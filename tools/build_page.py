"""Builds the page from web/app.html + web/css/app.css + web/js/*.js (concatenated in name order).
  server   -> web/index.html (full document; pmtiles basemap, live data from /data, satellite via /sat proxy)
  artifact -> <out> (claude.ai artifact body; MapLibre CSS inlined, sharded tiles)"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
mode = sys.argv[1] if len(sys.argv) > 1 else 'server'
W = os.path.join(root, 'web')
s = open(os.path.join(W, 'app.html'), encoding='utf-8').read()
s = s.replace('/*APP_CSS*/', open(os.path.join(W, 'css', 'app.css'), encoding='utf-8').read())
s = s.replace('/*APP_JS*/', ''.join(open(os.path.join(W, 'js', f), encoding='utf-8').read()
                                    for f in sorted(os.listdir(os.path.join(W, 'js'))) if f.endswith('.js')))
BM = '<script src="https://cdn.jsdelivr.net/npm/@protomaps/basemaps@5.7.0/dist/basemaps.js"></script>'
assert BM in s
if mode == 'artifact':
    css = os.path.join(here, 'maplibre-gl.css')
    if not os.path.exists(css):
        import urllib.request
        urllib.request.urlretrieve('https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.css', css)
    s = s.replace('/*MAPLIBRE_CSS*/', open(css).read())
    out = sys.argv[2]
    open(out, 'w', encoding='utf-8').write(s)
else:
    s = s.replace('<style>/*MAPLIBRE_CSS*/</style>', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.css">')
    s = s.replace(BM, BM + '\n<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.3.0/dist/pmtiles.js"></script>\n<script>window.__SERVER__=1</script>')
    head = ('<!doctype html><html lang="hr"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<meta name="theme-color" content="#A3166F"><meta name="description" content="Karta Hrvatske za pilote dronova: zone AMC, prepreke i vrijeme.">'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style></head><body>')
    open(os.path.join(root, 'web', 'index.html'), 'w', encoding='utf-8').write(head + s + '</body></html>')
print('built', mode)
