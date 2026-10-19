/* ============ constants ============ */
const ZC = { // airspace colours (chart convention), same in both themes
  P:'#D7263D', R:'#E4572E', D:'#F08A24', TRA:'#7B4FB8', TSA:'#4F6FD8', MTA:'#8A6D3B',
  CTR:'#B0157A', ATZ:'#C2185B', TMA:'#2D6CDF', RMZ:'#1F9E89', GLDR:'#0F8B8D', HPGLDR:'#0F8B8D'
};
const ZNAME = {P:'Zabranjena zona (P)',R:'Ograničena zona (R)',D:'Opasna zona (D)',TRA:'Privremeno rezervirano (TRA)',TSA:'Privremeno izdvojeno (TSA)',MTA:'Vojno vježbovno (MTA)',
  CTR:'Kontrolirana zona aerodroma (CTR)',ATZ:'Aerodromska prometna zona (ATZ)',TMA:'Završna kontrolirana oblast (TMA)',RMZ:'Zona obvezne radioveze (RMZ)',GLDR:'Područje jedriličarstva',HPGLDR:'Područje zmajarstva / paraglajdinga'};
const DRONES = {
  c0:{name:'Mini do 250 g (C0)', wind:8, sub:'A1', note:'Smiješ preletjeti pojedince, ali nikad okupljanje ljudi.'},
  c1:{name:'C1 do 900 g (npr. Air)', wind:10, sub:'A1', note:'Ne leti namjerno iznad ljudi; nikad iznad okupljanja.'},
  c2:{name:'C2 do 4 kg', wind:12, sub:'A2', note:'Potreban A2 certifikat. 30 m od ljudi (5 m u sporom modu).'},
  c3:{name:'Teži / bez oznake (A3)', wind:12, sub:'A3', note:'Samo daleko od ljudi: 150 m od stambenih, industrijskih i rekreacijskih područja.'}
};
const WMO = {0:'vedro',1:'pretežno vedro',2:'djelomično oblačno',3:'oblačno',45:'magla',48:'magla s injem',51:'slaba rosulja',53:'rosulja',55:'jaka rosulja',56:'ledena rosulja',57:'ledena rosulja',61:'slaba kiša',63:'kiša',65:'jaka kiša',66:'ledena kiša',67:'ledena kiša',71:'slab snijeg',73:'snijeg',75:'jak snijeg',77:'zrnati snijeg',80:'pljuskovi',81:'pljuskovi',82:'jaki pljuskovi',85:'snježni pljuskovi',86:'snježni pljuskovi',95:'grmljavina',96:'grmljavina s tučom',99:'grmljavina s tučom'};
const DAYS = ['ned','pon','uto','sri','čet','pet','sub'];
const SEV = {stop:3, warn:2, info:1, go:0};

/* ============ state ============ */
const SERVER=!!window.__SERVER__;
const S = {
  data:{}, tIdx:0, sel:null, height:120, drone:'c1', base:'auto',
  layers:{zonesActive:true, zonesStatic:true, ctr:true, power:true, rail:true, obst:true, aero:true, sens:true, prot:true, notam:true, wind:false, windAlt:'10'},
};
try{ const saved=JSON.parse(localStorage.getItem('letimtu')||'{}'); if(saved.layers) Object.assign(S.layers,saved.layers); if(saved.drone) S.drone=saved.drone; if(saved.height) S.height=saved.height; if(saved.base) S.base=saved.base; }catch(e){}
function persist(){ try{ localStorage.setItem('letimtu',JSON.stringify({layers:S.layers,drone:S.drone,height:S.height,base:S.base})); }catch(e){} }

/* ============ helpers ============ */
const $ = s=>document.querySelector(s);
const esc = s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const R2D=180/Math.PI, D2R=Math.PI/180;
function distM(a,b){ const x=(b[0]-a[0])*Math.cos((a[1]+b[1])/2*D2R)*111320, y=(b[1]-a[1])*110540; return Math.hypot(x,y); }
function bearing(a,b){ const x=(b[0]-a[0])*Math.cos((a[1]+b[1])/2*D2R), y=b[1]-a[1]; return (Math.atan2(x,y)*R2D+360)%360; }
const COMP=['S','SSI','SI','ISI','I','IJI','JI','JJI','J','JJZ','JZ','ZJZ','Z','ZSZ','SZ','SSZ'];
const compass = d=>COMP[Math.round(d/22.5)%16];
const fmtD = m=>m<1000?Math.round(m)+' m':(m/1000).toFixed(m<10000?1:0).replace('.',',')+' km';
function segDist(p,a,b,kx){ // meters, local equirectangular
  const ax=(a[0]-p[0])*kx, ay=(a[1]-p[1])*110540, bx=(b[0]-p[0])*kx, by=(b[1]-p[1])*110540;
  const dx=bx-ax, dy=by-ay, l=dx*dx+dy*dy; let t=l?-(ax*dx+ay*dy)/l:0; t=Math.max(0,Math.min(1,t));
  return Math.hypot(ax+t*dx, ay+t*dy);
}
function bboxOf(g){ let b=[180,90,-180,-90]; (function w(c){ if(typeof c[0]==='number'){ if(c[0]<b[0])b[0]=c[0]; if(c[1]<b[1])b[1]=c[1]; if(c[0]>b[2])b[2]=c[0]; if(c[1]>b[3])b[3]=c[1]; } else c.forEach(w); })(g.coordinates); return b; }
function inRing(p,r){ let ins=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1]; if(((yi>p[1])!==(yj>p[1]))&&(p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)) ins=!ins; } return ins; }
function inPoly(p,g){ const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]; return polys.some(pl=>inRing(p,pl[0])&&!pl.slice(1).some(h=>inRing(p,h))); }
function geomDist(p,g,b){ // distance from point to any geometry (0 if inside polygon)
  const kx=Math.cos(p[1]*D2R)*111320;
  if(g.type==='Point') return distM(p,g.coordinates);
  if((g.type==='Polygon'||g.type==='MultiPolygon') && inPoly(p,g)) return 0;
  let best=Infinity;
  (function w(c){ if(typeof c[0][0]==='number'){ for(let i=1;i<c.length;i++){ const d=segDist(p,c[i-1],c[i],kx); if(d<best)best=d; } if(c.length===1){const d=distM(p,c[0]); if(d<best)best=d;} } else c.forEach(w); })(g.coordinates);
  return best;
}
function near(fc,p,maxM,pred){ // features within maxM, sorted
  const dLat=maxM/110540, dLon=maxM/(Math.cos(p[1]*D2R)*111320), out=[];
  for(const f of fc.features){ if(pred&&!pred(f.properties)) continue; const b=f._b; if(p[0]<b[0]-dLon||p[0]>b[2]+dLon||p[1]<b[1]-dLat||p[1]>b[3]+dLat) continue;
    const d=geomDist(p,f.geometry); if(d<=maxM) out.push({f,d}); }
  return out.sort((a,b)=>a.d-b.d);
}
function prep(fc){ for(const f of fc.features) f._b=bboxOf(f.geometry); return fc; }
const pad2=n=>String(n).padStart(2,'0');
function fmtTime(ms,withDay=true){ const d=new Date(ms); return (withDay?DAYS[d.getDay()]+' '+d.getDate()+'.'+(d.getMonth()+1)+'. ':'')+pad2(d.getHours())+':'+pad2(d.getMinutes()); }
const fmtMeta=s=>{ if(!s) return '?'; const t=Date.parse(s); return isNaN(t)||String(s).length<=10?String(s):fmtTime(t); };
const parseUTC = s=>s?Date.parse(String(s).replace(' ','T').replace(/Z?$/,'Z')):NaN;

/* ============ sun ============ */
function sunTimes(ms,lat,lon){ // NOAA approximation; returns ms for sunrise, sunset, civil dawn, dusk
  const d=new Date(ms); const J0=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),12)/864e5+2440587.5;
  const n=Math.round(J0-2451545.0009+lon/360); const Js=2451545.0009-lon/360+n;
  const M=(357.5291+0.98560028*(Js-2451545))%360, C=1.9148*Math.sin(M*D2R)+0.02*Math.sin(2*M*D2R)+0.0003*Math.sin(3*M*D2R);
  const L=(M+C+180+102.9372)%360, Jt=Js+0.0053*Math.sin(M*D2R)-0.0069*Math.sin(2*L*D2R);
  const dec=Math.asin(Math.sin(L*D2R)*Math.sin(23.44*D2R));
  const at=h=>{ const w=Math.acos((Math.sin(h*D2R)-Math.sin(lat*D2R)*Math.sin(dec))/(Math.cos(lat*D2R)*Math.cos(dec))); const W=w*R2D/360; return [(Jt-W-2440587.5)*864e5,(Jt+W-2440587.5)*864e5]; };
  const [rise,set]=at(-0.833), [dawn,dusk]=at(-6); return {rise,set,dawn,dusk};
}

/* ============ weather grid ============ */
const WV = {t:0,rh:1,pp:2,pr:3,wc:4,cc:5,ccl:6,vis:7,ws10:8,wd10:9,gust:10,ws80:11,ws120:12,wd120:13};
function wxTimeMs(i){ return S.data.wx?(S.data.wx.t0+i*3600)*1000:Date.now(); }
function wxAt(lon,lat,h){
  const g=S.data.wx; if(!g) return null; const nl=g.lons.length;
  const fi=(lat-g.lats[0])/(g.lats[1]-g.lats[0]), fj=(lon-g.lons[0])/(g.lons[1]-g.lons[0]);
  const i0=Math.max(0,Math.min(g.lats.length-2,Math.floor(fi))), j0=Math.max(0,Math.min(nl-2,Math.floor(fj)));
  const ti=Math.max(0,Math.min(1,fi-i0)), tj=Math.max(0,Math.min(1,fj-j0));
  const P=[[i0,j0,(1-ti)*(1-tj)],[i0,j0+1,(1-ti)*tj],[i0+1,j0,ti*(1-tj)],[i0+1,j0+1,ti*tj]];
  const val=(v)=>{ let s=0,w=0; for(const [i,j,wt] of P){ const x=g.data[i*nl+j][v][h]; if(x!=null){s+=x*wt;w+=wt;} } return w?s/w:null; };
  const nearest=P.slice().sort((a,b)=>b[2]-a[2])[0]; const nd=g.data[nearest[0]*nl+nearest[1]];
  const ang=(v)=>{ let sx=0,sy=0; for(const [i,j,wt] of P){ const x=g.data[i*nl+j][v][h]; if(x!=null){sx+=Math.sin(x*D2R)*wt; sy+=Math.cos(x*D2R)*wt;} } return (Math.atan2(sx,sy)*R2D+360)%360; };
  let es=0,ew=0; for(const [i,j,wt] of P){ const e=g.elev[i*nl+j]; if(e!=null){es+=e*wt;ew+=wt;} }
  return { t:val(WV.t), rh:val(WV.rh), pp:val(WV.pp), pr:val(WV.pr), wc:nd[WV.wc][h], cc:val(WV.cc), ccl:val(WV.ccl), vis:val(WV.vis),
    ws10:val(WV.ws10), wd10:ang(WV.wd10), gust:val(WV.gust), ws80:val(WV.ws80), ws120:val(WV.ws120), wd120:ang(WV.wd120), elev:ew?es/ew:null };
}
function kpAt(ms){ const k=S.data.kp; if(!k) return null; let best=null; for(const [t,v,o] of k){ const s=Date.parse(t+'Z'); if(s<=ms && ms<s+3*3600e3) best={kp:v,obs:o}; } return best; }

