import gzip, sys, collections, struct, json, os
from pmtiles.reader import Reader, MmapSource, all_tiles
import mapbox_vector_tile as mvt
DROP={'meadow','scrub','farmland','grassland','grass','bare_rock','allotments'}
f=open(sys.argv[1],'rb'); r=Reader(MmapSource(f))
groups=collections.defaultdict(list)
for (z,x,y),data in all_tiles(r.get_bytes):
    if z>=10:
        t=mvt.decode(gzip.decompress(data), default_options={'y_coord_down':True})
        layers=[]
        for name,l in t.items():
            feats=l['features']
            if name=='landuse':
                feats=[ft for ft in feats if ft['properties'].get('kind') not in DROP]
            if not feats: continue
            layers.append({'name':name,'features':feats})
        raw=mvt.encode(layers, default_options={'y_coord_down':True,'extents':4096})
        data=gzip.compress(raw,9)
    key='base' if z<=7 else (f'a{x>>(z-7)}_{y>>(z-7)}' if z<=9 else f'b{x>>(z-9)}_{y>>(z-9)}')
    groups[key].append((z,x,y,data))
idx={}
for key,tiles in groups.items():
    head=struct.pack('<I',len(tiles)); body=b''; ents=b''
    for z,x,y,d in tiles:
        ents+=struct.pack('<BIIII',z,x,y,len(body),len(d)); body+=d
    blob=head+ents+body
    open(f'site/tiles/{key}.bin','wb').write(blob)
    idx[key]=len(blob)
json.dump(idx,open('site/tiles/index.json','w'))
print(sorted(idx.items(), key=lambda kv:-kv[1])[:5], len(idx), sum(idx.values()))
