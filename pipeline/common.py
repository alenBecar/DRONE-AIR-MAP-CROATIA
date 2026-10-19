"""Shared helpers for the data pipeline. All outputs go to $DATA_DIR/pub and are written atomically."""
import json, os, time, urllib.request, urllib.parse

DATA = os.environ.get('DATA_DIR', '/data')
PUB = os.path.join(DATA, 'pub')
WORK = os.path.join(DATA, 'work')
os.makedirs(PUB, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
UA = 'air-map-croatia/1.0 (personal drone map; dron.alenbecar.com)'
BBOX = (13.2, 42.3, 19.6, 46.65)  # W S E N


def http(url, data=None, timeout=120, tries=4, headers=None):
    last = None
    for a in range(tries):
        try:
            h = {'User-Agent': UA}
            h.update(headers or {})
            req = urllib.request.Request(url, data=data, headers=h)
            return urllib.request.urlopen(req, timeout=timeout).read()
        except Exception as e:  # noqa
            last = e
            time.sleep(5 + a * 10)
    raise last


def write_json(name, obj):
    path = os.path.join(PUB, name)
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, separators=(',', ':'), ensure_ascii=False)
    os.replace(tmp, path)


def read_json(name, default=None):
    try:
        with open(os.path.join(PUB, name)) as f:
            return json.load(f)
    except Exception:
        return default


OVERPASS = ['https://overpass-api.de/api/interpreter',
            'https://overpass.private.coffee/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter']


def overpass(body, timeout=600):
    q = '[out:json][timeout:500];area["ISO3166-1"="HR"][admin_level=2]->.a;(' + body + ');out geom qt;'
    last = None
    for a in range(6):
        srv = OVERPASS[a % len(OVERPASS)]
        try:
            b = http(srv, data=urllib.parse.urlencode({'data': q}).encode(), timeout=timeout, tries=1)
            d = json.loads(b)
            return d['elements']
        except Exception as e:
            last = e
            time.sleep(20 + a * 20)
    raise last


def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 5), round(c[1], 5)]
    return [rnd(x) for x in c]
