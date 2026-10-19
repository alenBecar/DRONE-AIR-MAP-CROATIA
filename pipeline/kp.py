"""NOAA SWPC planetary Kp index (observed + 3-day forecast) -> kp.json."""
import json
from common import http, write_json

d = json.loads(http('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', timeout=60))
# The feed has used both a list-of-lists (header row first) and a list-of-objects layout.
if d and isinstance(d[0], list):
    h = d[0]; d = [dict(zip(h, row)) for row in d[1:]]
out = [[x['time_tag'][:19], float(x['kp']), (x.get('observed') or 'p')[0]] for x in d]
write_json('kp.json', out)
print('kp', len(out))
