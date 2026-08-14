from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pandas as pd
from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import METRICS_PATH, STATIC_DIR, cors_origins
from app.emissions import available_regions
from app.forecasting import ForecastService
from app.schemas import CustomForecastRequest, ForecastResponse, Scenario


app = FastAPI(
    title="CarbonSense Intelligence API",
    version="2.0.0",
    description=(
        "Explainable energy forecasting, carbon scenarios, data quality and "
        "load-shifting intelligence for buildings and microgrids."
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@lru_cache
def get_forecast_service() -> ForecastService:
    return ForecastService()


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health", tags=["Operations"])
def health(service: ForecastService = Depends(get_forecast_service)) -> dict:
    quality = service.data_quality()
    return {
        "status": "ok",
        "service": "carbon-intelligence-api",
        "version": "2.0.0",
        "model": service.artifact.model_name,
        "data_quality": quality["status"],
    }


@app.get("/api/v1/model/metrics", tags=["Model"])
def model_metrics() -> dict:
    return json.loads(Path(METRICS_PATH).read_text(encoding="utf-8"))


@app.get("/api/v1/data/quality", tags=["Data"])
def data_quality(service: ForecastService = Depends(get_forecast_service)) -> dict:
    return service.data_quality()


@app.get("/api/v1/energy/history", tags=["Data"])
def energy_history(
    hours: int = Query(default=168, ge=24, le=2160),
    service: ForecastService = Depends(get_forecast_service),
) -> dict:
    return {"hours": hours, "history": service.history_points(hours)}


@app.get("/api/v1/emissions/regions", tags=["Emissions"])
def emission_regions() -> dict:
    return {
        "regions": available_regions(),
        "warning": "Bundled factors are illustrative. Connect a verified provider in production.",
    }


@app.get("/api/v1/energy/forecast", response_model=ForecastResponse, tags=["Forecast"])
def energy_forecast(
    hours: int = Query(default=24, ge=1, le=168),
    region: str = Query(default="demo"),
    efficiency_percent: float = Query(default=0, ge=0, le=40),
    renewable_growth_percent: float = Query(default=0, ge=-50, le=300),
    temperature_delta_c: float = Query(default=0, ge=-10, le=10),
    custom_factor_kg_per_kwh: float | None = Query(default=None, gt=0, le=2),
    service: ForecastService = Depends(get_forecast_service),
) -> dict:
    scenario = Scenario(
        region=region,
        efficiency_percent=efficiency_percent,
        renewable_growth_percent=renewable_growth_percent,
        temperature_delta_c=temperature_delta_c,
        custom_factor_kg_per_kwh=custom_factor_kg_per_kwh,
    )
    return service.forecast(hours, scenario=scenario)


@app.post(
    "/api/v1/energy/forecast/custom",
    response_model=ForecastResponse,
    tags=["Forecast"],
    summary="Forecast from real operational history",
)
def custom_energy_forecast(
    request: CustomForecastRequest,
    service: ForecastService = Depends(get_forecast_service),
) -> dict:
    history = pd.DataFrame([observation.model_dump() for observation in request.history])
    conditions = [condition.model_dump() for condition in request.future_conditions]
    return service.forecast(
        request.hours,
        scenario=request.scenario,
        history=history,
        future_conditions=conditions,
    )
