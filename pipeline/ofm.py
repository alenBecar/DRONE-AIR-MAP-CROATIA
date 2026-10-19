"""Croatian airspace (CTR, ATZ, TMA, P, R, D, RMZ, gliding areas) from open flightmaps OFMX for region LDZO.
Writes $DATA_DIR/work/airspace_ofm.geojson; amc.py merges it into the published zones file."""
import datetime, io, json, os, zipfile
import xml.etree.ElementTree as ET
from common import http, WORK


def airac_candidates(today=None):
    """Yield AIRAC ids (YYNN) from the current cycle backwards. Cycle 2401 started 2024-01-25; cycles are 28 days."""
    today = today or datetime.date.today()
    d = datetime.date(2024, 1, 25)
    cycles = []
    while d <= today:
        cycles.append(d)
        d += datetime.timedelta(days=28)
    out = []
    for c in reversed(cycles[-3:]):
        n = sum(1 for x in cycles if x.year == c.year and x <= c)
        out.append(f'{c.year % 100:02d}{n:02d}')
    return out


def ring(coords):
    out = []
    for x, y in coords:
        p = [round(x, 5), round(y, 5)]
        if not out or out[-1] != p:
            out.append(p)
    if out[0] != out[-1]:
        out.append(out[0])
    a = sum(out[i][0] * out[i + 1][1] - out[i + 1][0] * out[i][1] for i in range(len(out) - 1))
    if a < 0:
        out.reverse()
    return out


REF = {'HEI': 'AGL', 'ALT': 'AMSL', 'STD': 'STD', 'W84': 'AMSL'}


def olim(a, w):
    cd = a.findtext(f'codeDistVer{w}'); v = a.findtext(f'valDistVer{w}'); u = a.findtext(f'uomDistVer{w}')
    if v is None:
        return dict(value=None, unit=None, ref=None, text=None)
    v = float(v); v = int(v) if v.is_integer() else v; ref = REF.get(cd, cd)
    if ref == 'STD' or u == 'FL':
        return dict(value=v, unit='FL', ref='STD', text=f'FL{int(v):03d}')
    t = 'GND' if (v == 0 and ref == 'AGL') else f'{v} {u} {ref}'
    return dict(value=v, unit=u, ref=ref, text=t)


def main():
    blob, cyc = None, None
    for c in airac_candidates():
        try:
            blob = http(f'https://snapshots.openflightmaps.org/live/{c}/ofmx/ldzo/latest/ofmx_ld.zip', timeout=180, tries=2)
            cyc = c
            break
        except Exception as e:
            print('no OFM for', c, e)
    if blob is None:
        raise SystemExit('OFM download failed')
    z = zipfile.ZipFile(io.BytesIO(blob))
    names = z.namelist()
    ofmx = next(n for n in names if n.endswith('isolated/ofmx_ld.ofmx'))
    shp = next(n for n in names if n.endswith('isolated/ofmx_ld_ofmShapeExtension.xml'))
    root = ET.fromstring(z.read(ofmx))
    eff = root.get('effective')
    shapes = {}
    for a in ET.fromstring(z.read(shp)).iter('Ase'):
        uid = a.find('AseUid'); pl = a.find('gmlPosList')
        if pl is None or not pl.text:
            continue
        shapes[uid.get('mid')] = [tuple(map(float, t.split(',')[:2])) for t in pl.text.split()]
    ases = {a.find('AseUid').get('mid'): a for a in root.findall('Ase')}
    children = {}
    for g in root.findall('Adg'):
        c = g.find('AdgUid/AseUid').get('mid'); p = g.find('AseUidSameExtent')
        if p is not None:
            children.setdefault(p.get('mid'), []).append(c)
    feats = []
    for mid, a in ases.items():
        t = a.findtext('AseUid/codeType')
        if t in ('CLASS', None) or mid not in shapes:
            continue
        geom = {'type': 'Polygon', 'coordinates': [ring(shapes[mid])]}
        for p in [ases[c] for c in children.get(mid, [])] or [a]:
            lo = olim(p, 'Lower'); up = olim(p, 'Upper')
            if lo['value'] is None and p is not a: lo = olim(a, 'Lower')
            if up['value'] is None and p is not a: up = olim(a, 'Upper')
            q = dict(name=a.findtext('txtName'), type=t, id=a.findtext('AseUid/codeId'),
                     airspace_class=p.findtext('codeClass') or a.findtext('codeClass'))
            for k, l in (('lower', lo), ('upper', up)):
                for s in ('value', 'unit', 'ref', 'text'):
                    q[f'{k}_{s}'] = l[s]
            rm = '\n'.join(x for x in [a.findtext('txtRmk'), p.findtext('txtRmk') if p is not a else None] if x)
            q['remarks'] = rm or None
            q['activity_schedule'] = a.findtext('Att/codeWorkHr')
            feats.append({'type': 'Feature', 'geometry': geom, 'properties': q})
    out = {'type': 'FeatureCollection', 'meta': {'airac': cyc, 'effective': eff}, 'features': feats}
    tmp = os.path.join(WORK, 'airspace_ofm.geojson.tmp')
    with open(tmp, 'w') as f:
        json.dump(out, f, ensure_ascii=False)
    os.replace(tmp, os.path.join(WORK, 'airspace_ofm.geojson'))
    print('ofm', cyc, len(feats))


if __name__ == '__main__':
    main()
