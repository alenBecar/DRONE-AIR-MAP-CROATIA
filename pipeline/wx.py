"""Open-Meteo hourly forecast on a 0.25 deg grid over Croatia (72 h) -> wx.json."""
import datetime, json, time, urllib.parse
from common import http, write_json

V = ('temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,cloud_cover_low,'
     'visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_80m,wind_speed_120m,wind_direction_120m')
PREC = {'temperature_2m': 0, 'relative_humidity_2m': 0, 'precipitation_probability': 0, 'precipitation': 1, 'weather_code': 0,
        'cloud_cover': 0, 'cloud_cover_low': 0, 'wind_speed_10m': 1, 'wind_direction_10m': 0, 'wind_gusts_10m': 1,
        'wind_speed_80m': 1, 'wind_speed_120m': 1, 'wind_direction_120m': 0}


def r(v, n):
    return None if v is None else (round(v, n) if n else int(round(v)))


def main():
    lats = [round(42.35 + 0.25 * i, 2) for i in range(18)]
    lons = [round(13.45 + 0.25 * j, 2) for j in range(25)]
    pts = [(la, lo) for la in lats for lo in lons]
    names = V.split(',')
    res = []
    for k in range(0, len(pts), 50):
        b = pts[k:k + 50]
        q = urllib.parse.urlencode({'latitude': ','.join(str(p[0]) for p in b), 'longitude': ','.join(str(p[1]) for p in b),
                                    'hourly': V, 'forecast_hours': 72, 'past_hours': 1, 'timezone': 'UTC',
                                    'wind_speed_unit': 'ms', 'timeformat': 'unixtime'})
        d = json.loads(http('https://api.open-meteo.com/v1/forecast?' + q, timeout=90))
        res += d if isinstance(d, list) else [d]
        time.sleep(1)
    g = {'t0': res[0]['hourly']['time'][0], 'n': len(res[0]['hourly']['time']), 'lats': lats, 'lons': lons, 'vars': names,
         'fetched': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'elev': [], 'data': []}
    for d in res:
        g['elev'].append(r(d.get('elevation'), 0))
        row = []
        for v in names:
            a = d['hourly'][v]
            row.append([None if x is None else int(round(x / 100)) for x in a] if v == 'visibility' else [r(x, PREC[v]) for x in a])
        g['data'].append(row)
    write_json('wx.json', g)
    print('wx', len(res), g['n'])


if __name__ == '__main__':
    main()
