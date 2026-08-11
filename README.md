# VanDrishti — forest change detection

Hackathon-ready forest loss/gain detection with an India map and a FastAPI interface. The default workflow only needs a map area and two date periods: the backend automatically finds low-cloud Sentinel-2 Level-2A scenes, reads RGB + near-infrared data, masks invalid pixels, and compares vegetation condition. Manual image upload remains available as an advanced fallback.

## Included carbon forecasting module

The CarbonSense energy-demand and carbon-footprint forecasting project is preserved as a self-contained module in [`modules/carbon_footprint`](modules/carbon_footprint). It has its own FastAPI service, dashboard, model artifacts, demonstration data, tests, requirements, and Dockerfile, so it does not overwrite or interfere with the VanDrishti forest-detection application.

Run it separately on port 8001:

```powershell
cd modules/carbon_footprint
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Open `http://localhost:8001` for the CarbonSense dashboard.

- forest loss and gain area estimates;
- a transparent map overlay;
- GeoJSON change polygons for any web map;
- ranked loss hotspots, confidence/data-quality indicators, and an indicative carbon-exposure range;
- forest-cover before/after, annualised loss, NDVI trend, seasonal comparability, and minimum-patch filtering;
- source-scene previews, NDVI-intensity layer, overlay opacity, downloadable GeoJSON/CSV, and a printable decision brief;
- an optional trainable U-Net path for labeled datasets.

## Run locally

### One-click Windows setup

Extract the ZIP, then double-click `START_VANDRISHTI.bat`. The launcher finds or installs Python 3.12, replaces an incompatible project environment, creates an isolated `.venv`, installs the packages from `requirements.txt`, starts the API on an available local port, and opens the dashboard. Internet access is required for the initial setup. Keep the `VanDrishti API` terminal window open while using the application.

### Manual setup

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts/generate_demo.py
uvicorn backend.app.main:app --reload
```

Open `http://localhost:8000`. Interactive API documentation is at `http://localhost:8000/docs`.

## Automatic satellite API

`POST /api/v1/detect/satellite` accepts JSON:

```json
{
  "west": 76.98,
  "south": 10.08,
  "east": 77.00,
  "north": 10.10,
  "before_start": "2023-01-01",
  "before_end": "2023-02-28",
  "after_start": "2025-01-01",
  "after_end": "2025-02-28",
  "max_cloud": 20,
  "sensitivity": 0.55,
  "minimum_patch_hectares": 0.5
}
```

The selected area must be below 2,500 km². The API returns summary metrics, source-scene metadata and previews, data quality, confidence, field priority, hotspots, carbon-exposure range, PNG overlays, and GeoJSON. Before/after retrieval runs in parallel, processing preserves the ground aspect ratio, and a 32-observation in-memory cache makes repeated comparisons much faster. Catalogue requests retry automatically; if Microsoft Planetary Computer is unreachable, the provider falls back to Element 84 Earth Search. A first uncached request still takes several seconds because it reads remote satellite bands, and a fallback request can take about a minute.

## Manual-upload API contract

`POST /api/v1/detect` uses `multipart/form-data`:

| Field | Type | Meaning |
|---|---|---|
| `before` | image file | Earlier RGB image |
| `after` | image file | Later, co-registered RGB image |
| `west`, `south`, `east`, `north` | number | WGS84 bounding box |
| `sensitivity` | 0–1 | Optional; default `0.55` |

JavaScript example:

```js
const body = new FormData();
body.append("before", beforeFile);
body.append("after", afterFile);
body.append("west", "77.0");
body.append("south", "10.0");
body.append("east", "77.3");
body.append("north", "10.3");
body.append("sensitivity", "0.55");

const result = await fetch("http://localhost:8000/api/v1/detect", {
  method: "POST", body
}).then(r => r.json());
```

The response contains `summary`, `insights`, `source`, `change_geojson`, `overlay_data_url`, `bounds`, `image`, `legend`, and `engine`. In Leaflet, display the raster result with:

```js
L.imageOverlay(result.overlay_data_url, [
  [result.bounds.south, result.bounds.west],
  [result.bounds.north, result.bounds.east]
]).addTo(map);
L.geoJSON(result.change_geojson).addTo(map);
```

Health and model metadata are available at `GET /api/v1/health` and `GET /api/v1/model`. CORS is open for hackathon integration; restrict `allow_origins` before production.

## Model strategy

Automatic mode works immediately with Sentinel-2 NDVI change analysis. Manual uploads use an RGB Excess-Green baseline. These are screening tools, not scientifically validated deforestation products; seasonal differences, fire, flooding, shadows, plantations and residual clouds can affect detections.

For the ML submission, label masks with pixel values `0=no change`, `1=loss`, `2=gain` and arrange:

```text
backend/data/train/
  before/<id>.png
  after/<id>.png
  masks/<id>.png
```

Then train and launch the learned model:

```powershell
pip install -r requirements-ml.txt
python backend/train.py --epochs 20
$env:MODEL_CHECKPOINT="backend/checkpoints/change_unet.pt"
uvicorn backend.app.main:app --reload
```

Recommended next dataset step: export co-registered Sentinel-2 RGB composites plus change labels from Global Forest Change or your own annotated polygons, split train/validation by geography (not random tiles), and report per-class IoU/F1.

## Test and container

```powershell
pip install -r requirements-dev.txt
pytest -q
docker build -t vandrishti .
docker run --rm -p 8000:8000 vandrishti
```
