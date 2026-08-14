from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.forecasting import ForecastService  # noqa: E402


OUT = ROOT / "output/pdf/carbonsense_project_overview.pdf"
WIDTH, HEIGHT = A4

INK = HexColor("#12211E")
MUTED = HexColor("#61736E")
GREEN = HexColor("#24B47E")
GREEN_DARK = HexColor("#0B5E43")
GREEN_SOFT = HexColor("#E9F8F2")
NAVY = HexColor("#071511")
PANEL = HexColor("#10231E")
CYAN = HexColor("#298AA3")
AMBER = HexColor("#C58320")
VIOLET = HexColor("#7454B8")
LINE = HexColor("#D8E4E0")
PAPER = HexColor("#F7FAF8")
RED = HexColor("#C34F43")


def wrap_text(text: str, font: str, size: float, max_width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def paragraph(c: canvas.Canvas, text: str, x: float, y: float, width: float, size: float = 9.5,
              color=INK, leading: float = 14, font: str = "Helvetica") -> float:
    c.setFillColor(color)
    c.setFont(font, size)
    for line in wrap_text(text, font, size, width):
        c.drawString(x, y, line)
        y -= leading
    return y


def bullet_list(c: canvas.Canvas, items: list[str], x: float, y: float, width: float,
                size: float = 9, leading: float = 13.5, accent=GREEN) -> float:
    for item in items:
        lines = wrap_text(item, "Helvetica", size, width - 18)
        c.setFillColor(accent)
        c.circle(x + 3, y + 2, 2, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Helvetica", size)
        for index, line in enumerate(lines):
            c.drawString(x + 14, y, line)
            y -= leading
        y -= 3
    return y


def section_label(c: canvas.Canvas, text: str, x: float, y: float, color=GREEN) -> None:
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x, y, text.upper())


def title(c: canvas.Canvas, text: str, x: float, y: float, size: float = 24, color=INK) -> None:
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", size)
    c.drawString(x, y, text)


def header(c: canvas.Canvas, page: int, section: str) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    c.setFillColor(GREEN)
    c.circle(38, HEIGHT - 34, 10, fill=0, stroke=1)
    c.setLineWidth(1.2)
    c.line(34, HEIGHT - 40, 42, HEIGHT - 27)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(INK)
    c.drawString(56, HEIGHT - 37, "CarbonSense Intelligence")
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawRightString(WIDTH - 36, HEIGHT - 37, section.upper())
    c.setStrokeColor(LINE)
    c.line(36, HEIGHT - 49, WIDTH - 36, HEIGHT - 49)
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawString(36, 24, "Hackathon project overview - August 2026")
    c.drawRightString(WIDTH - 36, 24, f"{page} / 7")


def rounded_box(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill=white,
                stroke=LINE, radius: float = 9) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(.7)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def metric(c: canvas.Canvas, x: float, y: float, w: float, label: str, value: str,
           note: str, accent=GREEN) -> None:
    rounded_box(c, x, y, w, 78, white, LINE)
    c.setFillColor(accent)
    c.rect(x, y, 3, 78, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(x + 14, y + 58, label.upper())
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(x + 14, y + 32, value)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(x + 14, y + 14, note)


def flow_node(c: canvas.Canvas, x: float, y: float, w: float, title_text: str,
              detail: str, number: str, fill=white) -> None:
    rounded_box(c, x, y, w, 74, fill, LINE)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 12, y + 54, number)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 12, y + 37, title_text)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.2)
    for index, line in enumerate(wrap_text(detail, "Helvetica", 7.2, w - 24)[:2]):
        c.drawString(x + 12, y + 21 - 10 * index, line)


def draw_energy_chart(c: canvas.Canvas, x: float, y: float, w: float, h: float,
                      history: list[dict], forecast: list[dict]) -> None:
    rounded_box(c, x, y, w, h, white, LINE)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 16, y + h - 22, "Actual demand to forecast")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawRightString(x + w - 16, y + h - 22, "kWh - 90% forecast range")
    plot_x, plot_y = x + 38, y + 30
    plot_w, plot_h = w - 55, h - 70
    actual = history[-24:]
    all_values = [p["energy_kwh"] for p in actual]
    all_values += [v for p in forecast for v in (p["lower"], p["upper"])]
    low, high = min(all_values) - 4, max(all_values) + 4
    points = len(actual) + len(forecast)

    def sx(index: int) -> float:
        return plot_x + index * plot_w / max(points - 1, 1)

    def sy(value: float) -> float:
        return plot_y + (value - low) * plot_h / max(high - low, 1)

    c.setFont("Helvetica", 6.5)
    for i in range(4):
        yy = plot_y + i * plot_h / 3
        value = low + i * (high - low) / 3
        c.setStrokeColor(LINE)
        c.line(plot_x, yy, plot_x + plot_w, yy)
        c.setFillColor(MUTED)
        c.drawRightString(plot_x - 6, yy - 2, f"{value:.0f}")

    upper = [(sx(len(actual) + i), sy(p["upper"])) for i, p in enumerate(forecast)]
    lower = [(sx(len(actual) + i), sy(p["lower"])) for i, p in reversed(list(enumerate(forecast)))]
    path = c.beginPath()
    path.moveTo(*upper[0])
    for px, py in upper[1:] + lower:
        path.lineTo(px, py)
    path.close()
    c.setFillColor(Color(GREEN.red, GREEN.green, GREEN.blue, alpha=.12))
    c.drawPath(path, fill=1, stroke=0)

    actual_path = c.beginPath()
    actual_path.moveTo(sx(0), sy(actual[0]["energy_kwh"]))
    for index, item in enumerate(actual[1:], 1):
        actual_path.lineTo(sx(index), sy(item["energy_kwh"]))
    c.setStrokeColor(MUTED)
    c.setLineWidth(1.2)
    c.drawPath(actual_path, fill=0, stroke=1)

    forecast_path = c.beginPath()
    forecast_path.moveTo(sx(len(actual) - 1), sy(actual[-1]["energy_kwh"]))
    for index, item in enumerate(forecast):
        forecast_path.lineTo(sx(len(actual) + index), sy(item["energy_kwh"]))
    c.setStrokeColor(GREEN)
    c.setLineWidth(1.7)
    c.drawPath(forecast_path, fill=0, stroke=1)
    divider = sx(len(actual) - 1)
    c.setStrokeColor(GREEN)
    c.setDash(2, 3)
    c.line(divider, plot_y, divider, plot_y + plot_h)
    c.setDash()
    c.setFont("Helvetica-Bold", 6)
    c.setFillColor(GREEN_DARK)
    c.drawString(divider + 4, plot_y + plot_h + 4, "FORECAST")


def cover(c: canvas.Canvas, summary: dict) -> None:
    c.setFillColor(NAVY)
    c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    c.setFillColor(Color(GREEN.red, GREEN.green, GREEN.blue, alpha=.09))
    c.circle(WIDTH - 40, HEIGHT - 80, 190, fill=1, stroke=0)
    c.circle(WIDTH - 10, 120, 120, fill=1, stroke=0)
    c.setStrokeColor(Color(GREEN.red, GREEN.green, GREEN.blue, alpha=.25))
    for radius in (42, 76, 112):
        c.circle(WIDTH - 50, HEIGHT - 135, radius, fill=0, stroke=1)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(44, HEIGHT - 54, "CARBONSENSE  /  ML FORECASTING  /  HACKATHON 2026")
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 36)
    c.drawString(44, HEIGHT - 155, "CarbonSense")
    c.drawString(44, HEIGHT - 197, "Intelligence")
    c.setFillColor(GREEN)
    c.rect(44, HEIGHT - 220, 62, 3, fill=1, stroke=0)
    y = paragraph(
        c,
        "An ML-powered carbon operations platform that predicts energy demand, "
        "estimates emissions and recommends when flexible loads should move.",
        44, HEIGHT - 260, 390, 15, HexColor("#C7D8D2"), 22,
    )
    c.setFillColor(PANEL)
    c.roundRect(44, 110, WIDTH - 88, 118, 12, fill=1, stroke=0)
    metrics = [
        ("FORECAST WINDOW", "1-168h", "hourly outlook"),
        ("MODEL MAE", "2.41", "kWh on demo test"),
        ("INTERVAL COVERAGE", "89.72%", "target: 90%"),
        ("ACTION ENGINE", "Carbon Shift", "low-carbon scheduling"),
    ]
    col_w = (WIDTH - 118) / 4
    for i, (label, value, note) in enumerate(metrics):
        xx = 58 + i * col_w
        if i:
            c.setStrokeColor(HexColor("#274039"))
            c.line(xx - 12, 130, xx - 12, 207)
        c.setFillColor(GREEN)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(xx, 198, label)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 15 if i != 3 else 12)
        c.drawString(xx, 170, value)
        c.setFillColor(HexColor("#8FA9A1"))
        c.setFont("Helvetica", 7)
        c.drawString(xx, 148, note)
    c.setFillColor(HexColor("#8FA9A1"))
    c.setFont("Helvetica", 7)
    c.drawString(44, 45, "Project overview and developer handoff")
    c.drawRightString(WIDTH - 44, 45, "Version 2.0")
    c.showPage()


def page_problem(c: canvas.Canvas) -> None:
    header(c, 2, "Problem and solution")
    section_label(c, "01 / WHY IT EXISTS", 36, HEIGHT - 78)
    title(c, "From energy data to an operating decision", 36, HEIGHT - 110, 24)
    paragraph(
        c,
        "Most carbon dashboards explain what happened after the energy was consumed. "
        "CarbonSense looks ahead, quantifies uncertainty and turns the forecast into a scheduling action.",
        36, HEIGHT - 136, WIDTH - 72, 10.5, MUTED, 16,
    )
    cards_y = HEIGHT - 330
    card_w = (WIDTH - 88) / 3
    problems = [
        ("01", "Reactive reporting", "Carbon totals arrive too late to change the operating schedule."),
        ("02", "Hidden uncertainty", "Single-number forecasts can create false confidence for operators."),
        ("03", "No action layer", "Charts often stop before recommending what load should move and when."),
    ]
    for i, (num, heading, body) in enumerate(problems):
        x = 36 + i * (card_w + 8)
        rounded_box(c, x, cards_y, card_w, 124, white, LINE)
        c.setFillColor(RED)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x + 14, cards_y + 98, num)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(x + 14, cards_y + 73, heading)
        paragraph(c, body, x + 14, cards_y + 52, card_w - 28, 8, MUTED, 12)
    rounded_box(c, 36, 145, WIDTH - 72, 164, GREEN_SOFT, HexColor("#C7EADF"))
    section_label(c, "THE CARBONSENSE RESPONSE", 54, 283, GREEN_DARK)
    solution_items = [
        "Forecast demand for the next 1 to 168 hours from time, lag, weather and renewable drivers.",
        "Keep emissions conversion outside the ML model so regional factors can change independently.",
        "Expose a 90% uncertainty range, peak demand, clean-energy coverage and data-quality evidence.",
        "Recommend the cleanest operating window and estimate savings from shifting flexible load.",
    ]
    bullet_list(c, solution_items, 54, 258, WIDTH - 108, 9.2, 15, GREEN_DARK)
    c.showPage()


def page_workflow(c: canvas.Canvas) -> None:
    header(c, 3, "ML and inference workflow")
    section_label(c, "02 / HOW IT WORKS", 36, HEIGHT - 78)
    title(c, "A reproducible time-series pipeline", 36, HEIGHT - 110, 24)
    paragraph(c, "The design separates demand forecasting, emissions accounting and decision logic.",
              36, HEIGHT - 136, WIDTH - 72, 10, MUTED, 15)
    node_w = 97
    gap = 9
    start_x = 36
    node_y = HEIGHT - 270
    nodes = [
        ("01", "Hourly data", "Energy, weather, solar and wind"),
        ("02", "Features", "Seasonality, lags and rolling statistics"),
        ("03", "ML forecast", "Regularized demand regression"),
        ("04", "CO2 service", "Regional or custom grid factor"),
        ("05", "Carbon Shift", "Clean-window recommendation"),
    ]
    for i, (num, heading, detail) in enumerate(nodes):
        x = start_x + i * (node_w + gap)
        flow_node(c, x, node_y, node_w, heading, detail, num, GREEN_SOFT if i == 4 else white)
        if i < len(nodes) - 1:
            c.setStrokeColor(GREEN)
            c.setLineWidth(1)
            c.line(x + node_w + 2, node_y + 37, x + node_w + gap - 2, node_y + 37)
    left_x, right_x = 36, WIDTH / 2 + 10
    box_y = 305
    rounded_box(c, left_x, box_y, WIDTH / 2 - 52, 195, white, LINE)
    section_label(c, "MODEL FEATURES", left_x + 16, box_y + 169)
    bullet_list(c, [
        "Cyclical hour features and day-of-week context",
        "1-hour, 24-hour and 168-hour demand lags",
        "24-hour rolling mean and standard deviation",
        "Temperature, solar generation and wind generation",
        "Recursive future prediction without random shuffling",
    ], left_x + 16, box_y + 144, WIDTH / 2 - 84, 8.2, 12.5)
    rounded_box(c, right_x, box_y, WIDTH / 2 - 46, 195, white, LINE)
    section_label(c, "TRUST CONTROLS", right_x + 16, box_y + 169)
    bullet_list(c, [
        "Chronological train, validation and untouched test windows",
        "Previous-day seasonal baseline for honest comparison",
        "Validation-calibrated residual quantiles",
        "Wider uncertainty for longer horizons",
        "Versioned model and preprocessing artifact",
    ], right_x + 16, box_y + 144, WIDTH / 2 - 78, 8.2, 12.5, CYAN)
    rounded_box(c, 36, 132, WIDTH - 72, 142, PANEL, PANEL)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(54, 246, "CARBON CALCULATION")
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(54, 210, "predicted CO2 kg  =  predicted energy kWh  x  carbon intensity")
    paragraph(c, "The energy model never learns a fixed emissions factor. A verified provider can replace the demo factor without retraining demand prediction.",
              54, 180, WIDTH - 108, 8.5, HexColor("#A8BDB6"), 13)
    c.showPage()


def page_outputs(c: canvas.Canvas, service: ForecastService, forecast: dict) -> None:
    header(c, 4, "Outputs and visualizations")
    section_label(c, "03 / WHAT IT PRODUCES", 36, HEIGHT - 78)
    title(c, "Forecasts designed for decisions", 36, HEIGHT - 110, 24)
    summary = forecast["summary"]
    metric(c, 36, HEIGHT - 220, 122, "Forecast energy", f"{summary['total_energy_kwh']:.0f}", "kWh / next 24 hours", CYAN)
    metric(c, 166, HEIGHT - 220, 122, "Forecast emissions", f"{summary['total_co2_kg']:.1f}", "kgCO2e / next 24 hours", GREEN)
    metric(c, 296, HEIGHT - 220, 122, "Avg intensity", f"{summary['average_carbon_intensity']:.3f}", "kgCO2e per kWh", AMBER)
    metric(c, 426, HEIGHT - 220, 133, "Peak demand", f"{summary['peak_hour']['energy_kwh']:.1f}", "kWh at peak hour", VIOLET)
    history = service.history_points(24)
    draw_energy_chart(c, 36, 315, WIDTH - 72, 270, history, forecast["forecast"])
    rounded_box(c, 36, 122, WIDTH - 72, 168, GREEN_SOFT, HexColor("#C7EADF"))
    section_label(c, "CARBON SHIFT - THE UNIQUE ACTION LAYER", 54, 262, GREEN_DARK)
    shift = summary["shift_opportunity"]
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(54, 231, f"Shift {shift['flexible_load_kwh']:.1f} kWh to the cleanest forecast hour")
    c.setFillColor(GREEN_DARK)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(54, 190, f"{shift['estimated_savings_kg']:.1f} kgCO2e")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(54, 171, "estimated avoided emissions for this 24-hour scenario")
    paragraph(c, "The dashboard also exposes hourly CO2, renewable share, 90% ranges, the cleanest three-hour window and a downloadable CSV for operations teams.",
              270, 188, WIDTH - 324, 8.3, INK, 12.5)
    c.showPage()


def page_practical(c: canvas.Canvas) -> None:
    header(c, 5, "Practical value and uniqueness")
    section_label(c, "04 / WHERE IT HELPS", 36, HEIGHT - 78)
    title(c, "One engine, multiple operating contexts", 36, HEIGHT - 110, 24)
    contexts = [
        ("BUILDINGS", "Forecast HVAC and office demand; shift charging or cooling to cleaner hours.", GREEN),
        ("FACTORIES", "Move flexible production, reduce peaks and test efficiency investments.", CYAN),
        ("CAMPUSES", "Coordinate solar, EV charging and multi-building sustainability targets.", AMBER),
        ("MICROGRIDS", "Align loads with renewables and supply demand forecasts to GridOpt.", VIOLET),
    ]
    card_w = (WIDTH - 88) / 2
    for index, (name, body, accent) in enumerate(contexts):
        col, row = index % 2, index // 2
        x = 36 + col * (card_w + 16)
        y = HEIGHT - 292 - row * 150
        rounded_box(c, x, y, card_w, 128, white, LINE)
        c.setFillColor(accent)
        c.circle(x + 24, y + 99, 10, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(x + 24, y + 96.5, str(index + 1))
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(x + 44, y + 95, name)
        paragraph(c, body, x + 18, y + 66, card_w - 36, 8.5, MUTED, 13)
    rounded_box(c, 36, 124, WIDTH - 72, 164, PANEL, PANEL)
    section_label(c, "WHY IT STANDS OUT", 54, 260, GREEN)
    unique = [
        ("Actionable", "Moves from prediction to a quantified operating recommendation."),
        ("Scenario-ready", "Tests efficiency, renewables, temperature and grid intensity instantly."),
        ("Explainable", "Shows inputs, baseline, uncertainty, data quality and model evidence."),
    ]
    col_w = (WIDTH - 120) / 3
    for index, (heading, body) in enumerate(unique):
        x = 54 + index * col_w
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x, 222, heading)
        paragraph(c, body, x, 201, col_w - 22, 8, HexColor("#A8BDB6"), 12)
    c.showPage()


def page_tech(c: canvas.Canvas) -> None:
    header(c, 6, "API and technology stack")
    section_label(c, "05 / DEVELOPER HANDOFF", 36, HEIGHT - 78)
    title(c, "A small, portable technology stack", 36, HEIGHT - 110, 24)
    layers = [
        ("DASHBOARD", "HTML5 + CSS3 + JavaScript + responsive SVG", GREEN_SOFT, GREEN_DARK),
        ("REST API", "FastAPI + Pydantic + OpenAPI + CORS", HexColor("#EAF5F8"), CYAN),
        ("ML PIPELINE", "Python + NumPy + Pandas + time-series features", HexColor("#F8F2E8"), AMBER),
        ("DELIVERY", "Pytest + Uvicorn + Docker + health checks", HexColor("#F1ECFA"), VIOLET),
    ]
    for index, (name, detail, fill, accent) in enumerate(layers):
        y = HEIGHT - 212 - index * 76
        rounded_box(c, 36, y, WIDTH - 72, 58, fill, LINE)
        c.setFillColor(accent)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(52, y + 34, name)
        c.setFillColor(INK)
        c.setFont("Helvetica", 9)
        c.drawString(156, y + 34, detail)
    rounded_box(c, 36, 142, WIDTH - 72, 158, white, LINE)
    section_label(c, "CORE ENDPOINTS", 52, 274)
    endpoints = [
        ("GET", "/api/v1/energy/forecast", "Demo and scenario forecast"),
        ("POST", "/api/v1/energy/forecast/custom", "Real-history forecast"),
        ("GET", "/api/v1/energy/history", "Actual chart series"),
        ("GET", "/api/v1/data/quality", "Completeness and freshness"),
        ("GET", "/api/v1/model/metrics", "Evaluation evidence"),
    ]
    for index, (method, endpoint, purpose) in enumerate(endpoints):
        y = 246 - index * 22
        c.setFillColor(GREEN_DARK if method == "GET" else VIOLET)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(52, y, method)
        c.setFillColor(INK)
        c.setFont("Courier-Bold", 7.4)
        c.drawString(91, y, endpoint)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7.4)
        c.drawRightString(WIDTH - 52, y, purpose)
    c.showPage()


def page_evidence(c: canvas.Canvas, metrics_data: dict) -> None:
    header(c, 7, "Evidence and production roadmap")
    section_label(c, "06 / VALIDATION AND NEXT STEPS", 36, HEIGHT - 78)
    title(c, "Strong evidence, clear production boundary", 36, HEIGHT - 110, 22)
    metric(c, 36, HEIGHT - 220, 122, "Model MAE", f"{metrics_data['test_metrics']['mae']:.2f}", "kWh", GREEN)
    metric(c, 166, HEIGHT - 220, 122, "Baseline MAE", f"{metrics_data['previous_day_baseline_metrics']['mae']:.2f}", "kWh", MUTED)
    metric(c, 296, HEIGHT - 220, 122, "Model MAPE", f"{metrics_data['test_metrics']['mape_percent']:.2f}%", "safe denominator", CYAN)
    metric(c, 426, HEIGHT - 220, 133, "90% coverage", f"{metrics_data['interval_test_coverage_percent']:.2f}%", "held-out test", AMBER)
    rounded_box(c, 36, 352, WIDTH - 72, 204, white, LINE)
    section_label(c, "CHRONOLOGICAL EVALUATION", 52, 526)
    split = metrics_data["dataset"]
    bar_x, bar_y, bar_w, bar_h = 52, 476, WIDTH - 104, 28
    total = split["training_rows"] + split["test_rows"]
    train_w = bar_w * split["training_rows"] / total
    test_w = bar_w - train_w
    c.setFillColor(GREEN)
    c.roundRect(bar_x, bar_y, train_w, bar_h, 5, fill=1, stroke=0)
    c.setFillColor(AMBER)
    c.roundRect(bar_x + train_w, bar_y, test_w, bar_h, 5, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(bar_x + 10, bar_y + 10, f"TRAIN + VALIDATION  {split['training_rows']} rows")
    c.drawRightString(bar_x + bar_w - 10, bar_y + 10, f"TEST  {split['test_rows']} rows")
    paragraph(c, "Time is never randomly shuffled. The earlier observations fit and calibrate the pipeline; the latest 399 observations remain untouched until final evaluation.",
              52, 448, WIDTH - 104, 8.5, MUTED, 13)
    section_label(c, "PRODUCTION ROADMAP", 52, 402)
    bullet_list(c, [
        "Connect real smart-meter history and trusted future weather and renewable feeds.",
        "Replace illustrative factors with a verified regional or marginal-emissions provider.",
        "Add authentication, tenant isolation, rate limits, lineage and artifact storage.",
        "Monitor forecast error, interval coverage, missing data and feature drift.",
    ], 52, 380, WIDTH - 104, 8.2, 12.2)
    rounded_box(c, 36, 134, WIDTH - 72, 190, GREEN_SOFT, HexColor("#C7EADF"))
    section_label(c, "HACKATHON PITCH", 54, 296, GREEN_DARK)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 15)
    pitch = (
        "CarbonSense does not just predict electricity demand. It predicts when demand will occur, "
        "estimates the carbon impact and recommends when flexible loads should move."
    )
    y = 262
    for line in wrap_text(pitch, "Helvetica-Bold", 15, WIDTH - 108):
        c.drawString(54, y, line)
        y -= 22
    paragraph(c, "Result: a measurable, explainable path from raw hourly data to lower-carbon operations.",
              54, y - 8, WIDTH - 108, 9, GREEN_DARK, 14)
    c.showPage()


def build() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    service = ForecastService()
    forecast = service.forecast(24)
    metrics_data = json.loads((ROOT / "models/metrics_v1.json").read_text(encoding="utf-8"))
    c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1)
    c.setTitle("CarbonSense Intelligence - Project Overview")
    c.setAuthor("CarbonSense Hackathon Team")
    c.setSubject("ML forecasting, carbon intelligence, API and dashboard overview")
    cover(c, forecast["summary"])
    page_problem(c)
    page_workflow(c)
    page_outputs(c, service, forecast)
    page_practical(c)
    page_tech(c)
    page_evidence(c, metrics_data)
    c.save()
    print(OUT)


if __name__ == "__main__":
    build()
