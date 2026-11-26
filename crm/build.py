#!/usr/bin/env python3
"""Injeta o módulo de Contratos (src/) no index.html, que precisa ser arquivo único (Apps Script)."""
import re, json, pathlib
d = pathlib.Path(__file__).parent
s = (d/'index.html').read_text(encoding='utf-8')
css = (d/'src/contratos.css').read_text(encoding='utf-8')
js = '\n'.join((d/'src'/f).read_text(encoding='utf-8') for f in
               ['contratos-modelos.js','contratos-core.js','contratos-docs.js','contratos-views.js','contratos-publico.js'])
schema = (d/'src/contratos-schema.json').read_text(encoding='utf-8')
assert '</script' not in js.lower() and '</style' not in css.lower()
s = re.sub(r'<style id="ct-css">.*?</style>', lambda m: '<style id="ct-css">\n'+css+'</style>', s, count=1, flags=re.S)
s = re.sub(r'<script id="ct-js">.*?</script>', lambda m: '<script id="ct-js">\n'+js+'</script>', s, count=1, flags=re.S)
s = re.sub(r'<script type="application/json" id="ct-schema">.*?</script>', lambda m: '<script type="application/json" id="ct-schema">'+json.dumps(json.loads(schema),ensure_ascii=False)+'</script>', s, count=1, flags=re.S)
(d/'index.html').write_text(s, encoding='utf-8')
print('ok', len(s))
