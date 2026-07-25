"""
Main builder: imports setup + all chapter modules, builds the PDF.
Run: python3 build_pdf.py
"""

import sys
import os

# Ensure we can import sibling modules
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from sdr_doc import build_doc, PageBreak, Paragraph, Spacer, STYLES, COL_TEXT_DIM, MONO_FONT, COL_CYAN
from reportlab.platypus import HRFlowable, NextPageTemplate

# Import chapter modules
from sdr_doc_ch1_5 import chapter1, chapter2, chapter3, chapter4, chapter5
from sdr_doc_ch6_10 import chapter6, chapter7, chapter8_rds, chapter9_hdradio, chapter10_adsb
from sdr_doc_ch11_17 import (
    chapter11_apt, chapter12_meteor, chapter13_goes,
    chapter14_pocsag, chapter15_acars, chapter16_inmarsat, chapter17_gps,
)
from sdr_doc_ch18_25 import (
    chapter18_scanner, chapter19_notch, chapter20_recording, chapter21_antenna,
    chapter22_shortcuts, chapter23_troubleshooting, chapter24_glossary,
    chapter25_limitations, appendixA, appendixB,
)

def build_toc():
    """Build a simple TOC by listing chapters (page numbers approximated)."""
    toc = []
    toc.append(Paragraph("Table of Contents", STYLES["H1"]))
    toc.append(Spacer(1, 12))

    # Manually composed TOC entries (chapter number, title, approx page)
    # Page numbers are approximate; real layout will differ slightly.
    entries = [
        (1, "Chapter 1: Introduction &amp; Quick Start", 3),
        (1, "Chapter 2: Installing &amp; Running the App", 6),
        (1, "Chapter 3: The User Interface Tour", 9),
        (1, "Chapter 4: Tuning &amp; Demodulation", 13),
        (1, "Chapter 5: Connecting Real Hardware", 17),
        (1, "Chapter 6: The Bridge - Protocol &amp; Internals", 22),
        (1, "Chapter 7: Decoders Overview", 25),
        (1, "Chapter 8: RDS (FM Broadcast)", 27),
        (1, "Chapter 9: HD Radio (NRSC-5)", 30),
        (1, "Chapter 10: ADS-B Aircraft Tracking", 33),
        (1, "Chapter 11: NOAA APT Weather Satellites", 37),
        (1, "Chapter 12: Meteor M2 LRPT", 41),
        (1, "Chapter 13: GOES HRIT", 44),
        (1, "Chapter 14: POCSAG Pagers", 47),
        (1, "Chapter 15: ACARS Aircraft Messaging", 50),
        (1, "Chapter 16: Inmarsat STD-C", 53),
        (1, "Chapter 17: GPS L1 C/A Decoder", 56),
        (1, "Chapter 18: Scanner Mode", 60),
        (1, "Chapter 19: Notch Filter &amp; Interference", 62),
        (1, "Chapter 20: Recording &amp; Playback", 65),
        (1, "Chapter 21: Antenna Guide", 68),
        (1, "Chapter 22: Keyboard Shortcuts", 72),
        (1, "Chapter 23: Troubleshooting", 74),
        (1, "Chapter 24: Glossary", 78),
        (1, "Chapter 25: Limitations &amp; What's Not Possible", 82),
        (1, "Appendix A: Bridge Protocol Reference", 85),
        (1, "Appendix B: Frequency Reference", 88),
    ]
    for level, title, page in entries:
        # Build a simple TOC line with dot leader
        text = title
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.enums import TA_LEFT
        style = STYLES["TOCEntry1"]
        # Use # prefix for hex colors
        dim_color = "#" + COL_TEXT_DIM.hexval()[2:]
        cyan_color = "#" + COL_CYAN.hexval()[2:]
        # Use HTML to add dotted leader and page number
        html = f"<font name='{MONO_FONT}' color='{dim_color}'>{page}</font>"
        # Build a paragraph that shows title then dots then page number
        p = Paragraph(
            f"{text} <font color='{dim_color}'>{'&nbsp;' * 4}</font>"
            f"<font name='{MONO_FONT}' color='{cyan_color}'>{page}</font>",
            style,
        )
        toc.append(p)
        toc.append(Spacer(1, 4))

    return toc

def main():
    output_path = "/home/z/my-project/download/RTL-SDR-V3-Console-User-Guide.pdf"
    doc = build_doc(output_path)

    # Build the story (list of flowables)
    story = []

    # Page 1: Cover (uses Cover template)
    # We need a placeholder flowable so the page renders
    story.append(Spacer(1, 1))  # minimal content
    story.append(PageBreak())

    # Switch to Body template for the rest
    from reportlab.platypus import NextPageTemplate
    story.append(NextPageTemplate("Body"))

    # TOC page
    story.extend(build_toc())
    story.append(PageBreak())

    # All chapters
    story.extend(chapter1())
    story.extend(chapter2())
    story.extend(chapter3())
    story.extend(chapter4())
    story.extend(chapter5())
    story.extend(chapter6())
    story.extend(chapter7())
    story.extend(chapter8_rds())
    story.extend(chapter9_hdradio())
    story.extend(chapter10_adsb())
    story.extend(chapter11_apt())
    story.extend(chapter12_meteor())
    story.extend(chapter13_goes())
    story.extend(chapter14_pocsag())
    story.extend(chapter15_acars())
    story.extend(chapter16_inmarsat())
    story.extend(chapter17_gps())
    story.extend(chapter18_scanner())
    story.extend(chapter19_notch())
    story.extend(chapter20_recording())
    story.extend(chapter21_antenna())
    story.extend(chapter22_shortcuts())
    story.extend(chapter23_troubleshooting())
    story.extend(chapter24_glossary())
    story.extend(chapter25_limitations())
    story.extend(appendixA())
    story.extend(appendixB())

    print(f"Building PDF with {len(story)} flowables...")
    doc.build(story)

    import os
    size = os.path.getsize(output_path)
    print(f"\nPDF generated: {output_path}")
    print(f"Size: {size/1024:.1f} KB ({size/1024/1024:.2f} MB)")

if __name__ == "__main__":
    main()
