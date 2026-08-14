from __future__ import annotations

from datetime import date
from pathlib import Path
from time import perf_counter

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator
from starlette.concurrency import run_in_threadpool

from .detector import Bounds, ForestChangeDetector, _area_sq_km
from .satellite import SatelliteDataError, Sentinel2Provider


BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BASE_DIR / "frontend"
detector = ForestChangeDetector()
satellite_provider = Sentinel2Provider()


class SatelliteDetectionRequest(BaseModel):
    west: float
    south: float
    east: float
    north: float
    before_start: date
    before_end: date
    after_start: date
    after_end: date
    max_cloud: float = Field(20, ge=0, le=90)
    sensitivity: float = Field(0.55, ge=0, le=1)
    minimum_patch_hectares: float = Field(0.5, ge=0.05, le=50)

    @model_validator(mode="after")
    def validate_request(self):
        bounds = Bounds(self.west, self.south, self.east, self.north)
        bounds.validate()
        if _area_sq_km(bounds) > 2500:
            raise ValueError("Selected area must be smaller than 2,500 km²")
        if self.before_start > self.before_end or self.after_start > self.after_end:
            raise ValueError("Each start date must be before its end date")
        if self.before_end >= self.after_start:
            raise ValueError("The before period must end before the after period starts")
        if self.after_end > date.today():
            raise ValueError("Satellite dates cannot be in the future")
        return self

app = FastAPI(
    title="VanDrishti Forest Change API",
    version="1.0.0",
    description="Automatically retrieve Sentinel-2 imagery or analyse uploaded image pairs.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health() -> dict:
    return {"status": "ok", "engine": detector.engine, "satellite_cache": satellite_provider.cache_stats()}


@app.get("/api/v1/model")
def model_info() -> dict:
    return {
        "engine": detector.engine,
        "classes": ["no_change", "forest_loss", "forest_gain"],
        "input": "Area and two date periods, or two co-registered RGB images",
        "recommended_resolution": "256 to 1024 pixels per side",
        "satellite_source": "Sentinel-2 Level-2A via Planetary Computer with Earth Search fallback",
        "automatic_features": ["NDVI", "cloud masking", "parallel retrieval", "scene cache", "hotspot ranking"],
    }


@app.post("/api/v1/detect/satellite")
async def detect_satellite_change(request: SatelliteDetectionRequest) -> dict:
    bounds = Bounds(request.west, request.south, request.east, request.north)
    try:
        started = perf_counter()
        before, after = await run_in_threadpool(
            satellite_provider.paired_observations,
            bounds,
            request.before_start,
            request.before_end,
            request.after_start,
            request.after_end,
            request.max_cloud,
        )
        retrieval_seconds = round(perf_counter() - started, 2)
        valid_mask = before.valid_mask & after.valid_mask
        source = {
            "type": "automatic_satellite",
            "provider": before.metadata.get("catalog_provider", "Satellite STAC"),
            "providers": sorted({before.metadata.get("catalog_provider", "Satellite STAC"), after.metadata.get("catalog_provider", "Satellite STAC")}),
            "collection": "Sentinel-2 Level-2A",
            "before": {**before.metadata, "preview_data_url": before.preview_data_url},
            "after": {**after.metadata, "preview_data_url": after.preview_data_url},
            "retrieval_seconds": retrieval_seconds,
            "cache": satellite_provider.cache_stats(),
        }
        return await run_in_threadpool(
            detector.detect_arrays,
            before.rgb,
            after.rgb,
            bounds,
            request.sensitivity,
            before_ndvi=before.ndvi,
            after_ndvi=after.ndvi,
            valid_mask=valid_mask,
            source=source,
            minimum_patch_hectares=request.minimum_patch_hectares,
        )
    except SatelliteDataError as exc:
        raise HTTPException(503, str(exc)) from exc


@app.post("/api/v1/detect")
async def detect_change(
    before: UploadFile = File(..., description="Earlier RGB satellite/drone image"),
    after: UploadFile = File(..., description="Later RGB image covering the same bounds"),
    west: float = Form(...),
    south: float = Form(...),
    east: float = Form(...),
    north: float = Form(...),
    sensitivity: float = Form(0.55, ge=0.0, le=1.0),
    minimum_patch_hectares: float = Form(0.5, ge=0.05, le=50),
) -> dict:
    allowed = {"image/png", "image/jpeg", "image/webp", "image/tiff"}
    if before.content_type not in allowed or after.content_type not in allowed:
        raise HTTPException(415, "Upload PNG, JPEG, WEBP, or TIFF images")
    before_bytes, after_bytes = await before.read(), await after.read()
    if len(before_bytes) > 15_000_000 or len(after_bytes) > 15_000_000:
        raise HTTPException(413, "Each image must be 15 MB or smaller")
    try:
        return detector.detect(
            before_bytes,
            after_bytes,
            Bounds(west=west, south=south, east=east, north=north),
            sensitivity,
            minimum_patch_hectares,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")

    @app.get("/", include_in_schema=False)
    def dashboard() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-store"})
