from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.forecasting import FEATURES  # noqa: E402


SEED = 42


def generate_synthetic_data(days: int = 90) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    end = pd.Timestamp.now(tz="UTC").floor("h")
    timestamp = pd.date_range(end=end, periods=days * 24, freq="h")
    hour = timestamp.hour.to_numpy()
    dow = timestamp.dayofweek.to_numpy()
    day_number = np.arange(len(timestamp)) / 24

    temperature = 25 + 6 * np.sin(2 * np.pi * (hour - 7) / 24) + 2 * np.sin(
        2 * np.pi * day_number / 30
    ) + rng.normal(0, 1.2, len(timestamp))
    daylight = np.maximum(0, np.sin(np.pi * (hour - 6) / 12))
    cloud = np.clip(rng.normal(0.78, 0.18, len(timestamp)), 0.2, 1.0)
    solar = 18 * daylight * cloud + rng.normal(0, 0.5, len(timestamp))
    solar = np.maximum(0, solar)
    wind = np.maximum(0, 5 + 2.2 * np.sin(2 * np.pi * day_number / 5) + rng.normal(0, 1.4, len(timestamp)))
    morning_peak = 12 * np.exp(-0.5 * ((hour - 9) / 2.2) ** 2)
    evening_peak = 23 * np.exp(-0.5 * ((hour - 19) / 2.8) ** 2)
    weekend_adjustment = np.where(dow >= 5, -7, 0)
    cooling_load = np.maximum(temperature - 24, 0) * 2.0
    energy = (
        52
        + morning_peak
        + evening_peak
        + weekend_adjustment
        + cooling_load
        - 0.18 * solar
        - 0.08 * wind
        + rng.normal(0, 2.2, len(timestamp))
    )
    return pd.DataFrame(
        {
            "timestamp": timestamp,
            "energy_kwh": np.maximum(5, energy),
            "temperature_c": temperature,
            "solar_kwh": solar,
            "wind_kwh": wind,
        }
    )


def build_features(data: pd.DataFrame) -> pd.DataFrame:
    frame = data.copy()
    timestamp = pd.to_datetime(frame["timestamp"], utc=True)
    frame["hour_sin"] = np.sin(2 * np.pi * timestamp.dt.hour / 24)
    frame["hour_cos"] = np.cos(2 * np.pi * timestamp.dt.hour / 24)
    frame["dow"] = timestamp.dt.dayofweek
    frame["is_weekend"] = (timestamp.dt.dayofweek >= 5).astype(int)
    for hours in (1, 24, 168):
        frame[f"lag_{hours}h"] = frame["energy_kwh"].shift(hours)
    shifted = frame["energy_kwh"].shift(1)
    frame["roll_24h_mean"] = shifted.rolling(24).mean()
    frame["roll_24h_std"] = shifted.rolling(24).std(ddof=0)
    return frame.dropna().reset_index(drop=True)


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    error = actual - predicted
    return {
        "mae": round(float(np.mean(np.abs(error))), 4),
        "rmse": round(float(np.sqrt(np.mean(error**2))), 4),
        "mape_percent": round(float(np.mean(np.abs(error / actual)) * 100), 4),
    }


def fit_ridge(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    feature_mean = x.mean(axis=0)
    feature_scale = x.std(axis=0)
    feature_scale[feature_scale == 0] = 1
    scaled = (x - feature_mean) / feature_scale
    design = np.column_stack([np.ones(len(scaled)), scaled])
    ridge = np.eye(design.shape[1]) * 1.0
    ridge[0, 0] = 0
    weights = np.linalg.solve(design.T @ design + ridge, design.T @ y)
    return weights, feature_mean, feature_scale


def main() -> None:
    data = generate_synthetic_data()
    frame = build_features(data)
    validation_split = int(len(frame) * 0.7)
    test_split = int(len(frame) * 0.8)
    fit_frame = frame.iloc[:validation_split]
    validation = frame.iloc[validation_split:test_split]
    train, test = frame.iloc[:test_split], frame.iloc[test_split:]
    x_fit = fit_frame[FEATURES].to_numpy(dtype=float)
    y_fit = fit_frame["energy_kwh"].to_numpy(dtype=float)
    provisional_weights, provisional_mean, provisional_scale = fit_ridge(x_fit, y_fit)
    validation_x = validation[FEATURES].to_numpy(dtype=float)
    validation_actual = validation["energy_kwh"].to_numpy(dtype=float)
    validation_regression = provisional_weights[0] + (
        (validation_x - provisional_mean) / provisional_scale
    ) @ provisional_weights[1:]
    validation_seasonal = (
        0.65 * validation["lag_24h"].to_numpy(dtype=float)
        + 0.35 * validation["lag_168h"].to_numpy(dtype=float)
    )
    candidates = np.linspace(0, 1, 21)
    blend_weight = float(
        min(
            candidates,
            key=lambda weight: np.mean(
                np.abs(validation_actual - (weight * validation_regression + (1 - weight) * validation_seasonal))
            ),
        )
    )
    validation_prediction = blend_weight * validation_regression + (1 - blend_weight) * validation_seasonal
    calibration_residuals = validation_actual - validation_prediction

    x_train = train[FEATURES].to_numpy(dtype=float)
    x_test = test[FEATURES].to_numpy(dtype=float)
    y_train = train["energy_kwh"].to_numpy(dtype=float)
    y_test = test["energy_kwh"].to_numpy(dtype=float)
    weights, feature_mean, feature_scale = fit_ridge(x_train, y_train)
    x_test_scaled = (x_test - feature_mean) / feature_scale
    regression_prediction = weights[0] + x_test_scaled @ weights[1:]
    seasonal_prediction = (
        0.65 * test["lag_24h"].to_numpy(dtype=float)
        + 0.35 * test["lag_168h"].to_numpy(dtype=float)
    )
    predicted = blend_weight * regression_prediction + (1 - blend_weight) * seasonal_prediction
    residuals = y_test - predicted
    baseline = test["lag_24h"].to_numpy(dtype=float)

    model = {
        "model_name": "hybrid_ridge_energy_v2",
        "version": 2,
        "trained_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "random_seed": SEED,
        "features": FEATURES,
        "intercept": float(weights[0]),
        "coefficients": weights[1:].tolist(),
        "feature_mean": feature_mean.tolist(),
        "feature_scale": feature_scale.tolist(),
        "blend_model_weight": blend_weight,
        "residual_quantiles": {
            "lower": float(np.quantile(calibration_residuals, 0.05)),
            "upper": float(np.quantile(calibration_residuals, 0.95)),
            "coverage_target": 0.90,
            "calibration_rows": len(validation),
        },
    }
    report = {
        "model": model["model_name"],
        "dataset": {
            "type": "synthetic_demo",
            "hours": len(data),
            "training_rows": len(train),
            "validation_rows": len(validation),
            "test_rows": len(test),
            "chronological_split": True,
            "random_seed": SEED,
        },
        "test_metrics": metrics(y_test, predicted),
        "previous_day_baseline_metrics": metrics(y_test, baseline),
        "model_strategy": {
            "type": "regularized regression + seasonal ensemble",
            "regression_weight": blend_weight,
            "seasonal_weight": round(1 - blend_weight, 2),
            "interval_method": "chronological conformal residual quantiles",
        },
        "interval_test_coverage_percent": round(
            float(
                np.mean(
                    (y_test >= predicted + np.quantile(calibration_residuals, 0.05))
                    & (y_test <= predicted + np.quantile(calibration_residuals, 0.95))
                )
                * 100
            ),
            2,
        ),
        "warning": "Synthetic demo data and emission assumptions must be replaced for production.",
    }

    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "models").mkdir(exist_ok=True)
    data.to_csv(ROOT / "data/hourly_energy.csv", index=False)
    (ROOT / "models/energy_forecast_v1.json").write_text(
        json.dumps(model, indent=2), encoding="utf-8"
    )
    (ROOT / "models/metrics_v1.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
