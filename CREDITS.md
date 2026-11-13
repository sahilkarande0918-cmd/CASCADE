# Credits

Data, imagery and footage used by Cascade, with their licences.

| What | Source | Licence | Where it is used |
|---|---|---|---|
| Infrastructure, roads, rivers, buildings | © OpenStreetMap contributors, via the Overpass API | ODbL 1.0 | `public/data/*.json`, `public/media/pune-block.json` |
| Basemap tiles | OpenFreeMap (OpenMapTiles schema, OSM data) | ODbL data, free service | Dashboard map |
| Elevation | AWS open Terrain Tiles, Terrarium encoding (https://registry.opendata.aws/terrain-tiles/) | Various open sources; see the registry page | City files, scale model |
| Satellite imagery | "Sentinel-2 cloudless 2016" by EOX IT Services GmbH, https://s2maps.eu (contains modified Copernicus Sentinel data 2016) | CC BY 4.0 | `public/media/pune-s2.jpg`, `public/media/pune-block.jpg` |
| Sky footage | "2011-08-05 21-45-00-timelapse-clouds-seloncourt" by Thomas Bresson, https://commons.wikimedia.org/wiki/File:2011-08-05_21-45-00-timelapse-clouds-seloncourt.ogv (cropped, colour graded, looped) | CC BY 3.0 | `public/media/sky.mp4`, `public/media/sky-poster.jpg` |
| Rock texture | "Rock Face", Poly Haven, https://polyhaven.com/a/rock_face | CC0 | `public/media/rock-*.jpg` |
| Forecast and river discharge | Open-Meteo forecast and Flood APIs (GloFAS, Copernicus EMS) | CC BY 4.0 | `/api/hazard` (live, not stored) |
| Fonts | Stack Sans Headline and Stack Sans Text, Google Fonts | SIL Open Font License | Whole site |

## Statistics

Cascade shows no real-world statistics. Every number on the site is a simulated output of the engine on the data above, labelled as a simulated scenario.
