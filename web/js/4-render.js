/* ============ render panel ============ */
const VTXT={go:['Možeš letjeti','Nema poznatih zapreka. Vrijede opća pravila otvorene kategorije.'],warn:['Leti uz oprez','Potrebno je odobrenje, dogovor ili posebna pažnja. Pročitaj stavke ispod.'],stop:['Ne leti ovdje','Barem jedan razlog zabranjuje ili ozbiljno ugrožava let u odabrano vrijeme.'],info:['Možeš letjeti','Nema zapreka; pogledaj napomene.']};
const VICON={go:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',warn:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 6v7"/><circle cx="12" cy="18" r=".6" fill="currentColor"/></svg>',stop:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>'};
const SEVC={go:'var(--go)',warn:'var(--warn)',stop:'var(--stop)',info:'var(--info)'};
function items(arr,emptyTxt){ if(!arr.length) return `<div class="it sev-go"><span class="bar6"></span><div><b>${emptyTxt}</b></div></div>`;
  return arr.sort((a,b)=>SEV[b.sev]-SEV[a.sev]).map(x=>`<div class="it sev-${x.sev}"><span class="bar6"></span><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p>${x.lim?`<span class="lim">${esc(x.lim)}</span>`:''}</div></div>`).join(''); }
function dms(v,pos,neg){ const a=Math.abs(v), d=Math.floor(a), m=Math.floor((a-d)*60), s=((a-d)*60-m)*60; return `${d}°${pad2(m)}′${s.toFixed(0).padStart(2,'0')}″${v>=0?pos:neg}`; }
function windChart(p){
  const g=S.data.wx; if(!g) return ''; const H=S.height, lim=DRONES[S.drone].wind; const N=Math.min(24,g.n-S.tIdx); if(N<2) return '';
  const rows=[]; for(let k=0;k<N;k++){ const w=wxAt(p[0],p[1],S.tIdx+k); rows.push({ws:H>=100?w.ws120:H>=50?w.ws80:w.ws10, g:w.gust, pp:w.pp, t:wxTimeMs(S.tIdx+k)}); }
  const W=360,Hh=120,pl=24,pr=6,pt=8,pb=20, max=Math.max(lim*1.3,...rows.map(r=>r.g||0))*1.05;
  const x=i=>pl+(W-pl-pr)*i/(N-1), y=v=>pt+(Hh-pt-pb)*(1-v/max);
  const bw=(W-pl-pr)/N*.7;
  let s=`<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Vjetar sljedeća 24 sata">`;
  for(let v=0;v<=max;v+=5){ s+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl-4}" y="${y(v)+3}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="JetBrains Mono,monospace">${v}</text>`; }
  rows.forEach((r,i)=>{ if(r.pp>0) s+=`<rect x="${x(i)-bw/2}" y="${y(max*r.pp/100*0.35)}" width="${bw}" height="${Hh-pb-y(max*r.pp/100*0.35)}" fill="var(--info)" opacity=".22"/>`; });
  s+=`<line x1="${pl}" x2="${W-pr}" y1="${y(lim)}" y2="${y(lim)}" stroke="var(--stop)" stroke-dasharray="4 3" stroke-width="1.2"/><text x="${W-pr}" y="${y(lim)-3}" text-anchor="end" font-size="9" fill="var(--stop)" font-family="JetBrains Mono,monospace">granica ${lim} m/s</text>`;
  const path=k=>rows.map((r,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(r[k]||0).toFixed(1)).join('');
  s+=`<path d="${path('g')}L${x(N-1)},${y(0)}L${x(0)},${y(0)}Z" fill="var(--warn)" opacity=".16"/><path d="${path('g')}" fill="none" stroke="var(--warn)" stroke-width="1.5"/><path d="${path('ws')}" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
  rows.forEach((r,i)=>{ const d=new Date(r.t); if(i%3===0) s+=`<text x="${x(i)}" y="${Hh-6}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="JetBrains Mono,monospace">${pad2(d.getHours())}h</text>`; });
  s+=`<circle cx="${x(0)}" cy="${y(rows[0].ws||0)}" r="3.5" fill="var(--ink)"/></svg>`;
  return `<div class="chart">${s}<div class="legend-row"><span><i style="background:var(--ink)"></i>vjetar na ${H>=100?120:H>=50?80:10} m</span><span><i style="background:var(--warn);opacity:.6"></i>udari</span><span><i style="background:var(--info);opacity:.4"></i>vjerojatnost kiše</span></div></div>`;
}
function render(r){
  const {p,T,H,dr,wx,kp,sun,place,elev}=r; const v=r.total==='info'?'go':r.total;
  const lat=p[1].toFixed(5), lon=p[0].toFixed(5);
  const wsAlt=wx?(H>=100?wx.ws120:H>=50?wx.ws80:wx.ws10):null;
  const cls=(val,a,b)=>val==null?'':val>b?'bad':val>a?'mid':'';
  const stale=S.data.wx?(Date.now()-Date.parse(S.data.wx.fetched))/36e5:0;
  const title=place?(place.d<700?place.n:`kod ${place.n}`):`${lat}, ${lon}`;
  const dot=s=>`<i style="background:${SEVC[s==='info'?'go':s]}"></i>`;
  const wl=s=>({go:'u redu',info:'u redu',warn:'oprez',stop:'ne'}[s]);
  let h=`<div class="phead"><div style="min-width:0"><h2>${esc(title)}</h2>
    <div class="coords"><span>${lat}, ${lon}</span><span>${dms(p[1],'N','S')} ${dms(p[0],'E','W')}</span>${elev!=null?`<span>≈${Math.round(elev)} m n.v.</span>`:''}<button id="cpy">Kopiraj</button></div></div>
    <button class="xbtn" id="pclose" aria-label="Zatvori">×</button></div>
  <div class="verdict v-${v}"><div class="dot">${VICON[v]}</div><div class="t">${r.apprOnly?'Možeš uz odobrenje':VTXT[v][0]}</div><div class="s">${r.apprOnly?'Sve zapreke rješava prijava ili dogovor; vidi korake ispod.':VTXT[v][1]} <span style="color:var(--muted)">· ${fmtTime(T)}</span></div></div>
  ${r.quick50?`<button class="qbtn" id="q50">Spusti na 50 m za automatsko odobrenje u CTR-u</button>`:''}
  ${r.todo.length?`<div class="todo"><h3>Što trebaš napraviti</h3><ol>${[...new Map(r.todo.sort((a,b)=>SEV[b.sev]-SEV[a.sev]).map(x=>[x.t,x])).values()].map(x=>`<li class="td-${x.sev}">${esc(x.t)}</li>`).join('')}</ol></div>`:''}
  <div class="trio"><div>${dot(r.sa)}Zračni prostor<b>${wl(r.sa)}</b></div><div>${dot(r.sg)}Teren<b>${wl(r.sg)}</b></div><div>${dot(r.sw)}Vrijeme<b>${wl(r.sw)}</b></div></div>
  <div class="params"><label for="pDrone">Dron<select id="pDrone">${Object.entries(DRONES).map(([k,d])=>`<option value="${k}" ${k===S.drone?'selected':''}>${d.name}</option>`).join('')}</select></label>
    <label for="pH">Visina leta <span class="hval">${H} m</span><input type="range" id="pH" min="10" max="120" step="5" value="${H}"></label></div>
  <div class="sec"><h3>Zračni prostor <small>do ${H} m iznad tla</small></h3><div class="items">${items(r.air,'Izvan kontroliranih i zabranjenih zona (klasa G)')}</div></div>
  <div class="sec"><h3>Teren i prepreke <small>krug 500 m na karti</small></h3><div class="items">${items(r.ground,'Nema poznatih prepreka u blizini')}</div></div>
  <div class="sec"><h3>Vrijeme <small>${fmtTime(T)}</small></h3>`;
  if(wx){ h+=`<div class="wx">
    <div><small>Vjetar ${H>=100?120:H>=50?80:10} m</small><b class="${cls(wsAlt,dr.wind*.7,dr.wind)}">${wsAlt?.toFixed(1).replace('.',',')}</b> <em>m/s ${compass(H>=100?wx.wd120:wx.wd10)}</em></div>
    <div><small>Udari</small><b class="${cls(wx.gust,dr.wind*.8,dr.wind*1.25)}">${wx.gust?.toFixed(1).replace('.',',')}</b> <em>m/s</em></div>
    <div><small>Temperatura</small><b class="${wx.t<0||wx.t>35?'mid':''}">${Math.round(wx.t)}°</b> <em>${WMO[wx.wc]||''}</em></div>
    <div><small>Kiša</small><b class="${cls(wx.pp,40,70)}">${Math.round(wx.pp||0)}%</b> <em>${(wx.pr||0).toFixed(1).replace('.',',')} mm</em></div>
    <div><small>Vidljivost</small><b class="${wx.vis<15?'bad':wx.vis<50?'mid':''}">${wx.vis!=null?Math.min(99,wx.vis/10).toFixed(0):'–'}</b> <em>km</em></div>
    <div><small>Niska naoblaka</small><b>${Math.round(wx.ccl||0)}%</b> <em>uk. ${Math.round(wx.cc||0)}%</em></div>
    <div><small>Kp indeks</small><b class="${kp?(kp.kp>=6?'bad':kp.kp>=5?'mid':''):''}">${kp?kp.kp.toFixed(1).replace('.',','):'–'}</b> <em>${kp?(kp.obs==='o'?'izmjereno':'prognoza'):''}</em></div>
    <div><small>Sunce</small><b style="font-size:13px">${pad2(new Date(sun.rise).getHours())}:${pad2(new Date(sun.rise).getMinutes())}–${pad2(new Date(sun.set).getHours())}:${pad2(new Date(sun.set).getMinutes())}</b> <em>sumrak ${pad2(new Date(sun.dusk).getHours())}:${pad2(new Date(sun.dusk).getMinutes())}</em></div>
  </div>${windChart(p)}`;
  if(stale>6) h+=`<div class="stale">Prognoza je preuzeta ${fmtTime(Date.parse(S.data.wx.fetched))} (prije ${Math.round(stale)} h). Prije leta provjeri svježu prognozu.</div>`; }
  h+=`<div class="items" style="margin-top:8px">${r.weather.length?items(r.weather,''):''}</div></div>
  <div class="sec"><h3>Pravila za tvoj dron <small>${dr.sub}, otvorena kategorija</small></h3><ul class="rules">
    <li>Najviše <b>120 m</b> iznad tla; dron uvijek u vidnom polju (VLOS).</li>
    <li>${esc(dr.note)}</li>
    <li>Operater registriran kod HACZ-a, ID operatera vidljivo na dronu${S.drone==='c0'?' (obvezno ako dron ima kameru)':''}.</li>
    <li>${S.drone==='c2'?'A2 certifikat (CofC) uz A1/A3 online ispit.':S.drone==='c0'?'Za C0 preporučena obuka; za ostale potreban A1/A3 online ispit.':'Položen A1/A3 online ispit kod HACZ-a.'}</li>
    <li>Osiguranje od odgovornosti prema trećima.</li>
    <li>U CTR-u i rezerviranim zonama let samo uz odobrenje preko AMC portala.</li>
    <li>Ne snimaj vojne objekte; poštuj privatnost i GDPR.</li></ul></div>
  <div class="sec"><h3>Provjeri službeno</h3><div class="links">
    <a href="https://amc.crocontrol.hr/" target="_blank" rel="noopener">AMC portal (CroControl)</a>
    <a href="https://www.ccaa.hr/" target="_blank" rel="noopener">HACZ / CCAA</a>
    <a href="https://www.windy.com/${lat}/${lon}?${lat},${lon},12" target="_blank" rel="noopener">Windy</a>
    <a href="https://meteo.hr/" target="_blank" rel="noopener">DHMZ</a>
    <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener">Google karte</a>
    <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}" target="_blank" rel="noopener">OSM</a></div></div>
  <p class="note">Informativna procjena iz javnih podataka (AMC paket ${esc(S.data.zones?.meta?.amc_fetched||'')}, open flightmaps, OpenStreetMap, Open-Meteo). Ne zamjenjuje službeni AIP, NOTAM ni odobrenje AMC-a. Odgovornost za let je na operateru.</p>`;
  $('#pbody').innerHTML=h; $('#panel').hidden=false; $('#panel').classList.remove('min');
  $('#pclose').onclick=()=>{ S.sel=null; document.body.classList.remove('has-sel'); marker?.remove(); marker=null; map.getSource('sel')?.setData(EMPTY); renderHint(); };
  $('#pDrone').onchange=e=>{ S.drone=e.target.value; persist(); analyze(S.sel,false); };
  $('#pH').oninput=e=>{ S.height=+e.target.value; e.target.previousElementSibling.textContent=S.height+' m'; };
  $('#pH').onchange=e=>{ S.height=+e.target.value; persist(); analyze(S.sel,false); };
  const q50=$('#q50'); if(q50) q50.onclick=()=>{ S.height=50; persist(); analyze(S.sel,false); };
  $('#cpy').onclick=async e=>{ const t=`${lat}, ${lon}`, b=e.currentTarget; try{ await navigator.clipboard.writeText(t); b.textContent='Kopirano'; }catch(err){ const sel=getSelection(), rg=document.createRange(); rg.selectNodeContents(b.parentNode.firstElementChild); sel.removeAllRanges(); sel.addRange(rg); b.textContent='Označeno'; } };
}
function renderHint(){
  const m=S.data.zones?.meta;
  $('#pbody').innerHTML=`<div class="hint"><div class="phead"><h2>Gdje želiš letjeti?</h2><button class="xbtn" id="pmin" aria-label="Smanji panel">–</button></div>
  <p style="margin:0">Dodirni bilo koje mjesto na karti ili ga potraži. Dobit ćeš procjenu za odabrani trenutak:</p>
  <ol><li><b>Zračni prostor</b>: CTR, ATZ, zabranjene, opasne i vojne zone, uključujući rezervacije s AMC portala koje vrijede u to vrijeme.</li>
  <li><b>Teren</b>: dalekovodi, pruge, žičare, vjetroelektrane, antene, vojni objekti, zatvori, parkovi prirode i naselja.</li>
  <li><b>Vrijeme</b>: vjetar na visini leta, udari, kiša, vidljivost, Kp indeks i sumrak.</li></ol>
  <p style="margin:0">Vremenskom trakom na dnu biraš sat leta, do 3 dana unaprijed.</p>
  <div class="links"><a href="#" data-ex="15.9195,45.7835">Primjer: Jarun, Zagreb</a><a href="#" data-ex="15.3050,43.8020">Primjer: NP Kornati</a><a href="#" data-ex="16.4280,43.5180">Primjer: Split, Marjan</a></div>
  ${m?.announcement?`<div class="stale"><b>Obavijest AMC-a:</b> ${esc(m.announcement)}</div>`:''}
  ${SERVER&&S.data.status&&!S.data.status.basemap?.ok?`<div class="stale">Server prvi put priprema podlogu karte (oko 5–10 min). Zone i vrijeme već rade.</div>`:''}
  <p class="note">Zone: AMC CroControl ${esc(fmtMeta(m?.amc_fetched))}, rezervacije do ${esc((m?.amc_window?.[1]||'').slice(0,10))}. ${S.data.wx?'Prognoza od '+fmtTime(Date.parse(S.data.wx.fetched))+'.':''}</p></div>`;
  $('#panel').hidden=false; if(window.innerWidth<760 && !S._hinted){ $('#panel').classList.add('min'); } S._hinted=true;
  $('#pmin').onclick=()=>$('#panel').classList.toggle('min');
  $('#pbody').querySelectorAll('[data-ex]').forEach(a=>a.onclick=e=>{ e.preventDefault(); const ll=a.dataset.ex.split(',').map(Number); map.flyTo({center:ll,zoom:12.5,padding:panelPad()}); ensurePlaces().then(()=>analyze(ll,false)); });
}
$('#grab').addEventListener('click',()=>$('#panel').classList.toggle('min'));
ensurePlaces();
