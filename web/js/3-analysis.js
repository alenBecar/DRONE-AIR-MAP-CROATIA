/* ============ analysis ============ */
function panelPad(){ return window.innerWidth<760?{bottom:Math.round(window.innerHeight*.5),top:60,left:0,right:0}:{right:430,top:60,left:0,bottom:0}; }
map.on('click',e=>{ if($('#layers').hidden===false){ $('#layers').hidden=true; $('#btnLayers').setAttribute('aria-pressed','false'); } analyze([e.lngLat.lng,e.lngLat.lat],true); });
map.on('mousemove',e=>{ map.getCanvas().style.cursor='crosshair'; });

function limitAGL(m,ref,elev){ if(m==null) return null; if(ref==='AGL') return m; if(elev==null) return m; return m-elev; }
function fmtLim(txt,m,ref){ if(!txt && m==null) return '?'; if(txt && /GND|SFC/i.test(txt)) return 'tlo'; return (txt||m+' m')+(m!=null&&ref!=='AGL'?` (≈${m} m n.v.)`:''); }

function analyze(p, fly){
  S.sel=p; document.body.classList.add('has-sel');
  if(!marker){ const el=document.createElement('div'); el.className='pin'; marker=new maplibregl.Marker({element:el}).setLngLat(p).addTo(map); } else marker.setLngLat(p);
  map.getSource('sel')?.setData(ringFC());
  if(fly){ const pt=map.project(p), c=map.getContainer(), pad=panelPad(); const vw=c.clientWidth-(pad.right||0), vh=c.clientHeight-(pad.bottom||0);
    if(pt.x<40||pt.x>vw-40||pt.y<70||pt.y>vh-30) map.easeTo({center:p,padding:pad,duration:600}); }
  const T=wxTimeMs(S.tIdx)||Date.now(), H=S.height, dr=DRONES[S.drone], D=S.data;
  const wx=D.wx?wxAt(p[0],p[1],S.tIdx):null, elev=wx?.elev;
  const air=[], ground=[], weather=[];
  const todo=[]; let quick50=false;
  const add=(arr,sev,title,text,lim,td,appr)=>{ arr.push({sev,title,text,lim,appr:!!appr}); if(td) todo.push({sev,t:td}); };
  const R27=Math.round((D.zones?.meta?.params?.restricted_runway_radius_nm||2.7)*1852);

  /* --- airspace --- */
  const zonesHere=D.zones?D.zones.features.filter(f=>{ const b=f._b; return p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3]&&inPoly(p,f.geometry); }):[];
  const acts=zonesHere.filter(f=>f.properties.act), statics=zonesHere.filter(f=>!f.properties.act);
  const runways=D.aero?near(D.aero,p,9000,q=>q.aeroway==='runway'):[];
  const aeroPts=D.aero?D.aero.features.filter(f=>f.properties.pt===1&&['aerodrome','airstrip'].includes(f.properties.aeroway)):[];
  const aeroFor=g=>{ const c=g.type==='LineString'?g.coordinates[Math.floor(g.coordinates.length/2)]:g.coordinates; let b=null,bd=1e9; for(const a of aeroPts){ const d=distM(c,a.geometry.coordinates); if(d<bd){bd=d;b=a;} } return bd<4000?b.properties:null; };
  let inCTR=null; const minor=[];
  for(const f of statics){ const z=f.properties, lo=limitAGL(z.lo,z.lor,elev), hiTxt=fmtLim(z.hit,z.hi,z.hir), lim=`${fmtLim(z.lot,z.lo,z.lor)} – ${hiTxt}`;
    const above=lo!=null && lo>H+15;
    const name=`${z.n||''}`; const kind=ZNAME[z.t]||z.t;
    if(z.t==='P'){ add(air, above?'info':'stop', `${name} — zabranjena zona`, above?'Donja granica je iznad tvoje visine leta.':'Let je zabranjen bez posebnog odobrenja.'+(z.rem?' '+z.rem.split('\n')[0]:''), lim); continue; }
    if(z.t==='CTR'){ inCTR=z;
      // runway belonging to this CTR: nearest runway whose midpoint lies inside the CTR, else nearest overall
      const own=runways.find(r=>{ const c=r.f.geometry.coordinates; return inPoly(c[Math.floor(c.length/2)],f.geometry); })||runways[0];
      const rd=own?Math.max(0,own.d-25):null, ap=own?aeroFor(own.f.geometry):null, apn=ap?(ap.icao||ap.name):name;
      if(rd!=null && rd<R27){
        add(air,'stop',`CTR ${name} · URG oko piste`, `Udaljenost od piste ${fmtD(rd)}; granica je ${fmtD(R27)} (2,7 NM). Ovdje nema automatskog odobrenja. Let se odobrava samo iznimno, posebnim zahtjevom preko AMC portala i uz dogovor s kontrolom leta. Do granice URG-a ti fali ${fmtD(R27-rd)}.`, lim, `Za ovo mjesto treba posebno odobrenje AMC-a i kontrole leta ${apn}. Ili se odmakni ${fmtD(R27-rd)} od piste.`);
      } else if(H<=50){
        add(air,'warn',`CTR ${name} · do 50 m automatski`, `${rd!=null?'Izvan URG-a ('+fmtD(rd)+' od piste). ':''}Do 50 m iznad tla odobrenje u aplikaciji AMC Portal Mobile stiže automatski, na dan leta. Leti najviše do 50 m.`, lim, `Prijavi let u AMC Portal Mobile (CTR ${name}, do 50 m). Odobrenje je automatsko.`, true);
      } else {
        quick50=true;
        add(air,'warn',`CTR ${name} · ${H} m je iznad 50 m`, `${rd!=null?'Izvan URG-a ('+fmtD(rd)+' od piste). ':''}U CTR-u je automatsko odobrenje moguće samo do 50 m iznad tla. Za ${H} m treba redovni zahtjev na AMC portalu, koji odobrava kontrola leta. Spusti visinu na 50 m za automatsko odobrenje.`, lim, `Spusti visinu na 50 m za automatsko odobrenje ili podnesi redovni zahtjev na AMC portalu.`);
      }
      continue; }
    if(z.t==='ATZ'){ add(air,'warn',`ATZ ${name}`,'Aerodromska prometna zona nekontroliranog aerodroma (G klasa).',lim,`Dogovori let s operaterom aerodroma ${name} prije polijetanja.`,true); continue; }
    if(z.t==='RMZ'){ add(air,above?'info':'warn',`RMZ ${name}`,'Zona obvezne radioveze za zrakoplove; provjeri uvjete na AMC portalu.',lim); continue; }
    if(z.t==='GLDR'||z.t==='HPGLDR'){ add(air,'warn',kind+(name?' '+name:''),'Ovdje lete jedrilice ili paraglajderi, često nisko. Pojačan oprez, osobito vikendom.',lim); continue; }
    if(z.t==='TMA'&&above){ minor.push({n:'TMA '+name+(z.cls?' '+z.cls:''),t:'TMA'}); continue; }
    if(z.t==='TMA'){ add(air,above?'info':'warn',`TMA ${name}`+(z.cls?` (klasa ${z.cls})`:''), above?'Počinje iznad tvoje visine leta; ne utječe na let do '+H+' m.':'Donja granica je nisko; provjeri na AMC portalu.', lim); continue; }
    // D TRA TSA MTA R static
    const myActs=acts.filter(a=>a.properties.n===z.n);
    const laterActs=(D.zones.features.filter(a=>a.properties.act&&a.properties.n===z.n&&a.properties.fromMs>T)).sort((a,b)=>a.properties.fromMs-b.properties.fromMs);
    const activeNow=myActs.find(a=>a.properties.fromMs<=T&&a.properties.toMs>T);
    if(activeNow){ const a=activeNow.properties, alo=limitAGL(a.lo,a.lor,elev), aabove=alo!=null&&alo>H+15;
      add(air, aabove?'info':'stop', `${name} — AKTIVNA`, `${kind}. Aktivna ${fmtTime(a.fromMs)} – ${fmtTime(a.toMs,false)}${a.st?' ('+a.st+')':''}.${aabove?' Donja granica iznad tvoje visine.':' Ne leti dok je zona aktivna.'}`, `${fmtLim(a.lot,a.lo,a.lor)} – ${fmtLim(a.hit,a.hi,a.hir)}`); }
    else if(z.t==='R'){ add(air,above?'info':'warn',`${name} — ograničena zona`, (z.rem?z.rem.split('\n').slice(0,2).join(' '):'Aktivnost prema NOTAM-u ili AMC-u.'), lim); }
    else { const nx=laterActs[0]&&laterActs[0].properties.fromMs-T<12*3600e3; minor.push({n:name,t:z.t,next:laterActs[0]?.properties.fromMs});
      if(nx) add(air,'warn',`${name} — aktivira se uskoro`,`${kind}. Aktivacija ${fmtTime(laterActs[0].properties.fromMs)} – ${fmtTime(laterActs[0].properties.toMs,false)}. Završi let prije toga.`,lim); }
  }
  // activations whose static area wasn't hit (e.g. P/R reservations)
  for(const f of acts){ const a=f.properties; if(statics.some(s=>s.properties.n===a.n)) continue; if(!(a.fromMs<=T&&a.toMs>T)) continue;
    const alo=limitAGL(a.lo,a.lor,elev), ab=alo!=null&&alo>H+15;
    add(air, ab?'info':'stop', `${a.n} — AKTIVNA ${a.t}`, `Aktivna ${fmtTime(a.fromMs)} – ${fmtTime(a.toMs,false)}.`, `${fmtLim(a.lot,a.lo,a.lor)} – ${fmtLim(a.hit,a.hi,a.hir)}`); }
  if(minor.length){ const uniq=[...new Set(minor.map(m=>m.n+(m.t!=='TMA'?' ('+m.t+')':'')))];
    add(air,'info',`${uniq.length} ${uniq.length===1?'zona neaktivna':'zona neaktivno'} ili iznad tvoje visine`,`${uniq.join(', ')}. Vojne zone (D, TRA, TSA) u odabrano vrijeme nemaju aktivnu rezervaciju u AMC paketu.`); }
  if(D.notams){ for(const f of D.notams.features){ const q=f.properties, b=f._b; if(!(q.fromMs<=T&&q.toMs>T)) continue; if(p[0]<b[0]||p[0]>b[2]||p[1]<b[1]||p[1]>b[3]||!inPoly(p,f.geometry)) continue;
      const uas=/^QWU/.test(q.code), obst=/^QO/.test(q.code), sev=obst?'info':(q.lo!=null&&q.lo>H+300?'info':'warn');
      add(air, sev, `NOTAM ${q.n}${uas?' · let dronova/UAS':obst?' · prepreka':''}`, `${q.txt}`, `${q.lot||''}${q.hit?' – '+q.hit:''} · ${fmtTime(q.fromMs)} – ${isFinite(q.toMs)?fmtTime(q.toMs):'do opoziva'}`); } }
  // aerodromes nearby
  if(!inCTR && D.aero){
    // AMC: uncontrolled aerodrome = 3 km from runway edges, GND–1000 ft AGL, flights only with the aerodrome operator's approval
    const cand=[];
    for(const r of runways){ if(r.d>3500) break; const ap=aeroFor(r.f.geometry); cand.push({d:Math.max(0,r.d-15),ap,how:'piste'}); }
    for(const a of near(D.aero,p,3500,q=>!q.pt&&['aerodrome','airstrip'].includes(q.aeroway))) cand.push({d:a.d,ap:a.f.properties,how:'aerodroma'});
    for(const a of near(D.aero,p,3500,q=>q.pt===1&&['aerodrome','airstrip'].includes(q.aeroway))) cand.push({d:Math.max(0,a.d-400),ap:a.f.properties,how:'središta aerodroma'});
    cand.sort((a,b)=>a.d-b.d); const c=cand[0];
    if(c && c.d<=3000 && H<=305){ const q=c.ap||{}; const nm=`${q.name||'Aerodrom'}${q.icao?' ('+q.icao+')':''}`;
      add(air,'warn',`${nm} · zona 3 km`, `${fmtD(c.d)} od ${c.how}. Oko nekontroliranog aerodroma (3 km od piste, do 1000 ft) dron smije letjeti samo uz odobrenje operatora aerodroma.`, null, `Traži odobrenje operatora aerodroma ${nm}.`, true);
    } else { const a=near(D.aero,p,7000,q=>q.pt===1&&['aerodrome','airstrip'].includes(q.aeroway))[0];
      if(a) add(air,'info',`Aerodrom ${a.f.properties.name||''}${a.f.properties.icao?' ('+a.f.properties.icao+')':''}`, `Udaljen ${fmtD(a.d)}, izvan zone od 3 km. Prati promet zrakoplova.`); }
  }
  const helis=D.aero?near(D.aero,p,1500,q=>q.pt===1&&(q.aeroway==='helipad'||q.aeroway==='heliport')):[];
  if(helis[0]) add(air, helis[0].d<600?'warn':'info', `Helidrom ${helis[0].f.properties.name||''}`.trim(), `Udaljen ${fmtD(helis[0].d)}. Helikopteri (HMS, policija) lete nisko i bez najave.`);
  if(H>120) add(air,'stop','Visina iznad 120 m','U otvorenoj kategoriji najviše 120 m od najbliže točke tla.');
  if(!inCTR && !air.some(x=>x.sev==='stop')) todo.push({sev:'info',t:'Prijavi let u AMC Portal Mobile. Izvan CTR-a odobrenje je automatsko do 120 m ako nema aktivnih zona.'});

  /* --- ground --- */
  const pw=D.power?near(D.power,p,300):[];
  if(pw[0]){ const q=pw[0].f.properties; add(ground, pw[0].d<60?'warn':'info', `Dalekovod${q.kv?' '+q.kv+' kV':''}`, `${fmtD(pw[0].d)} od tebe${q.name?' · '+q.name:''}. Žice se slabo vide i ometaju kompas i GPS. Drži barem 30–50 m razmaka.`); }
  const rl=D.rail?near(D.rail,p,300,q=>q.railway):[];
  if(rl[0]){ const q=rl[0].f.properties; const el=q.electrified&&q.electrified!=='no'; add(ground, rl[0].d<60?'warn':'info', `${q.railway==='tram'?'Tramvajska pruga':'Željeznička pruga'}${q.name?' · '+q.name:''}`, `${fmtD(rl[0].d)} od tebe.${el?' Elektrificirana (kontaktna mreža).':''} Ne leti iznad pruge ni vlakova.`); }
  const aw=D.rail?near(D.rail,p,500,q=>q.aerialway):[];
  if(aw[0]) add(ground,'warn','Žičara / uspinjača',`${fmtD(aw[0].d)} od tebe. Sajle su gotovo nevidljive.`);
  const tb=D.points?near(D.points,p,1000,q=>q.k==='wind'):[];
  if(tb.length) add(ground, tb[0].d<300?'warn':'info', `Vjetroelektrana (${tb.length} ${tb.length===1?'turbina':'turbina'} u krugu 1 km)`, `Najbliža ${fmtD(tb[0].d)}. Visine turbina često prelaze 150 m, a lopatice stvaraju jaku turbulenciju.`);
  const ms=D.points?near(D.points,p,400,q=>['mast','tower','communications_tower','chimney'].includes(q.k)):[];
  if(ms[0]){ const q=ms[0].f.properties; add(ground, ms[0].d<150?'warn':'info', ({mast:'Antenski stup',tower:'Toranj',communications_tower:'Telekomunikacijski toranj',chimney:'Dimnjak'})[q.k]||'Prepreka', `${fmtD(ms[0].d)} od tebe${q.height?' · visina '+q.height+' m':''}. Odašiljači mogu ometati vezu s dronom.`); }
  const sn=D.sens?near(D.sens,p,500):[];
  for(const s of sn.slice(0,3)){ const q=s.f.properties, inside=s.d===0;
    if(q.k==='military') add(ground, inside?'stop':(s.d<200?'warn':'info'), `Vojni objekt${q.name?' · '+q.name:''}`, inside?'Unutar vojnog područja. Let i snimanje vojnih objekata su zabranjeni.':`${fmtD(s.d)} od tebe. Ne snimaj i ne preleći vojni objekt.`);
    else if(q.k==='prison') add(ground, inside||s.d<150?'stop':'warn', `Kaznionica / zatvor${q.name?' · '+q.name:''}`, inside?'Let iznad zatvora je zabranjen.':`${fmtD(s.d)} od tebe. Ne leti iznad i ne snimaj.`);
    else add(ground, inside?'warn':'info', `Elektrana${q.name?' · '+q.name:''}`, inside?'Unutar energetskog postrojenja (kritična infrastruktura). Potrebno dopuštenje vlasnika.':`${fmtD(s.d)} od tebe. Kritična infrastruktura: ne preleći bez dopuštenja.`);
  }
  const pr=D.prot?D.prot.features.filter(f=>{const b=f._b; return p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3]&&inPoly(p,f.geometry);}):[];
  for(const f of pr.slice(0,2)){ const q=f.properties; const np=/nacionaln|national/i.test(q.name||'')||q.boundary==='national_park';
    add(ground, np||/park prirode/i.test(q.name||'')?'warn':'info', q.name||'Zaštićeno područje', np?'Nacionalni park: let dronom samo uz pisano dopuštenje javne ustanove parka. Bez dozvole slijedi kazna.':'Zaštićeno područje: provjeri pravila javne ustanove; često je potrebna dozvola, osobito u sezoni gniježđenja.', null, np||/park prirode/i.test(q.name||'')?`Zatraži dopuštenje javne ustanove (${q.name||'park'}) za let i snimanje.`:null, true); }
  // settlements: query basemap landuse
  let urban=null;
  try{ const fs=map.querySourceFeatures('pm',{sourceLayer:'landuse'}); for(const f of fs){ const k=f.properties.kind; if(!['residential','industrial','commercial','retail','recreation_ground','park','pitch','stadium','school','hospital'].includes(k)) continue; if(f.geometry && (f.geometry.type==='Polygon'||f.geometry.type==='MultiPolygon') && inPoly(p,f.geometry)){ urban=k; break; } } }catch(e){}
  const place=nearestPlace(p);
  if(urban){ const lbl={residential:'stambenom',industrial:'industrijskom',commercial:'poslovnom',retail:'trgovačkom',recreation_ground:'rekreacijskom',park:'parkovnom',pitch:'sportskom',stadium:'sportskom',school:'školskom',hospital:'bolničkom'}[urban];
    add(ground, S.drone==='c3'?'stop':'warn', `Nalaziš se u ${lbl} području`, dr.sub==='A3'?'Za A3 potkategoriju moraš biti 150 m od stambenih, poslovnih, industrijskih i rekreacijskih područja.':`${dr.note} Pazi na privatnost: ne snimaj ljude i privatne posjede bez pristanka.`); }
  else if(place && place.d<1200 && 'ctv'.includes(place.k)) add(ground,'info',`Naselje ${place.n}`,`Središte je ${fmtD(place.d)} od tebe. ${dr.sub==='A3'?'Za A3 drži 150 m od naseljenih područja.':'Ne leti iznad okupljanja ljudi.'}`);

  /* --- weather --- */
  let wsev='go';
  if(wx){ const wsAlt=H>=100?wx.ws120:H>=50?wx.ws80:wx.ws10, gust=wx.gust;
    const lim=dr.wind;
    if(gust!=null&&gust>lim*1.25 || wsAlt!=null&&wsAlt>lim) add(weather,'stop','Prejak vjetar',`Na ${H} m oko ${wsAlt.toFixed(1).replace('.',',')} m/s, udari do ${gust.toFixed(1).replace('.',',')} m/s. Granica za tvoj dron je otprilike ${lim} m/s.`);
    else if(gust!=null&&gust>lim*0.8 || wsAlt!=null&&wsAlt>lim*0.7) add(weather,'warn','Vjetrovito',`Na ${H} m oko ${wsAlt.toFixed(1).replace('.',',')} m/s, udari do ${gust.toFixed(1).replace('.',',')} m/s. Računaj s većom potrošnjom baterije pri povratku protiv vjetra.`);
    if(wx.pp!=null&&wx.pp>=60 || wx.pr!=null&&wx.pr>=0.3) add(weather,(wx.pr||0)>=0.5?'stop':'warn','Oborine',`Vjerojatnost ${Math.round(wx.pp||0)} %, ${(wx.pr||0).toFixed(1).replace('.',',')} mm/h. Većina dronova nije vodootporna.`);
    if([95,96,99].includes(wx.wc)) add(weather,'stop','Grmljavina','Ne leti za grmljavine.');
    if(wx.vis!=null&&wx.vis<50) add(weather,wx.vis<15?'stop':'warn','Smanjena vidljivost',`Vidljivost oko ${(wx.vis/10).toFixed(1).replace('.',',')} km. Dron moraš stalno vidjeti golim okom (VLOS).`);
    if(wx.t!=null&&wx.t<0) add(weather,'warn','Hladno',`${Math.round(wx.t)} °C: baterije gube kapacitet; drži ih toplima i skrati let.`);
    if(wx.t!=null&&wx.t>35) add(weather,'warn','Vrućina',`${Math.round(wx.t)} °C: pazi na pregrijavanje baterije i motora.`);
  }
  const kp=kpAt(T); if(kp&&kp.kp>=5) add(weather,kp.kp>=6?'stop':'warn',`Geomagnetska oluja (Kp ${kp.kp.toFixed(1)})`,'GPS može biti nepouzdan. Budi spreman letjeti ručno (ATTI).'); else if(kp&&kp.kp>=4) add(weather,'info',`Kp ${kp.kp.toFixed(1)}`,'Povišena geomagnetska aktivnost; prati broj satelita.');
  const sun=sunTimes(T,p[1],p[0]); const night=T<sun.dawn||T>sun.dusk, twi=!night&&(T<sun.rise||T>sun.set);
  if(night) add(weather,'warn','Noć','Noćni let: dron mora imati upaljeno zeleno trepćuće svjetlo, a ti dobro poznavati teren po danu.');
  else if(twi) add(weather,'info','Sumrak','Svjetlo se brzo mijenja; uključi svjetla na dronu.');

  const worst=arr=>arr.reduce((m,x)=>SEV[x.sev]>SEV[m]?x.sev:m,'go');
  const sa=worst(air), sg=worst(ground), sw=worst(weather);
  const total=[sa,sg,sw].reduce((m,x)=>SEV[x]>SEV[m]?x:m,'go');
  const warns=[...air,...ground,...weather].filter(x=>x.sev==='warn'), apprOnly=total==='warn'&&warns.length>0&&warns.every(x=>x.appr);
  render({p,T,H,dr,wx,kp,sun,place,elev,air,ground,weather,sa,sg,sw,total,todo,quick50,apprOnly,inCTR});
}
function nearestPlace(p){ if(!PLACES) return null; let best=null; const dLat=.12; for(const q of PLACES){ if(Math.abs(q[2]-p[1])>dLat||Math.abs(q[1]-p[0])>dLat*1.4) continue; if(q[3]==='p'||q[3]==='i') continue; const d=distM(p,[q[1],q[2]]); const w=d*({c:.35,t:.5,s:.9,v:1,h:1.6,I:1}[q[3]]||1); if(!best||w<best.w) best={n:q[0],k:q[3],d,w}; } return best; }

