from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, KeepTogether)


OUT = Path(r"C:\Users\Aryan Raj\Documents\Codex\2026-08-08\we-are-participating-in-a-hackathon\outputs\ecospherai-anomaly-detection-module.pdf")
OUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#0B1220")
INK = colors.HexColor("#17233A")
MUTED = colors.HexColor("#56657E")
TEAL = colors.HexColor("#18BFAE")
PALE_TEAL = colors.HexColor("#E7F8F5")
CORAL = colors.HexColor("#E85D6B")
PALE = colors.HexColor("#F5F8FC")
LINE = colors.HexColor("#DCE4EE")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Kicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8.5,
                          leading=11, textColor=TEAL, spaceAfter=7, uppercase=True))
styles.add(ParagraphStyle(name="TitleCustom", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=27,
                          leading=31, textColor=NAVY, spaceAfter=8))
styles.add(ParagraphStyle(name="Deck", parent=styles["Normal"], fontName="Helvetica", fontSize=11.5,
                          leading=17, textColor=MUTED, spaceAfter=15))
styles.add(ParagraphStyle(name="H2Custom", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14,
                          leading=18, textColor=NAVY, spaceBefore=11, spaceAfter=7))
styles.add(ParagraphStyle(name="BodyCustom", parent=styles["Normal"], fontName="Helvetica", fontSize=9.7,
                          leading=14.2, textColor=INK, spaceAfter=7))
styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontName="Helvetica", fontSize=8.4,
                          leading=11.5, textColor=MUTED))
styles.add(ParagraphStyle(name="CardTitle", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10.2,
                          leading=13, textColor=NAVY, spaceAfter=3))
styles.add(ParagraphStyle(name="CardBody", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5,
                          leading=11.5, textColor=MUTED))


def p(text, style="BodyCustom"):
    return Paragraph(text, styles[style])


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 15 * mm, A4[0] - 18 * mm, 15 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9.5 * mm, "EcoSphere Sentinel | Climate and Sustainability Intelligence")
    canvas.drawRightString(A4[0] - 18 * mm, 9.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def card(title, body, accent=TEAL):
    t = Table([[p(title, "CardTitle")], [p(body, "CardBody")]], colWidths=[52 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEBEFORE", (0, 0), (0, -1), 3, accent), ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


story = []
story += [p("ML MODULE BRIEF", "Kicker"), p("EcoSphere Sentinel", "TitleCustom"),
          p("Explainable anomaly intelligence for climate and sustainability infrastructure.", "Deck")]

hero = Table([[p("<b>Mission</b><br/>Turn raw IoT energy data into early warnings that reduce waste, emissions and operational risk.", "BodyCustom"),
               p("<b>Who benefits</b><br/>Cities, campuses, facilities teams, utilities, farms and renewable-energy operators.", "BodyCustom")]], colWidths=[82 * mm, 82 * mm])
hero.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE_TEAL), ("BOX", (0, 0), (-1, -1), .7, TEAL),
                          ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 10),
                          ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 10),
                          ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
story += [hero, Spacer(1, 10)]

story += [p("What problem does it solve?", "H2Custom"),
          p("Climate infrastructure can waste electricity or fail silently. A fault in HVAC, cold storage, water treatment, EV charging or renewable generation may only be noticed after a high bill, service disruption or safety incident. EcoSphere Sentinel detects abnormal behaviour as readings arrive, explains why it is suspicious and gives operations teams an action to investigate.")]

cards = [[card("1. Ingest", "Devices or gateways submit energy, timestamp, identity and optional temperature, voltage and current."),
          card("2. Learn", "A robust per-device baseline models normal operating ranges while resisting occasional spikes."),
          card("3. Detect", "Rules and Isolation Forest combine to flag range breaches, residuals, rapid change and unusual patterns.")],
         [card("4. Explain", "Every alert returns reasons, signal contributions, severity and a recommended next action.", CORAL),
          card("5. Measure impact", "The dashboard estimates CO2e at risk from abnormal grid-energy usage.", CORAL),
          card("6. Act", "Teams investigate the device, check sensor integrity and gateway logs, then use audit records for review.", CORAL)]]
flow = Table(cards, colWidths=[54 * mm, 54 * mm, 54 * mm], hAlign="LEFT")
flow.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 2),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 3),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
story += [flow, Spacer(1, 6), p("Example outcome", "H2Custom"),
          p("Campus HVAC normally operates between <b>480-530 kWh</b>. A reading of <b>4,820 kWh</b> becomes a HIGH anomaly. The system shows the expected range versus the observation, explains the extreme deviation and residual, creates an audit entry and recommends verifying the sensor, device and gateway.")]

story += [PageBreak(), p("OUTPUTS AND DIFFERENTIATORS", "Kicker"), p("What the system delivers", "TitleCustom")]

outputs = [
    ["Dashboard", "A 24-hour, 7-day or 30-day timeline of observed energy against expected operating bounds, with anomalies marked clearly."],
    ["Investigation-ready alert", "Device ID, severity, score, expected range, observed value, reasons, evidence signals and recommended action."],
    ["Sustainability insight", "Anomaly rate and estimated CO2e-at-risk help teams prioritise abnormal grid consumption."],
    ["Integration API", "Frontend-ready endpoints for telemetry ingestion, asset lists, dashboard data, security alerts and audit logs."],
]
table_data = [[p("Output", "CardTitle"), p("What a user receives", "CardTitle")]] + [[p(a, "CardTitle"), p(b, "CardBody")] for a, b in outputs]
table = Table(table_data, colWidths=[48 * mm, 118 * mm])
table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("BACKGROUND", (0, 1), (-1, -1), PALE), ("GRID", (0, 0), (-1, -1), .4, LINE),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
story += [table, Spacer(1, 10), p("Why it is unique", "H2Custom")]

unique = Table([[card("Hybrid, not black-box", "Isolation Forest finds novel patterns; transparent rule checks make the alert understandable to a non-technical operator."),
                 card("Climate + cyber lens", "It treats duplicate or replayed gateway messages as a security signal alongside energy waste and equipment faults.", CORAL),
                 card("Asset-aware storytelling", "The same intelligence works across HVAC, solar, wind, water, batteries, EV charging, farms and cold chain.")]], colWidths=[54 * mm, 54 * mm, 54 * mm])
unique.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
story += [unique, Spacer(1, 10), p("Technology stack", "H2Custom")]

stack = [["Layer", "Technology / role"],
         ["API", "Python, FastAPI and Uvicorn - validated REST endpoints and automatic interactive documentation."],
         ["ML", "scikit-learn Isolation Forest - unsupervised detection of unusual multivariate telemetry patterns."],
         ["Analytics", "NumPy and robust median/MAD baselines - fast device-specific thresholds that are less affected by spikes."],
         ["Storage", "SQLite - persistent readings, alerts and audit logs for a portable hackathon deployment."],
         ["Dashboard", "HTML, CSS, JavaScript and Chart.js - interactive asset selector, timelines, alert details and demo controls."],
         ["Security", "Payload validation, size limits, device/message identity checks and replay/duplicate detection."],
]
stack_data = [[p(a, "CardTitle"), p(b, "CardBody")] for a, b in stack]
stack_table = Table(stack_data, colWidths=[38 * mm, 128 * mm])
stack_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), PALE_TEAL), ("GRID", (0, 0), (-1, -1), .35, LINE),
                                  ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                                  ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
story += [stack_table, Spacer(1, 10), p("Demo positioning", "H2Custom"),
          p("For the hackathon, the dashboard includes 30 days of transparent synthetic data for 12 sustainability assets. In a deployment, each asset would send live readings through the ingestion API, use a calibrated baseline and run with synthetic seeding disabled.")]

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=17 * mm, bottomMargin=20 * mm)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
