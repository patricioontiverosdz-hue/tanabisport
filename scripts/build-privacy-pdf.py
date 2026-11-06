"""Build the integral privacy notice from TSI's canonical local HTML.

Requires Node.js, ReportLab, pypdf and Pillow. Reuses approved logo and font
helpers from build-consent-pdf.py without regenerating the consent PDF.
The source HTML is evaluated only up to the UI function declarations.
"""
from __future__ import annotations

import argparse
import hashlib
import html
from io import BytesIO
import json
from pathlib import Path
import re
import runpy
import shutil
import subprocess

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate


ROOT = Path(__file__).resolve().parents[1]
NAME = "Tanabi-Sports-aviso-privacidad-integral-2.2.6.pdf"
SOURCE = ROOT / "assets" / "tsi-226-privacy.js"
WIDTH, HEIGHT = letter
MARGIN = 47
INK = colors.HexColor("#15191e")
MUTED = colors.HexColor("#53606b")
ACCENT = colors.HexColor("#c88b1d")
HEADER = "AVISO DE PRIVACIDAD INTEGRAL"
VERSION_LINE = "TSI 2.2.6 | 6 de noviembre de 2026"
FOOTER = "Tanabi Sports | Aviso de Privacidad Integral"


def canonical_document() -> dict:
    script = """
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.argv[1],'utf8');
const start=source.indexOf('  var VERSION'),end=source.indexOf('  function escapeHTML');
if(start<0||end<=start)throw Error('Canonical document declarations not found');
process.stdout.write(vm.runInNewContext(source.slice(start,end)+'JSON.stringify({version:VERSION,html:integral})',{}, {timeout:1000}));
"""
    result = subprocess.run(["node", "-e", script, str(SOURCE)],
                            check=True, capture_output=True)
    data = json.loads(result.stdout.decode("utf-8"))
    if data.get("version") != "2.2.6" or not data.get("html", "").startswith("<p>"):
        raise ValueError("Unexpected canonical integral notice")
    return data


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def plain_text(markup: str) -> str:
    separated = re.sub(r"</?(?:p|h3)\b[^>]*>|<br\s*/?>", " ", markup)
    return normalized(html.unescape(re.sub(r"<[^>]+>", "", separated)))


def blocks(markup: str) -> list[tuple[str, str]]:
    found = [(match.group(1), match.group(2)) for match in
             re.finditer(r"<(p|h3)>(.*?)</\1>", markup, re.S)]
    reconstructed = "".join(f"<{tag}>{content}</{tag}>" for tag, content in found)
    if reconstructed != markup or not found:
        raise ValueError("Integral notice contains unsupported or unparsed blocks")
    return found


class NumberedNoticeCanvas(canvas.Canvas):
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
            self.drawString(MARGIN, 25, FOOTER)
            self.drawRightString(WIDTH - MARGIN, 25, f"Página {self._pageNumber} de {total}")
            self.restoreState()
            super().showPage()
        super().save()


def build(output: Path) -> dict:
    data = canonical_document()
    parts = blocks(data["html"])
    helpers = runpy.run_path(str(ROOT / "scripts" / "build-consent-pdf.py"))
    main_raw, ts_raw = helpers["approved_logos"]()
    helpers["register_fonts"]()
    main_logo, watermark = ImageReader(BytesIO(main_raw)), ImageReader(BytesIO(ts_raw))
    styles = {
        "body": ParagraphStyle("Body", fontName="TSI", fontSize=10.2, leading=14.2,
                               textColor=INK, spaceAfter=8.5, alignment=TA_LEFT,
                               allowWidows=0, allowOrphans=0),
        "identity": ParagraphStyle("Identity", fontName="TSI", fontSize=10, leading=14.2,
                                   textColor=INK, spaceAfter=12),
        "title": ParagraphStyle("Title", fontName="TSI-Bold", fontSize=19, leading=23,
                                textColor=INK, spaceAfter=6, keepWithNext=True),
        "meta": ParagraphStyle("Meta", fontName="TSI", fontSize=9, leading=12.5,
                               textColor=MUTED, spaceAfter=14, keepWithNext=True),
        "section": ParagraphStyle("Section", fontName="TSI-Bold", fontSize=11.3, leading=15.3,
                                  textColor=INK, spaceBefore=6.5, spaceAfter=7,
                                  keepWithNext=True),
    }

    def page_background(pdf, doc):
        pdf.saveState()
        pdf.setFillAlpha(0.048)
        pdf.drawImage(watermark, (WIDTH - 300) / 2, (HEIGHT - 300) / 2 - 10,
                      width=300, height=300, mask="auto", preserveAspectRatio=True)
        pdf.restoreState()
        pdf.saveState()
        logo_width = 143
        pdf.drawImage(main_logo, MARGIN, HEIGHT - 80, width=logo_width,
                      height=logo_width * 364 / 872, mask="auto", preserveAspectRatio=True)
        pdf.setFillColor(MUTED)
        pdf.setFont("TSI-Bold", 8.8)
        pdf.drawRightString(WIDTH - MARGIN, HEIGHT - 43, HEADER)
        pdf.setFont("TSI", 8.2)
        pdf.drawRightString(WIDTH - MARGIN, HEIGHT - 57, VERSION_LINE)
        pdf.setStrokeColor(ACCENT)
        pdf.setLineWidth(1.1)
        pdf.line(MARGIN, HEIGHT - 92, WIDTH - MARGIN, HEIGHT - 92)
        pdf.restoreState()

    story = [Paragraph("Aviso de privacidad integral", styles["title"]),
             Paragraph("Tanabi Sports · Versión 2.2.6 · Revisión: 6 de noviembre de 2026.",
                       styles["meta"])]
    for index, (tag, content) in enumerate(parts):
        if tag == "h3" and content.startswith(("3. ", "6. ")):
            story.append(PageBreak())
        markup = content.replace("<strong>", "<b>").replace("</strong>", "</b>")
        markup = re.sub(r"<br\s*>", "<br/>", markup)
        style = "identity" if index == 0 else "section" if tag == "h3" else "body"
        story.append(Paragraph(markup, styles[style]))
    output.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(output), pagesize=letter, leftMargin=MARGIN,
                            rightMargin=MARGIN, topMargin=108, bottomMargin=54,
                            title="Tanabi Sports - Aviso de Privacidad Integral 2.2.6",
                            author="Tanabi Sports", subject="Aviso de privacidad integral - TSI 2.2.6",
                            creator="Tanabi Sports / ReportLab", pageCompression=1)
    doc.build(story, onFirstPage=page_background, onLaterPages=page_background,
              canvasmaker=NumberedNoticeCanvas)
    result = verify(output, data)
    mirror = ROOT / "output" / "pdf" / NAME
    if output.resolve() != mirror.resolve():
        mirror.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output, mirror)
    return result


def verify(output: Path, expected: dict | None = None) -> dict:
    expected = expected or canonical_document()
    parts = blocks(expected["html"])
    reader = PdfReader(str(output), strict=True)
    if not 2 <= len(reader.pages) <= 5:
        raise ValueError(f"Unexpected page count: {len(reader.pages)}")
    collected = []
    for index, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        if FOOTER not in text or f"Página {index} de {len(reader.pages)}" not in text:
            raise ValueError("Missing notice footer or page number")
        for repeated in (HEADER, VERSION_LINE, FOOTER):
            text = text.replace(repeated, "")
        collected.append(re.sub(r"Página \d+ de \d+", "", text))
        if len(page.images) != 2:
            raise ValueError("Every page must contain both approved logos")
        states = page["/Resources"].get("/ExtGState", {})
        if not any(abs(float(state.get_object().get("/ca", 1)) - 0.048) < 1e-9
                   for state in states.values()):
            raise ValueError("Watermark transparency is missing")
        for annotation in page.get("/Annots", []):
            target = annotation.get_object()
            if target.get("/Subtype") != "/Link" or target.get("/A", {}).get("/URI") != "mailto:Datrilagency@gmail.com":
                raise ValueError("Unexpected interactive behavior in privacy notice")
    extracted = normalized(" ".join(collected))
    for _, content in parts:
        if plain_text(content) not in extracted:
            raise ValueError("Canonical paragraph missing from PDF: " + plain_text(content))
    if plain_text(expected["html"]) not in extracted:
        raise ValueError("Canonical integral notice is not present in full sequence")
    if reader.get_fields() or reader.is_encrypted or reader.trailer["/Root"].get("/JavaScript"):
        raise ValueError("Notice must not contain forms, encryption or JavaScript")
    if "Documento para completar y firmar" in extracted:
        raise ValueError("Consent-form wording leaked into the notice footer")
    raw = output.read_bytes()
    return {
        "output": str(output.resolve()), "pages": len(reader.pages), "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "git_blob": hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest(),
        "source_html_sha256": hashlib.sha256(expected["html"].encode("utf-8")).hexdigest(),
        "canonical_text_sha256": hashlib.sha256(plain_text(expected["html"]).encode("utf-8")).hexdigest(),
        "canonical_blocks_verified": len(parts),
        "logo_images_per_page": [len(page.images) for page in reader.pages],
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
