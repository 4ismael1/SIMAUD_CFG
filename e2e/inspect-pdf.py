import json
from pathlib import Path
import re
import sys

import pymupdf


filename = Path(sys.argv[1])
document = pymupdf.open(filename)
pages = [page.get_text() for page in document]
text = "\n".join(pages)
code = re.search(r"[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}", text)
render_directory = filename.parent / (filename.stem + "-paginas")
render_directory.mkdir(exist_ok=True)
for number, page in enumerate(document, start=1):
    page.get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25)).save(render_directory / f"pagina-{number}.png")

result = {
    "pageCount": len(pages),
    "pages": pages,
    "code": code.group() if code else None,
    "qrDrawingCount": len(document[-1].get_drawings()),
    "links": [link.get("uri") for page in document for link in page.get_links() if link.get("uri")],
    "images": sum(len(page.get_images()) for page in document),
}
filename.with_suffix(".inspeccion.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=True))
