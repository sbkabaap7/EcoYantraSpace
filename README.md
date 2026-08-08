# CarbonSense Intelligence

CarbonSense is a hackathon-ready carbon operations platform for buildings and microgrids. It forecasts hourly demand, estimates emissions outside the ML model, exposes uncertainty and data quality, compares operating scenarios, and identifies when flexible demand should move to reduce carbon.

The included data and regional factors are deterministic demonstration assumptions. The architecture accepts real hourly history and future weather/renewable inputs, but verified data and a live marginal-emissions provider are required before production use.

## What makes it useful

- **Energy forecast:** 1-168 recursive hourly predictions with 90% calibrated ranges.
- **Carbon Shift:** recommends a low-carbon three-hour operating window and estimates savings from moving 10% of peak load.
- **Scenario lab:** compare efficiency, renewable growth, grid intensity and temperature scenarios without retraining the demand model.
- **Real data path:** submit 168-17,520 hourly observations to the custom forecast endpoint.
- **Driver inputs:** optionally supply future temperature, solar and wind conditions; otherwise robust hour/day median climatology is used.
- **Model evidence:** chronological train/validation/test splits, previous-day baseline, conformal residual intervals and a data-quality score.
- **Interactive dashboard:** actual-vs-forecast chart, confidence band, carbon intensity, renewable coverage, peak cards and downloadable CSV.
- **Integration:** versioned REST contract, OpenAPI, CORS, health checks and Docker.

## Run

```powershell
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

- Dashboard: `http://localhost:8000/`
- Interactive API: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## Frontend integration

```js
const query = new URLSearchParams({
  hours: 72,
  efficiency_percent: 10,
  renewable_growth_percent: 25,
  region: "demo",
});
const response = await fetch(
  `http://localhost:8000/api/v1/energy/forecast?${query}`
);
if (!response.ok) throw new Error(`Forecast failed: ${response.status}`);
const { forecast, summary } = await response.json();
```

Useful response fields:

- `forecast[].energy_kwh`, `lower`, `upper` - demand series and 90% range
- `forecast[].co2_kg` - hourly carbon footprint
- `forecast[].carbon_intensity_kg_per_kwh` - time-varying grid proxy
- `forecast[].renewable_share_percent` - renewable coverage
- `summary.peak_hour` - peak-demand card
- `summary.cleanest_window` - preferred operating window
- `summary.shift_opportunity` - flexible-load move and estimated avoided emissions

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/energy/forecast` | Demo/history-backed forecast and scenarios |
| POST | `/api/v1/energy/forecast/custom` | Forecast using supplied operational history |
| GET | `/api/v1/energy/history` | Recent actual series for charts |
| GET | `/api/v1/data/quality` | Completeness, gaps, freshness and outlier audit |
| GET | `/api/v1/model/metrics` | Model, baseline and interval evidence |
| GET | `/api/v1/emissions/regions` | Available illustrative factor configurations |

### Forecast from real data

```json
POST /api/v1/energy/forecast/custom
{
  "hours": 24,
  "history": [
    {
      "timestamp": "2026-08-01T00:00:00Z",
      "energy_kwh": 61.2,
      "temperature_c": 27.1,
      "solar_kwh": 0,
      "wind_kwh": 4.3
    }
  ],
  "future_conditions": [
    {
      "timestamp": "2026-08-08T12:00:00Z",
      "temperature_c": 31.5,
      "solar_kwh": 15.1,
      "wind_kwh": 5.2
    }
  ],
  "scenario": {
    "region": "demo",
    "efficiency_percent": 8,
    "renewable_growth_percent": 20,
    "temperature_delta_c": 0
  }
}
```

At least 168 unique hourly history records are required. OpenAPI at `/docs` contains the complete schema and validation rules.

## Model strategy

The training pipeline creates cyclical time features, weekday/weekend context, 1h/24h/168h lags, rolling demand statistics, temperature and renewable drivers. It uses a regularized linear demand model evaluated chronologically against a previous-day seasonal baseline. A validation window selects the seasonal blend and calibrates residual quantiles; the untouched test window reports MAE, RMSE, MAPE and interval coverage.

Current synthetic-demo test performance is stored in `models/metrics_v1.json`. Retrain and test with:

```powershell
python scripts/train_model.py
python -m pytest -q
```

## Production checklist

1. Replace `data/hourly_energy.csv` or call the custom endpoint from your meter/data pipeline.
2. Feed trusted future weather and renewable generation into `future_conditions`.
3. Replace the illustrative factor logic in `app/emissions.py` with a verified regional or marginal-emissions provider.
4. Persist model artifacts in object storage and record training data lineage.
5. Add API authentication, tenant isolation, rate limits and request logging at the deployment layer.
6. Monitor forecast error, interval coverage, missing data and feature drift after deployment.

## Docker

```powershell
docker build -t carbonsense .
docker run --rm -p 8000:8000 carbonsense
```

Allowed frontend origins come from the comma-separated `CORS_ORIGINS` environment variable. Defaults are `http://localhost:3000` and `http://localhost:5173`.
