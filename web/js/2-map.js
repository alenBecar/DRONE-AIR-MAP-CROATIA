/* ============ map: protocols ============ */
const shardCache=new Map();
function shardKey(z,x,y){ if(z<=7) return 'base'; if(z<=9) return 'a'+(x>>(z-7))+'_'+(y>>(z-7)); return 'b'+(x>>(z-9))+'_'+(y>>(z-9)); }
function loadShard(key){
  if(!shardCache.has(key)) shardCache.set(key, fetch('tiles/'+key+'.wasm').then(r=>{ if(!r.ok) throw new Error('tile '+r.status); return r.arrayBuffer(); }).then(buf=>{
    const dv=new DataView(buf), n=dv.getUint32(0,true), idx=new Map(), base=4+n*17;
    for(let i=0;i<n;i++){ const o=4+i*17; idx.set(dv.getUint8(o)+'/'+dv.getUint32(o+1,true)+'/'+dv.getUint32(o+5,true), [base+dv.getUint32(o+9,true), dv.getUint32(o+13,true)]); }
    return {buf,idx};
  }).catch(e=>{ shardCache.delete(key); throw e; }));
  return shardCache.get(key);
}
async function gunzip(u8){ const ds=new DecompressionStream('gzip'); return await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer(); }
maplibregl.addProtocol('hrt', async (params)=>{
  const [z,x,y]=params.url.replace('hrt://','').split('/').map(Number);
  const key=shardKey(z,x,y); if(S.data.tileIndex && !(key in S.data.tileIndex)) return {data:new ArrayBuffer(0)};
  const sh=await loadShard(key); const e=sh.idx.get(z+'/'+x+'/'+y); if(!e) return {data:new ArrayBuffer(0)};
  return {data: await gunzip(new Uint8Array(sh.buf,e[0],e[1]))};
});
const satCache=new Map(); let satIndex=null;
const EMPTY_PNG=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),c=>c.charCodeAt(0)).buffer;
maplibregl.addProtocol('hrsat', async (params)=>{
  const [z,x,y]=params.url.replace('hrsat://','').split('/').map(Number);
  if(!satIndex) satIndex=await fetch('sat/index.json').then(r=>r.json()).catch(()=>({}));
  const key=z<=9?'sbase':'s'+(x>>(z-9))+'_'+(y>>(z-9)); if(!(key in satIndex)) return {data:EMPTY_PNG.slice(0)};
  if(!satCache.has(key)) satCache.set(key, fetch('sat/'+key+'.wasm').then(r=>{ if(!r.ok) throw new Error('sat '+r.status); return r.arrayBuffer(); }).then(buf=>{
    const dv=new DataView(buf), n=dv.getUint32(0,true), idx=new Map(), base=4+n*17;
    for(let i=0;i<n;i++){ const o=4+i*17; idx.set(dv.getUint8(o)+'/'+dv.getUint32(o+1,true)+'/'+dv.getUint32(o+5,true),[base+dv.getUint32(o+9,true),dv.getUint32(o+13,true)]); }
    return {buf,idx}; }).catch(e=>{ satCache.delete(key); throw e; }));
  const sh=await satCache.get(key); const e=sh.idx.get(z+'/'+x+'/'+y);
  return {data: e? sh.buf.slice(e[0],e[0]+e[1]) : EMPTY_PNG.slice(0)};
});
if(SERVER && window.pmtiles){ const pmp=new pmtiles.Protocol(); maplibregl.addProtocol('pmtiles',pmp.tile); }
maplibregl.addProtocol('hrg', async (params)=>{
  const [stack,range]=params.url.replace('hrg://','').split('/'); const font=decodeURIComponent(stack).split(',')[0].replace(/\s+/g,'');
  if(!['0-255','256-511'].includes(range)) return {data:new ArrayBuffer(0)};
  const r=await fetch('fonts/'+font+'/'+range+'.wasm'); return {data: r.ok? await r.arrayBuffer(): new ArrayBuffer(0)};
});
maplibregl.addProtocol('hrs', async (params)=>{
  const f=params.url.replace('hrs://','').replace(/\/(?=[.@])/,'').replace('@2x','_2x'); const r=await fetch('sprites/'+f);
  if(params.type==='json') return {data: await r.json()}; return {data: await r.arrayBuffer()};
});

/* ============ map: style ============ */
function isDark(){ const t=document.documentElement.getAttribute('data-theme'); if(t) return t==='dark'; return matchMedia('(prefers-color-scheme: dark)').matches; }
function flavorName(){ return S.base==='auto' ? (isDark()?'dark':'light') : S.base==='sat' ? 'dark' : S.base; }
function mapDark(){ return S.base==='sat' || flavorName()==='dark'; }
function hatch(color,id,dense){ const c=document.createElement('canvas'), n=dense?8:12; c.width=c.height=n; const x=c.getContext('2d'); x.strokeStyle=color; x.lineWidth=1.6; x.beginPath(); x.moveTo(-2,n+2); x.lineTo(n+2,-2); x.moveTo(-2,2); x.lineTo(2,-2); x.moveTo(n-2,n+2); x.lineTo(n+2,n-2); x.stroke(); return x.getImageData(0,0,n,n); }
function arrowImg(){ const n=48,c=document.createElement('canvas'); c.width=c.height=n; const x=c.getContext('2d'); x.fillStyle='#fff'; x.beginPath(); x.moveTo(24,4); x.lineTo(36,22); x.lineTo(28,22); x.lineTo(28,44); x.lineTo(20,44); x.lineTo(20,22); x.lineTo(12,22); x.closePath(); x.fill(); return x.getImageData(0,0,n,n); }
function turbineImg(){ const n=40,c=document.createElement('canvas'); c.width=c.height=n; const x=c.getContext('2d'); x.translate(20,17); x.strokeStyle='#0B3D4F'; x.fillStyle='#fff'; x.lineWidth=3;
  x.beginPath(); x.moveTo(0,0); x.lineTo(0,22); x.stroke(); for(let a=0;a<3;a++){ x.save(); x.rotate(a*2.094-1.57); x.beginPath(); x.ellipse(0,-8,3,9,0,0,7); x.fill(); x.stroke(); x.restore(); } x.beginPath(); x.arc(0,0,3,0,7); x.fillStyle='#0B3D4F'; x.fill(); return x.getImageData(0,0,n,n); }

function overlayLayers(){
  const L=[], Tsec=wxTimeMs(S.tIdx)||Date.now(), vis=b=>({visibility:b?'visible':'none'});
  const activeF=['all',['==',['get','act'],1],['<=',['get','fromMs'],Tsec],['>',['get','toMs'],Tsec]];
  const staticF=['all',['!=',['get','act'],1],['in',['get','t'],['literal',['D','TRA','TSA','MTA','R','P']]]];
  const ctrF=['in',['get','t'],['literal',['CTR','ATZ','TMA','RMZ','GLDR','HPGLDR']]];
  const zcol=['match',['get','t'],...Object.entries(ZC).flat(),'#888'];
  // protected & sensitive
  L.push({id:'prot-fill',type:'fill',source:'prot',paint:{'fill-pattern':'hatch-prot','fill-opacity':.55},layout:vis(S.layers.prot)});
  L.push({id:'prot-line',type:'line',source:'prot',paint:{'line-color':'#2E8B57','line-width':1.4,'line-opacity':.8},layout:vis(S.layers.prot)});
  L.push({id:'sens-fill',type:'fill',source:'sens',filter:['!=',['geometry-type'],'Point'],paint:{'fill-pattern':['match',['get','k'],'prison','hatch-prison','military','hatch-mil','hatch-plant']},layout:vis(S.layers.sens)});
  L.push({id:'sens-line',type:'line',source:'sens',filter:['!=',['geometry-type'],'Point'],paint:{'line-color':['match',['get','k'],'prison','#333','military','#7A5A12','#C88A00'],'line-width':1.3},layout:vis(S.layers.sens)});
  // controlled airspace
  L.push({id:'ctr-fill',type:'fill',source:'zones',filter:['in',['get','t'],['literal',['CTR','ATZ']]],paint:{'fill-color':zcol,'fill-opacity':0.045},layout:vis(S.layers.ctr)});
  L.push({id:'ctr-line',type:'line',source:'zones',filter:['==',['get','t'],'CTR'],paint:{'line-color':zcol,'line-width':2.4,'line-dasharray':[4,2]},layout:vis(S.layers.ctr)});
  L.push({id:'atz-line',type:'line',source:'zones',filter:['==',['get','t'],'ATZ'],paint:{'line-color':zcol,'line-width':2.2,'line-dasharray':[2,2]},layout:vis(S.layers.ctr)});
  L.push({id:'oth-line',type:'line',source:'zones',filter:['in',['get','t'],['literal',['TMA','RMZ','GLDR','HPGLDR']]],paint:{'line-color':zcol,'line-width':['match',['get','t'],'TMA',1,1.8],'line-opacity':['match',['get','t'],'TMA',.6,.9]},layout:vis(S.layers.ctr)});
  // static military / restricted
  L.push({id:'st-fill',type:'fill',source:'zones',filter:staticF,paint:{'fill-color':zcol,'fill-opacity':['match',['get','t'],'P',.22,'R',.14,0]},layout:vis(S.layers.zonesStatic)});
  L.push({id:'st-line',type:'line',source:'zones',filter:staticF,paint:{'line-color':zcol,'line-width':['match',['get','t'],'P',2,'R',1.6,1],'line-opacity':['match',['get','t'],'P',1,'R',.9,.4]},layout:vis(S.layers.zonesStatic)});
  // active reservations at selected time
  L.push({id:'act-fill',type:'fill',source:'zones',filter:activeF,paint:{'fill-pattern':['match',['get','t'],'P','hatch-P','R','hatch-R','D','hatch-D','TSA','hatch-TSA','hatch-TRA']},layout:vis(S.layers.zonesActive)});
  L.push({id:'act-line',type:'line',source:'zones',filter:activeF,paint:{'line-color':zcol,'line-width':2.6},layout:vis(S.layers.zonesActive)});
  // power & rail
  L.push({id:'rail-case',type:'line',source:'rail',filter:['has','railway'],minzoom:8,paint:{'line-color':mapDark()?'#C9D1CE':'#2B2F2E','line-width':['interpolate',['linear'],['zoom'],8,2,14,5]},layout:vis(S.layers.rail)});
  L.push({id:'rail-dash',type:'line',source:'rail',filter:['has','railway'],minzoom:8,paint:{'line-color':mapDark()?'#1A1F1D':'#FFFFFF','line-width':['interpolate',['linear'],['zoom'],8,1,14,3],'line-dasharray':[3,3]},layout:vis(S.layers.rail)});
  L.push({id:'rail-low',type:'line',source:'rail',filter:['has','railway'],maxzoom:8,paint:{'line-color':mapDark()?'#C9D1CE':'#2B2F2E','line-width':1,'line-opacity':.7},layout:vis(S.layers.rail)});
  L.push({id:'aerialway',type:'line',source:'rail',filter:['has','aerialway'],paint:{'line-color':'#8E3CC2','line-width':2,'line-dasharray':[2,1]},layout:vis(S.layers.rail)});
  L.push({id:'power-case',type:'line',source:'power',paint:{'line-color':'#3B2A00','line-opacity':.55,'line-width':['interpolate',['linear'],['zoom'],7,['case',['>=',['get','kv'],220],2.6,['>=',['get','kv'],100],1.8,0.8],14,['case',['>=',['get','kv'],220],6,['>=',['get','kv'],100],4.5,3]]},layout:vis(S.layers.power)});
  L.push({id:'power',type:'line',source:'power',paint:{'line-color':['case',['>=',['get','kv'],220],'#FFB000',['>=',['get','kv'],100],'#FFC83D','#F6DD72'],'line-width':['interpolate',['linear'],['zoom'],7,['case',['>=',['get','kv'],220],1.6,['>=',['get','kv'],100],1,0.4],14,['case',['>=',['get','kv'],220],3.6,['>=',['get','kv'],100],2.6,1.6]]},layout:vis(S.layers.power)});
  L.push({id:'power-lbl',type:'symbol',source:'power',minzoom:11,filter:['>',['get','kv'],0],layout:{...vis(S.layers.power),'symbol-placement':'line','text-field':['concat',['to-string',['get','kv']],' kV'],'text-font':['Noto Sans Medium'],'text-size':11,'symbol-spacing':300},paint:{'text-color':'#5A3D00','text-halo-color':'#FFF4CC','text-halo-width':1.5}});
  // aero
  L.push({id:'aero-area',type:'fill',source:'aero',filter:['all',['!=',['geometry-type'],'Point'],['!=',['get','aeroway'],'runway']],paint:{'fill-color':'#B0157A','fill-opacity':.08},layout:vis(S.layers.aero)});
  L.push({id:'runway',type:'line',source:'aero',filter:['==',['get','aeroway'],'runway'],paint:{'line-color':'#B0157A','line-width':['interpolate',['linear'],['zoom'],8,2,14,10]},layout:vis(S.layers.aero)});
  L.push({id:'heli',type:'circle',source:'aero',filter:['all',['==',['get','pt'],1],['in',['get','aeroway'],['literal',['helipad','heliport']]]],minzoom:8,paint:{'circle-radius':['interpolate',['linear'],['zoom'],8,3,14,8],'circle-color':'#fff','circle-stroke-color':'#B0157A','circle-stroke-width':2},layout:vis(S.layers.aero)});
  L.push({id:'heli-h',type:'symbol',source:'aero',filter:['all',['==',['get','pt'],1],['in',['get','aeroway'],['literal',['helipad','heliport']]]],minzoom:11,layout:{...vis(S.layers.aero),'text-field':'H','text-font':['Noto Sans Medium'],'text-size':10,'text-allow-overlap':true},paint:{'text-color':'#B0157A'}});
  L.push({id:'aero-pt',type:'circle',source:'aero',filter:['all',['==',['get','pt'],1],['in',['get','aeroway'],['literal',['aerodrome','airstrip']]]],paint:{'circle-radius':['interpolate',['linear'],['zoom'],6,3.5,12,7],'circle-color':'#B0157A','circle-stroke-color':'#fff','circle-stroke-width':1.5},layout:vis(S.layers.aero)});
  L.push({id:'aero-lbl',type:'symbol',source:'aero',minzoom:8,filter:['all',['==',['get','pt'],1],['in',['get','aeroway'],['literal',['aerodrome','airstrip']]]],layout:{...vis(S.layers.aero),'text-field':['coalesce',['get','icao'],['get','name']],'text-font':['Noto Sans Medium'],'text-size':11,'text-offset':[0,1.1],'text-anchor':'top'},paint:{'text-color':'#B0157A','text-halo-color':mapDark()?'#111':'#fff','text-halo-width':1.5}});
  // obstacles
  L.push({id:'turbine',type:'symbol',source:'pts',filter:['==',['get','k'],'wind'],minzoom:8,layout:{...vis(S.layers.obst),'icon-image':'turbine','icon-size':['interpolate',['linear'],['zoom'],8,.35,14,.8],'icon-allow-overlap':true},paint:{}});
  L.push({id:'mast',type:'circle',source:'pts',filter:['in',['get','k'],['literal',['mast','tower','communications_tower','chimney']]],minzoom:9,paint:{'circle-radius':['interpolate',['linear'],['zoom'],9,2,14,5],'circle-color':'#E03C31','circle-stroke-color':'#fff','circle-stroke-width':1},layout:vis(S.layers.obst)});
  L.push({id:'mast-lbl',type:'symbol',source:'pts',filter:['all',['has','height'],['!=',['get','k'],'pylon']],minzoom:12,layout:{...vis(S.layers.obst),'text-field':['concat',['get','height'],' m'],'text-font':['Noto Sans Regular'],'text-size':10,'text-offset':[0,1],'text-anchor':'top'},paint:{'text-color':'#B3261E','text-halo-color':mapDark()?'#111':'#fff','text-halo-width':1.2}});
  // zone labels
  L.push({id:'zone-lbl',type:'symbol',source:'zones',minzoom:8,filter:['any',['all',ctrF,['!=',['get','t'],'TMA']],['in',['get','t'],['literal',['P','R']]],activeF],layout:{'symbol-placement':'line','text-field':['concat',['get','n'],' ',['get','t']],'text-font':['Noto Sans Medium'],'text-size':11,'symbol-spacing':400},paint:{'text-color':zcol,'text-halo-color':mapDark()?'#111':'#fff','text-halo-width':1.6}});
  // wind
  L.push({id:'wind',type:'symbol',source:'wind',layout:{visibility:S.layers.wind?'visible':'none','icon-image':'arrow','icon-size':['interpolate',['linear'],['zoom'],5,.32,9,.6],'icon-rotate':['get','rot'],'icon-rotation-alignment':'map','icon-allow-overlap':true,'text-field':['to-string',['get','s']],'text-font':['Noto Sans Medium'],'text-size':10,'text-offset':[0,1.4],'text-allow-overlap':true},paint:{'icon-color':['interpolate',['linear'],['get','s'],0,'#3FA36B',6,'#E8B21E',10,'#E46B22',14,'#C21F1F'],'text-color':mapDark()?'#eee':'#222','text-halo-color':mapDark()?'#000':'#fff','text-halo-width':1.2}});
  // selection radius
  const notamF=['all',['<=',['get','fromMs'],Tsec],['>',['get','toMs'],Tsec]];
  L.push({id:'notam-fill',type:'fill',source:'notams',filter:notamF,paint:{'fill-color':'#E8590C','fill-opacity':.08},layout:vis(S.layers.notam)});
  L.push({id:'notam-line',type:'line',source:'notams',filter:notamF,paint:{'line-color':'#E8590C','line-width':1.6,'line-dasharray':[3,2]},layout:vis(S.layers.notam)});
  L.push({id:'notam-lbl',type:'symbol',source:'notams',filter:notamF,minzoom:8,layout:{...vis(S.layers.notam),'symbol-placement':'line','text-field':['concat','NOTAM ',['get','n']],'text-font':['Noto Sans Medium'],'text-size':10.5,'symbol-spacing':500},paint:{'text-color':'#C2410C','text-halo-color':mapDark()?'#111':'#fff','text-halo-width':1.5}});
  L.push({id:'sel-ring',type:'line',source:'sel',paint:{'line-color':'#A3166F','line-width':1.5,'line-dasharray':[2,2]}});
  return L;
}
function windFC(){
  const g=S.data.wx, F=[]; if(!g) return {type:'FeatureCollection',features:F};
  const nl=g.lons.length, alt=S.layers.windAlt==='120', vs=alt?WV.ws120:WV.ws10, vd=alt?WV.wd120:WV.wd10;
  g.lats.forEach((la,i)=>g.lons.forEach((lo,j)=>{ const d=g.data[i*nl+j]; const s=d[vs][S.tIdx], dir=d[vd][S.tIdx]; if(s==null) return;
    F.push({type:'Feature',properties:{s:Math.round(s),rot:(dir+180)%360},geometry:{type:'Point',coordinates:[lo,la]}}); }));
  return {type:'FeatureCollection',features:F};
}
function ringFC(){ if(!S.sel) return {type:'FeatureCollection',features:[]}; const [lo,la]=S.sel, F=[];
  for(const r of [500]){ const c=[]; for(let a=0;a<=64;a++){ const t=a/64*2*Math.PI; c.push([lo+Math.sin(t)*r/(111320*Math.cos(la*D2R)), la+Math.cos(t)*r/110540]); } F.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c}}); }
  return {type:'FeatureCollection',features:F}; }
const EMPTY={type:'FeatureCollection',features:[]};
function buildStyle(){
  const fl=basemaps.namedFlavor(flavorName());
  let base=basemaps.layers('pm',fl,{lang:'hr'});
  if(S.base==='sat'){ // hybrid: dark earth/water under the imagery (outside coverage), then roads + labels on top
    const under=base.filter(l=>['background','earth','water'].includes(l.id));
    const keep=base.filter(l=>l.type==='symbol' || /^roads_(highway|major|link|minor$|minor_casing|highway_casing|major_casing|rail)/.test(l.id) || /^boundaries/.test(l.id));
    keep.forEach(l=>{ if(l.type==='line'){ l.paint={...l.paint,'line-opacity':/casing/.test(l.id)?0.25:0.55}; } });
    base=under.concat([{id:'sat',type:'raster',source:'sat',paint:{'raster-fade-duration':150,'raster-saturation':-0.05,'raster-contrast':0.05}}],keep);
  }
  const D=S.data;
  return {version:8, glyphs:'hrg://{fontstack}/{range}', sprite:'hrs://'+(flavorName()==='dark'||flavorName()==='black'?'dark':'light'),
    sources:{ pm:{type:'vector',...(SERVER?{url:'pmtiles://'+new URL('data/hr.pmtiles',location.href).href}:{tiles:['hrt://{z}/{x}/{y}'],maxzoom:11}),attribution:'<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> · Protomaps · AMC CroControl · open flightmaps · Open-Meteo'},
      sat:{type:'raster',tiles:[SERVER?new URL('sat/',location.href).href+'{z}/{y}/{x}.jpg':'hrsat://{z}/{x}/{y}'],tileSize:256,minzoom:SERVER?0:5,maxzoom:SERVER?15:13,attribution:'Sentinel-2 cloudless 2024 by <a href="https://s2maps.eu">EOX</a> (Copernicus Sentinel data 2024)'},
      zones:{type:'geojson',data:D.zones||EMPTY}, notams:{type:'geojson',data:D.notams||EMPTY}, power:{type:'geojson',data:D.power||EMPTY}, rail:{type:'geojson',data:D.rail||EMPTY}, aero:{type:'geojson',data:D.aero||EMPTY},
      pts:{type:'geojson',data:D.points||EMPTY}, sens:{type:'geojson',data:D.sens||EMPTY}, prot:{type:'geojson',data:D.prot||EMPTY}, wind:{type:'geojson',data:windFC()}, sel:{type:'geojson',data:ringFC()} },
    layers: base.concat(overlayLayers())};
}

/* ============ map init ============ */
const map=new maplibregl.Map({container:'map',style:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':isDark()?'#0E1412':'#E8EEEB'}}]},center:window.innerWidth<760?[16.4,43.6]:[16.3,44.75],zoom:window.innerWidth<760?5.5:6.6,minZoom:5,maxZoom:16.5,maxBounds:[[11.2,41.2],[21.4,47.6]],attributionControl:{compact:true},dragRotate:false,pitchWithRotate:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-left');
map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
map.touchZoomRotate.disableRotation();
map.on('error',e=>{ const er=e&&e.error; if(er&&(er.name==='AbortError'||/abort/i.test(er.message||''))) return; console.warn('map:',er&&er.message||er); });
map.on('styleimagemissing',e=>{
  const id=e.id; if(map.hasImage(id)) return;
  const H={'hatch-prot':['#2E8B57'],'hatch-prison':['#333333',1],'hatch-mil':['#8A6414',1],'hatch-plant':['#D99A00'],'hatch-P':[ZC.P,1],'hatch-R':[ZC.R,1],'hatch-D':[ZC.D,1],'hatch-TRA':[ZC.TRA,1],'hatch-TSA':[ZC.TSA,1]};
  if(H[id]) map.addImage(id,hatch(H[id][0],id,H[id][1]));
  else if(id==='arrow') map.addImage(id,arrowImg(),{sdf:true,pixelRatio:1});
  else if(id==='turbine') map.addImage(id,turbineImg(),{pixelRatio:2});
});
let marker=null;
function restyle(){ map.setStyle(buildStyle(),{diff:false}); }
function refreshDynamic(){
  if(!map.getSource('wind')) return;
  map.getSource('wind').setData(windFC());
  const T=wxTimeMs(S.tIdx), f=['all',['==',['get','act'],1],['<=',['get','fromMs'],T],['>',['get','toMs'],T]];
  map.setFilter('act-fill',f); map.setFilter('act-line',f);
  const nf=['all',['<=',['get','fromMs'],T],['>',['get','toMs'],T]]; ['notam-fill','notam-line','notam-lbl'].forEach(id=>map.getLayer(id)&&map.setFilter(id,nf));
  const ctrF=['in',['get','t'],['literal',['CTR','ATZ','TMA','RMZ','GLDR','HPGLDR']]];
  map.setFilter('zone-lbl',['any',['all',ctrF,['!=',['get','t'],'TMA']],['in',['get','t'],['literal',['P','R']]],f]);
}
new MutationObserver(()=>{ if(S.base==='auto') restyle(); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{ if(S.base==='auto') restyle(); });

/* ============ data load ============ */
async function J(u){ const r=await fetch(u); if(!r.ok) throw new Error(u+' '+r.status); return r.json(); }
const bust=()=>SERVER?'?t='+Math.floor(Date.now()/60000):'';
async function loadAll(first){
  const names=['data/zones.geojson','data/power.geojson','data/rail.geojson','data/aero.geojson','data/points.geojson','data/sensitive.geojson','data/protected.geojson',SERVER?'data/wx.json':'wx.json','data/kp.json','data/notams.geojson',SERVER?'data/status.json':'tiles/index.json'];
  const live=new Set(['data/zones.geojson','data/wx.json','wx.json','data/kp.json','data/notams.geojson','data/status.json']);
  const want=first?names:names.filter(n=>live.has(n));
  const got=await Promise.all(want.map(u=>J(u+(live.has(u)?bust():'')).catch(e=>{ if(first) console.warn(e); return null; })));
  const R={}; want.forEach((n,i)=>R[n]=got[i]);
  const D=S.data, has=n=>n in R && R[n];
  if(has('data/zones.geojson')){ const z=R['data/zones.geojson']; for(const f of z.features){ const p=f.properties; if(p.act){ p.fromMs=parseUTC(p.from); p.toMs=parseUTC(p.to); } } D.zones=prep(z); }
  if(has('data/notams.geojson')){ const n=R['data/notams.geojson']; for(const f of n.features){ const p=f.properties; p.fromMs=parseUTC(p.from); p.toMs=parseUTC(p.to)||Infinity; } D.notams=prep(n); }
  const wx=R[SERVER?'data/wx.json':'wx.json']; if(wx) D.wx=wx;
  if(has('data/kp.json')) D.kp=R['data/kp.json'];
  if(SERVER){ if(has('data/status.json')) D.status=R['data/status.json']; } else D.tileIndex=R['tiles/index.json']||null;
  if(first){ [['power','data/power.geojson'],['rail','data/rail.geojson'],['aero','data/aero.geojson'],['points','data/points.geojson'],['sens','data/sensitive.geojson'],['prot','data/protected.geojson']].forEach(([k,n])=>{ if(R[n]) D[k]=prep(R[n]); }); }
  if(D.wx && (first || S.followNow)){ S.tIdx=Math.max(0,Math.min(D.wx.n-1,Math.round((Date.now()/1000-D.wx.t0)/3600))); }
  if(D.wx) $('#trange').max=D.wx.n-1;
}
(async function load(){
  try{ await loadAll(true); }catch(e){ console.error(e); }
  S.followNow=true;
  $('#loading').hidden=true;
  setupTime(); restyle(); renderLayers();
  if(!S.sel) renderHint();
  if(SERVER) setInterval(async()=>{ try{ await loadAll(false); setupTime(); for(const [k,v] of [['zones',S.data.zones],['notams',S.data.notams]]) map.getSource(k)?.setData(v||EMPTY); refreshDynamic(); renderLayers(); if(S.sel) analyze(S.sel,false); else renderHint(); }catch(e){ console.warn(e); } }, 10*60e3);
})();

/* ============ time bar ============ */
function setupTime(){
  const g=S.data.wx; if(!g){ $('#timebar').hidden=true; return; }
  const r=$('#trange'); r.value=S.tIdx; const ticks=$('#ticks'); ticks.innerHTML='';
  for(let i=0;i<g.n;i++){ const d=new Date(wxTimeMs(i)); if(d.getHours()===0||i===0){ const s=document.createElement('span'); s.style.left=(i/(g.n-1)*100)+'%'; s.textContent=i===0&&d.getHours()!==0?'':DAYS[d.getDay()]+' '+d.getDate()+'.'; if(s.textContent) ticks.appendChild(s); } }
  updWhen();
}
function updWhen(){ const ms=wxTimeMs(S.tIdx); const nowIdx=Math.round((Date.now()/1000-S.data.wx.t0)/3600); $('#when').textContent=(S.tIdx===nowIdx?'sada · ':'')+fmtTime(ms); }
$('#trange').addEventListener('input',e=>{ S.tIdx=+e.target.value; S.followNow=false; updWhen(); refreshDynamic(); if(S.sel) analyze(S.sel,false); });
$('#btnNow').addEventListener('click',()=>{ const g=S.data.wx; if(!g) return; S.followNow=true; S.tIdx=Math.max(0,Math.min(g.n-1,Math.round((Date.now()/1000-g.t0)/3600))); $('#trange').value=S.tIdx; updWhen(); refreshDynamic(); if(S.sel) analyze(S.sel,false); });

/* ============ layers panel ============ */
const LYR=[
  ['Zračni prostor',[
    ['zonesActive','Aktivne rezervacije (AMC)','repeating-linear-gradient(45deg,#7B4FB8 0 2px,transparent 2px 5px)','u odabrano vrijeme'],
    ['zonesStatic','P / R / D / TRA / TSA zone','linear-gradient(90deg,#D7263D,#F08A24,#7B4FB8)',''],
    ['ctr','CTR, ATZ, TMA, RMZ','#B0157A',''],
    ['aero','Aerodromi i helidromi','#B0157A',''],
    ['notam','NOTAM-i (upozorenja, dronovi, prepreke)','repeating-linear-gradient(90deg,#E8590C 0 6px,transparent 6px 9px)','AMC'] ]],
  ['Prepreke na tlu',[
    ['power','Dalekovodi','#FFB000','kV'],
    ['rail','Pruge, tramvaji, žičare','repeating-linear-gradient(90deg,#2B2F2E 0 5px,#fff 5px 9px)',''],
    ['obst','Vjetroelektrane, antene, dimnjaci','#E03C31',''] ]],
  ['Osjetljiva područja',[
    ['sens','Vojska, zatvori, elektrane','repeating-linear-gradient(45deg,#8A6414 0 2px,transparent 2px 5px)',''],
    ['prot','Nacionalni parkovi i parkovi prirode','repeating-linear-gradient(45deg,#2E8B57 0 2px,transparent 2px 6px)',''] ]],
  ['Vrijeme',[ ['wind','Strelice vjetra','linear-gradient(90deg,#3FA36B,#E8B21E,#E46B22,#C21F1F)','m/s'] ]]
];
function renderLayers(){
  let h='';
  for(const [title,rows] of LYR){ h+=`<h3>${title}</h3>`; for(const [k,label,sw,sm] of rows) h+=`<label class="lyr"><input type="checkbox" id="ly-${k}" data-k="${k}" ${S.layers[k]?'checked':''}><span><span class="sw" style="background:${sw}"></span>&nbsp; ${label}</span><small>${sm}</small></label>`; }
  h+=`<div class="seg" style="margin:4px 0 6px" role="group" aria-label="Visina vjetra">${['10','120'].map(a=>`<button data-wa="${a}" aria-pressed="${S.layers.windAlt===a}">Vjetar na ${a} m</button>`).join('')}</div>`;
  h+=`<h3>Podloga</h3><div class="seg" role="group" aria-label="Podloga karte">${[['auto','Auto'],['light','Karta'],['sat','Satelit'],['grayscale','Siva'],['dark','Tamna']].map(([k,l])=>`<button data-base="${k}" aria-pressed="${S.base===k}">${l}</button>`).join('')}</div>`;
  const m=S.data.zones?.meta, w=S.data.wx;
  h+=`<p class="note">Zone: AMC CroControl (${esc(fmtMeta(m?.amc_fetched))}, rezervacije do ${esc((m?.amc_window?.[1]||'').slice(0,10))}) i open flightmaps AIRAC ${esc(m?.ofm_airac||'')}. Prepreke: OpenStreetMap. Prognoza: Open-Meteo, ${w?fmtTime(Date.parse(w.fetched)):'–'}. Satelit: Sentinel-2 cloudless 2024 (EOX, 10 m).${SERVER&&S.data.status?' Podaci se osvježavaju automatski.':''}</p>`;
  $('#layers').innerHTML=h;
}
$('#layers').addEventListener('change',e=>{ const k=e.target.dataset.k; if(!k) return; S.layers[k]=e.target.checked; persist(); restyle(); });
$('#layers').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; if(b.dataset.base){ if(b.dataset.base==='sat'&&S.base!=='sat') S.prevBase=S.base; S.base=b.dataset.base; syncSatBtn(); } if(b.dataset.wa){ S.layers.windAlt=b.dataset.wa; S.layers.wind=true; } persist(); renderLayers(); restyle(); });
function syncSatBtn(){ $('#btnSat').setAttribute('aria-pressed',String(S.base==='sat')); }
$('#btnSat').addEventListener('click',()=>{ if(S.base==='sat'){ S.base=S.prevBase||'auto'; } else { S.prevBase=S.base; S.base='sat'; } persist(); syncSatBtn(); renderLayers(); restyle(); });
syncSatBtn();
$('#btnLayers').addEventListener('click',()=>{ const L=$('#layers'); L.hidden=!L.hidden; $('#btnLayers').setAttribute('aria-pressed',String(!L.hidden)); });

/* ============ search ============ */
let PLACES=null;
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
async function ensurePlaces(){ if(!PLACES){ try{ PLACES=(await J('data/places.json')).map(p=>[...p,norm(p[0])]); }catch(e){ PLACES=[]; } } return PLACES; }
const KIND={c:'grad',t:'grad',s:'kvart',v:'selo',h:'zaselak',p:'vrh',i:'otočić',I:'otok',n:'park',a:'aerodrom'};
let EXTRA=null;
function extras(){ // national/nature parks and aerodromes, searchable once the layers are loaded
  if(EXTRA) return EXTRA; const D=S.data; if(!D.prot||!D.aero) return [];
  const out=[];
  for(const f of D.prot.features){ const n=f.properties.name; if(!n) continue; const b=f._b; out.push([n,(b[0]+b[2])/2,(b[1]+b[3])/2,'n',0]); }
  for(const f of D.aero.features){ const q=f.properties; if(q.pt!==1||!['aerodrome','airstrip','heliport'].includes(q.aeroway)) continue; const n=(q.name||'')+(q.icao?' ('+q.icao+')':''); if(!n.trim()) continue; const c=f.geometry.coordinates; out.push([n,c[0],c[1],'a',1]); }
  EXTRA=out.map(p=>[...p,norm(p[0])]); return EXTRA; }
let resIdx=-1, resList=[];
$('#q').addEventListener('focus',ensurePlaces);
$('#q').addEventListener('input',async e=>{
  const q=e.target.value.trim(); const box=$('#res'); resIdx=-1;
  const m=q.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if(m){ let a=+m[1].replace(',','.'), b=+m[2].replace(',','.'); if(a<b){ [a,b]=[b,a]; } resList=[[`${a.toFixed(5)}, ${b.toFixed(5)}`,b,a,'k']]; }
  else if(q.length<2){ box.hidden=true; return; }
  else { const P=await ensurePlaces(), n=norm(q); const st=[],co=[]; for(const p of extras().concat(P)){ const x=p[p.length-1]; if(x.startsWith(n)||x.includes(' '+n)) st.push(p); else if(x.includes(n)) co.push(p); if(st.length>40) break; }
    const byR=(a,b)=>a[4]-b[4]; resList=st.sort(byR).concat(co.sort(byR)).slice(0,8); }
  box.innerHTML=resList.length?resList.map((p,i)=>`<button data-i="${i}"><span>${esc(p[0])}</span><small>${p[3]==='k'?'koordinate':(KIND[p[3]]||'')}${p[3]==='p'&&p[5]?' · '+esc(p[5])+' m':''}</small></button>`).join(''):'<button disabled><span>Nema rezultata</span></button>';
  box.hidden=false;
});
const p_rank=4;
$('#q').addEventListener('keydown',e=>{ const box=$('#res'); if(box.hidden) return; const bs=[...box.querySelectorAll('button[data-i]')];
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); resIdx=(resIdx+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length; bs.forEach((b,i)=>b.classList.toggle('on',i===resIdx)); }
  else if(e.key==='Enter'){ e.preventDefault(); pick(resIdx<0?0:resIdx); } else if(e.key==='Escape'){ box.hidden=true; } });
$('#res').addEventListener('click',e=>{ const b=e.target.closest('button[data-i]'); if(b) pick(+b.dataset.i); });
function pick(i){ const p=resList[i]; if(!p) return; $('#res').hidden=true; $('#q').value=p[3]==='k'?p[0]:p[0]; $('#q').blur();
  const ll=[p[1],p[2]]; map.flyTo({center:ll,zoom:Math.max(map.getZoom(),p[3]==='n'?10.5:p[3]==='c'?11.5:13),padding:panelPad(),speed:1.6}); analyze(ll,true); }
document.addEventListener('click',e=>{ if(!e.target.closest('.search')) $('#res').hidden=true; });

