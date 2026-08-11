import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from backend.app.main import app
from backend.app.detector import Bounds, ForestChangeDetector
from backend.app.satellite import SatelliteObservation, Sentinel2Provider


client = TestClient(app)


def png(with_forest: bool) -> bytes:
    image = Image.new("RGB", (128, 128), (150, 120, 75))
    if with_forest:
        ImageDraw.Draw(image).rectangle((20, 20, 100, 100), fill=(30, 150, 55))
    output = io.BytesIO(); image.save(output, "PNG")
    return output.getvalue()


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_detects_forest_loss() -> None:
    response = client.post(
        "/api/v1/detect",
        files={"before": ("before.png", png(True), "image/png"), "after": ("after.png", png(False), "image/png")},
        data={"west": 77.0, "south": 10.0, "east": 77.1, "north": 10.1, "sensitivity": 0.55},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["summary"]["forest_loss_sq_km"] > 0
    assert result["summary"]["forest_gain_sq_km"] == 0
    assert result["change_geojson"]["type"] == "FeatureCollection"
    assert result["overlay_data_url"].startswith("data:image/png;base64,")


def test_rejects_invalid_bounds() -> None:
    response = client.post(
        "/api/v1/detect",
        files={"before": ("before.png", png(True), "image/png"), "after": ("after.png", png(False), "image/png")},
        data={"west": 80, "south": 10, "east": 70, "north": 11},
    )
    assert response.status_code == 422


def test_automatic_satellite_endpoint(monkeypatch) -> None:
    class FakeProvider:
        def cache_stats(self):
            return {"hits": 0, "misses": 2, "entries": 2, "capacity": 32}

        def paired_observations(self, *args, **kwargs):
            rgb = np.full((64, 64, 3), (45, 125, 55), dtype=np.uint8)
            valid = np.ones((64, 64), dtype=bool)
            before = SatelliteObservation(
                rgb, np.full((64, 64), 0.72, dtype=np.float32), valid,
                {"scene_id": "before-scene", "date": "2023-01-15", "cloud_cover_percent": 2, "valid_pixel_percent": 100},
                "data:image/jpeg;base64,before",
            )
            after = SatelliteObservation(
                rgb, np.full((64, 64), 0.18, dtype=np.float32), valid,
                {"scene_id": "after-scene", "date": "2025-01-15", "cloud_cover_percent": 3, "valid_pixel_percent": 100},
                "data:image/jpeg;base64,after",
            )
            return before, after

    monkeypatch.setattr("backend.app.main.satellite_provider", FakeProvider())
    response = client.post(
        "/api/v1/detect/satellite",
        json={
            "west": 77.0, "south": 10.0, "east": 77.1, "north": 10.1,
            "before_start": "2023-01-01", "before_end": "2023-02-28",
            "after_start": "2025-01-01", "after_end": "2025-02-28",
            "max_cloud": 20, "sensitivity": 0.55,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["engine"] == "sentinel-2-ndvi-change-v1"
    assert result["summary"]["forest_loss_sq_km"] > 0
    assert result["source"]["type"] == "automatic_satellite"
    assert result["insights"]["field_priority"] == "high"
    assert result["summary"]["forest_cover_before_percent"] == 100
    assert result["insights"]["comparison_quality"] == "strong"


def test_small_ndvi_threshold_crossing_is_treated_as_noise() -> None:
    rgb = np.full((64, 64, 3), (45, 125, 55), dtype=np.uint8)
    valid = np.ones((64, 64), dtype=bool)
    result = ForestChangeDetector().detect_arrays(
        rgb, rgb, Bounds(77.0, 10.0, 77.02, 10.02), 0.55,
        before_ndvi=np.full((64, 64), 0.38, dtype=np.float32),
        after_ndvi=np.full((64, 64), 0.36, dtype=np.float32),
        valid_mask=valid,
    )
    assert result["summary"]["forest_loss_sq_km"] == 0


def test_satellite_shape_preserves_aoi_aspect_ratio() -> None:
    height, width = Sentinel2Provider.target_shape(Bounds(77.0, 10.0, 77.2, 10.05), 640)
    assert width == 640
    assert 160 <= height < width
