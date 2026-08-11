from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "VanDrishti_Project_Brief.pdf"

INK = colors.HexColor("#071A14")
FOREST = colors.HexColor("#315C3B")
LIME = colors.HexColor("#C9F25B")
PAPER = colors.HexColor("#F5F2E9")
MIST = colors.HexColor("#E5EAE2")
MUTED = colors.HexColor("#647269")
RED = colors.HexColor("#EF4444")
GREEN = colors.HexColor("#22A85A")
WHITE = colors.white


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Kicker", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=FOREST, spaceAfter=8, tracking=1.5))
styles.add(ParagraphStyle(name="CoverTitle", fontName="Helvetica-Bold", fontSize=38, leading=39, textColor=INK, spaceAfter=12))
styles.add(ParagraphStyle(name="CoverSub", fontName="Helvetica", fontSize=14, leading=21, textColor=MUTED, spaceAfter=18))
styles.add(ParagraphStyle(name="H1x", fontName="Helvetica-Bold", fontSize=24, leading=28, textColor=INK, spaceAfter=12))
styles.add(ParagraphStyle(name="H2x", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=INK, spaceBefore=8, spaceAfter=7))
styles.add(ParagraphStyle(name="Bodyx", fontName="Helvetica", fontSize=9.5, leading=14.2, textColor=INK, spaceAfter=7))
styles.add(ParagraphStyle(name="Smallx", fontName="Helvetica", fontSize=7.7, leading=10.5, textColor=MUTED))
styles.add(ParagraphStyle(name="CardTitle", fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=INK, spaceAfter=4))
styles.add(ParagraphStyle(name="CardBody", fontName="Helvetica", fontSize=8.2, leading=11.3, textColor=MUTED))
styles.add(ParagraphStyle(name="WhiteH", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=WHITE, spaceAfter=7))
styles.add(ParagraphStyle(name="WhiteBody", fontName="Helvetica", fontSize=9, leading=13, textColor=colors.HexColor("#DDE6E0")))
styles.add(ParagraphStyle(name="Metric", fontName="Helvetica-Bold", fontSize=18, leading=20, textColor=INK, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="MetricLabel", fontName="Helvetica-Bold", fontSize=7.2, leading=9, textColor=MUTED, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="TableHead", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=WHITE))
styles.add(ParagraphStyle(name="TableCell", fontName="Helvetica", fontSize=8.1, leading=11.2, textColor=INK))
styles.add(ParagraphStyle(name="TableCellBold", fontName="Helvetica-Bold", fontSize=8.2, leading=11.2, textColor=INK))
styles.add(ParagraphStyle(name="Quote", fontName="Helvetica-Bold", fontSize=15, leading=21, textColor=INK, leftIndent=10, rightIndent=10, alignment=TA_CENTER))


def P(text: str, style: str = "Bodyx") -> Paragraph:
    return Paragraph(text, styles[style])


def bullet(text: str) -> Paragraph:
    return Paragraph(f"<font color='#315C3B'><b>-</b></font> {text}", styles["Bodyx"])


def section_title(kicker: str, title: str) -> list:
    return [P(kicker.upper(), "Kicker"), P(title, "H1x")]


def card(title: str, body: str, background=PAPER) -> Table:
    table = Table([[P(title, "CardTitle"),], [P(body, "CardBody"),]], colWidths=[78 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#C8D0C8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
    ]))
    return table


def metric(value: str, label: str) -> Table:
    t = Table([[P(value, "Metric")], [P(label.upper(), "MetricLabel")]], colWidths=[52 * mm], rowHeights=[12 * mm, 9 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EEF0E8")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CCD3CB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def data_table(headers: list[str], rows: list[list[str]], widths: list[float]) -> Table:
    data = [[P(header, "TableHead") for header in headers]]
    for row in rows:
        data.append([P(value, "TableCellBold" if index == 0 else "TableCell") for index, value in enumerate(row)])
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PAPER]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD2CC")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def page_background(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(INK)
    canvas.rect(0, height - 12 * mm, width, 12 * mm, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(WHITE)
    canvas.drawString(18 * mm, height - 7.6 * mm, "VANDRISHTI")
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#B8C7BE"))
    canvas.drawRightString(width - 18 * mm, height - 7.6 * mm, "FOREST CHANGE INTELLIGENCE")
    canvas.setStrokeColor(colors.HexColor("#C8CEC7"))
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9 * mm, "Hackathon project brief | Screening tool, not a regulatory measurement")
    canvas.drawRightString(width - 18 * mm, 9 * mm, f"{doc.page}")
    canvas.restoreState()


def build_story() -> list:
    story = []

    story += [Spacer(1, 10 * mm), P("FOREST CHANGE INTELLIGENCE FOR INDIA", "Kicker")]
    story += [P("VanDrishti", "CoverTitle")]
    story += [P("From coordinates and dates to field-ready forest evidence.", "CoverSub")]

    hero = Table([[P("VanDrishti automatically retrieves satellite observations, detects likely forest loss and gain, and converts the result into maps, metrics, hotspots and web-ready geospatial outputs.", "WhiteH"),
                   P("The platform removes the need for users to find or align satellite files. A forest officer, NGO or analyst can draw an area on the India map, select two periods and receive a decision brief.", "WhiteBody")]], colWidths=[92 * mm, 72 * mm])
    hero.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 13),
        ("RIGHTPADDING", (0, 0), (-1, -1), 13),
        ("TOPPADDING", (0, 0), (-1, -1), 15),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 15),
        ("LINEBEFORE", (1, 0), (1, 0), 1, colors.HexColor("#496057")),
    ]))
    story += [hero, Spacer(1, 8 * mm)]
    story += [Table([[metric("10 m", "Sentinel-2 detail"), metric("3", "Change classes"), metric("2", "Satellite catalogues")]], colWidths=[55 * mm] * 3, hAlign="LEFT"), Spacer(1, 9 * mm)]
    story += [P("EXECUTIVE SUMMARY", "Kicker"), P("What the project does", "H1x")]
    summary_cards = Table([[
        card("1. Select", "Choose a forest preset or draw a red analysis box anywhere over India."),
        card("2. Compare", "Select before and after periods. The system finds suitable low-cloud scenes."),
    ], [
        card("3. Detect", "Cloud-masked NDVI change logic identifies forest loss, gain and stable areas."),
        card("4. Act", "Review field priority, hotspots, confidence, carbon exposure and exportable evidence."),
    ]], colWidths=[82 * mm, 82 * mm], hAlign="LEFT")
    summary_cards.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story += [summary_cards, Spacer(1, 5 * mm), P("Primary users: forest departments, conservation NGOs, environmental researchers, restoration teams, district administrators and web platforms that need a forest-change API.", "Bodyx")]

    story += [PageBreak()]
    story += section_title("System workflow", "What VanDrishti uses and how it works")
    pipeline = Table([[
        P("AREA + DATES", "TableHead"), P("TO", "TableHead"), P("SCENE SEARCH", "TableHead"), P("TO", "TableHead"), P("BAND PROCESSING", "TableHead"), P("TO", "TableHead"), P("CHANGE OUTPUT", "TableHead")
    ]], colWidths=[35 * mm, 8 * mm, 35 * mm, 8 * mm, 38 * mm, 8 * mm, 35 * mm])
    pipeline.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), FOREST), ("BACKGROUND", (2, 0), (2, 0), FOREST),
        ("BACKGROUND", (4, 0), (4, 0), FOREST), ("BACKGROUND", (6, 0), (6, 0), FOREST),
        ("BACKGROUND", (1, 0), (1, 0), INK), ("BACKGROUND", (3, 0), (3, 0), INK), ("BACKGROUND", (5, 0), (5, 0), INK),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story += [pipeline, Spacer(1, 6 * mm)]
    workflow_rows = [
        ["1. Area of interest", "A user draws a rectangle or selects a preset Indian forest landscape. The area is limited to 2,500 km2 for responsive processing."],
        ["2. Date windows", "Before and after ranges are selected. Similar seasons are recommended to reduce monsoon and phenology effects."],
        ["3. Satellite discovery", "The API searches Sentinel-2 Level-2A scenes by bounds, date, cloud cover and coverage. It retries and uses a second catalogue if required."],
        ["4. Spectral processing", "Blue, green, red, near-infrared and Scene Classification Layer data are read. Clouds, shadows, snow and invalid pixels are removed."],
        ["5. Change logic", "NDVI forest classes are compared. A meaningful NDVI shift and minimum patch size are required, reducing small noisy detections."],
        ["6. Geographic evidence", "Pixels are converted into area statistics, transparent overlays and GeoJSON polygons positioned on the India map."],
    ]
    story += [data_table(["STAGE", "WHAT HAPPENS"], workflow_rows, [48 * mm, 116 * mm]), Spacer(1, 7 * mm)]
    story += [P("Data and analytical components", "H2x")]
    components = Table([[
        card("Sentinel-2 Level-2A", "Surface-reflectance imagery at 10 m for the visible and near-infrared bands used by the project."),
        card("NDVI", "A vegetation signal calculated as (NIR - Red) / (NIR + Red). Dense healthy vegetation generally has higher values."),
    ], [
        card("Cloud classification", "Sentinel-2 SCL pixels exclude cloud, cirrus, shadow, snow, saturated and no-data regions."),
        card("Hybrid model path", "The live baseline uses explainable NDVI/RGB rules. A six-channel U-Net is included for training on labelled pairs."),
    ]], colWidths=[82 * mm, 82 * mm])
    components.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story += [components]

    story += [PageBreak()]
    story += section_title("Outputs", "What the system produces")
    output_rows = [
        ["Forest loss", "Area in km2 and hectares, red polygons and a red transparent map overlay."],
        ["Forest gain", "Area in km2, green polygons and a green transparent map overlay."],
        ["Net and annualised change", "Gain minus loss, percentage changed and an annualised loss estimate based on observation dates."],
        ["Forest-cover trend", "Estimated forest-like cover before and after, plus mean NDVI movement."],
        ["Loss hotspots", "Up to five largest loss polygons ranked with coordinates and area for field verification."],
        ["Data quality", "Valid-pixel percentage, scene cloud cover, observation gap, seasonal gap and comparison quality."],
        ["Action insight", "Low, medium or high field priority with a recommended next action."],
        ["Carbon exposure", "Indicative low-to-high tonnes CO2e range based on detected loss. It is explicitly presented as a screening estimate."],
        ["Exports", "GeoJSON change polygons, CSV summary, printable report and JSON API response."],
    ]
    story += [data_table(["OUTPUT", "DESCRIPTION"], output_rows, [49 * mm, 115 * mm]), Spacer(1, 7 * mm)]
    story += [P("Map layers available to the user", "H2x")]
    layer_cards = Table([[
        card("Change detection", "Red loss and green gain mask with adjustable opacity."),
        card("NDVI intensity", "Continuous red-to-green strength of vegetation decline or recovery."),
    ], [
        card("Before observation", "Selected source scene preview aligned to the area bounds."),
        card("After observation", "Later source preview for direct visual comparison."),
    ]], colWidths=[82 * mm, 82 * mm])
    layer_cards.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story += [layer_cards, Spacer(1, 7 * mm)]
    story += [P("Example API result", "H2x")]
    api_box = Table([[P("<font name='Courier'>summary.forest_loss_sq_km   0.0883<br/>summary.forest_loss_hectares  8.83<br/>insights.field_priority        medium<br/>insights.comparison_quality    strong<br/>source.before.date              2023-02-17<br/>source.after.date               2025-02-21</font>", "TableCell")]], colWidths=[164 * mm])
    api_box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E8EBE4")), ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#BBC5BD")), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    story += [api_box, Spacer(1, 4 * mm), P("Values above illustrate the response structure. Actual values depend on the selected area, dates, cloud conditions and sensitivity settings.", "Smallx")]

    story += [PageBreak()]
    story += section_title("Differentiation", "What makes VanDrishti unique")
    uniqueness = [
        ["No satellite-file handling", "The main workflow needs only an area and dates. Scene discovery, access and processing happen automatically."],
        ["Dual-provider resilience", "Planetary Computer is the primary catalogue; Element 84 Earth Search provides automatic fallback when required."],
        ["Detection plus decision support", "The result is not just a mask. It includes confidence, field priority, hotspots, source quality and recommended action."],
        ["India-first interface", "The map, forest presets, area controls and default experience are designed around Indian monitoring use cases."],
        ["Explainable baseline", "NDVI thresholds, meaningful-change requirements, cloud masking and minimum patch controls are understandable to judges and users."],
        ["Interoperable outputs", "GeoJSON, CSV, PNG overlays and an API allow integration with GIS, mobile field apps and government dashboards."],
        ["Fast repeat analysis", "Before and after scenes load in parallel. A 32-observation cache makes repeated comparisons nearly immediate."],
    ]
    story += [data_table(["UNIQUE CAPABILITY", "WHY IT MATTERS"], uniqueness, [52 * mm, 112 * mm]), Spacer(1, 8 * mm)]
    story += [P("Practical applications", "H2x")]
    impact_rows = [
        ["Forest departments", "Screen large areas, prioritise inspections and attach polygons to field assignments."],
        ["Conservation NGOs", "Track restoration, encroachment and habitat pressure without operating a full remote-sensing stack."],
        ["District administration", "Compare suspected clearing with permits, fires, roads and local land-use records."],
        ["Researchers", "Export repeatable geospatial results and scene metadata for further validation."],
        ["Web and mobile teams", "Call a documented REST API and display map-ready outputs without implementing satellite processing."],
    ]
    story += [data_table(["USER", "PRACTICAL VALUE"], impact_rows, [48 * mm, 116 * mm]), Spacer(1, 8 * mm)]
    scenario = Table([[P("PRACTICAL SCENARIO", "Kicker"), P("A forest officer draws a red box over a suspected clearing, compares January 2023 with January 2025, and receives ranked red hotspots. The largest polygon can be exported as GeoJSON and sent to a field team with its coordinates and estimated area.", "Bodyx")]], colWidths=[38 * mm, 126 * mm])
    scenario.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#DFF0A8")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    story += [scenario]

    story += [PageBreak()]
    story += section_title("Implementation", "Technology stack and API")
    stack_rows = [
        ["Frontend", "HTML5, CSS3, JavaScript", "Responsive dashboard, controls, reports and exports."],
        ["Interactive mapping", "Leaflet, Leaflet Draw, OpenStreetMap", "India map, AOI drawing/editing, layers, hotspots and overlays."],
        ["Backend API", "Python, FastAPI, Uvicorn", "Validation, endpoints, orchestration, CORS and OpenAPI documentation."],
        ["Satellite discovery", "PySTAC Client", "Spatial, temporal, cloud-cover and collection searches."],
        ["Satellite sources", "Planetary Computer, Earth Search", "Primary and fallback access to Sentinel-2 Level-2A."],
        ["Raster processing", "Rasterio, NumPy, Pillow", "COG windows, spectral calculations, masks, previews and overlays."],
        ["Computer vision", "OpenCV", "Morphology, connected components, contours and polygon simplification."],
        ["ML path", "PyTorch U-Net", "Optional six-channel before/after semantic segmentation model."],
        ["Testing", "Pytest, FastAPI TestClient", "API, validation, NDVI noise and geometry checks."],
        ["Packaging", "Docker", "Portable local or cloud deployment."],
    ]
    story += [data_table(["LAYER", "TECHNOLOGY", "ROLE"], stack_rows, [35 * mm, 52 * mm, 77 * mm]), Spacer(1, 7 * mm)]
    story += [P("Main API routes", "H2x")]
    api_rows = [
        ["POST /api/v1/detect/satellite", "Automatic area-and-date Sentinel-2 analysis."],
        ["POST /api/v1/detect", "Advanced before/after image upload analysis."],
        ["GET /api/v1/health", "Service health, active engine and cache status."],
        ["GET /api/v1/model", "Model classes, input requirements and available features."],
        ["GET /docs", "Interactive OpenAPI documentation for web developers."],
    ]
    story += [data_table(["ROUTE", "PURPOSE"], api_rows, [70 * mm, 94 * mm]), Spacer(1, 7 * mm)]
    story += [P("Responsible-use limitations", "H2x")]
    story += [
        bullet("Optical imagery is affected by residual clouds, haze, shadows, flooding and seasonal vegetation cycles."),
        bullet("Plantations, crops and natural phenology can appear as forest gain or loss; similar-season comparisons improve reliability."),
        bullet("Area and carbon figures are screening estimates. Regulatory decisions require local records and field validation."),
        bullet("The current NDVI baseline should be benchmarked against labelled Indian forest-change data before operational deployment."),
    ]
    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=20 * mm, bottomMargin=18 * mm,
        title="VanDrishti Project Brief", author="VanDrishti Hackathon Team",
        subject="Forest change detection project overview, outputs, uniqueness and technology stack",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="project-brief", frames=[frame], onPage=page_background)])
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
