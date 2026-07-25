#!/usr/bin/env python3
"""
RTL-SDR V3 Console — Comprehensive PDF Documentation Generator.
Single-file ReportLab script. Saves to /home/z/my-project/download/.
"""

import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether, HRFlowable, Flowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ----------------------------------------------------------------------
# Font registration — prefer Noto, fall back to Helvetica/Courier
# ----------------------------------------------------------------------
def try_register(name, path):
    try:
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont(name, path))
            return True
    except Exception:
        pass
    return False

BODY_FONT = "Helvetica"
BODY_FONT_BOLD = "Helvetica-Bold"
HEAD_FONT = "Helvetica-Bold"
MONO_FONT = "Courier"
MONO_FONT_BOLD = "Courier-Bold"

if try_register("NotoSansSC", "/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf"):
    BODY_FONT = "NotoSansSC"
if try_register("NotoSansSC-Bold", "/usr/share/fonts/truetype/chinese/NotoSansSC-Bold.ttf"):
    BODY_FONT_BOLD = "NotoSansSC-Bold"
    HEAD_FONT = "NotoSansSC-Bold"
if try_register("DejaVuSansMono", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"):
    MONO_FONT = "DejaVuSansMono"
if try_register("DejaVuSansMono-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"):
    MONO_FONT_BOLD = "DejaVuSansMono-Bold"

# ----------------------------------------------------------------------
# Color palette — matches the app's dark theme
# ----------------------------------------------------------------------
COL_BG_DEEP    = HexColor("#0a0e1a")
COL_BG_PANEL   = HexColor("#0f1726")
COL_BG_RAISED  = HexColor("#1a2333")
COL_TEXT       = HexColor("#e5edf5")
COL_TEXT_DIM   = HexColor("#8a98a8")
COL_CYAN       = HexColor("#00d4ff")
COL_CYAN_DIM   = HexColor("#0099cc")
COL_AMBER      = HexColor("#ffc850")
COL_AMBER_DIM  = HexColor("#cc9a30")
COL_EMERALD    = HexColor("#28d68a")
COL_RED        = HexColor("#ff5050")
COL_BORDER     = HexColor("#1f2a3a")
COL_TABLE_HEAD = HexColor("#0d1521")
COL_TABLE_ALT  = HexColor("#0f1828")

# ----------------------------------------------------------------------
# Paragraph styles
# ----------------------------------------------------------------------
STYLES = getSampleStyleSheet()
def add_style(name, **kw):
    if name in STYLES.byName:
        del STYLES.byName[name]
    STYLES.add(ParagraphStyle(name=name, **kw))

add_style("CoverTitle",  fontName=HEAD_FONT, fontSize=36, leading=42, textColor=COL_CYAN, alignment=TA_CENTER, spaceAfter=12)
add_style("H1", fontName=HEAD_FONT, fontSize=22, leading=28, textColor=COL_CYAN, alignment=TA_LEFT, spaceBefore=18, spaceAfter=10, keepWithNext=1)
add_style("H2", fontName=HEAD_FONT, fontSize=15, leading=20, textColor=COL_AMBER, alignment=TA_LEFT, spaceBefore=14, spaceAfter=6, keepWithNext=1)
add_style("H3", fontName=HEAD_FONT, fontSize=12, leading=16, textColor=COL_TEXT, alignment=TA_LEFT, spaceBefore=10, spaceAfter=4, keepWithNext=1)
add_style("Body", fontName=BODY_FONT, fontSize=10.5, leading=15, textColor=COL_TEXT, alignment=TA_LEFT, spaceAfter=8)
add_style("Code", fontName=MONO_FONT, fontSize=9, leading=12, textColor=COL_CYAN, alignment=TA_LEFT, backColor=COL_BG_RAISED, leftIndent=8, rightIndent=8, spaceAfter=8, spaceBefore=4, borderColor=COL_BORDER, borderWidth=0.5, borderPadding=4)
add_style("Callout", fontName=BODY_FONT, fontSize=10, leading=14, textColor=COL_AMBER, alignment=TA_LEFT, backColor=HexColor("#1a1810"), leftIndent=8, rightIndent=8, spaceAfter=8, spaceBefore=4, borderColor=COL_AMBER_DIM, borderWidth=0.5, borderPadding=8)
add_style("Tip", fontName=BODY_FONT, fontSize=10, leading=14, textColor=COL_EMERALD, alignment=TA_LEFT, backColor=HexColor("#0d1f17"), leftIndent=8, rightIndent=8, spaceAfter=8, spaceBefore=4, borderColor=COL_EMERALD, borderWidth=0.5, borderPadding=8)
add_style("Warning", fontName=BODY_FONT, fontSize=10, leading=14, textColor=COL_RED, alignment=TA_LEFT, backColor=HexColor("#1f0d0d"), leftIndent=8, rightIndent=8, spaceAfter=8, spaceBefore=4, borderColor=COL_RED, borderWidth=0.5, borderPadding=8)
add_style("TableHead", fontName=HEAD_FONT, fontSize=9, leading=12, textColor=COL_CYAN, alignment=TA_LEFT)
add_style("TableCell", fontName=BODY_FONT, fontSize=9, leading=12, textColor=COL_TEXT, alignment=TA_LEFT)
add_style("TOCEntry1", fontName=HEAD_FONT, fontSize=11, leading=18, textColor=COL_TEXT, alignment=TA_LEFT)
add_style("TOCEntry2", fontName=BODY_FONT, fontSize=10, leading=15, textColor=COL_TEXT_DIM, alignment=TA_LEFT, leftIndent=16)

# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def code(text):
    """Inline code block."""
    escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    escaped = escaped.replace("\n", "<br/>")
    return Paragraph(f"<font name='{MONO_FONT}'>{escaped}</font>", STYLES["Code"])

def callout(text):
    return Paragraph(text, STYLES["Callout"])

def tip(text):
    return Paragraph(f"<b>Tip:</b> {text}", STYLES["Tip"])

def warning(text):
    return Paragraph(f"<b>Warning:</b> {text}", STYLES["Warning"])

def body(text):
    return Paragraph(text, STYLES["Body"])

def h1(text):
    return Paragraph(text, STYLES["H1"])

def h2(text):
    return Paragraph(text, STYLES["H2"])

def h3(text):
    return Paragraph(text, STYLES["H3"])

def hr():
    return HRFlowable(width="100%", thickness=0.5, color=COL_BORDER, spaceBefore=6, spaceAfter=6)

def make_table(headers, rows, col_widths=None):
    PAGE_W, PAGE_H = A4
    MARGIN_L = 20 * mm
    MARGIN_R = 20 * mm
    CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R
    if col_widths is None:
        col_widths = [CONTENT_W / len(headers)] * len(headers)
    data = [[Paragraph(h, STYLES["TableHead"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), STYLES["TableCell"]) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COL_TABLE_HEAD),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COL_TABLE_ALT, COL_BG_RAISED]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.3, COL_BORDER),
    ]))
    return t

# ----------------------------------------------------------------------
# Page background painters
# ----------------------------------------------------------------------
PAGE_W, PAGE_H = A4

def draw_cover(canv, doc):
    canv.saveState()
    canv.setFillColor(COL_BG_DEEP)
    canv.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # Soft glow circles
    canv.setFillColor(HexColor("#0d1a2e"))
    canv.circle(PAGE_W / 2, PAGE_H * 0.85, 80 * mm, fill=1, stroke=0)
    canv.setFillColor(HexColor("#0a1a26"))
    canv.circle(PAGE_W * 0.2, PAGE_H * 0.3, 60 * mm, fill=1, stroke=0)
    # Decorative radio waves at top
    canv.setStrokeColor(COL_CYAN_DIM)
    canv.setLineWidth(0.3)
    for i in range(5):
        canv.circle(PAGE_W / 2, PAGE_H * 0.92, (20 + i * 8) * mm, fill=0, stroke=1)
    # Accent line
    canv.setStrokeColor(COL_CYAN)
    canv.setLineWidth(1.5)
    canv.line(20*mm, PAGE_H * 0.55, PAGE_W - 20*mm, PAGE_H * 0.55)
    # Title
    canv.setFillColor(COL_CYAN)
    canv.setFont(HEAD_FONT, 38)
    canv.drawCentredString(PAGE_W / 2, PAGE_H * 0.62, "RTL-SDR V3 Console")
    # Subtitle
    canv.setFillColor(COL_TEXT)
    canv.setFont(BODY_FONT, 14)
    canv.drawCentredString(PAGE_W / 2, PAGE_H * 0.58, "A Comprehensive User Guide")
    # Tagline
    canv.setFillColor(COL_TEXT_DIM)
    canv.setFont(BODY_FONT, 11)
    canv.drawCentredString(PAGE_W / 2, PAGE_H * 0.50,
        "Installation  -  Features  -  Decoders  -  Troubleshooting  -  Reference")
    # Decorative frequency readout
    canv.setFillColor(COL_CYAN_DIM)
    canv.setFont(MONO_FONT, 12)
    canv.drawCentredString(PAGE_W / 2, PAGE_H * 0.42, "091.500000 MHz   WFM   2.40 Msps")
    # Footer block
    canv.setFillColor(COL_TEXT_DIM)
    canv.setFont(MONO_FONT, 10)
    canv.drawCentredString(PAGE_W / 2, 50 * mm, "Version 1.0")
    canv.drawCentredString(PAGE_W / 2, 44 * mm, "jwfrancois  /  Z.ai")
    canv.drawCentredString(PAGE_W / 2, 38 * mm, "github.com/jwfrancois/rtl-sdr-v3-console")
    canv.restoreState()

def draw_page(canv, doc):
    canv.saveState()
    canv.setFillColor(COL_BG_DEEP)
    canv.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # Footer
    canv.setFillColor(COL_TEXT_DIM)
    canv.setFont(MONO_FONT, 8)
    canv.drawString(20 * mm, 12 * mm, "RTL-SDR V3 Console  -  User Guide")
    canv.drawRightString(PAGE_W - 20 * mm, 12 * mm, f"Page {canv.getPageNumber()}")
    # Top accent line
    canv.setStrokeColor(COL_CYAN_DIM)
    canv.setLineWidth(0.5)
    canv.line(20 * mm, PAGE_H - 14 * mm, PAGE_W - 20 * mm, PAGE_H - 14 * mm)
    canv.restoreState()

# ----------------------------------------------------------------------
# DocTemplate with two page templates: Cover + Body
# ----------------------------------------------------------------------
def build_doc(output_path):
    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=22*mm, bottomMargin=22*mm,
        title="RTL-SDR V3 Console - User Guide",
        author="jwfrancois / Z.ai",
        subject="Comprehensive documentation for the RTL-SDR V3 web console",
        creator="Z.ai PDF Generator",
    )
    frame_cover = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="cover")
    frame_body = Frame(20*mm, 22*mm, PAGE_W - 40*mm, PAGE_H - 44*mm, id="body")
    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[frame_cover], onPage=draw_cover),
        PageTemplate(id="Body", frames=[frame_body], onPage=draw_page),
    ])
    return doc

print("Setup loaded OK")
