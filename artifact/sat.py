import json, urllib.request, io, os, sys, time, struct, collections
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
D='/workspace/letim-tu/sat'; os.makedirs(D+'/raw',exist_ok=True)
L=json.load(open(D+'/tilelist.json'))
jobs=[(int(z),x,y) for z,v in L.items() for x,y in v]
def get(j):
    z,x,y=j; f=f'{D}/raw/{z}_{x}_{y}.webp'
    if os.path.exists(f): return 1
    u=f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'
    for a in range(5):
        try:
            b=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'letim-tu/1.0 (personal drone map)'}),timeout=60).read()
            im=Image.open(io.BytesIO(b)).convert('RGB'); out=io.BytesIO(); im.save(out,'WEBP',quality=68,method=5)
            open(f,'wb').write(out.getvalue()); return 1
        except Exception as e:
            if '404' in str(e): return 0
            time.sleep(2+a*3)
    return 0
with ThreadPoolExecutor(6) as ex: r=list(ex.map(get,jobs))
print('ok',sum(r),'of',len(jobs))
groups=collections.defaultdict(list)
for z,x,y in jobs:
    f=f'{D}/raw/{z}_{x}_{y}.webp'
    if not os.path.exists(f): continue
    key='sbase' if z<=9 else f's{x>>(z-9)}_{y>>(z-9)}'
    groups[key].append((z,x,y,open(f,'rb').read()))
os.makedirs('/workspace/letim-tu/site/sat',exist_ok=True); idx={}
for key,tiles in groups.items():
    head=struct.pack('<I',len(tiles)); ents=b''; body=b''
    for z,x,y,d in tiles: ents+=struct.pack('<BIIII',z,x,y,len(body),len(d)); body+=d
    blob=head+ents+body; open(f'/workspace/letim-tu/site/sat/{key}.wasm','wb').write(blob); idx[key]=len(blob)
json.dump(idx,open('/workspace/letim-tu/site/sat/index.json','w'))
print(len(idx),'shards',sum(idx.values())/1e6,'MB', max(idx.values())/1e6)
