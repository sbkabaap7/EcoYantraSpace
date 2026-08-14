"""Automatic Sentinel-2 retrieval from Microsoft Planetary Computer."""

from __future__ import annotations

import base64
import io
import math
import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from typing import Any

import numpy as np
import rasterio
from PIL import Image
from pydantic.warnings import PydanticDeprecatedSince20
from pystac import Item
from pystac_client import Client
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

from .detector import Bounds, _area_sq_km


# planetary-computer 1.0.0 still declares a Pydantic v1-style Config class.
# Keep that third-party deprecation from surfacing whenever this app starts.
with warnings.catch_warnings():
    warnings.filterwarnings(
        "ignore",
        message="Support for class-based `config` is deprecated",
        category=PydanticDeprecatedSince20,
        module=r"pydantic\._internal\._config",
    )
    import planetary_computer


STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
EARTH_SEARCH_URL = "https://earth-search.aws.element84.com/v1"
CLOUD_CLASSES = {0, 1, 3, 8, 9, 10, 11}


class SatelliteDataError(RuntimeError):
    pass


@dataclass
class SatelliteObservation:
    rgb: np.ndarray
    ndvi: np.ndarray
    valid_mask: np.ndarray
    metadata: dict[str, Any]
    preview_data_url: str


@dataclass(frozen=True)
class CatalogSource:
    name: str
    url: str
    collection: str
    bands: tuple[str, str, str, str, str]
    requires_signing: bool


CATALOG_SOURCES = (
    CatalogSource("Microsoft Planetary Computer", STAC_URL, "sentinel-2-l2a", ("B04", "B03", "B02", "B08", "SCL"), True),
    CatalogSource("Element 84 Earth Search", EARTH_SEARCH_URL, "sentinel-2-c1-l2a", ("red", "green", "blue", "nir", "scl"), False),
)


def _coverage(item: Item, bounds: Bounds) -> float:
    west, south, east, north = item.bbox
    overlap_width = max(0.0, min(east, bounds.east) - max(west, bounds.west))
    overlap_height = max(0.0, min(north, bounds.north) - max(south, bounds.south))
    return overlap_width * overlap_height / ((bounds.east - bounds.west) * (bounds.north - bounds.south))


def _read_asset(
    item: Item,
    key: str,
    bounds: Bounds,
    shape: tuple[int, int],
    resampling: Resampling,
    requires_signing: bool,
) -> np.ndarray:
    if key not in item.assets:
        raise SatelliteDataError(f"Sentinel scene does not contain required band {key}")
    href = planetary_computer.sign(item.assets[key].href) if requires_signing else item.assets[key].href
    try:
        with rasterio.Env(
            GDAL_HTTP_MULTIRANGE="YES",
            GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
            GDAL_HTTP_TIMEOUT="25",
        ):
            with rasterio.open(href) as source:
                native_bounds = transform_bounds(
                    "EPSG:4326",
                    source.crs,
                    bounds.west,
                    bounds.south,
                    bounds.east,
                    bounds.north,
                    densify_pts=21,
                )
                window = from_bounds(*native_bounds, transform=source.transform)
                return source.read(
                    1,
                    window=window,
                    out_shape=shape,
                    boundless=True,
                    fill_value=0,
                    resampling=resampling,
                )
    except Exception as exc:
        raise SatelliteDataError(f"Could not read Sentinel band {key}: {exc}") from exc


def _stretch_rgb(red: np.ndarray, green: np.ndarray, blue: np.ndarray, valid: np.ndarray) -> np.ndarray:
    output = []
    for band in (red, green, blue):
        values = band[valid]
        if values.size:
            low, high = np.percentile(values, (2, 98))
        else:
            low, high = 0, 3000
        scaled = np.clip((band.astype(np.float32) - low) / max(1.0, high - low), 0, 1)
        output.append((scaled * 255).astype(np.uint8))
    rgb = np.stack(output, axis=2)
    rgb[~valid] = (208, 215, 210)
    return rgb


def _data_url(rgb: np.ndarray) -> str:
    output = io.BytesIO()
    Image.fromarray(rgb, "RGB").save(output, "JPEG", quality=84, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")


class Sentinel2Provider:
    def __init__(self) -> None:
        self._catalogs: dict[str, Client] = {}

    def _catalog(self, source: CatalogSource) -> Client:
        if source.url not in self._catalogs:
            self._catalogs[source.url] = Client.open(source.url)
        return self._catalogs[source.url]

    def _select_item(self, bounds: Bounds, start: date, end: date, max_cloud: float) -> tuple[Item, CatalogSource]:
        errors: list[str] = []
        found_empty_catalog = False
        for source in CATALOG_SOURCES:
            for attempt, delay in enumerate((0.0, 0.6, 1.8), start=1):
                if delay:
                    time.sleep(delay)
                try:
                    items = list(
                        self._catalog(source).search(
                            collections=[source.collection],
                            bbox=[bounds.west, bounds.south, bounds.east, bounds.north],
                            datetime=f"{start.isoformat()}/{end.isoformat()}",
                            query={"eo:cloud_cover": {"lt": max_cloud}},
                            max_items=40,
                        ).items()
                    )
                    if not items:
                        found_empty_catalog = True
                        break
                    selected = max(items, key=lambda item: (_coverage(item, bounds) >= 0.995, _coverage(item, bounds), -float(item.properties.get("eo:cloud_cover", 100))))
                    return selected, source
                except Exception as exc:
                    self._catalogs.pop(source.url, None)
                    if attempt == 3:
                        errors.append(f"{source.name}: {type(exc).__name__}")
        if found_empty_catalog and not errors:
            raise SatelliteDataError(
                f"No Sentinel-2 scene found from {start} to {end} below {max_cloud:g}% cloud. "
                "Use a wider date range or raise the cloud limit."
            )
        providers = "; ".join(errors) if errors else "no matching scenes"
        raise SatelliteDataError(
            "Both satellite catalogues are temporarily unavailable "
            f"({providers}). Check the internet connection and retry; completed scene queries remain cached."
        )

    @staticmethod
    def target_shape(bounds: Bounds, max_side: int = 640) -> tuple[int, int]:
        mean_latitude = math.radians((bounds.north + bounds.south) / 2)
        width_km = 111.320 * math.cos(mean_latitude) * (bounds.east - bounds.west)
        height_km = 110.574 * (bounds.north - bounds.south)
        if width_km >= height_km:
            return max(160, round(max_side * height_km / max(width_km, 0.001))), max_side
        return max_side, max(160, round(max_side * width_km / max(height_km, 0.001)))

    @lru_cache(maxsize=32)
    def observation(self, bounds: Bounds, start: date, end: date, max_cloud: float, max_side: int = 640) -> SatelliteObservation:
        bounds.validate()
        if _area_sq_km(bounds) > 2500:
            raise SatelliteDataError("Selected area is too large. Draw an area smaller than 2,500 km².")
        if start > end:
            raise SatelliteDataError("The start date must be before the end date.")
        item, catalog_source = self._select_item(bounds, start, end, max_cloud)
        shape = self.target_shape(bounds, max_side)
        red_key, green_key, blue_key, nir_key, scl_key = catalog_source.bands
        red = _read_asset(item, red_key, bounds, shape, Resampling.bilinear, catalog_source.requires_signing).astype(np.float32)
        green = _read_asset(item, green_key, bounds, shape, Resampling.bilinear, catalog_source.requires_signing).astype(np.float32)
        blue = _read_asset(item, blue_key, bounds, shape, Resampling.bilinear, catalog_source.requires_signing).astype(np.float32)
        nir = _read_asset(item, nir_key, bounds, shape, Resampling.bilinear, catalog_source.requires_signing).astype(np.float32)
        scl = _read_asset(item, scl_key, bounds, shape, Resampling.nearest, catalog_source.requires_signing).astype(np.uint8)
        valid = (red > 0) & (nir > 0) & ~np.isin(scl, list(CLOUD_CLASSES))
        ndvi = np.divide(nir - red, nir + red, out=np.full_like(red, -1.0), where=(nir + red) > 0)
        rgb = _stretch_rgb(red, green, blue, valid)
        scene_date = item.datetime.date().isoformat() if item.datetime else str(item.properties.get("datetime", ""))[:10]
        metadata = {
            "scene_id": item.id,
            "catalog_provider": catalog_source.name,
            "date": scene_date,
            "cloud_cover_percent": round(float(item.properties.get("eo:cloud_cover", 0)), 2),
            "valid_pixel_percent": round(float(valid.mean()) * 100, 2),
            "coverage_percent": round(_coverage(item, bounds) * 100, 2),
            "platform": item.properties.get("platform", "Sentinel-2"),
            "resolution_m": 10,
            "processed_width": shape[1],
            "processed_height": shape[0],
        }
        return SatelliteObservation(rgb, ndvi, valid, metadata, _data_url(rgb))

    def paired_observations(
        self,
        bounds: Bounds,
        before_start: date,
        before_end: date,
        after_start: date,
        after_end: date,
        max_cloud: float,
    ) -> tuple[SatelliteObservation, SatelliteObservation]:
        # Independent date windows can be fetched concurrently; repeated requests use the LRU cache.
        with ThreadPoolExecutor(max_workers=2) as executor:
            before_future = executor.submit(self.observation, bounds, before_start, before_end, max_cloud)
            after_future = executor.submit(self.observation, bounds, after_start, after_end, max_cloud)
            return before_future.result(), after_future.result()

    def cache_stats(self) -> dict[str, int]:
        info = self.observation.cache_info()
        return {"hits": info.hits, "misses": info.misses, "entries": info.currsize, "capacity": info.maxsize}
