# VanDrishti — forest change detection

Hackathon-ready forest loss/gain detection with an India map and a FastAPI interface. The default workflow only needs a map area and two date periods: the backend automatically finds low-cloud Sentinel-2 Level-2A scenes, reads RGB + near-infrared data, masks invalid pixels, and compares vegetation condition. Manual image upload remains available as an advanced fallback.

## Included carbon forecasting module

The CarbonSense energy-demand and carbon-footprint forecasting project is preserved as a self-contained module in [`modules/carbon_footprint`](modules/carbon_footprint). It has its own FastAPI service, dashboard, model artifacts, demonstration data, tests, requirements, and Dockerfile, so it does not overwrite or interfere with the VanDrishti forest-detection application.

Run it separately from `modules/carbon_footprint`; complete VS Code instructions are included below.

- forest loss and gain area estimates;
- a transparent map overlay;
- GeoJSON change polygons for any web map;
- ranked loss hotspots, confidence/data-quality indicators, and an indicative carbon-exposure range;
- forest-cover before/after, annualised loss, NDVI trend, seasonal comparability, and minimum-patch filtering;
- source-scene previews, NDVI-intensity layer, overlay opacity, downloadable GeoJSON/CSV, and a printable decision brief;
- an optional trainable U-Net path for labeled datasets.

## Run VanDrishti in VS Code on Windows

### Prerequisites

Install the following before starting:

- Windows 10 or 11;
- [Visual Studio Code](https://code.visualstudio.com/);
- [Python 3.12](https://www.python.org/downloads/) (the project is tested with Python 3.12);
- the Microsoft Python extension for VS Code (recommended);
- an internet connection for the first package installation and for live satellite analysis.

Do not use Python 3.14 for this project. Some geospatial packages may not have compatible Python 3.14 builds.

### 1. Open the correct folder

1. Open VS Code.
2. Select **File > Open Folder**.
3. Select the project root: the folder containing `backend`, `frontend`, `requirements.txt`, and `START_VANDRISHTI.bat`.
4. Select **Terminal > New Terminal**.

The terminal must be at the project root, not inside `modules/carbon_footprint`. Check it with:

```powershell
Get-Location
```

If the terminal is currently inside `modules/carbon_footprint`, return to the root with:

```powershell
deactivate 2>$null
cd ..\..
```

### 2. Create the Python environment and install packages

Run these commands from the project root:

```powershell
py -3.12 --version
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\generate_demo.py
```

The last command is safe to rerun and prepares the demonstration images. The commands use the environment's Python executable directly, so PowerShell script-execution policy does not need to be changed.

### 3. Select the VS Code Python interpreter

1. Press `Ctrl+Shift+P`.
2. Search for **Python: Select Interpreter**.
3. Select `.venv\Scripts\python.exe` from the project root.

Do not select `modules\carbon_footprint\.venv`; that is a separate environment for the optional CarbonSense application.

### 4. Start VanDrishti

From the project root, run:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Keep this terminal open. Then visit:

- dashboard: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- interactive API documentation: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- health check: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)

When the terminal displays `Application startup complete`, the project is ready.

### 5. Use another port if 8000 is unavailable

If the terminal reports `address already in use`, `WinError 10013`, or another port-binding error, start the application on port 8767:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8767
```

Then open [http://127.0.0.1:8767](http://127.0.0.1:8767). Only the port number in the browser address changes.

### 6. Stop the application

Click the terminal that is running Uvicorn and press `Ctrl+C`. Closing that terminal also stops the local server.

### One-click Windows alternative

Instead of the manual VS Code setup, run the included launcher from the project root:

```powershell
.\START_VANDRISHTI.bat
```

The launcher finds or installs Python 3.12, creates a compatible `.venv`, installs the packages, chooses an available port, starts the API, and opens the dashboard. Keep its terminal window open while using VanDrishti.

## Run the CarbonSense module in VS Code (optional)

CarbonSense is a separate application with its own environment. Open a second VS Code terminal and run:

```powershell
cd modules\carbon_footprint
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Open [http://127.0.0.1:8001](http://127.0.0.1:8001). If port 8001 is unavailable, replace it with 8768 in both the command and browser address.

Do not run `backend.app.main:app` from the CarbonSense folder. Return to the project root before starting VanDrishti.

## Verify the installation

Install the development requirements and run the VanDrishti tests from the project root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

Run the CarbonSense tests from its own folder and environment:

```powershell
cd modules\carbon_footprint
.\.venv\Scripts\python.exe -m pytest -q
cd ..\..
```

Expected result: 6 VanDrishti tests and 15 CarbonSense tests pass.

## Common VS Code problems

- **`No module named backend`**: the terminal is not at the project root. Run `cd ..\..` if you are inside `modules\carbon_footprint`.
- **`No module named app` for CarbonSense**: run its command from `modules\carbon_footprint`, not from the project root.
- **Wrong environment shown in the prompt**: run `deactivate`, return to the correct folder, and use the explicit `.\.venv\Scripts\python.exe` commands above.
- **PowerShell says script execution is disabled**: do not activate the environment; use `.\.venv\Scripts\python.exe` directly as shown above.
- **Port or socket error**: use port 8767 for VanDrishti or 8768 for CarbonSense.
- **Package installation fails**: confirm `py -3.12 --version` works, delete only the affected `.venv` folder, recreate it, and rerun the installation commands.
- **Satellite analysis is slow**: the first uncached request downloads remote Sentinel-2 bands and can take several seconds. The fallback satellite provider can take about a minute.

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
