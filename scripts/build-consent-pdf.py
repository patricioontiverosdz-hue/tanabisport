"""Build the printable TSI 2.2.6 consent from the canonical client text.

Requires Node.js, ReportLab, pypdf and Pillow. No network, personal data, forms,
signatures or consent records are created. The two approved logos are extracted
from the repository; the wording is evaluated from consentText without changes.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
from html import escape
from io import BytesIO
import json
from pathlib import Path
import re
import shutil
import subprocess

from PIL import Image as PILImage
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
NAME = "Tanabi-Sports-consentimiento-fotografias-2.2.6.pdf"
SOURCE = ROOT / "assets" / "tsi-226-privacy.js"
WIDTH, HEIGHT = letter
MARGIN = 47
INK = colors.HexColor("#15191e")
MUTED = colors.HexColor("#53606b")
ACCENT = colors.HexColor("#c88b1d")


def canonical_text() -> str:
    # Evaluate only the local variable declarations preceding the UI functions.
    script = """
const fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(process.argv[1],'utf8');
const start=s.indexOf('  var VERSION'),end=s.indexOf('  function escapeHTML');
if(start<0||end<=start)throw Error('Canonical consent declarations not found');
process.stdout.write(vm.runInNewContext(s.slice(start,end)+'JSON.stringify(consentText)',{}, {timeout:1000}));
"""
    result = subprocess.run(
        ["node", "-e", script, str(SOURCE)], check=True, capture_output=True
    )
    text = json.loads(result.stdout.decode("utf-8"))
    if not isinstance(text, str) or not text.startswith("TANABI SPORTS"):
        raise ValueError("Invalid canonical consent text")
    return text


def approved_logos() -> tuple[bytes, bytes]:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    svg = (ROOT / "assets" / "favicon-ts.svg").read_text(encoding="utf-8")
    main = re.search(r"var LOGO=[\"']data:image/png;base64,([^\"']+)", html)
    ts = re.search(r"data:image/png;base64,([^\"']+)", svg)
    if not main or not ts:
        raise ValueError("The approved TanabiSports/TS logos could not be found")
    images = tuple(base64.b64decode(item.group(1), validate=True) for item in (main, ts))
    for raw in images:
        with PILImage.open(BytesIO(raw)) as image:
            image.verify()
    return images


def register_fonts() -> None:
    candidates = [
        (Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")),
        (Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
         Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
         Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("TSI", str(regular)))
            pdfmetrics.registerFont(TTFont("TSI-Bold", str(bold)))
            pdfmetrics.registerFontFamily("TSI", normal="TSI", bold="TSI-Bold")
            return
    raise FileNotFoundError("Install Arial, Liberation Sans or DejaVu Sans before building")


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        kwargs["invariant"] = 1
        super().__init__(*args, **kwargs)
        self.page_states = []

    def showPage(self):
        self.page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self.page_states)
        for state in self.page_states:
            self.__dict__.update(state)
            self.saveState()
            self.setStrokeColor(colors.HexColor("#d9dee3"))
            self.setLineWidth(0.5)
            self.line(MARGIN, 39, WIDTH - MARGIN, 39)
            self.setFont("TSI", 8)
            self.setFillColor(MUTED)
            self.drawString(MARGIN, 25, "Tanabi Sports | Documento para completar y firmar")
            self.drawRightString(WIDTH - MARGIN, 25, f"Página {self._pageNumber} de {total}")
            self.restoreState()
            super().showPage()
        super().save()


def build(output: Path) -> dict:
    text = canonical_text()
    main_raw, ts_raw = approved_logos()
    main_logo, watermark = ImageReader(BytesIO(main_raw)), ImageReader(BytesIO(ts_raw))
    register_fonts()
    styles = {
        "body": ParagraphStyle("Body", fontName="TSI", fontSize=10.2, leading=14.2,
                               textColor=INK, spaceAfter=7.8, alignment=TA_LEFT),
        "title": ParagraphStyle("Title", fontName="TSI-Bold", fontSize=15.2, leading=18.2,
                                textColor=INK, spaceAfter=5, keepWithNext=True),
        "meta": ParagraphStyle("Meta", fontName="TSI", fontSize=9, leading=12.5,
                               textColor=MUTED, spaceAfter=11, keepWithNext=True),
        "identity": ParagraphStyle("Identity", fontName="TSI", fontSize=9.7, leading=13.3,
                                   textColor=INK, spaceAfter=3.5),
        "section": ParagraphStyle("Section", fontName="TSI-Bold", fontSize=11.2, leading=15.3,
                                  textColor=INK, spaceAfter=9, keepWithNext=True),
        "notice": ParagraphStyle("Notice", fontName="TSI-Bold", fontSize=9.6, leading=13.3,
                                 textColor=INK, backColor=colors.HexColor("#f5f5f2"),
                                 borderPadding=9, spaceBefore=8, spaceAfter=15),
        "field": ParagraphStyle("Field", fontName="TSI", fontSize=10.2, leading=21,
                                textColor=INK, spaceAfter=6.5),
        "check": ParagraphStyle("Check", fontName="TSI-Bold", fontSize=11, leading=20,
                                textColor=INK, spaceAfter=7),
        "end": ParagraphStyle("End", fontName="TSI", fontSize=9.2, leading=12.5,
                              textColor=INK, backColor=colors.HexColor("#f5f5f2"),
                              borderPadding=8, spaceBefore=9, spaceAfter=0),
    }

    def page_background(pdf, doc):
        pdf.saveState()
        # Original TS logo, unchanged, with low-opacity PDF painting on every page.
        pdf.setFillAlpha(0.048)
        pdf.drawImage(watermark, (WIDTH - 300) / 2, (HEIGHT - 300) / 2 - 10,
                      width=300, height=300, mask="auto", preserveAspectRatio=True)
        pdf.restoreState()
        pdf.saveState()
        logo_width = 143
        logo_height = logo_width * 364 / 872
        pdf.drawImage(main_logo, MARGIN, HEIGHT - 80, width=logo_width, height=logo_height,
                      mask="auto", preserveAspectRatio=True)
        pdf.setFillColor(MUTED)
        pdf.setFont("TSI-Bold", 8.8)
        pdf.drawRightString(WIDTH - MARGIN, HEIGHT - 43, "CONSENTIMIENTO DE IMAGEN")
        pdf.setFont("TSI", 8.2)
        pdf.drawRightString(WIDTH - MARGIN, HEIGHT - 57, "TSI 2.2.6 | 6 de noviembre de 2026")
        pdf.setStrokeColor(ACCENT)
        pdf.setLineWidth(1.1)
        pdf.line(MARGIN, HEIGHT - 92, WIDTH - MARGIN, HEIGHT - 92)
        pdf.restoreState()

    lines = text.splitlines()
    social = next(i for i, line in enumerate(lines) if line.startswith("1. Redes sociales"))
    advertising = next(i for i, line in enumerate(lines) if line.startswith("2. Publicidad"))
    scope = lines.index("ALCANCE Y CONDICIONES")
    minors = lines.index("MENORES DE EDAD")
    story = []
    for index, line in enumerate(lines):
        if index in (advertising, minors):
            story.append(PageBreak())
        if not line:
            story.append(Spacer(1, 4))
            continue
        if index == 0:
            style = "title"
        elif index == 1:
            style = "meta"
        elif index in (3, 4, 5):
            style = "identity"
        elif line.startswith("FORMATO PARA COMPLETAR") or line.startswith("DECISIÓN EXPRESA"):
            style = "notice"
        elif index in (social, advertising, scope, minors):
            style = "section"
        elif line.startswith("[ ] AUTORIZO"):
            style = "check"
        elif line.startswith("Entregar una copia"):
            style = "end"
        elif "_____" in line and (len(line) < 145 or line.startswith("Forma en que")):
            style = "field"
        else:
            style = "body"
        markup = escape(line)
        # Preserve the source text; move the long representation field to its own
        # writing line for comfortable hand completion rather than shrinking it.
        if line.startswith("Forma en que"):
            markup = re.sub(r" (_{5,})", r"<br/>\1", markup)
        story.append(Paragraph(markup, styles[style]))

    output.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(output), pagesize=letter, rightMargin=MARGIN,
                            leftMargin=MARGIN, topMargin=108, bottomMargin=54,
                            title=lines[0], author="Tanabi Sports",
                            subject="Consentimiento independiente - TSI 2.2.6",
                            creator="Tanabi Sports / ReportLab", pageCompression=1)
    doc.build(story, onFirstPage=page_background, onLaterPages=page_background,
              canvasmaker=NumberedCanvas)
    result = verify(output, text)
    mirror = ROOT / "output" / "pdf" / NAME
    if output.resolve() != mirror.resolve():
        mirror.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output, mirror)
    return result


def verify(output: Path, expected: str | None = None) -> dict:
    expected = expected or canonical_text()
    reader = PdfReader(str(output), strict=True)
    if len(reader.pages) != 3:
        raise ValueError(f"Expected three readable pages, found {len(reader.pages)}")
    combined = " ".join(page.extract_text() or "" for page in reader.pages)
    normalized = lambda value: re.sub(r"\s+", " ", value).strip()
    extracted = normalized(combined)
    for line in expected.splitlines():
        if line and normalized(line) not in extracted:
            raise ValueError("Canonical text missing from PDF: " + line)
    for page in reader.pages:
        if len(page.images) != 2:
            raise ValueError("Every page must contain both approved logos")
        states = page["/Resources"].get("/ExtGState", {})
        if not any(abs(float(state.get_object().get("/ca", 1)) - 0.048) < 1e-9
                   for state in states.values()):
            raise ValueError("TS watermark must be semitransparent on every page")
        if page.get("/Annots"):
            raise ValueError("This printable form must not add interactive fields")
    if reader.get_fields():
        raise ValueError("Unexpected interactive form data")
    raw = output.read_bytes()
    return {
        "output": str(output.resolve()), "pages": len(reader.pages), "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "git_blob": hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest(),
        "source_text_sha256": hashlib.sha256(expected.encode("utf-8")).hexdigest(),
        "canonical_lines_verified": sum(bool(line) for line in expected.splitlines()),
        "logo_images_per_page": [len(page.images) for page in reader.pages],
        "static_printable": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "assets" / NAME)
    parser.add_argument("--verify", action="store_true", help="Read-only PDF checks")
    args = parser.parse_args()
    result = verify(args.output) if args.verify else build(args.output)
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
