"""Protomaps vector basemap extract for Croatia (+ margins) -> hr.pmtiles, served with HTTP range requests."""
import json, os, subprocess
from common import http, PUB, BBOX

maxz = os.environ.get('BASEMAP_MAXZOOM', '13')
builds = json.loads(http('https://build-metadata.protomaps.dev/builds.json', timeout=60))
key = builds[-1]['key']
tmp = os.path.join(PUB, 'hr.pmtiles.tmp')
bbox = ','.join(str(x) for x in BBOX)
subprocess.run(['pmtiles', 'extract', f'https://build.protomaps.com/{key}', tmp, f'--bbox={bbox}', f'--maxzoom={maxz}',
                '--download-threads=4'], check=True, timeout=3600)
os.replace(tmp, os.path.join(PUB, 'hr.pmtiles'))
print('basemap', key, maxz, os.path.getsize(os.path.join(PUB, 'hr.pmtiles')))
