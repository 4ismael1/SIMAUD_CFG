import base64
import io
import json
from pathlib import Path
import re
import sys
import zipfile


directory = Path(sys.argv[1])
environment = Path("e2e/.env.e2e").read_text(encoding="utf-8")
secrets = []
for line in environment.splitlines():
    name, value = line.split("=", 1)
    if name.endswith("_PASSWORD") or name.endswith("_SECRET") or name.endswith("_KEY"):
        secrets.append(json.loads(value).encode())

for filename in directory.rglob("*"):
    if not filename.is_file():
        continue
    content = filename.read_bytes()
    if any(secret in content for secret in secrets):
        raise SystemExit("El resultado contiene un secreto e2e. Se bloqueó la entrega.")
    if filename.name != "index.html":
        continue
    match = re.search(rb"data:application/zip;base64,([A-Za-z0-9+/=]+)", content)
    if not match:
        continue
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(match[1]))) as archive:
        for entry in archive.namelist():
            if any(secret in archive.read(entry) for secret in secrets):
                raise SystemExit("El informe HTML contiene un secreto e2e. Se bloqueó la entrega.")

print("Artefactos revisados sin secretos e2e.")
