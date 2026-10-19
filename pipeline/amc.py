"""CroControl AMC portal: static areas, activations (reservations) and NOTAMs, merged with OFM airspace.
Only public aeronautical information is kept. The package also lists users, drone reservations of other
operators, phone numbers and e-mails: none of that is ever written to disk."""
import datetime, json, math, os, random, re
from common import http, write_json, WORK

URL = 'https://amc.crocontrol.hr/AMC/Package/InitialPackage?{}'
FT = 0.3048


def wkt_poly(s):
    rings = re.findall(r'\(([^()]+)\)', s)
    out = []
    for r in rings:
        pts = [[round(float(a), 5), round(float(b), 5)] for a, b in (p.split()[:2] for p in r.split(','))]
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        out.append(pts)
    return {'type': 'Polygon', 'coordinates': out}


def amc_lim(val, unit):
    """AMC limits -> (metres, ref, text). FL 0 means ground."""
    u = (unit or '').upper().strip()
    if val is None:
        return None, None, None
    if u == 'FL':
        if val == 0:
            return 0, 'AGL', 'GND'
        return round(val * 100 * FT), 'STD', f'FL{int(val):03d}'
    if u in ('FT AMSL', 'FEET', 'FT'):
        return (0, 'AGL', 'GND') if val == 0 else (round(val * FT), 'AMSL', f'{int(val)} ft AMSL')
    if u == 'M AGL':
        return round(val), 'AGL', f'{int(val)} m AGL'
    return None, None, f'{val} {unit}'


def ofm_lim(p, k):
    v, un, ref, txt = p.get(k + '_value'), p.get(k + '_unit'), p.get(k + '_ref'), p.get(k + '_text')
    if v is None:
        return None, None, txt
    un = (un or 'FT').upper(); ref = (ref or 'AMSL').upper()
    m = v * 100 * FT if un == 'FL' else (v * FT if un in ('FT', 'FEET') else float(v))
    if un == 'FL':
        ref = 'STD'
    if txt and txt.upper() == 'GND':
        return 0, 'AGL', txt
    return round(m), {'MSL': 'AMSL', 'SFC': 'AGL'}.get(ref, ref), txt


def circle(lon, lat, r_m, n=48):
    c = [[round(lon + math.sin(2 * math.pi * i / n) * r_m / (111320 * math.cos(math.radians(lat))), 5),
          round(lat + math.cos(2 * math.pi * i / n) * r_m / 110540, 5)] for i in range(n)]
    return {'type': 'Polygon', 'coordinates': [c + [c[0]]]}


def notams(pkg):
    out = []
    for x in pkg.get('ActiveFullNotams') or []:
        q = (x.get('QPodaci') or '').split('/')
        code = q[1] if len(q) > 1 else ''
        subj = code[1:3] if len(code) >= 3 else ''
        if not (subj[:1] in ('W', 'R') or subj in ('OB', 'OL')):
            continue
        lat, lon = x.get('ParserLat'), x.get('ParserLng')
        if lat is None or lon is None:
            continue
        r_nm = x.get('ParserCircleRadiusNm') or 0.3
        if r_nm > 50:
            continue
        lo = x.get('ParserLower') or 0
        lo_u = (x.get('ParserLowerUnit') or 'FL').upper()
        lo_m = lo * 100 * FT if lo_u == 'FL' else lo * FT
        if lo_m > 1500:
            continue
        hi = x.get('ParserUpper'); hi_u = (x.get('ParserUpperUnit') or 'FL').upper()
        out.append({'type': 'Feature', 'geometry': circle(lon, lat, max(r_nm, 0.1) * 1852),
                    'properties': {'n': f"{x.get('Serija') or ''}{x.get('Broj') or ''}", 'code': code, 't': 'NOTAM',
                                   'txt': (x.get('EOpis') or '')[:600], 'from': (x.get('BVrijemeOd') or '') + 'Z',
                                   'to': (x.get('CVrijemeDo') or '') + 'Z', 'sch': (x.get('DSun') or '')[:200] or None,
                                   'lo': round(lo_m), 'lot': 'GND' if lo == 0 else f'{lo}{" FL" if lo_u == "FL" else " ft"}',
                                   'hit': f'{hi}{" FL" if hi_u == "FL" else " ft"}' if hi is not None else None,
                                   'r_nm': r_nm}})
    return out


def main():
    pkg = json.loads(http(URL.format(random.randint(1, 10**9)), timeout=120, headers={'Accept': 'application/json'}))
    feats = []
    # OFM airspace (CTR, ATZ, TMA, RMZ, P, R, gliding)
    try:
        with open(os.path.join(WORK, 'airspace_ofm.geojson')) as f:
            ofm = json.load(f)
    except Exception:
        ofm = {'features': [], 'meta': {}}
    for f in ofm['features']:
        p = f['properties']
        if p['type'] not in ('CTR', 'ATZ', 'P', 'R', 'RMZ', 'TMA', 'GLDR', 'HPGLDR'):
            continue
        lo, lor, lot = ofm_lim(p, 'lower'); hi, hir, hit = ofm_lim(p, 'upper')
        q = {'n': p.get('name'), 't': p['type'], 'lo': lo, 'lor': lor, 'lot': lot, 'hi': hi, 'hir': hir, 'hit': hit, 'src': 'ofm'}
        for a, b in (('airspace_class', 'cls'), ('remarks', 'rem'), ('activity_schedule', 'sch')):
            if p.get(a):
                q[b] = p[a]
        feats.append({'type': 'Feature', 'properties': q, 'geometry': f['geometry']})
    # AMC static areas
    for x in pkg.get('Areas') or []:
        try:
            g = wkt_poly(x['Poligon'])
        except Exception:
            continue
        lo, lor, lot = amc_lim(x.get('Lowerflightlevel'), x.get('LowerUnit'))
        hi, hir, hit = amc_lim(x.get('Upperflightlevel'), x.get('UpperUnit'))
        feats.append({'type': 'Feature', 'geometry': g, 'properties': {'n': x.get('Name'), 't': x.get('AreaType'), 'lo': lo, 'lor': lor, 'lot': lot,
                                                                      'hi': hi, 'hir': hir, 'hit': hit, 'src': 'amc'}})
    # AMC activations (public airspace reservations; user fields are dropped)
    res = pkg.get('Reservations') or []
    for x in res:
        try:
            g = wkt_poly(x['Poligon'])
        except Exception:
            continue
        lo, lor, lot = amc_lim(x.get('LowerreservedFL'), x.get('LowerUnit'))
        hi, hir, hit = amc_lim(x.get('UpperreservedFL'), x.get('UpperUnit'))
        feats.append({'type': 'Feature', 'geometry': g, 'properties': {'n': x.get('Name'), 't': x.get('AreaType'), 'lo': lo, 'lor': lor, 'lot': lot,
                                                                      'hi': hi, 'hir': hir, 'hit': hit, 'src': 'amc', 'act': 1,
                                                                      'from': (x.get('StartDate') or '') + 'Z', 'to': (x.get('EndDate') or '') + 'Z',
                                                                      'st': x.get('ReservationStatus'), 'dn': x.get('ZaPrikazString')}})
    cs = pkg.get('ClientSettings') or {}
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')
    meta = {'amc_fetched': now,
            'amc_window': [min((x['StartDate'] for x in res), default=None), max((x['EndDate'] for x in res), default=None)],
            'ofm_airac': (ofm.get('meta') or {}).get('airac'),
            'params': {'restricted_runway_radius_nm': cs.get('RestrictedRunwayRadiusInNm'),
                       'ctr_max_height_ft': cs.get('CTRAwayFromRunwayMaxHeightInFeets'),
                       'g_layer_max_reservation_ft': cs.get('MaxGLayerReservationHeightInFeets')},
            'announcement': None}
    ann = pkg.get('LastAMCAnnouncementList') or []
    hr = next((a.get('Message') for a in ann if (a.get('CultureCode') or '').startswith('hr')), None)
    if hr:
        meta['announcement'] = re.sub(r'<[^>]+>', ' ', hr)[:1500]
    write_json('zones.geojson', {'type': 'FeatureCollection', 'meta': meta, 'features': feats})
    nt = notams(pkg)
    write_json('notams.geojson', {'type': 'FeatureCollection', 'meta': {'fetched': now}, 'features': nt})
    print('zones', len(feats), 'notams', len(nt))


if __name__ == '__main__':
    main()
