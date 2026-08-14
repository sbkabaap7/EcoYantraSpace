from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class EmissionFactor(BaseModel):
    factor_kg_per_kwh: float = Field(gt=0)
    unit: str
    region: str
    source: str
    valid_from: str
    valid_to: str
    is_verified: bool


class Scenario(BaseModel):
    region: str = "demo"
    efficiency_percent: float = Field(default=0, ge=0, le=40)
    renewable_growth_percent: float = Field(default=0, ge=-50, le=300)
    temperature_delta_c: float = Field(default=0, ge=-10, le=10)
    custom_factor_kg_per_kwh: float | None = Field(default=None, gt=0, le=2)


class ForecastPoint(BaseModel):
    timestamp: datetime
    energy_kwh: float = Field(ge=0)
    co2_kg: float = Field(ge=0)
    lower: float = Field(ge=0, description="Lower 90% energy estimate in kWh")
    upper: float = Field(ge=0, description="Upper 90% energy estimate in kWh")
    co2_lower_kg: float = Field(ge=0)
    co2_upper_kg: float = Field(ge=0)
    temperature_c: float
    solar_kwh: float = Field(ge=0)
    wind_kwh: float = Field(ge=0)
    renewable_share_percent: float = Field(ge=0, le=100)
    carbon_intensity_kg_per_kwh: float = Field(ge=0)


class PeakHour(BaseModel):
    timestamp: datetime
    energy_kwh: float


class CleanWindow(BaseModel):
    start: datetime
    end: datetime
    average_carbon_intensity: float


class ShiftOpportunity(BaseModel):
    from_timestamp: datetime
    to_timestamp: datetime
    flexible_load_kwh: float
    estimated_savings_kg: float


class ForecastSummary(BaseModel):
    total_energy_kwh: float
    total_co2_kg: float
    renewable_energy_kwh: float
    average_carbon_intensity: float
    peak_hour: PeakHour
    cleanest_window: CleanWindow
    shift_opportunity: ShiftOpportunity
    recommendation: str
    recommendations: list[str]


class ForecastResponse(BaseModel):
    model: str
    generated_at: datetime
    data_through: datetime
    hours: int
    scenario: Scenario
    emission_factor: EmissionFactor
    forecast: list[ForecastPoint]
    summary: ForecastSummary


class HourlyObservation(BaseModel):
    timestamp: datetime
    energy_kwh: float = Field(gt=0)
    temperature_c: float = Field(ge=-60, le=70)
    solar_kwh: float = Field(ge=0)
    wind_kwh: float = Field(ge=0)


class FutureCondition(BaseModel):
    timestamp: datetime
    temperature_c: float = Field(ge=-60, le=70)
    solar_kwh: float = Field(ge=0)
    wind_kwh: float = Field(ge=0)


class CustomForecastRequest(BaseModel):
    hours: int = Field(default=24, ge=1, le=168)
    history: list[HourlyObservation] = Field(min_length=168, max_length=17520)
    future_conditions: list[FutureCondition] = Field(default_factory=list, max_length=168)
    scenario: Scenario = Field(default_factory=Scenario)

    @field_validator("history")
    @classmethod
    def timestamps_must_be_unique(cls, values: list[HourlyObservation]) -> list[HourlyObservation]:
        timestamps = [value.timestamp for value in values]
        if len(timestamps) != len(set(timestamps)):
            raise ValueError("history timestamps must be unique")
        return values
