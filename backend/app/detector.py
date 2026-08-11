"""Forest loss/gain detection with a CV baseline and optional U-Net checkpoint."""

from __future__ import annotations

import base64
import io
import math
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

from .model import ChangeUNet, torch


MAX_SIDE = 1024


@dataclass(frozen=True)
class Bounds:
    west: float
    south: float
    east: float
    north: float

    def validate(self) -> None:
        if not (-180 <= self.west < self.east <= 180):
            raise ValueError("Longitude bounds must satisfy -180 <= west < east <= 180")
        if not (-90 <= self.south < self.north <= 90):
            raise ValueError("Latitude bounds must satisfy -90 <= south < north <= 90")


def load_rgb(content: bytes) -> np.ndarray:
    try:
        image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as exc:
        raise ValueError("The uploaded file is not a readable image") from exc
    if image.width < 16 or image.height < 16:
        raise ValueError("Images must be at least 16 x 16 pixels")
    scale = min(1.0, MAX_SIDE / max(image.size))
    if scale < 1:
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS
        )
    return np.asarray(image, dtype=np.uint8)


def _vegetation_mask(rgb: np.ndarray, threshold: float) -> np.ndarray:
    values = rgb.astype(np.float32) / 255.0
    red, green, blue = values[..., 0], values[..., 1], values[..., 2]
    # Excess Green is robust for RGB satellite/drone imagery when NIR is unavailable.
    exg = 2 * green - red - blue
    visible_vegetation = (exg > threshold) & (green > 0.16) & (green > red * 1.03)
    return visible_vegetation.astype(np.uint8)


def _ndvi_forest_mask(ndvi: np.ndarray, sensitivity: float) -> np.ndarray:
    # Dense vegetation normally has higher NDVI; sensitivity adjusts the cutoff.
    threshold = 0.48 - sensitivity * 0.20
    return (ndvi > threshold).astype(np.uint8)


def _clean(mask: np.ndarray, minimum_blob_pixels: int) -> np.ndarray:
    kernel = np.ones((3, 3), dtype=np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    clean = np.zeros_like(mask)
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] >= minimum_blob_pixels:
            clean[labels == label] = 1
    return clean


def _area_sq_km(bounds: Bounds) -> float:
    mean_lat = math.radians((bounds.north + bounds.south) / 2)
    width = 111.320 * math.cos(mean_lat) * (bounds.east - bounds.west)
    height = 110.574 * (bounds.north - bounds.south)
    return abs(width * height)


def _pixel_to_lon_lat(x: int, y: int, width: int, height: int, bounds: Bounds) -> list[float]:
    lon = bounds.west + (x / width) * (bounds.east - bounds.west)
    lat = bounds.north - (y / height) * (bounds.north - bounds.south)
    return [round(lon, 7), round(lat, 7)]


def _mask_features(mask: np.ndarray, kind: str, bounds: Bounds, total_area: float) -> list[dict[str, Any]]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    height, width = mask.shape
    features: list[dict[str, Any]] = []
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:100]:
        perimeter = cv2.arcLength(contour, True)
        simplified = cv2.approxPolyDP(contour, max(1.5, perimeter * 0.008), True)
        if len(simplified) < 3:
            continue
        coordinates = [
            _pixel_to_lon_lat(int(point[0][0]), int(point[0][1]), width, height, bounds)
            for point in simplified
        ]
        coordinates.append(coordinates[0])
        pixel_area = float(cv2.contourArea(contour))
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "change": kind,
                    "area_sq_km": round(total_area * pixel_area / (width * height), 4),
                },
                "geometry": {"type": "Polygon", "coordinates": [coordinates]},
            }
        )
    return features


def _overlay_data_url(loss: np.ndarray, gain: np.ndarray) -> str:
    rgba = np.zeros((*loss.shape, 4), dtype=np.uint8)
    rgba[loss.astype(bool)] = (239, 68, 68, 175)
    rgba[gain.astype(bool)] = (34, 197, 94, 175)
    output = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(output, "PNG", optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _ndvi_delta_data_url(before_ndvi: np.ndarray, after_ndvi: np.ndarray, valid: np.ndarray) -> str:
    delta = np.clip(after_ndvi - before_ndvi, -0.5, 0.5)
    strength = (np.abs(delta) / 0.5 * 210).astype(np.uint8)
    rgba = np.zeros((*delta.shape, 4), dtype=np.uint8)
    negative = (delta < 0) & valid
    positive = (delta > 0) & valid
    rgba[negative, :3] = (239, 68, 68)
    rgba[positive, :3] = (34, 197, 94)
    rgba[..., 3] = np.where(valid, strength, 0)
    output = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(output, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


class ForestChangeDetector:
    def __init__(self, checkpoint_path: str | None = None) -> None:
        checkpoint = checkpoint_path or os.getenv("MODEL_CHECKPOINT")
        self.model = None
        self.device = None
        if checkpoint and torch is not None and Path(checkpoint).is_file():
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.model = ChangeUNet().to(self.device)
            state = torch.load(checkpoint, map_location=self.device, weights_only=True)
            self.model.load_state_dict(state)
            self.model.eval()

    @property
    def engine(self) -> str:
        return "change-unet-v1" if self.model is not None else "rgb-vegetation-baseline-v1"

    def _predict_masks(
        self,
        before: np.ndarray,
        after: np.ndarray,
        sensitivity: float,
        before_ndvi: np.ndarray | None = None,
        after_ndvi: np.ndarray | None = None,
    ) -> tuple[np.ndarray, np.ndarray]:
        if self.model is not None:
            # U-Net dimensions must be divisible by 8; restore masks to API image size.
            height, width = before.shape[:2]
            sized_width, sized_height = max(8, width // 8 * 8), max(8, height // 8 * 8)
            b = cv2.resize(before, (sized_width, sized_height)).astype(np.float32) / 255.0
            a = cv2.resize(after, (sized_width, sized_height)).astype(np.float32) / 255.0
            values = np.concatenate((b, a), axis=2).transpose(2, 0, 1)
            tensor = torch.from_numpy(values).unsqueeze(0).to(self.device)
            with torch.inference_mode():
                classes = self.model(tensor).argmax(1).squeeze(0).cpu().numpy().astype(np.uint8)
            classes = cv2.resize(classes, (width, height), interpolation=cv2.INTER_NEAREST)
            return (classes == 1).astype(np.uint8), (classes == 2).astype(np.uint8)

        if before_ndvi is not None and after_ndvi is not None:
            before_forest = _ndvi_forest_mask(before_ndvi, sensitivity)
            after_forest = _ndvi_forest_mask(after_ndvi, sensitivity)
            # Require a meaningful NDVI shift as well as a class transition to suppress seasonal noise.
            minimum_delta = 0.16 - sensitivity * 0.10
            loss = before_forest & (1 - after_forest) & ((before_ndvi - after_ndvi) >= minimum_delta)
            gain = after_forest & (1 - before_forest) & ((after_ndvi - before_ndvi) >= minimum_delta)
            return loss.astype(np.uint8), gain.astype(np.uint8)

        # Higher user sensitivity lowers the vegetation threshold slightly.
        threshold = 0.16 - sensitivity * 0.10
        before_forest = _vegetation_mask(before, threshold)
        after_forest = _vegetation_mask(after, threshold)
        return before_forest & (1 - after_forest), after_forest & (1 - before_forest)

    def detect_arrays(
        self,
        before: np.ndarray,
        after: np.ndarray,
        bounds: Bounds,
        sensitivity: float,
        *,
        before_ndvi: np.ndarray | None = None,
        after_ndvi: np.ndarray | None = None,
        valid_mask: np.ndarray | None = None,
        source: dict[str, Any] | None = None,
        minimum_patch_hectares: float = 0.5,
    ) -> dict[str, Any]:
        bounds.validate()
        if after.shape[:2] != before.shape[:2]:
            after = cv2.resize(after, (before.shape[1], before.shape[0]), interpolation=cv2.INTER_AREA)

        loss, gain = self._predict_masks(before, after, sensitivity, before_ndvi, after_ndvi)
        if valid_mask is not None:
            valid_mask = cv2.resize(valid_mask.astype(np.uint8), (loss.shape[1], loss.shape[0]), interpolation=cv2.INTER_NEAREST)
            loss, gain = loss & valid_mask, gain & valid_mask
        total_area = _area_sq_km(bounds)
        hectares_per_pixel = total_area * 100 / loss.size
        min_blob = max(4, math.ceil(minimum_patch_hectares / max(hectares_per_pixel, 0.000001)))
        loss, gain = _clean(loss, min_blob), _clean(gain, min_blob)
        loss_area = total_area * float(loss.mean())
        gain_area = total_area * float(gain.mean())
        changed = np.logical_or(loss, gain)
        features = _mask_features(loss, "loss", bounds, total_area)
        features += _mask_features(gain, "gain", bounds, total_area)

        valid_percent = round(float(valid_mask.mean()) * 100, 2) if valid_mask is not None else 100.0
        source_cloud = [] if source is None else [
            float(source.get("before", {}).get("cloud_cover_percent", 0)),
            float(source.get("after", {}).get("cloud_cover_percent", 0)),
        ]
        average_cloud = sum(source_cloud) / len(source_cloud) if source_cloud else 0.0
        confidence = round(max(0.0, min(96.0, valid_percent * 0.78 + (100 - average_cloud) * 0.18)), 1)
        loss_features = sorted(
            (feature for feature in features if feature["properties"]["change"] == "loss"),
            key=lambda feature: feature["properties"]["area_sq_km"],
            reverse=True,
        )
        hotspots = []
        for index, feature in enumerate(loss_features[:5], start=1):
            points = feature["geometry"]["coordinates"][0][:-1]
            hotspots.append({
                "rank": index,
                "area_sq_km": feature["properties"]["area_sq_km"],
                "longitude": round(sum(point[0] for point in points) / len(points), 6),
                "latitude": round(sum(point[1] for point in points) / len(points), 6),
            })
        loss_hectares = loss_area * 100
        carbon_low = round(loss_hectares * 50 * 3.67)
        carbon_high = round(loss_hectares * 150 * 3.67)
        if loss_area >= 5 or float(changed.mean()) >= 0.08:
            priority = "high"
        elif loss_area >= 1 or float(changed.mean()) >= 0.025:
            priority = "medium"
        else:
            priority = "low"
        trend = "net forest loss" if gain_area - loss_area < -0.01 else "net forest gain" if gain_area - loss_area > 0.01 else "stable"
        forest_before_percent = None
        forest_after_percent = None
        mean_ndvi_before = None
        mean_ndvi_after = None
        ndvi_delta_url = None
        if before_ndvi is not None and after_ndvi is not None:
            valid = valid_mask.astype(bool) if valid_mask is not None else np.ones_like(before_ndvi, dtype=bool)
            valid_count = max(1, int(valid.sum()))
            before_forest = _ndvi_forest_mask(before_ndvi, sensitivity).astype(bool) & valid
            after_forest = _ndvi_forest_mask(after_ndvi, sensitivity).astype(bool) & valid
            forest_before_percent = round(float(before_forest.sum()) / valid_count * 100, 2)
            forest_after_percent = round(float(after_forest.sum()) / valid_count * 100, 2)
            mean_ndvi_before = round(float(before_ndvi[valid].mean()), 3) if valid.any() else None
            mean_ndvi_after = round(float(after_ndvi[valid].mean()), 3) if valid.any() else None
            ndvi_delta_url = _ndvi_delta_data_url(before_ndvi, after_ndvi, valid)

        observation_days = None
        annualized_loss = None
        seasonal_gap_days = None
        comparison_quality = "standard"
        if source and source.get("before", {}).get("date") and source.get("after", {}).get("date"):
            before_date = date.fromisoformat(source["before"]["date"])
            after_date = date.fromisoformat(source["after"]["date"])
            observation_days = (after_date - before_date).days
            annualized_loss = round(loss_area / max(observation_days / 365.25, 0.01), 4)
            before_doy, after_doy = before_date.timetuple().tm_yday, after_date.timetuple().tm_yday
            raw_gap = abs(before_doy - after_doy)
            seasonal_gap_days = min(raw_gap, 365 - raw_gap)
            comparison_quality = "strong" if seasonal_gap_days <= 30 and valid_percent >= 85 else "moderate" if seasonal_gap_days <= 60 and valid_percent >= 70 else "limited"

        warnings = [
            "Area and carbon exposure are estimates, not regulatory measurements.",
            "Validate detections against local records or field observations.",
        ]
        if seasonal_gap_days is not None and seasonal_gap_days > 45:
            warnings.append("The observations are from different seasons; vegetation cycles may affect the result.")

        return {
            "engine": "sentinel-2-ndvi-change-v1" if before_ndvi is not None else self.engine,
            "summary": {
                "aoi_area_sq_km": round(total_area, 4),
                "forest_loss_sq_km": round(loss_area, 4),
                "forest_gain_sq_km": round(gain_area, 4),
                "net_change_sq_km": round(gain_area - loss_area, 4),
                "changed_percent": round(float(changed.mean()) * 100, 3),
                "forest_loss_hectares": round(loss_area * 100, 2),
                "forest_cover_before_percent": forest_before_percent,
                "forest_cover_after_percent": forest_after_percent,
                "annualized_loss_sq_km": annualized_loss,
            },
            "bounds": bounds.__dict__,
            "image": {"width": before.shape[1], "height": before.shape[0]},
            "change_geojson": {"type": "FeatureCollection", "features": features},
            "overlay_data_url": _overlay_data_url(loss, gain),
            "ndvi_delta_overlay_data_url": ndvi_delta_url,
            "legend": {"loss": "#ef4444", "gain": "#22c55e"},
            "insights": {
                "field_priority": priority,
                "trend": trend,
                "analysis_confidence_percent": confidence,
                "valid_pixel_percent": valid_percent,
                "comparison_quality": comparison_quality,
                "observation_gap_days": observation_days,
                "seasonal_gap_days": seasonal_gap_days,
                "mean_ndvi_before": mean_ndvi_before,
                "mean_ndvi_after": mean_ndvi_after,
                "minimum_patch_hectares": minimum_patch_hectares,
                "loss_hotspots": hotspots,
                "carbon_exposure_tonnes_co2e": {"low": carbon_low, "high": carbon_high},
                "recommendation": (
                    "Prioritise field verification of the largest red hotspot."
                    if priority == "high" else
                    "Review hotspot polygons against recent permits and fire records."
                    if priority == "medium" else
                    "No major signal; continue periodic monitoring."
                ),
            },
            "source": source or {"type": "manual_upload"},
            "warnings": warnings,
        }

    def detect(
        self,
        before_bytes: bytes,
        after_bytes: bytes,
        bounds: Bounds,
        sensitivity: float,
        minimum_patch_hectares: float = 0.5,
    ) -> dict[str, Any]:
        return self.detect_arrays(
            load_rgb(before_bytes), load_rgb(after_bytes), bounds, sensitivity,
            minimum_patch_hectares=minimum_patch_hectares,
        )
