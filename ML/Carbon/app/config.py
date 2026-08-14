from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT_DIR / "models/energy_forecast_v1.json"
DATA_PATH = ROOT_DIR / "data/hourly_energy.csv"
METRICS_PATH = ROOT_DIR / "models/metrics_v1.json"
STATIC_DIR = ROOT_DIR / "app/static"

# Demo assumption only. Replace this object with a verified regional factor/service.
EMISSION_FACTORS = {
    "demo": {
    "factor_kg_per_kwh": 0.47,
    "unit": "kgCO2e/kWh",
    "region": "DEMO_GENERIC_GRID",
    "source": "Hackathon demo assumption - not verified for production",
    "valid_from": "2026-01-01",
    "valid_to": "2026-12-31",
    "is_verified": False,
    },
    "low_carbon_demo": {
        "factor_kg_per_kwh": 0.18,
        "unit": "kgCO2e/kWh",
        "region": "LOW_CARBON_DEMO",
        "source": "Hackathon scenario assumption - not a live grid factor",
        "valid_from": "2026-01-01",
        "valid_to": "2026-12-31",
        "is_verified": False,
    },
    "high_carbon_demo": {
        "factor_kg_per_kwh": 0.72,
        "unit": "kgCO2e/kWh",
        "region": "HIGH_CARBON_DEMO",
        "source": "Hackathon scenario assumption - not a live grid factor",
        "valid_from": "2026-01-01",
        "valid_to": "2026-12-31",
        "is_verified": False,
    },
}


def cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
    return [item.strip() for item in raw.split(",") if item.strip()]
