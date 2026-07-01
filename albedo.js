/*
ALBEDO (Automated Land-surface Broadband Estimation & Data-series Output) - v2026.1
Author: Quinn Fischer - Flanagan Lab @ The University of Lethbridge

This Google Earth Engine Script is designed to be an interactive
and user friendly tool for assembling Sentinel-2 broadband surface
albedo timeseries data, using coefficients for deriving a wide-band albedo 
proxy from narrow-band Sentinel data developed by Bonafoni & Sekertekin (2020).

  --- To use: ---

- Add a new geometry feature using the draw tools encompassing the area
  you wish to obtain albedo information for, or add an existing import
  record, renamed geometry.

  NOTE: Any pixels inside this geometry will be averaged together for each scene
  valid data exists in order to create your timeseries

- Press save, then run in the code editor, and adjust the parameters
  available within the UI to suit the needs of your investigation

- Click "Analyze Albedo Data" to build the export table

- To export your timeseries data, open the Tasks tab and click Run to
  export the CSV to your Google Drive
*/


Map.addLayer(geometry, {color: 'red'}, 'Geometry');

// CONSTANTS
var PIXEL_SCALE = 10;
var DEFAULT_YEARS = '2020, 2021, 2022, 2023, 2024, 2025';
var DEFAULT_COVERAGE = 90;

// Cloud Score+ is used instead of QA60, for better masking performance and to resolve years with missing QA60 Data
var CS_COLLECTION = 'GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED';
var CS_BAND = 'cs_cdf';     // Cumulative-distribution clear-sky score (0-1). 
                            // This implementation uses 'cs_cdf'; see Cloud Score+ documentation for more info
var CLEAR_THRESHOLD = 0.60; // Pixels >= this are treated as clear

// Get geometry area for calculations
var AOI_AREA = geometry.area(1);

// Initialize map and UI
Map.setOptions("HYBRID");
Map.centerObject(geometry);
setupUI();

// Set up the UI and user inputs
function setupUI() {
  var panel = ui.Panel({style: {width: '300px'}});
  
  var yearTextbox = ui.Textbox({
    placeholder: 'Enter years (e.g., 2019,2021,2023)',
    value: DEFAULT_YEARS
  });
  
  var startDay = ui.Textbox({
    placeholder: 'Enter Start Day (MM-DD)',
    value: '04-01'
  });
  
  var endDay = ui.Textbox({
    placeholder: 'Enter End Day (MM-DD)',
    value: '09-30'
  });
  
  var coverageLabel = ui.Label('Minimum ROI Coverage Required: ' + DEFAULT_COVERAGE + '%');
  
  var coverageSlider = ui.Slider({
    min: 0,
    max: 100,
    value: DEFAULT_COVERAGE,
    step: 5,
    style: {width: '250px'},
    onChange: function(value) {
      coverageLabel.setValue('Minimum ROI Coverage Required: ' + value + '%');
    }
  });

  // Outlier removal: flag scenes whose mean albedo is more than
  // n standard deviations from the pooled mean in either direction. On by
  // default at 3 dev. to remove cloud/cloud shadow missed by cloud score masking
  var outlierCheckbox = ui.Checkbox({
    label: 'Remove albedo values beyond n SD of the mean',
    value: true
  });

  var sdTextbox = ui.Textbox({
    placeholder: 'n (e.g., 3)',
    value: '3'
  });

var runButton = ui.Button({
  label: 'Analyze Albedo Data',
  onClick: function() {
    print('Starting analysis for years: ' + yearTextbox.getValue());
    print('Minimum ROI coverage threshold: ' + coverageSlider.getValue() + '%');
    
    var years = yearTextbox.getValue().split(',').map(function(year) {
      return year.trim();
    });
    
    var sentinelCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
    
    var params = {
      years: years,
      coverageThreshold: coverageSlider.getValue(),
      startDay: startDay.getValue(),
      endDay: endDay.getValue(),
      sentinelCollection: sentinelCollection,
      removeOutliers: outlierCheckbox.getValue(),
      sdThreshold: parseFloat(sdTextbox.getValue())
    };
    
    runAnalysis(params);
  }
});
  
  // Add elements to panel
  panel.add(ui.Label('Sentinel-2 Albedo Tool', {fontWeight: 'bold', fontSize: '14px'}));
  panel.add(ui.Label('Enter years to analyze (separated by commas):'));
  panel.add(yearTextbox);
  panel.add(ui.Label('Enter Start Day [MM-DD]'));
  panel.add(startDay);
  panel.add(ui.Label('Enter End Day [MM-DD]'));
  panel.add(endDay);
  panel.add(coverageLabel);
  panel.add(coverageSlider);
  panel.add(outlierCheckbox);
  panel.add(ui.Label('Outlier threshold [n standard deviations]'));
  panel.add(sdTextbox);
  panel.add(runButton);
  
  ui.root.add(panel);
}


/**
 * Masks clouds via the linked Cloud Score+ band and calculates coverage percentage for an image
 * @param {ee.Image} image - The Sentinel scene to process (must carry CS_BAND)
 * @param {ee.Geometry} aoi - Area of interest
 * @return {ee.Image} Masked image with coverage percentage as property
 */
function maskCloudsAndCalculateCoverage(image, aoi) {
  // Build a clear-sky mask from the Cloud Score+ band, renamed 'valid' so the
  // coverage reducer below is independent of any source band
  var mask = image.select(CS_BAND).gte(CLEAR_THRESHOLD).rename('valid');

  // Apply the mask to the image
  var maskedImage = image.updateMask(mask);

  // Calculate the valid pixel area (non-masked) within the user defined aoi
  var validArea = mask.multiply(ee.Image.pixelArea())
                .reduceRegion({
                  reducer: ee.Reducer.sum(),
                  geometry: aoi,
                  scale: PIXEL_SCALE,
                  maxPixels: 1e9,
                  tileScale: 16
                }).get('valid');
  
  // Calculate coverage percentage. Clamp added because of reducer logic in Earth Engine.
  var coveragePercent = ee.Number(validArea).divide(AOI_AREA).multiply(100).clamp(0, 100);
  
  // Add coverage percentage as a property
  return maskedImage.set('coverage_percent', coveragePercent);
}

/**
 * Calculates broadband albedo and its mean over the AOI
 * @param {ee.Image} image - The Sentinel image with reflectance bands
 * @param {ee.Geometry} aoi - Area of interest
 * @return {ee.Image} Image with added mean albedo property
 */
function convertToAlbedo(image, aoi) {
  // Combine reflectance bands into broadband albedo (Bonafoni & Sekertekin 2020)
  var albedo = image.expression(
    '(B2*0.2266 + B3*0.1236 + B4*0.1573 + B8*0.3417 + B11*0.1170 + B12*0.0338) / 10000',
    {'B2': image.select('B2'), 'B3': image.select('B3'), 'B4': image.select('B4'),
     'B8': image.select('B8'), 'B11': image.select('B11'), 'B12': image.select('B12')}
  ).rename('albedo');

  // Calculate mean albedo across the AOI polygon
  var meanAlb = albedo.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: aoi,
    scale: PIXEL_SCALE,
    maxPixels: 1e9,
    tileScale: 16 // Force chunking to reduce memory consumption
  }).get('albedo');

  // Add the mean albedo as a property
  return image
    .set('mean_Albedo', meanAlb)
}

/**
 * Gets and processes Sentinel albedo data for a specific year
 * @param {Object} params - Analysis parameters
 * @param {string} year - Year to process
 * @return {Object} Object containing the processed collection
 */
function getSentinelAlbedoTimeSeries(params, year) {
  
  // Parse user provided month range
  var startDateParts = params.startDay.split('-');
  var endDateParts = params.endDay.split('-');
  
  // Define date range for the specified year
  var startDate = ee.Date.fromYMD(parseInt(year, 10), parseInt(startDateParts[0], 10), parseInt(startDateParts[1], 10));
  var endDate = ee.Date.fromYMD(parseInt(year, 10), parseInt(endDateParts[0], 10), parseInt(endDateParts[1], 10));
  
  // Filter cloud score collection first, then link with sentinel below
  var csPlus = ee.ImageCollection(CS_COLLECTION)
    .filterBounds(geometry)
    .filterDate(startDate, endDate);

  // Get Sentinel-2 collection for the time period, attach the Cloud Score+
  // band, and keep only the bands we need
  var sentinelCollection_prefilter = ee.ImageCollection(params.sentinelCollection)
    .filterBounds(geometry)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 80))
    .linkCollection(csPlus, [CS_BAND])
    .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12', CS_BAND])
    .sort('system:time_start');

  // Add a julian day property 
  var withDay = sentinelCollection_prefilter.map(function(img) {
    var julianDay = ee.Date(img.get('system:time_start')).getRelative('day', 'year').add(1);
    return img.set('julian_day', julianDay);
  });

  // Build a list of unique days
  var days = ee.List(withDay.aggregate_array('julian_day')).distinct();
 
  // For each unique day, grab the first image, and build a new collection from those
  var sentinelCollection = ee.ImageCollection(
    days.map(function(d) {
      return ee.Image(withDay.filter(ee.Filter.eq('julian_day', d)).first());
    })
  );

  // Apply cloud masking and calculate coverage
  var processedCollection = sentinelCollection.map(function(image) {
    return maskCloudsAndCalculateCoverage(image, geometry);
  });
  
  // Filter by coverage threshold
  var filteredByCoverage = processedCollection
    .filter(ee.Filter.gte('coverage_percent', params.coverageThreshold));
  
  // Calculate mean albedo
  var albedoCollection = filteredByCoverage.map(function(image) {
    return convertToAlbedo(image, geometry);
  });
  
  // Return the collection
  return {
    collection: albedoCollection
  };
}


/**
 * Runs the albedo analysis based on user parameters
 * @param {Object} params - Analysis parameters
 */
function runAnalysis(params) {
  Map.clear();
  Map.setOptions("HYBRID");

  var allAlbedoData = ee.FeatureCollection([]);

  params.years.forEach(function(year) {
    var collection = getSentinelAlbedoTimeSeries(params, year).collection;

    var albedoData = collection.map(function(image) {
      return ee.Feature(null, {
        'timestamp_full': ee.Date(image.get('system:time_start')).format('yyyy-MM-dd HH:mm'),
        'image_id': image.get('system:index'),
        'julian_day': image.get('julian_day'),
        'coverage_percent': image.get('coverage_percent'),
        'mean_albedo': image.get('mean_Albedo')
      });
    });

    allAlbedoData = allAlbedoData.merge(albedoData);
  });

  // Optionally flag albedo outliers: scenes whose mean albedo falls outside
  // (pooled mean +/- n * pooled SD) have their value replaced with -999 rather
  // than being removed. Stats are pooled over all retained scenes across all years.
  if (params.removeOutliers) {
    // Guard against null albedo values
    var validData = allAlbedoData.filter(ee.Filter.notNull(['mean_albedo']));

    var stats = validData.reduceColumns({
      reducer: ee.Reducer.mean().combine({
        reducer2: ee.Reducer.stdDev(),
        sharedInputs: true
      }),
      selectors: ['mean_albedo']
    });

    var meanAlb = ee.Number(stats.get('mean'));
    var sdAlb = ee.Number(stats.get('stdDev'));
    var margin = sdAlb.multiply(params.sdThreshold);
    var upperBound = meanAlb.add(margin);
    var lowerBound = meanAlb.subtract(margin);

    // Replace out-of-range mean_albedo with -999 instead of dropping the row,
    // so the exported CSV shows exactly which scenes were rejected because of standard dev. 
    // All other fields (timestamp, coverage, etc.) are kept intact.
    allAlbedoData = validData.map(function(f) {
      var v = ee.Number(f.get('mean_albedo'));
      var inRange = v.gte(lowerBound).and(v.lte(upperBound));
      return f.set('mean_albedo', ee.Algorithms.If(inRange, v, -999));
    });

    print('Outlier flagging ON — out-of-range mean_albedo replaced with -999');
  }

  Export.table.toDrive({
    collection: allAlbedoData,
    description: 'Basin_n_2015_2025_CLP',
    fileFormat: 'CSV',
    folder: 'Earth Engine Exports'
  });

  print('Export task ready — open the Tasks tab and click Run to export to Drive.');
}
