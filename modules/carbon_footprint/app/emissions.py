from __future__ import annotations

from copy import deepcopy

from app.config import EMISSION_FACTORS


def get_emission_factor(region: str = "demo", custom_factor: float | None = None) -> dict:
    if region not in EMISSION_FACTORS:
        region = "demo"
    factor = deepcopy(EMISSION_FACTORS[region])
    if custom_factor is not None:
        factor.update(
            {
                "factor_kg_per_kwh": custom_factor,
                "region": "CUSTOM",
                "source": "User-supplied carbon intensity",
                "is_verified": False,
            }
        )
    return factor


def available_regions() -> list[dict[str, str | float | bool]]:
    return [
        {
            "key": key,
            "region": value["region"],
            "factor_kg_per_kwh": value["factor_kg_per_kwh"],
            "is_verified": value["is_verified"],
        }
        for key, value in EMISSION_FACTORS.items()
    ]
