# bump-version.py - Pone un número de versión nuevo en los archivos de la web (?v=...).
# GitHub Pages guarda los archivos en caché hasta 10 minutos; con la versión en la URL,
# el celular descarga la página y el código de la misma versión y no mezcla viejo con nuevo.
# Uso: python bump-version.py   (antes de cada commit que se publique)
import re, time, pathlib

VERSION = time.strftime("%Y%m%d%H%M%S")
ROOT = pathlib.Path(__file__).parent
LOCAL_FILE = r"(\./)?(app|style|firebase-config|questions-data|questions-18|question-types|persona-data)\.(js|css)"

for name in ["index.html", "app.js", "questions-data.js"]:
    path = ROOT / name
    text = path.read_text(encoding="utf-8")
    text = re.sub(r'(["\'])(' + LOCAL_FILE + r')(\?v=\w+)?\1', lambda m: f"{m.group(1)}{m.group(2)}?v={VERSION}{m.group(1)}", text)
    path.write_text(text, encoding="utf-8", newline="\n")

print("versión", VERSION)
