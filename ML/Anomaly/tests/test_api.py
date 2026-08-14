from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_attack_reading_creates_high_severity_alert():
    response = client.post("/api/v1/iot/readings", json={
        "device_id": "17", "energy_kwh": 4820,
        "timestamp": "2026-08-08T10:00:00Z", "user_id": "simulator", "message_id": "test-attack-001",
    })
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "ANOMALY"
    assert body["severity"] == "HIGH"
    assert body["expected_range"] == {"min": 480.0, "max": 530.0}
    assert body["observed"] == 4820.0
    assert "forecast residual is unusually large" in body["reasons"]
    assert body["signals"]
    assert "sensor integrity" in body["recommended_action"]


def test_negative_energy_is_rejected():
    response = client.post("/api/v1/iot/readings", json={
        "device_id": "17", "energy_kwh": -1, "timestamp": "2026-08-08T10:00:00Z",
    })
    assert response.status_code == 422


def test_dashboard_and_attack_demo_are_available():
    assert client.post("/api/v1/demo/attack").status_code == 201
    asset_attack = client.post("/api/v1/demo/attack?device_id=08")
    assert asset_attack.status_code == 201
    assert asset_attack.json()["device_id"] == "08"
    dashboard = client.get("/api/v1/dashboard?device_id=17&hours=168")
    assert dashboard.status_code == 200
    assert dashboard.json()["alerts"]
