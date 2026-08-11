import unittest

from app.forecasting import ForecastService
from app.schemas import Scenario


class ForecastServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.service = ForecastService()

    def test_forecast_has_requested_number_of_points(self) -> None:
        response = self.service.forecast(24)
        self.assertEqual(response["hours"], 24)
        self.assertEqual(len(response["forecast"]), 24)

    def test_ranges_and_carbon_are_valid(self) -> None:
        response = self.service.forecast(3)
        for point in response["forecast"]:
            self.assertLessEqual(point["lower"], point["energy_kwh"])
            self.assertGreaterEqual(point["upper"], point["energy_kwh"])
            self.assertGreaterEqual(point["co2_kg"], 0)

    def test_forecasts_are_deterministic(self) -> None:
        first = self.service.forecast(5)["forecast"]
        second = self.service.forecast(5)["forecast"]
        self.assertEqual(first, second)

    def test_horizon_uncertainty_grows(self) -> None:
        points = self.service.forecast(72)["forecast"]
        first_width = points[0]["upper"] - points[0]["lower"]
        final_width = points[-1]["upper"] - points[-1]["lower"]
        self.assertGreater(final_width, first_width)

    def test_custom_factor_is_kept_outside_model(self) -> None:
        response = self.service.forecast(
            2, scenario=Scenario(custom_factor_kg_per_kwh=0.25)
        )
        self.assertEqual(response["emission_factor"]["region"], "CUSTOM")
        self.assertEqual(response["model"], "hybrid_ridge_energy_v2")

    def test_data_quality_is_reported(self) -> None:
        quality = self.service.data_quality()
        self.assertEqual(quality["missing_hours"], 0)
        self.assertGreaterEqual(quality["completeness_percent"], 99)


if __name__ == "__main__":
    unittest.main()
