# **ALBEDO**
***A**utomated **L**and-surface **B**roadband **E**stimation & **D**ata-series **O**utput*  
  
A Google Earth Engine script, designed to be an interactive and user friendly tool for assembling Sentinel-2 broadband surface albedo timeseries data for any user defined area of interest.
Developed by the Flanagan Lab @ [The University of Lethbridge](https://uleth.ca).

## What is ALBEDO for?

Surface albedo — the fraction of incoming shortwave radiation reflected by the land surface — is a key control on the surface energy balance, and is useful for studying energy partitioning within ecosystems, snow and vegetation dynamics, and land surface change. Sentinel-2 provides frequent, high-resolution multispectral measurements that can be converted to a broadband albedo proxy using narrow-to-broadband coefficients developed Bonafoni & Sekertekin (2020).

However, assessing albedo manually on a per-scene basis is time consuming and can introduce error. This Earth Engine script was created to automate the retrieval of broadband albedo timeseries data from relevant Sentinel-2 Surface Reflectance scenes. Cloud and cloud shadow affected areas are masked out using Google's Cloud Score+ product, broadband albedo is calculated within a user-defined polygon, and a mean value is derived per scene. Processed data is then exportable as a .csv to Google Drive.

Of note, is this script does not apply any resampling to the SWIR bands, unlike the technique employed by Bonafoni & Sekertekin, who utilized a super-resoluton technique to resample from 20m to 10m. This script instead uses the default nearest neigbour logic in Earth Engine for resampling and applies no super-resolving techniques.

# Getting Started
> [!Tip]
> In order to use ALBEDO, you must be a registered user on Google Earth Engine. A guide to setting up an account can be found [here](https://developers.google.com/earth-engine/guides/access).

> [!Note]
> The `main` branch of this GitHub repository is **frozen** at version `v2026.1`, which was used for our publication. To reproduce results relating to our publication, please use this version. Community contributions, bug reports, and feature requests are welcome on the `community` branch.

### Access via GitHub
The read-only `main` branch corresponds to the contents of the `albedo.js` file in the 'Releases' section, which can be pasted directly into the Earth Engine Code Editor. You can also clone the main branch:
```
git clone https://github.com/qfisch/albedo.git
```

For the actively developed version, clone the `community` branch instead:
```
git clone -b community https://github.com/qfisch/albedo.git
```

## Using ALBEDO

### 1. Define your geometry
>[!Important]
> Be sure to `Save` -> `Run` each time you update your geometry; ALBEDO will not update geometry dynamically.

ALBEDO is designed to take some input `geometry` polygon. You may create a polygon using the default interactive web editing tools, or import your own asset. Regardless, the polygon variable must be defined as `geometry`. ALBEDO currently only handles one polygon at a time.

If you are importing your geometry from an asset (uploaded shapefile/table), be sure to select only one feature at a time:
```javascript
var geometry = ee.FeatureCollection('projects/you/assets/example').first()
  .geometry();
Map.addLayer(geometry, {color: 'red'}, 'Geometry');
```
Replace the table ID with the geometry you have uploaded and intend to use. For more information on handling tables, refer to the Earth Engine documentation.

### 2. Specify your parameters

Use the menu pane to configure your analysis. Specify the time period and date range for your project, set the coverage threshold to handle cloud cover and data quality, and optionally enable outlier flagging.

**Menu Options: (click to expand)**

<details>
<summary>A. Dates</summary>

- **Years**
  - Specified individually, separated by commas.
  - **Example**: `2016,2018` or `2017,2018,2019,2020,2021`
- **Start/End Range**
  - Within each year, ALBEDO can filter scenes by start and end date
  - This is useful when you only need data during certain periods, such as a growing season
  - **Example**: Start Day `04-01`, End Day `09-30` would only include scenes captured April 1st - September 30th each year

</details>

<details>
<summary>B. Filtering</summary>

- **Minimum ROI Coverage Required**
  - By default, ALBEDO masks clouds and cloud shadows using Google's Cloud Score+ product (`cs_cdf` band; pixels scoring `>= 0.60` are treated as clear)
  - This slider specifies the percentage of pixels that must remain after masking for a measurement to be considered valid
  - For larger areas, lower coverage amounts (~50%) can be considered acceptable
  - For smaller areas, higher coverage amounts (~80%-100%) should be used
  - **Default**: `90%`

</details>

<details>
<summary>C. Outlier Removal</summary>

- **Remove albedo values beyond n SD of the mean**
  - When enabled, scenes whose mean albedo falls more than `n` standard deviations from the pooled mean (across all retained scenes, all years) are flagged
  - Flagged scenes have their `mean_albedo` value replaced with `-999` in the exported .csv rather than being removed, so rejected scenes remain visible in the record
  - This option provides extra protection against erronous albedo values due to cloud cover missed by the Cloud Score + Mask
  - **Outlier threshold** sets `n`
  - **Default**: `ON`, with `n = 3`

</details>

### 3. Run your analysis
Once your geometry and parameters have been specified, click the `Analyze Albedo Data` button. ALBEDO will then compile, mask, and average all relevant scenes into a timeseries, and prepare a Google Drive export task.

To export a .csv, open the `Tasks` tab in Code Editor and click `Run` on the generated export task. The resulting file is written to your Google Drive.

# References & Resources
- Bonafoni, S., & Sekertekin, A. (2020). Albedo Retrieval From Sentinel-2 by New Narrow-to-Broadband Conversion Coefficients. *IEEE Geoscience and Remote Sensing Letters*, 17(9), 1618–1622. [https://doi.org/10.1109/LGRS.2020.2967085](https://doi.org/10.1109/LGRS.2020.2967085)

- European Space Agency. Copernicus Sentinel-2 (Surface Reflectance, Harmonized) [dataset]. Accessed via Google Earth Engine (`COPERNICUS/S2_SR_HARMONIZED`).

- Google. Cloud Score+ S2_HARMONIZED [dataset]. Accessed via Google Earth Engine (`GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED`).
