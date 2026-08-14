from fastapi.testclient import TestClient

from app.main import app, get_forecast_service


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_forecast_contract() -> None:
    response = client.get("/api/v1/energy/forecast?hours=6")
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "hybrid_ridge_energy_v2"
    assert body["hours"] == 6
    assert len(body["forecast"]) == 6
    assert body["emission_factor"]["is_verified"] is False
    assert "peak_hour" in body["summary"]
    assert "cleanest_window" in body["summary"]
    assert "carbon_intensity_kg_per_kwh" in body["forecast"][0]


def test_forecast_hours_validation() -> None:
    assert client.get("/api/v1/energy/forecast?hours=0").status_code == 422
    assert client.get("/api/v1/energy/forecast?hours=169").status_code == 422


def test_metrics_endpoint() -> None:
    response = client.get("/api/v1/model/metrics")
    assert response.status_code == 200
    assert response.json()["dataset"]["chronological_split"] is True


def test_dashboard_is_served() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "CarbonSense" in response.text
    assert "energy-chart" in response.text


def test_data_quality_and_history() -> None:
    quality = client.get("/api/v1/data/quality")
    history = client.get("/api/v1/energy/history?hours=24")
    assert quality.status_code == 200
    assert quality.json()["score"] >= 0
    assert history.status_code == 200
    assert len(history.json()["history"]) == 24


def test_scenario_changes_results() -> None:
    baseline = client.get("/api/v1/energy/forecast?hours=24").json()
    scenario = client.get(
        "/api/v1/energy/forecast?hours=24&efficiency_percent=15&renewable_growth_percent=50"
    ).json()
    assert scenario["summary"]["total_energy_kwh"] < baseline["summary"]["total_energy_kwh"]
    assert scenario["summary"]["total_co2_kg"] < baseline["summary"]["total_co2_kg"]


def test_custom_history_forecast() -> None:
    history = get_forecast_service().history.tail(168).copy()
    history["timestamp"] = history["timestamp"].map(lambda value: value.isoformat())
    payload = {
        "hours": 3,
        "history": history.to_dict(orient="records"),
        "scenario": {"region": "low_carbon_demo", "efficiency_percent": 5},
    }
    response = client.post("/api/v1/energy/forecast/custom", json=payload)
    assert response.status_code == 200
    assert len(response.json()["forecast"]) == 3
    assert response.json()["emission_factor"]["region"] == "LOW_CARBON_DEMO"


def test_openapi_contains_forecast_endpoint() -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/api/v1/energy/forecast" in response.json()["paths"]
