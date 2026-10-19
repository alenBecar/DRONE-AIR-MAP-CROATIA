"""OpenStreetMap obstacles and places for Croatia via Overpass -> power, rail, aero, points, sensitive, protected, places."""
import time
from shapely.geometry import LineString, Polygon, Point, mapping
from shapely.ops import polygonize, unary_union
from common import overpass, write_json, rnd


def coords(e):
    return [(p['lon'], p['lat']) for p in e.get('geometry', []) if p]


def area_geom(e):
    if e['type'] == 'node':
        return Point(e['lon'], e['lat'])
    if e['type'] == 'way':
        c = coords(e)
        if len(c) >= 4 and c[0] == c[-1]:
            return Polygon(c)
        return LineString(c) if len(c) > 1 else None
    lines = [LineString(coords(m)) for m in e.get('members', []) if m.get('type') == 'way' and len(coords(m)) > 1]
    polys = list(polygonize(unary_union(lines))) if lines else []
    return unary_union(polys) if polys else None


def T(e, *ks):
    t = e.get('tags', {})
    return {k.replace(':', '_'): t[k] for k in ks if k in t}


def geo(g):
    m = mapping(g)
    return {'type': m['type'], 'coordinates': rnd(m['coordinates'])}


def fc(feats):
    return {'type': 'FeatureCollection', 'features': feats}


def power():
    F = []
    for e in overpass('way(area.a)[power~"^(line|minor_line|cable)$"];'):
        c = coords(e)
        if len(c) < 2:
            continue
        p = T(e, 'power', 'voltage', 'name', 'operator', 'cables', 'circuits', 'line', 'location')
        if p.get('location') == 'underground' or (p.get('power') == 'cable' and p.get('location') != 'overhead'):
            continue
        try:
            v = max(int(x) for x in p.get('voltage', '0').split(';') if x.isdigit())
        except ValueError:
            v = 0
        p['kv'] = v // 1000
        F.append({'type': 'Feature', 'properties': p, 'geometry': geo(LineString(c).simplify(0.00003))})
    write_json('power.geojson', fc(F))
    return len(F)


def rail():
    F = []
    for e in overpass('way(area.a)[railway~"^(rail|light_rail|tram|narrow_gauge|funicular)$"];way(area.a)[aerialway];'):
        c = coords(e)
        if len(c) < 2:
            continue
        p = T(e, 'railway', 'aerialway', 'electrified', 'voltage', 'name', 'usage', 'service', 'ref')
        F.append({'type': 'Feature', 'properties': p, 'geometry': geo(LineString(c).simplify(0.00003))})
    write_json('rail.geojson', fc(F))
    return len(F)


def aero():
    F = []
    for e in overpass('nwr(area.a)[aeroway~"^(aerodrome|heliport|helipad|airstrip|runway)$"];'):
        g = area_geom(e)
        if g is None:
            continue
        p = T(e, 'aeroway', 'name', 'icao', 'iata', 'ref', 'surface', 'operator', 'ele')
        if p['aeroway'] in ('aerodrome', 'heliport', 'helipad', 'airstrip') and g.geom_type != 'Point':
            F.append({'type': 'Feature', 'properties': dict(p, pt=1), 'geometry': geo(g.representative_point())})
            if p['aeroway'] in ('aerodrome', 'airstrip'):
                F.append({'type': 'Feature', 'properties': p, 'geometry': geo(g.simplify(0.00005))})
        else:
            F.append({'type': 'Feature', 'properties': dict(p, pt=1) if g.geom_type == 'Point' else p, 'geometry': geo(g)})
    write_json('aero.geojson', fc(F))
    return len(F)


def points():
    F = []
    els = overpass('node(area.a)[power=generator]["generator:source"=wind];'
                   'node(area.a)[man_made~"^(mast|tower|chimney|communications_tower)$"];')
    for e in els:
        t = e.get('tags', {})
        if t.get('tower:type') in ('lighting', 'diving', 'defensive', 'watchtower', 'flare'):
            continue
        k = 'wind' if t.get('generator:source') == 'wind' else t.get('man_made')
        p = {'k': k}
        for a in ('height', 'name', 'operator', 'tower:type'):
            if a in t:
                p[a.replace(':', '_')] = t[a]
        F.append({'type': 'Feature', 'properties': p, 'geometry': {'type': 'Point', 'coordinates': [round(e['lon'], 5), round(e['lat'], 5)]}})
    write_json('points.geojson', fc(F))
    return len(F)


def sensitive():
    F = []
    for e in overpass('nwr(area.a)[amenity=prison];nwr(area.a)[landuse=military];nwr(area.a)[power=plant];'):
        t = e.get('tags', {})
        k = 'prison' if t.get('amenity') == 'prison' else ('military' if t.get('landuse') == 'military' else ('plant' if t.get('power') == 'plant' else None))
        if not k:
            continue
        g = area_geom(e)
        if g is None or g.geom_type == 'LineString':
            continue
        p = T(e, 'name', 'operator', 'plant_source')
        p['k'] = k
        F.append({'type': 'Feature', 'properties': p, 'geometry': geo(g if g.geom_type == 'Point' else g.simplify(0.00003))})
    write_json('sensitive.geojson', fc(F))
    return len(F)


def protected():
    F = []
    for e in overpass('relation(area.a)[boundary~"^(national_park|protected_area)$"];way(area.a)[boundary~"^(national_park|protected_area)$"];'):
        t = e.get('tags', {})
        if not (t.get('boundary') == 'national_park' or t.get('protect_class', '') in ('1', '1a', '1b', '2', '3', '4', '5')):
            continue
        g = area_geom(e)
        if g is None or g.geom_type in ('Point', 'LineString'):
            continue
        p = T(e, 'name', 'protection_title', 'protect_class', 'boundary', 'operator', 'website')
        F.append({'type': 'Feature', 'properties': p, 'geometry': geo(g.simplify(0.0002))})
    write_json('protected.geojson', fc(F))
    return len(F)


def places():
    import json
    from common import http
    import urllib.parse
    q = ('[out:json][timeout:250];area["ISO3166-1"="HR"][admin_level=2]->.a;'
         '(node(area.a)[place~"^(city|town|village|island|islet|suburb|hamlet)$"][name];node(area.a)[natural=peak][name][ele];);out qt;')
    d = json.loads(http('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': q}).encode(), timeout=300, tries=5))['elements']
    rank = {'city': 0, 'town': 1, 'suburb': 2, 'village': 3, 'island': 2, 'islet': 5, 'hamlet': 6}
    out = []
    for e in d:
        t = e['tags']
        k = 'peak' if t.get('natural') == 'peak' else t['place']
        r = 4 if k == 'peak' else rank[k]
        out.append([t['name'], round(e['lon'], 4), round(e['lat'], 4), 'I' if k == 'island' else k[0], r] + ([t.get('ele', '')] if k == 'peak' else []))
    out.sort(key=lambda x: x[4])
    write_json('places.json', out)
    return len(out)


if __name__ == '__main__':
    errors = []
    for fn in (power, rail, aero, points, sensitive, protected, places):
        try:
            print(fn.__name__, fn(), flush=True)
        except Exception as e:
            errors.append(f'{fn.__name__}: {e}')
            print('FAIL', fn.__name__, e, flush=True)
        time.sleep(10)  # be gentle with Overpass
    if errors:
        raise SystemExit('; '.join(errors))
