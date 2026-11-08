/* =====================================================================
   ASISTENTE DE CARRERAS DEL IES N°10 — lógica de la página y del asistente
   Los datos están en js/datos.js y las preguntas frecuentes en js/preguntas.js
   ===================================================================== */
const MINUTOS_REINICIO = 3;              // modo muestra: reinicia tras X minutos sin uso

/* =====================================================================
   Utilidades
   ===================================================================== */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
const store = { get(k,d){ try{ const v=localStorage.getItem(k); return v===null?d:v; }catch(e){ return d; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
const sede = id => SEDES.find(s => s.id === id);
const horarioDe = c => c.horario || sede(c.sede).horario.replace(/\s*\(.*\)$/, "");   // horario propio de la carrera o, si no tiene, el de su sede (sin las aclaraciones de otras carreras)
const carrera = id => CARRERAS.find(c => c.id === id);
function toast(t){ const el=$("#toast"); el.textContent=t; el.style.display="block"; clearTimeout(toast.t); toast.t=setTimeout(()=>el.style.display="none",2500); }

function secciones(md){
  const out = {titulo:"", intro:[], secs:[]}; let cur = null;
  md.split("\n").forEach(l => {
    if (l.startsWith("# ")) out.titulo = l.slice(2);
    else if (l.startsWith("## ")) { cur = {t:l.slice(3).trim(), lines:[]}; out.secs.push(cur); }
    else if (cur) cur.lines.push(l); else if (l.trim()) out.intro.push(l);
  });
  return out;
}
function mdLite(lines){
  let h = "", inList = false;
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
  for (let l of lines) {
    l = l.trimEnd();
    const y = l.match(/^(\d°)\s*\(([^)]*)\):\s*(.+)$/) || l.match(/^(\d°) año\s*\(([^)]*)\)\s*:?\s*(.*)$/);
    if (y) { if (inList){h+="</ul>";inList=false;}
      h += `<div class="year"><b>${y[1]} año · ${esc(y[2])} hs cát.</b><div class="subj">${y[3].split(/\s·\s/).filter(Boolean).map(s=>`<span>${esc(s.trim().replace(/\s(\d+)\/(\d+)$/," · $1 hs/sem"))}</span>`).join("")}</div></div>`; continue; }
    if (/^\s*[-•]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) { if(!inList){h+="<ul>";inList=true;} h += `<li>${inline(l.replace(/^\s*([-•]|\d+\.)\s+/,""))}</li>`; continue; }
    if (inList){h+="</ul>";inList=false;}
    if (l.trim()) h += `<p>${inline(l)}</p>`;
  }
  if (inList) h += "</ul>";
  return h;
}
/* ---------- Plan de estudio como tabla ---------- */
function planDe(c){
  const d = secciones(c.md), s = d.secs.find(x=>/^estructura/i.test(x.t)); if(!s) return [];
  const anios = [];
  s.lines.forEach(l => { const m = l.trim().match(/^(\d)°\s*(?:año)?\s*\(([^)]*)\)\s*:?\s*(.*)$/); if(!m) return;
    const materias = m[3].split(/\s·\s/).map(x=>x.trim()).filter(Boolean).map(x => {
      const mm = x.match(/^(.*?)\s+(\d+)(?:\/(\d+))?$/); let nombre = mm?mm[1]:x, hs = mm?mm[2]:"";
      const par = nombre.match(/\s*\(([^)]*)\)\s*$/); let reg = "Anual";
      if (par){ nombre = nombre.slice(0,par.index); const p=par[1]; reg = /1°C/.test(p)?"1° cuatrimestre":/2°C/.test(p)?"2° cuatrimestre":"Anual"; const fmt=p.replace(/,?\s*[12]°C/,"").trim(); if(fmt) nombre += " ("+fmt+")"; }
      return {nombre:nombre.trim(), hs, reg};
    });
    anios.push({anio:+m[1], total:m[2].replace(/[^\d]/g,""), materias});
  });
  return anios;
}
function aprobDe(c, nombre){
  const R = REGIMEN[c.id]; if (!R) return null; const k = norm(nombre);
  if (R.final.some(x=>norm(x)===k)) return `<span class="reg b-f">Solo examen final</span>`;
  if (R.prom.some(x=>norm(x)===k)) return `<span class="reg b-p">Solo promoción</span>`;
  return `<span class="reg b-pe">Promoción o final</span>`;
}
function tablaPlan(c, {anio=null, horas=false}={}){
  let anios = planDe(c); if (anio) anios = anios.filter(a=>a.anio===anio);
  if (!anios.length) return "";
  const cuat = anios.some(a=>a.materias.some(m=>m.reg!=="Anual"));
  const apr = !!REGIMEN[c.id];
  const cols = 1 + (cuat?1:0) + (horas?1:0) + (apr?1:0);
  return `<table class="plan"><thead><tr><th>Materia</th>${cuat?"<th>Cursado</th>":""}${horas?"<th>Hs/sem</th>":""}${apr?"<th>Aprobación</th>":""}</tr></thead><tbody>` +
    anios.map(a => `<tr class="yr"><td colspan="${cols}">${a.anio}° año</td></tr>` + a.materias.map(m=>`<tr><td>${esc(m.nombre)}</td>${cuat?`<td class="n">${m.reg}</td>`:""}${horas?`<td class="n">${m.hs||"–"}</td>`:""}${apr?`<td class="n">${aprobDe(c,m.nombre)}</td>`:""}</tr>`).join("")).join("") + "</tbody></table>";
}

/* =====================================================================
   Exploración por sedes
   ===================================================================== */
const estado = { sede:null, tipo:"todas", carrera:null, conv:null };
const IC = {
  sede:'<svg class="i" viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>',
  tec:'<svg class="i" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/></svg>',
  prof:'<svg class="i" viewBox="0 0 24 24"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
  arrow:'<svg class="i" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  chat:'<svg class="i" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
};
function crumbs(){
  const c = [`<button data-go="home">Sedes</button>`];
  if (estado.sede) c.push(`<span>›</span><button data-go="sede">${esc(sede(estado.sede).nombre)}</button>`);
  if (estado.carrera) c.push(`<span>›</span><span>${esc(carrera(estado.carrera).nombre)}</span>`);
  $("#crumbs").innerHTML = c.join("");
}
function render(){
  crumbs(); const ex = $("#explore");
  if (estado.carrera) return renderFicha(ex);
  if (estado.sede) return renderSede(ex);
  $("#exTitle").textContent = "Oferta Académica por Sedes";
  ex.innerHTML = `<div class="cards">${SEDES.map(s => {
    const n = CARRERAS.filter(c=>c.sede===s.id), y = "";
    return `<button class="card" data-sede="${s.id}"><span class="badge${y}">Sede</span><div class="ico${y}">${IC.sede}</div>
      <h3>${esc(s.nombre)}</h3><p>${esc(s.lugar)}</p>
      <div class="foot"><span>${[[n.filter(c=>c.tipo==="tecnicatura").length,"tecnicatura"],[n.filter(c=>c.tipo==="profesorado").length,"profesorado"]].filter(x=>x[0]).map(x=>x[0]+" "+x[1]+(x[0]>1?"s":"")).join(" · ")}</span><span class="go">Ver ${IC.arrow}</span></div></button>`; }).join("")}</div>`;
}
function renderSede(ex){
  const s = sede(estado.sede);
  $("#exTitle").textContent = s.nombre;
  const lista = CARRERAS.filter(c => c.sede===s.id && (estado.tipo==="todas" || c.tipo===estado.tipo)).sort((a,b)=>(a.tipo>b.tipo?-1:a.tipo<b.tipo?1:a.nombre.localeCompare(b.nombre)));
  ex.innerHTML = `<p style="color:var(--slate-500);margin-bottom:6px">📍 ${esc(s.dir)} — ${esc(s.lugar)}</p><p style="color:var(--slate-500);margin-bottom:14px">🕒 ${esc(s.horario)}</p>
    <div class="tabs">${["todas","tecnicatura","profesorado"].map(t=>`<button class="tab${estado.tipo===t?" on":""}" data-tipo="${t}">${t==="todas"?"Todas":t==="tecnicatura"?"Tecnicaturas":"Profesorados"}</button>`).join("")}</div>
    <div class="cards">${lista.map(c => { const p = c.tipo==="profesorado";
      return `<button class="card" data-car="${c.id}"><span class="badge${p?" prof":""}">${p?"Profesorado":"Tecnicatura"}</span><div class="ico${p?" prof":""}">${p?IC.prof:IC.tec}</div>
        <h3>${esc(c.nombre)}</h3><p>Resolución: ${esc(c.res)}</p><div class="foot"><span>${c.anios} años</span><span class="go">Ver ${IC.arrow}</span></div></button>`; }).join("") || "<p>No hay carreras de este tipo en esta sede.</p>"}</div>`;
}
const ORDEN_SEC = ["Datos generales","Perfil","Ámbito","Habilitaciones","Objetivo","Finalidades","Estructura","Distribución","Correlatividades","Prácticas","Cursado","Otros documentos","Documentos"];
function renderFicha(ex){
  const c = carrera(estado.carrera), s = sede(c.sede), d = secciones(c.md), y = "";
  $("#exTitle").textContent = "Detalle de la carrera";
  const titulo = c.nombre;
  const revisar = d.intro.filter(l => /REVISAR|OJO|ATENCIÓN|NO disponibles/i.test(l));
  const secs = d.secs.slice().sort((a,b)=>{ const i=x=>{const k=ORDEN_SEC.findIndex(o=>x.t.startsWith(o));return k<0?50:k;}; return i(a)-i(b); });
  ex.innerHTML = `<div class="ficha-hero${y}"><small>${c.tipo==="profesorado"?"Profesorado":"Tecnicatura Superior"} · ${esc(s.nombre)}</small>
      <h3>${esc(titulo)}</h3><div class="kv"><span>⏱ ${c.anios} años</span><span>📄 Res. ${esc(c.res)}</span><span>📍 ${esc(s.lugar)}</span><span>🕒 ${esc(horarioDe(c).replace("Lunes a viernes ","Lun a vie "))}</span></div></div>
    ${revisar.length?`<div class="warn">⚠ ${esc(revisar.join(" ").replace(/^⚠\s*/,""))}</div>`:""}
    <div class="ask-row"><button class="btn-main" data-ask="Contame lo más importante de esta carrera">${IC.chat} Preguntarle al asistente</button></div>
    ${secs.map((x,i)=>{ const tb = /^estructura/i.test(x.t) ? tablaPlan(c,{horas:true}) : ""; const resto = tb ? x.lines.filter(l=>!/^\s*\d°\s*(año)?\s*\(/.test(l)) : x.lines;
      return `<details class="sec"${i<2?" open":""}><summary>${esc(/^estructura/i.test(x.t)?"Plan de estudio (materias por año)":x.t)}</summary><div class="sec-b">${tb}${mdLite(resto)}</div></details>`; }).join("")}`;
}
$("#explore").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return; activo();
  if (b.dataset.sede){ estado.sede=b.dataset.sede; estado.tipo="todas"; estado.carrera=null; render(); setChips(); }
  else if (b.dataset.tipo){ estado.tipo=b.dataset.tipo; render(); }
  else if (b.dataset.car){ abrirCarrera(b.dataset.car); }
  else if (b.dataset.ask){ abrirChat(); consultar(b.dataset.ask); }
});
$("#crumbs").addEventListener("click", e => { const b=e.target.closest("button"); if(!b) return; activo();
  if (b.dataset.go==="home"){ estado.sede=null; estado.carrera=null; } else { estado.carrera=null; } render(); setChips(); });
function abrirCarrera(id){ const c=carrera(id); estado.carrera=id; estado.conv=id; estado.sede=c.sede; render(); setChips();
  $("#ctx").hidden=false; $("#ctx").textContent="Hablando de: "+c.nombre; window.scrollTo({top:0,behavior:"smooth"}); }

/* =====================================================================
   Chat
   ===================================================================== */
function burbuja(html, quien){ const d=document.createElement("div"); d.className="m "+quien; d.innerHTML=html; const ch=$("#chips"); if (ch && ch.parentNode===$("#msgs")) $("#msgs").insertBefore(d,ch); else $("#msgs").appendChild(d); $("#msgs").scrollTop=1e9; return d; }
function bienvenida(){
  const ch=$("#chips"); $("#msgs").innerHTML=""; $("#msgs").appendChild(ch);
  burbuja(`¡Hola! 👋 Soy el asistente del <strong>IES N°10</strong>. Te puedo contar sobre las <strong>24 carreras</strong> de nuestras 4 sedes: requisitos de ingreso, duración, materias, perfil del egresado, salida laboral, turno y dónde se cursa.<br><br><strong>Tocá una opción de abajo</strong> para empezar. También podés explorar las sedes en la página.`, "bot");
}
$("#chips").addEventListener("click", e => { const b=e.target.closest(".chip"); if(!b) return;
  if (b.dataset.nav==="back") { if (pila.length>1) pila.pop(); verMenu(); return; }
  if (b.dataset.nav==="home") { pila=["inicio"]; verMenu(); return; }
  const o = MENU(pila[pila.length-1]).op[+b.dataset.i]; if (o) elegir(o); });
/* ---------- Búsqueda de las carreras relacionadas con una consulta ---------- */
const ALIAS = {
  enfermeria:["enfermer"], sanitario:["sanitari","promotor","aps","agente"], ciencia:["administracion","contab","economia"], secundaria:["matemat"],
  visual:["ciego","visual","disminuid"], rural:["rural","primaria","maestr"], fisica:["quimic"], ciencias:["ciencias de la educacion","pedagog"],
  motora:["neuro","motor"], idioma:["ingles","idioma"], regional:["cocina","gastronom","chef"], deportivo:["deport","entrenad","gimnas","educacion fisica"],
  energia:["energ","renovable","solar","electric"], historia:["historia"], comunidad_familia:["niñez","ninez","adolescen","familia"],
  empresas:["empresa","comercializ","marketing","administracion de empresas"], datos:["datos","inteligencia artificial"," ia ","machine","programac"],
  diseno:["indumentaria","moda","diseño","diseno","costura","textil"], gestion:["agropecuar","campo","agro"], produccion:["suelo","hidric","agropecuar"],
  higiene:["higiene","seguridad"], acompanamiento:["acompañ","acompan","terapeut","salud mental"], software:["software","programac","informatic","desarroll"],
  alimentos:["alimento","bromatolog"]
};
const GRUPOS = { informatica:["software","datos"], salud:["enfermeria","sanitario","acompanamiento","higiene"], docente:CARRERAS.filter(c=>c.tipo==="profesorado").map(c=>c.id) };
function relevantes(q){
  const n = " "+norm(q)+" ", puntos = {};
  CARRERAS.forEach(c => { let p=0; (ALIAS[c.id]||[]).forEach(a=>{ if(n.includes(norm(a))) p+=3; });
    norm(c.nombre).split(/[^a-z0-9ñ]+/).filter(w=>w.length>4&&!["superior","educacion","profesorado","orientacion","secundaria","especial","tecnicatura","trabajo","practica","gestion","produccion","cultura","salud","datos","seguridad","familia","regional","primaria","ciencias"].includes(w)).forEach(w=>{ if(n.includes(w)) p+=2; });
    if (p) puntos[c.id]=p; });
  if (/informatic|computa|tecnolog|program/.test(n)) GRUPOS.informatica.forEach(id=>puntos[id]=(puntos[id]||0)+2);
  if (/salud|medic|hospital/.test(n)) GRUPOS.salud.forEach(id=>puntos[id]=(puntos[id]||0)+2);
  CARRERAS.forEach(c => { const clave = norm(c.nombre).replace(/^(tec\. sup\. en |prof\. de (educacion (secundaria|primaria|especial|sup\.) (en |orientacion en |con orientacion en )?)?)/,"").split(/ c\/o | y | e /)[0].trim();
    if (clave.length>5 && n.includes(clave)) puntos[c.id]=(puntos[c.id]||0)+8; });
  let ids = Object.keys(puntos).sort((a,b)=>puntos[b]-puntos[a]).slice(0,3);
  if (ids.length>1 && puntos[ids[0]] >= 2*puntos[ids[1]] + 1 && !/informatic|computa|tecnolog|program|salud|medic|hospital/.test(n)) ids = [ids[0]];
  if (estado.carrera && !ids.length) ids.push(estado.carrera);
  return ids.slice(0,3).map(carrera);
}
function carreraConv(q){ return relevantes(q)[0] || (estado.carrera?carrera(estado.carrera):null) || (estado.conv?carrera(estado.conv):null); }

/* ---------- Respuesta armada desde la base ---------- */
function respuestaLocal(q){
  const n = norm(q), rel = relevantes(q); let c = rel[0];
  const generico = /que carreras|carreras hay|oferta|sedes|donde quedan|direcci/.test(n);
  if (!c && !generico) c = estado.carrera ? carrera(estado.carrera) : estado.conv ? carrera(estado.conv) : null;
  const sec = (car, re) => { const d=secciones(car.md); const s=d.secs.find(x=>re.test(norm(x.t))); return s? s.lines.filter(l=>l.trim()).join("\n") : ""; };
  const papeles = "**Papeles para inscribirte en el IES N°10:**\n" + REQUISITOS.map(r=>"- "+r).join("\n");
  const fechas = "**¿Cuándo me inscribo?**\n- " + CALENDARIO + "\n\n**Ingreso:** " + INGRESO;
  if (/cuando|fecha|preinscrip|examen|ingreso|cupo|mesa/.test(n) && !/requisit|papel/.test(n)) return fechas;
  if (/inscrib|requisit|papel|document|necesito/.test(n) && !c) return papeles + "\n\n" + fechas;
  if (/horario|hora|turno/.test(n) && !c) return "**Horarios de cursado (lunes a viernes):**\n" + SEDES.map(s=>`- **${s.nombre}:** ${s.horario.replace("Lunes a viernes","").replace(/^\s*·?\s*(de\s)?/,"")}`).join("\n");
  if (/sedes|donde quedan|direcci/.test(n) && !c) return "**Sedes del IES N°10:**\n" + SEDES.map(s=>`- **${s.nombre}** (${s.lugar}): ${s.dir}`).join("\n");
  if (!c && !generico) return "No tengo ese dato en la información del instituto. Consultalo en la **secretaría de tu sede**.\n\nSí te puedo ayudar con: carreras, requisitos de inscripción, fechas, ingreso, materias, correlatividades, horarios, sedes, asistencia y promoción, equivalencias, validez del título y boleto estudiantil.";
  if (!c || (generico && !rel.length)) {
    const s = estado.sede ? [sede(estado.sede)] : SEDES;
    return s.map(x=>`**${x.nombre}:**\n`+CARRERAS.filter(k=>k.sede===x.id).map(k=>`- ${k.nombre} (${k.tipo}, ${k.anios} años)`).join("\n")).join("\n\n");
  }
  const intencion = /inscrib|requisit|ingres|necesito|materia|plan de estudio|trabaj|perfil|egresad|salida|laboral|turno|horario|cursa|donde|sede|queda/.test(n);
  if (rel.length>1 && !intencion && !estado.carrera) return "Te pueden interesar estas carreras:\n" + rel.map(k=>`- **${k.nombre}** — ${sede(k.sede).nombre}, ${k.anios} años (${k.tipo})`).join("\n") + "\nTocá la sede en la página para ver el detalle, o preguntame por una en particular.";
  let t = `**${c.nombre}** — ${sede(c.sede).nombre}\n`;
  if (/inscrib|requisit|ingres|necesito|papel/.test(n)) t += sec(c,/datos generales/).split("\n").filter(l=>/ingreso|secundari|medio|25 anos|regimen/i.test(norm(l))).join("\n") + "\n\n" + papeles + "\n\n" + fechas;
  else if (/materia|plan de estudio|que se estudia/.test(n)) { const anio = (n.match(/\b([1-5])\s*(°|º|o\b|er|ero|do|to)|primer|segund|tercer|cuart|quint/)||[])[0]; const num = !anio?null: /primer/.test(anio)?1:/segund/.test(anio)?2:/tercer/.test(anio)?3:/cuart/.test(anio)?4:/quint/.test(anio)?5:parseInt(anio);
    const est = sec(c,/estructura/); t += num ? est.split("\n").filter(l=>l.startsWith(num+"°")).join("\n") || est : est; }
  else if (/trabaj|perfil|egresad|salida|laboral/.test(n)) t += (sec(c,/perfil/) + "\n" + sec(c,/ambito/)).slice(0,1200);
  else if (/donde|sede|queda|direcc/.test(n) && !/conta|cuenta|habla|informacion|\binfo\b|quiero saber|que es|sobre/.test(n)) t += `Se cursa en **${sede(c.sede).nombre}**: ${sede(c.sede).dir} (${sede(c.sede).lugar}).\n- Horario: ${horarioDe(c)}.`;
  else if (/turno|horario|cursa|hora/.test(n)) t += `**Horario:** ${horarioDe(c)}.\n` + sec(c,/cursado/);
  else if (!rel.length && !c) return "No estoy seguro de qué querés saber. Podés preguntarme, por ejemplo:\n- ¿Qué carreras hay?\n- ¿Qué necesito para inscribirme?\n- ¿Qué materias tiene " + (c?c.nombre.replace(/^Tec\. Sup\. en |^Prof\. de /,""):"Enfermería") + "?\n- ¿En qué horario se cursa?";
  else t += sec(c,/datos generales/).slice(0,900);
  return t.trim();
}

function anioPedido(n){ const a=(n.match(/\b([1-5])\s*(°|º|o\b|er\b|ero|do\b|to\b)|primer|segund|tercer|cuart|quint/)||[])[0]; if(!a) return null;
  return /primer/.test(a)?1:/segund/.test(a)?2:/tercer/.test(a)?3:/cuart/.test(a)?4:/quint/.test(a)?5:parseInt(a); }
function sedeEn(n){ return /yuto/.test(n)?"yuto":/fraile|pintado/.test(n)?"fraile":/normal/.test(n)?"normal":/comerci|comercio/.test(n)?"comer":/libertador|san martin|lgsm|ledesma/.test(n)?"lgsm":null; }
const SEDES_DE = id => id==="lgsm" ? ["comer","normal"] : [id];
function listaCarreras(lista, titulo){
  const corto = s => s.replace(/^Tec\. Sup\. en /,"").replace(/^Prof\. de /,"").replace(/^Educación /,"Educ. ");
  return `<p><strong>${esc(titulo)}</strong></p><table class="plan"><thead><tr><th>Carrera</th><th>Sede</th><th>Años</th></tr></thead><tbody>` +
    lista.map(c=>`<tr><td>${esc(corto(c.nombre))}</td><td class="n">${esc(sede(c.sede).nombre.replace("Sede ",""))}</td><td class="n">${c.anios}</td></tr>`).join("") + `</tbody></table>`;
}

function regimenDe(c){
  const R = REGIMEN[c.id]; const pl = planDe(c);
  if (!R || !pl.length) return `<p>En el diseño curricular de <strong>${esc(c.nombre)}</strong> no figura el régimen de aprobación materia por materia${c.tipo==="profesorado"?": los profesorados indican solo el <strong>formato</strong> de cada unidad (materia, taller, seminario, trabajo de campo, práctica docente) y se rigen por el <strong>Régimen Académico</strong> provincial":": solo dice que se rige por la <strong>normativa vigente</strong> del nivel superior"}.</p><p>La regla general: promocionás con <strong>7 o más en los parciales</strong> y el <strong>80% de los trabajos prácticos</strong>; la asistencia para promocionar la define cada docente. Las prácticas profesionalizantes suelen aprobarse solo por promoción.</p><p class="t-note">Para saber qué materias van a final en esta carrera, consultá en secretaría o con la coordinación.</p>`;
  const tipo = m => { const k=norm(m); if (R.final.some(x=>norm(x)===k)) return ["Solo examen final","b-f"]; if (R.prom.some(x=>norm(x)===k)) return ["Solo promoción","b-p"]; return ["Promoción o examen final","b-pe"]; };
  const filas = pl.map(a=>`<tr class="yr"><td colspan="2">${a.anio}° año</td></tr>`+a.materias.map(m=>{const [tx,cl]=tipo(m.nombre); return `<tr><td>${esc(m.nombre)}</td><td class="n"><span class="reg ${cl}">${tx}</span></td></tr>`;}).join("")).join("");
  const nf = R.final.length, np = R.prom.length;
  return `<p><strong>${esc(c.nombre)}</strong>: cómo se aprueba cada materia según el diseño curricular.</p><table class="plan"><thead><tr><th>Materia</th><th>Aprobación</th></tr></thead><tbody>${filas}</tbody></table><p class="t-note">${nf?nf+" materias van solo a examen final; ":""}${np} solo por promoción; el resto se puede promocionar (7 o más en parciales y 80% de trabajos prácticos; la asistencia la define el docente) o rendir final.</p>`;
}

function validezDe(c){
  const v = VALIDEZ[c.id];
  if (v) return `<p><strong>${esc(c.nombre)}</strong> es un título <strong>oficial</strong> y tiene <strong>validez nacional</strong>${v.coh?` para las cohortes <strong>${v.coh}</strong> (año de ingreso)`:""}.</p><ul><li><strong>Resolución:</strong> ${esc(v.res)}</li><li>Con validez nacional, el título sirve para trabajar y seguir estudiando <strong>en todo el país</strong>.</li></ul><p class="t-note">La validez nacional se otorga <strong>por cohorte</strong>. Para las cohortes más nuevas la resolución puede estar en trámite: consultalo en secretaría.</p>`;
  return `<p><strong>${esc(c.nombre)}</strong> es una carrera <strong>oficial</strong>, aprobada por el Ministerio de Educación de Jujuy (Diseño Curricular Res. ${esc(c.res||"")}).</p><p>En el portal del IES N°10 <strong>todavía no está cargada la resolución de validez nacional</strong> de esta carrera. La validez nacional la otorga la Nación <strong>por cohorte</strong> y suele tramitarse mientras cursa la primera promoción.</p><p class="t-note">Para saber en qué estado está el trámite, consultá en secretaría.</p>`;
}

function nombresCorr(c, s){
  if (!s) return "—";
  const R = CORR[c.id]; return s.split(",").map(x=>x.trim()).filter(Boolean).map(x=>{ const r = /^\d+$/.test(x) ? R.find(y=>y[0]===+x) : null; return r ? esc(r[1]) : esc(x); }).join(", ");
}
function correlDe(c, q){
  const R = CORR[c.id];
  if (!R) return c.tipo==="profesorado" ? `<p>Las correlatividades de <strong>${esc(c.nombre)}</strong> consultalas en <strong>secretaría</strong> de tu sede.</p>` : `<p>No tengo cargadas las correlatividades de <strong>${esc(c.nombre)}</strong>. Consultalas en <strong>secretaría</strong> de tu sede.</p>`;
  const n = norm(q);
  // ¿pregunta por una materia puntual?
  let mat = R.filter(r => r[1].length>3 && n.includes(norm(r[1]))).sort((a,b)=>b[1].length-a[1].length)[0]
           || R.filter(r => { const w = norm(r[1]).split(" ").filter(x=>x.length>4); return w.length && w.every(x=>n.includes(x)); })[0];
  if (mat && norm(c.nombre).includes(norm(mat[1])) && !/\b(cursar|rendir|cursarla|rendirla|materia)\b/.test(n)) mat = null;
  if (mat) {
    const req = R.filter(r => (r[2]+","+r[3]).split(",").map(x=>x.trim()).includes(String(mat[0])));
    return `<p><strong>${esc(mat[1])}</strong> (${esc(c.nombre)})</p><ul><li><strong>Para cursarla</strong> necesitás tener <strong>regularizada</strong>: ${nombresCorr(c,mat[2])}</li><li><strong>Para rendirla</strong> necesitás tener <strong>aprobada</strong>: ${nombresCorr(c,mat[3])}</li></ul>${req.length?`<p class="t-note">A su vez, ${esc(mat[1])} es correlativa de: ${req.map(r=>esc(r[1])).join(", ")}.</p>`:""}`;
  }
  const pl = planDe(c); const anio = anioPedido(n);
  let idx = 0; const porAnio = pl.map(a => { const filas = R.slice(idx, idx + a.materias.length); idx += a.materias.length; return {anio:a.anio, filas}; });
  const sel = porAnio.filter(a => !anio || a.anio===anio).filter(a => a.filas.length);
  const body = sel.map(a => `<tr class="yr"><td colspan="3">${a.anio}° año</td></tr>` + a.filas.map(r => `<tr><td>${esc(r[1])}</td>${!r[2]&&!r[3]?`<td colspan="2"><span class='t-note'>sin correlativas</span></td>`:r[2]===r[3]?`<td colspan="2">${nombresCorr(c,r[2])} <span class='t-note'>(para cursar y para rendir)</span></td>`:`<td>${r[2]?nombresCorr(c,r[2]):"—"}</td><td>${r[3]?nombresCorr(c,r[3]):"—"}</td>`}</tr>`).join("")).join("");
  return `<p><strong>Correlatividades · ${esc(c.nombre)}</strong>${anio?` · ${anio}° año`:""}</p><table class="plan"><thead><tr><th>Materia</th><th>Para cursar (regularizada)</th><th>Para rendir (aprobada)</th></tr></thead><tbody>${body}</tbody></table><p class="t-note">Las materias de 1° año no tienen correlativas. Fuente: Diseño Curricular Res. ${esc(c.res)}. Podés preguntarme por una materia puntual, por ejemplo "¿qué necesito para cursar ${esc((R.find(r=>r[2])||R[0])[1])}?".</p>`;
}
function implDe(c){
  const v = IMPL[c.id];
  const base = v ? `<p>La última resolución de <strong>implementación</strong> cargada en el portal para <strong>${esc(c.nombre)}</strong> es para la cohorte <strong>${v[0]}</strong>${v[1]?` (${esc(v[1])})`:""}.</p>` : `<p>En el portal no figura una resolución de implementación reciente para <strong>${esc(c.nombre)}</strong>.</p>`;
  const vieja = v && /2022|2024$/.test(v[0]) && !/2025|2026/.test(v[0]);
  return base + `<p>Cada año el Ministerio aprueba qué carreras abren inscripción para la nueva cohorte (año de ingreso). ${vieja||!v?"<strong>No hay resolución reciente cargada</strong>, así que no es seguro que abra el próximo ciclo.":"Para el próximo ciclo (2027) la apertura depende de una nueva resolución."}</p><p class="t-note">Confirmá en secretaría si abre la inscripción para el año que viene.</p>`;
}
function docsDe(c){
  const v = VALIDEZ[c.id], im = IMPL[c.id];
  return `<p><strong>Documentos oficiales · ${esc(c.nombre)}</strong></p><ul><li><strong>Diseño Curricular:</strong> ${c.res?esc(c.res):"no cargado en el portal"}</li><li><strong>Validez nacional:</strong> ${v?esc(v.res)+(v.coh?" · cohortes "+v.coh:""):"todavía no cargada en el portal"}</li></ul><p>👉 <a href="https://panel-administrativo-ies10.vercel.app/modules/sectores/general/general.html" target="_blank" rel="noopener">Ver los PDF en el portal del IES N°10</a></p>`;
}

/* Singular y plural: se agregan las dos formas al texto para que las reglas reconozcan cualquiera */
const NO_PLURAL = new Set("ingles lunes martes miercoles jueves viernes tres seis mas pues antes despues entonces crisis analisis tesis ademas atras jamas detras quizas vez dos los las mis tus sus nos les eres somos sos estas este esto esta estos estas cuantos cuantas todos todas otros otras unos unas muchos muchas pocos pocas varios varias ambos tenes podes sabes queres sos hacemos cursos".split(" "));
function singular(w){
  if (w.length<4 || NO_PLURAL.has(w) || !w.endsWith("s")) return w;
  if (w.endsWith("iones")) return w.slice(0,-5)+"ion";
  if (w.endsWith("ces")) return w.slice(0,-3)+"z";
  if (/(ales|eles|iles|oles|ores|eres|enes|anes|ines)$/.test(w)) return w.slice(0,-2);
  return w.slice(0,-1);
}
function plural(w){
  if (w.length<4 || NO_PLURAL.has(w) || w.endsWith("s")) return w;
  if (w.endsWith("z")) return w.slice(0,-1)+"ces";
  if (w.endsWith("ion")) return w.slice(0,-3)+"iones";
  if (/[aeiou]$/.test(w)) return w+"s";
  if (/[lrnd]$/.test(w)) return w+"es";
  return w;
}
function formas(n0){
  const s = n0.split(" ").map(singular).join(" "), pl = s.split(" ").map(plural).join(" ");
  return [n0, s, pl].filter((x,i,a)=>a.indexOf(x)===i).join(" ¦ ");
}

/* ===================== Charla con personas que no saben qué quieren ===================== */
const INTERESES = [
  [/arte|dibuj|pint|moda|ropa|costur|tejer|disen|indumentaria/, "Si te gusta el arte, el diseño o la moda", ["diseno"]],
  [/cocin|gastronom|chef|reposter|pasteler|comida/, "Si te gusta la cocina", ["regional","alimentos"]],
  [/deport|futbol|gimnasio|entren|educacion fisica|profe de gimnasia|actividad fisica/, "Si te gusta el deporte", ["deportivo"]],
  [/ensenar|dar clases|maestr|docen|ser profe|escuela/, "Si te gusta enseñar", ["rural","secundaria","historia","fisica","ciencia","idioma","visual","motora","ciencias"]],
  [/matematic|numeros|cuentas|calculo/, "Si te gustan los números", ["secundaria","datos","empresas","ciencia"]],
  [/quimic|laboratorio|experiment|ciencia(s)? natural/, "Si te gusta la química o el laboratorio", ["fisica","alimentos"]],
  [/historia|pasado|cultura/, "Si te gusta la historia", ["historia","regional"]],
  [/ingles|idioma/, "Si te gustan los idiomas", ["idioma"]],
  [/electric|energia|solar|panel|instalacion|electron/, "Si te gusta la electricidad o la energía", ["energia","higiene"]],
  [/empresa|negocio|emprend|vender|ventas|comercio|administr|contab|plata|marketing/, "Si te gustan los negocios o la administración", ["empresas","ciencia"]],
  [/discapacid|inclusion|ciegos|sordos|autis/, "Si te interesa trabajar con personas con discapacidad", ["visual","motora","acompanamiento"]],
  [/psicolog|salud mental|escuchar|aconsejar|terapia/, "Si te interesa la psicología o la salud mental", ["acompanamiento","comunidad_familia"]],
  [/segur|prevencion|bombero|accidente|industria|fabrica/, "Si te interesa la seguridad o la industria", ["higiene","alimentos"]],
  [/alimento|fabrica de comida|calidad|bromatolog/, "Si te interesan los alimentos", ["alimentos","regional"]],
  [/compu|program|tecnolog|informatic|datos|inteligencia artificial|videojueg|celular|sistemas/, "Si te gusta la tecnología", ["software","datos"]],
  [/salud|medic|hospital|cuidar|enfermer|curar|primeros auxilios/, "Si te interesa la salud", ["enfermeria","sanitario","acompanamiento"]],
  [/campo|agro|animal|planta|cultivo|rural|naturaleza|ambiente|tierra|suelo/, "Si te gusta el campo o la naturaleza", ["gestion","produccion","energia"]],
  [/social|comunidad|ayudar a (la )?gente|ninos|chicos|familia|derechos/, "Si te interesa lo social", ["comunidad_familia","acompanamiento","sanitario"]],
];
const NO_HAY = [
  [/medicin|medico|doctor/, "Medicina", ["enfermeria","sanitario"]],
  [/abogac|abogado|derecho|leyes|escribano/, "Abogacía", ["empresas","comunidad_familia"]],
  [/psicolog/, "Psicología", ["acompanamiento","comunidad_familia"]],
  [/contador|contabilidad|ciencias economicas/, "Contador Público", ["empresas","ciencia"]],
  [/arquitect/, "Arquitectura", ["diseno","energia"]],
  [/veterinar/, "Veterinaria", ["gestion","produccion"]],
  [/ingenier/, "Ingeniería", ["software","energia","higiene"]],
  [/policia|gendarm|militar|fuerzas/, "Policía o fuerzas de seguridad", ["higiene"]],
  [/profesorado de educacion fisica|educacion fisica|profe de gimnasia/, "Profesorado de Educación Física", ["deportivo"]],
  [/nutricion|nutricionista/, "Nutrición", ["regional","alimentos","deportivo"]],
  [/kinesiolog|fisioterap/, "Kinesiología", ["deportivo","motora"]],
  [/odontolog|dentista/, "Odontología", ["enfermeria","sanitario"]],
  [/jardin|nivel inicial|maestra jardinera/, "Profesorado de Nivel Inicial (jardín)", ["rural","ciencias"]],
  [/periodism|comunicacion social|locutor/, "Periodismo", ["idioma","historia"]],
  [/farmac/, "Farmacia", ["enfermeria"]],
  [/obstetric|partera/, "Obstetricia", ["enfermeria","sanitario"]],
  [/trabajo social|trabajador social|asistente social/, "Trabajo Social", ["comunidad_familia","acompanamiento"]],
];
function listaIds(ids, titulo){ return listaCarreras(ids.map(id=>carrera(id)).filter(Boolean), titulo); }
function charla(q){
  const n0 = norm(q).trim(), n = " "+n0+" ";
  const corta = n0.replace(/[!?.¡¿, ]+/g," ").trim();
  // saludos y cortesía (como si fuera una persona)
  if (/^(hola|holis|buenas|buen dia|buenas tardes|buenas noches|hey|ey|que tal|como estas|como andas|como va|todo bien)( (como estas|como andas|que tal|todo bien|bot|amigo|che))*( \w+)?$/.test(corta) && corta.split(" ").length<=5)
    return {r:`<p>¡Hola! 😊 Todo bien, gracias. Soy el asistente virtual del IES N°10.</p><p>¿Ya sabés qué carrera te interesa o querés que te ayude a elegir?</p>`, sig:["No sé qué estudiar","¿Qué carreras hay?","¿Qué necesito para inscribirme?"]};
  if (/^(chau|adios|nos vemos|hasta luego|me voy|bye|chao)/.test(corta))
    return {r:`<p>¡Chau! 👋 Que te vaya muy bien. Si te quedó alguna duda, acercate a la secretaría de la sede o volvé a preguntarme.</p>`, sig:[]};
  if (/^(gracias|muchas gracias|mil gracias|genial gracias|ok gracias|grax|buenisimo|joya|genial|excelente|perfecto|de diez)\b/.test(corta) && corta.split(" ").length<=6)
    return {r:`<p>¡De nada! 🙌 ¿Querés saber algo más? Por ejemplo, los requisitos o las fechas de inscripción.</p>`, sig:["¿Qué necesito para inscribirme?","¿Cuándo son las inscripciones?","¿Qué carreras hay?"]};
  if (/^(ok|oka|okey|dale|bueno|listo|si|sii+|no|nop|aja|ah|mm+|ya|claro|entiendo|entendi|ah ok|ok dale)$/.test(corta))
    return {r:`<p>¿Te cuento algo más? Podés preguntarme lo que quieras con tus palabras, o tocar una de estas opciones:</p>`, sig:["¿Qué carreras hay?","No sé qué estudiar","¿Qué necesito para inscribirme?","¿Cuáles son los horarios?"]};
  if (/^(ja)+$|^(je)+$|^(jsj)+|^xd+$|^lol$/.test(corta.replace(/ /g,"")))
    return {r:`<p>😄 ¿Te ayudo con algo de las carreras?</p>`, sig:["¿Qué carreras hay?","No sé qué estudiar"]};
  if (/\b(como te llamas|cual es tu nombre|tu nombre|quien sos|que sos|sos una persona|sos humano|sos real|sos un robot|sos un bot|estas vivo|cuantos anos tenes|sos ia|sos chatgpt|me estas hablando una persona)\b/.test(n0))
    return {r:`<p>Soy el <strong>asistente virtual del IES N°10</strong>: un programa, no una persona. Me armaron estudiantes del instituto para ayudarte con las carreras.</p><p>Si querés hablar con alguien, acercate a los chicos del stand o a la secretaría de la sede. ¿En qué te ayudo?</p>`, sig:["¿Qué carreras hay?","No sé qué estudiar"]};
  if (/\b(te quiero|te amo|sos lindo|sos linda|tenes novi|queres ser mi|casate|salimos)\b/.test(n0))
    return {r:`<p>Jaja, gracias 😅 Soy solo un asistente virtual. ¿Te ayudo con alguna carrera?</p>`, sig:["¿Qué carreras hay?","No sé qué estudiar"]};
  if (/\b(tonto|boludo|idiota|estupido|inutil|no servis|no sabes nada|bot de mierda|sos malo|pelotudo)\b/.test(n0))
    return {r:`<p>Perdón si no te entendí bien. Probá preguntarme de otra forma, o tocá una opción y te ayudo. 🙂</p>`, sig:["¿Qué carreras hay?","¿Qué necesito para inscribirme?","No sé qué estudiar"]};
  // perdidos / no saben qué hacer
  if (/\b(termine el secundario|termino el secundario|sali del colegio|me recibi del secundario|recien termine)\b.*\b(no se|que (hago|estudio|puedo))|\b(mi (mama|papa|vieja|viejo|familia|madre|padre)) (quiere|dice|me dijo)\b|\b(no se si estudiar|vale la pena estudiar|me conviene estudiar)\b/.test(n0))
    return {r:`<p>¡Qué bueno que estés pensando en estudiar! No hace falta tenerlo todo claro: muchos empiezan así.</p><p>Contame un poco: <strong>¿qué te gusta hacer o en qué te imaginás trabajando?</strong> Por ejemplo: tecnología, salud, enseñar, el campo, cocina, deporte, negocios, arte o ayudar a la gente. Con eso te digo qué carreras te pueden servir.</p>`, sig:["Me gusta la tecnología","Me interesa la salud","Me gusta enseñar","Quiero ayudar a la gente"]};
  if (/^(y )?(ahora )?(que hago|que tengo que hacer|que hago ahora|y ahora)$/.test(corta)) return {r:`<p>Te ayudo 😊 ¿Querés elegir una carrera, ver qué papeles necesitás o saber cuándo te inscribís?</p>`, sig:["No sé qué estudiar","¿Qué necesito para inscribirme?","¿Cuándo son las inscripciones?"]};
  if (/\b(estoy perdid\w*|no se nada|no entiendo nada|no se por donde empezar|no se como (funciona|es esto)|soy nuev\w*|primera vez|como empiezo|ayuda|ayudame|me ayudas|me podes ayudar|necesito ayuda|orientame|guiame|no se que hacer)\b/.test(n0))
    return {r:`<p>¡Tranqui, te ayudo paso a paso! 😊</p><ol><li><strong>Elegí una carrera:</strong> si no sabés cuál, contame qué te gusta (por ejemplo "me gusta la tecnología" o "quiero ayudar a la gente").</li><li><strong>Fijate en qué sede se dicta</strong> y el horario.</li><li><strong>Juntá los papeles</strong> para inscribirte.</li><li><strong>Preinscribite en diciembre</strong> y confirmá en febrero o marzo; después rendís el examen de ingreso.</li></ol><p>¿Por dónde empezamos?</p>`, sig:["No sé qué estudiar","¿Qué carreras hay?","¿Qué necesito para inscribirme?","¿Cuándo son las inscripciones?"]};
  if (/\b(estoy nervios\w*|me da miedo|tengo miedo|no se si voy a poder|me cuesta estudiar|soy malo estudiando|no soy inteligente|es muy dificil)\b/.test(n0))
    return {r:`<p>Es normal sentirse así al empezar. 💪 Las carreras están pensadas para personas que recién salen del secundario o que hace tiempo no estudian, y vas a tener profesores y compañeros que te acompañan.</p><p>Si querés, te cuento cómo es la cursada o qué carreras hay, así vas viendo con calma.</p>`, sig:["¿Cómo se aprueba una materia?","¿Cuáles son los horarios?","No sé qué estudiar"]};
  if (/\b(carrera corta|algo corto|algo rapido|recibirme rapido|trabajar rapido|pocos anos|menos anos|2 anos|dos anos|1 ano|un ano)\b/.test(n0))
    return {r:`<p>Las carreras más cortas del IES N°10 son las <strong>tecnicaturas, de 3 años</strong> (los profesorados duran 4). No hay carreras de 1 o 2 años.</p>` + listaIds(CARRERAS.filter(c=>c.tipo==="tecnicatura").map(c=>c.id),"Tecnicaturas (3 años)"), sig:["No sé qué estudiar","¿Qué necesito para inscribirme?"]};
  if (/\b(me (podes|podrias) (anotar|inscribir)|anotame|inscribime|quiero que me anotes|me anoto aca|me inscribo aca|puedo inscribirme aca|reservame)\b/.test(n0))
    return {r:`<p>Yo no puedo anotarte: soy un asistente informativo. La inscripción se hace en la <strong>secretaría de la sede</strong> de la carrera que elijas (preinscripción en diciembre, confirmación en febrero y marzo).</p>`, sig:["¿Qué necesito para inscribirme?","¿Dónde quedan las sedes?"]};
  if (/\b(te paso mi (numero|celular|mail|whatsapp)|mi (numero|celular|mail|whatsapp|telefono) es|me (llamas|llamarias|avisas|escribis)|anota mi|guarda mi)\b|\b\d{8,}\b/.test(n0))
    return {r:`<p>No guardo datos personales ni puedo llamarte o escribirte, así que <strong>no me pases tu número ni tu mail</strong>. 🙂</p><p>Para que te avisen de fechas, acercate a la secretaría de la sede.</p>`, sig:["¿Cuándo son las inscripciones?","¿Dónde quedan las sedes?"]};
  if (/\b(no te entendi|no entendi|no entiendo|explicame (mas )?facil|decilo mas facil|mas simple|con otras palabras|que significa eso|que quisiste decir)\b/.test(n0))
    return {r:`<p>Perdón, lo digo más simple 🙂: preguntame <strong>una cosa por vez</strong>, con tus palabras. Por ejemplo:</p><ul><li>"¿Qué carreras hay en Yuto?"</li><li>"¿Qué papeles necesito?"</li><li>"¿Cuánto dura Enfermería?"</li></ul>`, sig:["¿Qué carreras hay?","¿Qué necesito para inscribirme?","No sé qué estudiar"]};
  // carreras que no se dictan
  for (const [re, nombre, ids] of NO_HAY) if (new RegExp("\\b(quiero|tienen|hay|estudiar|ser|carrera de|se puede|dan|dictan|me gusta|me interesa|profesorado de|licenciatura en)\\b.*("+re.source+")|^("+re.source+")\\b").test(n0) && !relevantes(q).some(c=>norm(c.nombre).includes(nombre.toLowerCase())))
    return {r:`<p><strong>${esc(nombre)}</strong> no se dicta en el IES N°10 (se estudia en la universidad o en otra institución).</p>` + listaIds(ids, "Lo más parecido que hay acá") + `<p class="t-note">Con un título del IES N°10 después podés seguir estudiando en la universidad.</p>`, sig:["¿Qué carreras hay?","No sé qué estudiar","¿Puedo seguir en la universidad?"]};
  // intereses
  if (/\b(me gusta\w*|me interesa\w*|me encanta\w*|quiero|soy buen\w*|se me da|me llama la atencion|algo (de|con|que tenga)|trabajar (en|con|de)|me veo|me imagino|ser)\b/.test(n0) && !relevantes(q).filter(c=>new RegExp(norm(c.nombre).split(" ").filter(w=>w.length>6).slice(-1)[0]||"^$").test(n0)).length) {
    const hits = INTERESES.filter(([re])=>re.test(n0));
    if (hits.length) { const ids=[...new Set(hits.flatMap(h=>h[2]))];
      return {r: listaIds(ids, hits[0][1]+", te pueden servir:") + `<p>¿Querés que te cuente de alguna? Escribí su nombre o "contame de …".</p>`, sig: ids.slice(0,3).map(id=>"Contame de "+carrera(id).nombre.replace(/^Tec\. Sup\. en |^Prof\. de (Educación )?/,""))}; }
  }
  return null;
}

/* =====================================================================
   MENÚ DE OPCIONES (el chat funciona solo con botones)
   go = abre otro menú · q = muestra una respuesta (y se queda en el mismo menú)
   ===================================================================== */
const corto = s => s.replace(/^Tec\. Sup\. en /,"").replace(/^Prof\. de /,"Prof. ").replace(/^Prof\. Educación /,"Prof. ");
const GUSTOS = [["💻 Tecnología",14],["🩺 Salud",15],["🍎 Enseñar",3],["🌱 Campo y naturaleza",16],["🤝 Social",17],["🍲 Cocina",1],["⚽ Deporte",2],["💼 Negocios",9],["🎨 Arte y moda",0],["⚡ Energía y electricidad",8],["♿ Discapacidad",10],["🧠 Psicología",11],["🔢 Números",4],["🧪 Química",5],["📜 Historia",6],["🌎 Idiomas",7],["🦺 Seguridad e industria",12]];
function MENU(id){
  const [k,a,b] = id.split(":");
  if (k==="inicio") return {t:"Menú principal", intro:null, op:[
    {t:"🏫 Carreras por sede", go:"sedes"},{t:"📝 Inscripción e ingreso", go:"insc"},{t:"📚 Cursada", go:"cursada"},
    {t:"🎓 Título y validez", go:"titulo"},{t:"💰 Becas y beneficios", go:"becas"},{t:"🤔 No sé qué estudiar", go:"elegir"},{t:"❓ Otras consultas", go:"otras"}]};
  if (k==="sedes") return {t:"Sedes", intro:"<p>Elegí una sede:</p>", op: SEDES.map(s=>({t:`${s.nombre.replace("Sede ","")} · ${s.lugar}`, go:"sede:"+s.id}))};
  if (k==="sede") { const s=sede(a), cs=CARRERAS.filter(c=>c.sede===a), te=cs.filter(c=>c.tipo==="tecnicatura").length, pr=cs.length-te;
    return {t:s.nombre.replace("Sede ",""), intro:`<p><strong>${esc(s.nombre)}</strong> (${esc(s.lugar)})</p><ul><li><strong>Dirección:</strong> ${esc(s.dir)}</li><li><strong>Horario:</strong> ${esc(s.horario)}</li></ul><p>¿Qué querés ver?</p>`,
      op:[...(te?[{t:`🛠 Tecnicaturas (${te})`, go:`tipo:${a}:tecnicatura`}]:[]), ...(pr?[{t:`🍎 Profesorados (${pr})`, go:`tipo:${a}:profesorado`}]:[])]}; }
  if (k==="tipo") { const cs=CARRERAS.filter(c=>c.sede===a && c.tipo===b);
    return {t:b==="tecnicatura"?"Tecnicaturas":"Profesorados", intro:`<p>${b==="tecnicatura"?"Tecnicaturas (3 años)":"Profesorados (4 años)"} en <strong>${esc(sede(a).nombre)}</strong>. Elegí una carrera:</p>`, op: cs.map(c=>({t:corto(c.nombre), go:"car:"+c.id}))}; }
  if (k==="car") { const c=carrera(a);
    return {t:corto(c.nombre), introQ:"info", ctx:a, op:[
      {t:"📋 Datos generales", q:"info", ctx:a},...(planDe(c).length?[{t:"📚 Materias por año", q:"sus materias", ctx:a}]:[]),...(CORR[a]?[{t:"🔗 Correlatividades", q:"correlatividades", ctx:a}]:[]),
      ...((seccionDe(c,/^perfil|^finalidad|^objetivo/)||seccionDe(c,/^ambito/))?[{t:"👤 Perfil y salida laboral", html:()=>perfilHTML(c)}]:[]),{t:"🕒 Horario y sede", html:()=>{ const s=sede(c.sede); return `<p><strong>${esc(c.nombre)}</strong></p><ul><li><strong>Sede:</strong> ${esc(s.nombre)} (${esc(s.lugar)})</li><li><strong>Dirección:</strong> ${esc(s.dir)}</li><li><strong>Horario:</strong> ${esc(horarioDe(c))}</li></ul>`; }},
      {t:"🎓 Validez del título", q:"tiene validez?", ctx:a},{t:"📄 Documentos oficiales", q:"resoluciones de la carrera", ctx:a}]}; }
  if (k==="insc") return {t:"Inscripción e ingreso", intro:"<p>¿Qué querés saber de la inscripción?</p>", op:[
    {t:"📋 Requisitos y papeles", q:"¿Qué necesito para inscribirme?"},{t:"📅 Fechas de inscripción", q:"¿Cuándo son las inscripciones?"},{t:"💻 Preinscripción online (NEXO)", q:"inscripcion online"},
    {t:"✏️ Examen de ingreso", q:"¿Qué entra en el examen de ingreso?"},{t:"👥 Cupos", q:"¿Cuántos alumnos entran?"},{t:"📢 Resultados del examen", q:"cuando dan los resultados del examen"},
    {t:"❌ Si no entro", q:"que pasa si no apruebo el ingreso"},{t:"🎒 Estoy terminando el secundario", q:"si recien termino el secundario puedo?"},{t:"📘 Debo materias del secundario", q:"debo materias del secundario"},
    {t:"🧑 Mayores de 25 sin secundario", q:"tengo mas de 25 y no termine el secundario"},{t:"🗂 Dónde saco cada papel", go:"papeles"},{t:"📑 Fotocopias y originales", q:"tengo que llevar fotocopias?"},
    {t:"📍 Dónde me inscribo", q:"donde me inscribo"},{t:"➕ Dos carreras o dos sedes", q:"puedo hacer dos carreras?"},{t:"🎂 ¿Hay edad límite?", q:"hay edad limite?"}]};
  if (k==="papeles") return {t:"Papeles", intro:"<p>¿Qué papel necesitás sacar?</p>", op:[
    {t:"CUIL", q:"donde saco el cuil"},{t:"Acta de nacimiento autenticada", q:"donde saco el acta de nacimiento"},{t:"Certificado de residencia", q:"donde saco el certificado de residencia"},
    {t:"Planilla prontuarial", q:"que es la planilla prontuarial"},{t:"Planilla psicofísica", q:"que es la planilla psicofisica"},{t:"Fotos carnet", q:"fotos carnet"},{t:"Título en trámite", q:"constancia de titulo en tramite"}]};
  if (k==="cursada") return {t:"Cursada", intro:"<p>¿Sobre qué tema de la cursada?</p>", op:[
    {t:"✅ Asistencia y aprobación", go:"aprob"},{t:"📝 Exámenes y mesas", go:"exam"},{t:"🔁 Trámites de cursada", go:"tram"},{t:"📅 Calendario y horarios", go:"cal"},{t:"📖 Qué significa cada cosa", go:"conc"}]};
  if (k==="aprob") return {t:"Asistencia y aprobación", intro:"<p>Elegí un tema:</p>", op:[
    {t:"Asistencia (80%)", q:"cuantas faltas puedo tener"},{t:"Si trabajo (60%)", q:"si trabajo me bajan la asistencia?"},{t:"¿Puedo estudiar y trabajar?", q:"puedo estudiar y trabajar?"},
    {t:"Regularizar una materia", q:"que es regularizar"},{t:"Promoción y examen final", q:"con que nota se promociona"},{t:"Parciales y recuperatorios", q:"hay recuperatorio?"},
    {t:"Trabajos prácticos", q:"que es un trabajo practico"},{t:"Si falto mucho", q:"que pasa si falto mucho"}]};
  if (k==="exam") return {t:"Exámenes y mesas", intro:"<p>Elegí un tema:</p>", op:[
    {t:"Mesas de examen", q:"cuando son las mesas de examen"},{t:"Inscribirme a una mesa", q:"como me inscribo a una mesa"},{t:"Rendir libre", q:"que es rendir libre"},
    {t:"Vencimiento de la regularidad", q:"se vence la regularidad?"},{t:"Correlatividades", q:"que son las correlatividades"}]};
  if (k==="tram") return {t:"Trámites", intro:"<p>Elegí un trámite:</p>", op:[
    {t:"Equivalencias y asimilación", q:"como pido equivalencias"},{t:"Cambiarme de carrera", q:"puedo cambiarme de carrera despues?"},{t:"Recursar una materia", q:"puedo recursar"},
    {t:"Dejar la carrera y volver", q:"puedo dejar y volver despues"},{t:"Constancia de alumno regular", q:"como pido certificado de alumno regular"},{t:"Certificado analítico", q:"como saco el analitico"}]};
  if (k==="cal") return {t:"Calendario y horarios", intro:"<p>Elegí un tema:</p>", op:[
    {t:"Horarios de cada sede", q:"cuales son los horarios"},{t:"¿Se cursa todos los días?", q:"hay que ir todos los dias"},{t:"¿Es presencial?", q:"las clases son virtuales?"},
    {t:"¿Cuándo empiezan las clases?", q:"cuando empiezan las clases"},{t:"¿Cuándo terminan? Vacaciones", q:"cuando terminan las clases"},{t:"¿Cuándo me recibo?", q:"cuando me recibo"},{t:"¿Cuántas materias por año?", q:"cuantas materias curso por año"}]};
  if (k==="conc") return {t:"Qué significa", intro:"<p>¿Qué querés que te explique?</p>", op:[
    {t:"Práctica profesionalizante", q:"que es la practica profesionalizante"},{t:"Residencia (profesorados)", q:"que es la residencia en el profesorado"},{t:"EDI", q:"que es el edi"},{t:"UDI", q:"que es la udi"},
    {t:"Taller, seminario y otros formatos", q:"que es un seminario"},{t:"Materia anual y cuatrimestral", q:"que es una materia anual"},{t:"Hora cátedra", q:"cuanto dura una hora catedra"},{t:"Taller integrador", q:"que es el taller integrador"}]};
  if (k==="titulo") return {t:"Título y validez", intro:"<p>Elegí un tema:</p>", op:[
    {t:"¿Qué es la validez nacional?", q:"que es la validez nacional"},{t:"Validez de cada carrera", go:"valcar"},{t:"¿Qué título me dan?", q:"que titulo me dan"},
    {t:"Tecnicatura vs. profesorado", q:"diferencia entre tecnicatura y profesorado"},{t:"Seguir en la universidad", q:"puedo seguir en la universidad?"},{t:"Trámite del título", q:"cuando me dan el titulo"}]};
  if (k==="valcar") return {t:"Validez por carrera", intro:"<p>Elegí la carrera:</p>", op: CARRERAS.map(c=>({t:corto(c.nombre), q:"tiene validez?", ctx:c.id}))};
  if (k==="becas") return {t:"Becas y beneficios", intro:"<p>Elegí una opción:</p>", op:[
    {t:"🎓 Beca Progresar", q:"hay becas?"},{t:"🚌 Boleto gratuito (BEGUP)", q:"como saco el begup"},{t:"📄 Constancia de alumno regular", q:"constancia de alumno regular"},{t:"📚 Biblioteca digital gratuita", q:"tienen biblioteca?"},{t:"💵 ¿Es gratis estudiar?", q:"cuanto cuesta"}]};
  if (k==="elegir") return {t:"No sé qué estudiar", intro:"<p>Seleccioná el área que más te interesa:</p>", op:[
    ...GUSTOS.map(([t,i])=>({t, go:"gusto:"+i})),{t:"⏱ Carreras más cortas", q:"quiero algo corto"},{t:"🚫 Carreras que no hay en el IES N°10", go:"nohay"},{t:"📋 Ver todas las carreras", q:"que carreras hay"},{t:"🗣 ¿Qué carreras tienen inglés?", q:"hay ingles en todas las carreras?"}]};
  if (k==="gusto") { const g=INTERESES[+a]; const ids=g[2];
    return {t:g[1].replace(/^Si te (gusta|gustan|interesa) /,""), intro: listaIds(ids, g[1]+", te pueden servir:")+"<p>Seleccioná una carrera para ver más información:</p>", op: ids.map(id=>({t:corto(carrera(id).nombre), go:"car:"+id}))}; }
  if (k==="nohay") return {t:"Carreras que no hay", intro:"<p>¿Qué carrera buscabas?</p>", op: NO_HAY.map(([re,nombre])=>({t:nombre, q:"quiero estudiar "+nombre}))};
  if (k==="otras") return {t:"Otras consultas", intro:"<p>Elegí una opción:</p>", op:[
    {t:"💵 ¿Es gratis?", q:"cuanto cuesta"},{t:"🏢 ¿Qué es la secretaría?", q:"que es bedelia"},{t:"🕒 Horario de la secretaría", q:"a que hora atiende la secretaria"},{t:"📞 Contacto", html:()=>`<p>Los datos de contacto (teléfono, correo y redes) se informan en la <strong>secretaría de cada sede</strong>.</p>` + responder("donde quedan las sedes")},
    {t:"🌐 Página del IES N°10", q:"tienen pagina web?"},{t:"📍 Dónde quedan las sedes", q:"donde quedan las sedes"},{t:"🚌 Cómo llegar", html:()=>responder("donde quedan las sedes") + `<p>🚌 Como alumno del IES N°10 podés tramitar el <strong>BEGUP</strong> (Boleto Estudiantil Gratuito Universal Provincial), que sirve para colectivos urbanos e interurbanos de Jujuy. Lo encontrás en <strong>Becas y beneficios</strong>.</p>`},{t:"🏫 El instituto", go:"inst"},{t:"🤖 ¿Quién hizo este asistente?", q:"quien te hizo"}]};
  if (k==="inst") return {t:"El instituto", intro:"<p>Elegí una opción:</p>", op:[
    {t:"Comedor", q:"hay comedor?"},{t:"Wifi y computadoras", q:"hay wifi en el instituto?"},{t:"Centro de estudiantes", q:"hay centro de estudiantes?"},{t:"Uniforme", q:"hay uniforme?"},
    {t:"Materiales", q:"hay que comprar materiales?"},{t:"¿Necesito computadora?", q:"necesito computadora?"},{t:"Ir a ver una clase", q:"puedo ir a ver una clase?"}]};
  return MENU("inicio");
}

function seccionDe(c, re){ const s = secciones(c.md).secs.filter(x=>re.test(norm(x.t))); return s.length ? s.map(x=>mdLite(x.lines)).join("") : ""; }
function perfilHTML(c){ const p = seccionDe(c,/^perfil|^finalidad|^objetivo/), a = seccionDe(c,/^ambito/);
  if (!p && !a) return `<p>No tengo cargado el perfil de <strong>${esc(c.nombre)}</strong>.</p><p class="t-note">Consultalo en la secretaría de la sede.</p>`;
  return `<p><strong>${esc(c.nombre)}</strong></p>` + (p?`<p><strong>👤 Perfil del egresado</strong></p>${p}`:"") + (a?`<p><strong>💼 Dónde puede trabajar</strong></p>${a}`:""); }

/* Ajusta el texto al modo opciones: tono formal y sin invitaciones a escribir */
function limpiar(h){
  return h
    .replace(/(Preguntame|Podés preguntarme|Decime (la|tu) carrera)[^<]*?(\?"|"\.|\.|\?»)(\)?)/g,"")
    .replace(/Ojo: /g,"Importante: ").replace(/<p>No: todas las carreras/g,"<p>Todas las carreras").replace(/<p>Sí: /g,"<p>").replace(/<p>Sí, podés/g,"<p>Podés")
    .replace(/Ese dato no está en la información que tengo: consultalo en la/g,"Esta información se consulta en la")
    .replace(/No tengo cargados los datos de contacto del IES N°10 \(teléfono, mail o redes\)\./,"Los datos de contacto (teléfono, correo y redes) se informan en la secretaría de cada sede.")
    .replace(/No tengo los recorridos de colectivo, pero te puedo dar las direcciones de las sedes\./,"Estas son las direcciones de las sedes.")
    .replace(/\s+\.\s*(<\/p>)/g,".$1").replace(/\.\s*\./g,".").replace(/<p class="t-note">\s*<\/p>/g,"").replace(/<p>\s*<\/p>/g,"");
}
let pila = ["inicio"];
function responder(q, ctx){
  if (ctx) { estado.conv = ctx; }
  const keep = estado.carrera; estado.carrera = null;
  let r = respuestaDirecta(q);
  if (!r) r = mdLite(respuestaLocal(q).split("\n"));
  estado.carrera = keep;
  return limpiar(r);
}
function verMenu(){
  const id = pila[pila.length-1], m = MENU(id);
  const ruta = pila.map(x=>MENU(x).t).join(" › ");
  $("#chips").className = "chips menu"; $("#msgs").appendChild($("#chips"));
  $("#chips").innerHTML = (pila.length>1?`<div class="ruta">${esc(ruta)}</div>`:"") + m.op.map((o,i)=>`<button class="chip" data-i="${i}">${esc(o.t)}</button>`).join("") +
    (pila.length>1 ? `<div class="nav"><button class="chip" data-nav="back">⬅ Volver</button><button class="chip" data-nav="home">🏠 Menú principal</button></div>` : "");
  const ctxEl=$("#ctx"); const c = id.startsWith("car:") ? carrera(id.split(":")[1]) : null;
  if (c) { ctxEl.hidden=false; ctxEl.innerHTML=`Hablando de: <strong>${esc(corto(c.nombre))}</strong>`; } else ctxEl.hidden=true;
}
function elegir(o){
  activo(); burbuja(esc(o.t.replace(/^[^\p{L}\p{N}¿¡]+/u,"")), "user");
  if (o.go) { pila.push(o.go); const m = MENU(o.go); const html = m.introQ ? responder(m.introQ, m.ctx) : m.intro; if (html) burbuja(html,"bot"); }
  else { burbuja(o.html ? limpiar(o.html()) : responder(o.q, o.ctx), "bot"); }
  sonar(); verMenu(); const bots=[...document.querySelectorAll("#msgs .m.bot")]; const last=bots[bots.length-1];
  const box=$("#msgs"); if (last) box.scrollTop = last.offsetTop - box.offsetTop - 60; else box.scrollTop=1e9;
}
function setChips(){
  if (estado.carrera) { pila = ["inicio","sedes","sede:"+carrera(estado.carrera).sede,`tipo:${carrera(estado.carrera).sede}:${carrera(estado.carrera).tipo}`,"car:"+estado.carrera]; }
  else if (estado.sede) { pila = ["inicio","sedes","sede:"+estado.sede]; }
  else pila = ["inicio"];
  verMenu();
}
function respuestaDirecta(q){
  { const ch = charla(q); if (ch) { ultimoSig = ch.sig; return ch.r; } }
  const n0 = norm(q), n = formas(n0), sd = sedeEn(n0), rel = relevantes(q);
  if (/^(hola|buenas|buen dia|buenas tardes|buenas noches|hey|que tal)\b[\s!?.]*$/.test(n0.trim()))
    return `<p>¡Hola! 😊 Preguntame lo que quieras sobre las carreras del IES N°10: qué carreras hay, requisitos, materias, horarios o de qué se trabaja.</p>`;
  if (/gracias|genial|buenisimo|joya/.test(n0) && n0.length<25) return `<p>¡De nada! Si querés, preguntame por otra carrera. 🙌</p>`;
  if (/cuanto cuesta|cuota|arancel|se paga|es gratis|gratuit|precio|matricula|es pago/.test(n) && !/colectivo|boleto|begu|viaj|transporte|pasaje/.test(n))
    return `<p>El IES N°10 es un instituto público de la provincia de Jujuy. En los documentos oficiales <strong>no figura ningún arancel</strong>. Para saber si hay algún aporte (cooperadora, materiales), consultá en secretaría.</p>`;
  if (/tecnicatura|tecnico superior|tecnicos/.test(n) && !/diferencia|que es (una |la )?tecnicatura/.test(n) && !rel.filter(c=>!/tecnicatura|tecnico/.test(norm(c.nombre)) || n0.split(" ").length>3).length && n0.split(" ").length<=5)
    return listaCarreras(CARRERAS.filter(c=>c.tipo==="tecnicatura"), "Tecnicaturas del IES N°10");
  if (sd && sd!=="lgsm" && !rel.length && !(carreraConv(q) && /esta|dicta|hay|tiene|tambien|se da/.test(n0)) && n0.split(" ").length<=5 && !/carrera|horario|hora|turno|cursa|donde|direcc|queda|ubic/.test(n)) { const s = sede(sd);
    return `<p><strong>${esc(s.nombre)}</strong> (${esc(s.lugar)})</p><ul><li><strong>Dirección:</strong> ${esc(s.dir)}</li><li><strong>Horario:</strong> ${esc(s.horario)}</li></ul>` + listaCarreras(CARRERAS.filter(c=>c.sede===sd), "Carreras de esta sede"); }
  if (/docente|profesorado|\bprofe\b|profesor|ensenar|maestr|dar clases/.test(n) && !/tecnicatura|tecnico|residencia|practica|que es/.test(n) && !rel.length && !/diferencia|que es (una |la )?tecnicatura/.test(n))
    return listaCarreras(CARRERAS.filter(c=>c.tipo==="profesorado"), "Profesorados del IES N°10 (para ser docente)");
  if (sd && /carrera|que hay|oferta|estudiar/.test(n) && !rel.length) {
    if (sd==="lgsm") return listaCarreras(CARRERAS.filter(c=>SEDES_DE(sd).includes(c.sede)), "Carreras en Libertador Gral. San Martín (Sede Comercial N°4 y Sede Escuela Normal)");
    const s = sede(sd); return listaCarreras(CARRERAS.filter(c=>c.sede===sd), `Carreras en ${s.nombre}`) + `<p class="t-note">📍 ${esc(s.dir)} · 🕒 ${esc(s.horario)}</p>`; }
  if (sd==="lgsm" && /horario|hora|turno|cursa|donde|direcc|queda/.test(n) && !rel.length && !carreraConv(q))
    return `<p><strong>Sedes en Libertador Gral. San Martín</strong></p><ul>${SEDES_DE(sd).map(id=>{const s=sede(id); return `<li><strong>${esc(s.nombre)}</strong>: ${esc(s.dir)} · 🕒 ${esc(s.horario)}</li>`;}).join("")}</ul>`;
  if (sd && sd!=="lgsm" && /horario|hora|turno|cursa/.test(n) && !rel.length) { const s = sede(sd);
    return `<p><strong>${esc(s.nombre)}</strong></p><ul><li><strong>Horario:</strong> ${esc(s.horario)}</li><li><strong>Dirección:</strong> ${esc(s.dir)} (${esc(s.lugar)})</li></ul>`; }
  if (sd && sd!=="lgsm" && /donde|direcc|queda|ubic/.test(n) && !rel.length) { const s = sede(sd);
    return `<p><strong>${esc(s.nombre)}</strong>: ${esc(s.dir)} (${esc(s.lugar)}).</p><p class="t-note">🕒 ${esc(s.horario)}</p>`; }
  // --- seguimientos sobre la carrera de la conversación ---
  const cc = carreraConv(q);
  if (cc && (/otra sede|otras sedes|en que sedes?|cuales sedes|solo (se dicta|esta|hay) en|tambien (esta|hay|se dicta)|se dicta en|donde mas|en otro lado|en otro lugar/.test(n) || (sd && /esta|hay|dicta|tienen|tambien/.test(n)))) {
    const mismas = CARRERAS.filter(x => x.id===cc.id || norm(x.nombre)===norm(cc.nombre));
    const s = sede(cc.sede);
    if (sd==="lgsm") return SEDES_DE(sd).includes(cc.sede) ? `<p>Sí: <strong>${esc(cc.nombre)}</strong> se dicta en Libertador Gral. San Martín, en la <strong>${esc(s.nombre)}</strong>.</p><p class="t-note">📍 ${esc(s.dir)} · 🕒 ${esc(horarioDe(cc))}</p>`
      : `<p>No: <strong>${esc(cc.nombre)}</strong> no se dicta en Libertador Gral. San Martín. Está en <strong>${esc(s.nombre)}</strong> (${esc(s.lugar)}).</p><p class="t-note">📍 ${esc(s.dir)} · 🕒 ${esc(horarioDe(cc))}</p>`;
    if (sd && sd!==cc.sede) return `<p>No: <strong>${esc(cc.nombre)}</strong> no se dicta en ${esc(sede(sd).nombre)}. Solo está en <strong>${esc(s.nombre)}</strong> (${esc(s.lugar)}).</p><p class="t-note">📍 ${esc(s.dir)} · 🕒 ${esc(horarioDe(cc))}</p>` + listaCarreras(CARRERAS.filter(x=>x.sede===sd), `Lo que sí hay en ${sede(sd).nombre}`);
    if (sd && sd===cc.sede) return `<p>Sí: <strong>${esc(cc.nombre)}</strong> se dicta en <strong>${esc(s.nombre)}</strong>.</p><p class="t-note">📍 ${esc(s.dir)} · 🕒 ${esc(horarioDe(cc))}</p>`;
    return `<p><strong>${esc(cc.nombre)}</strong> se dicta ${mismas.length>1?"en estas sedes":"<strong>solo en "+esc(s.nombre)+"</strong> ("+esc(s.lugar)+")"}. No está en otras sedes del IES N°10.</p><p class="t-note">📍 ${esc(s.dir)} · 🕒 ${esc(horarioDe(cc))}</p>`;
  }
  if (/(que|cuales|cual|cuantas)\b.*\b(materias?|se)\b.*\b(promocion\w*|final(es)?)\b|\b(promocion\w*|final(es)?)\b.*\b(materias?)\b|se (pueden )?promocionar|van a final|son promocionables?|\bmaterias?\b.*\b(promocion\w*|final(es)?)\b|regimen de aprobacion/.test(n) && !/que es (la )?promocion|nota|asistencia|porcentaje|faltas/.test(n)) {
    const c2 = rel[0] || cc;
    if (c2) { ultimoSig = ["¿Qué nota necesito para promocionar?","¿Cuántas faltas puedo tener?","Sus materias"]; return regimenDe(c2); }
    return `<p>Depende de la carrera: algunas materias van <strong>solo a examen final</strong>, las prácticas <strong>solo por promoción</strong> y el resto admite las dos. ¿De qué carrera querés saberlo?</p>`;
  }
  if (cc && /presencial|virtual|a distancia|online|modalidad/.test(n))
    return `<p><strong>${esc(cc.nombre)}</strong> es <strong>presencial</strong>, en ${esc(sede(cc.sede).nombre)}.</p><p class="t-note">🕒 ${esc(sede(cc.sede).horario)}</p>`;
  if (cc && /cuantas materias|cantidad de materias/.test(n)) { const pl = planDe(cc); if (pl.length)
    return `<p><strong>${esc(cc.nombre)}</strong> tiene <strong>${pl.reduce((s,a)=>s+a.materias.length,0)} materias</strong> en ${pl.length} años:</p><ul>${pl.map(a=>`<li>${a.anio}° año: ${a.materias.length} materias</li>`).join("")}</ul><p class="t-note">Preguntame "sus materias" para ver la lista.</p>`; }
  if (cc && /practica|pasantia/.test(n) && !/que (es|son)|como son/.test(n)) { const cur = cc.md.split("\n").filter(l=>/Práctica|Prácticas|PP I|Residencia/i.test(l) && /hs|año/i.test(l)).slice(-2);
    return `<p>Sí, <strong>${esc(cc.nombre)}</strong> tiene <strong>prácticas profesionalizantes</strong> desde la cursada${cc.tipo==="profesorado"?", y en 4° año la Residencia Pedagógica en escuelas":""}.</p>${cur.length?`<ul>${cur.map(l=>`<li>${esc(l.replace(/^[-\s]*/,"").slice(0,160))}</li>`).join("")}</ul>`:""}`; }
  { const c3 = rel[0]||cc; if (c3 && CORR[c3.id] && /\b(cursar|rendir|cursarla|rendirla)\b/.test(n) && CORR[c3.id].some(r=>norm(r[1]).length>3 && n.includes(norm(r[1])))) { ultimoSig=["Correlatividades","¿Qué es regularizar una materia?","Sus materias"]; return correlDe(c3, q); } }
  if ((rel[0]||cc) && /correlativ|que (necesito|tengo que tener|hace falta|debo tener) (para|pa) (cursar|rendir)|para (poder )?(cursar|rendir) .*(necesito|tengo que)|que materias necesito|requisitos? (para|de) (cursar|rendir)/.test(n) && !/^que (es|son) (las )?correlativ/.test(n.trim())) { ultimoSig=["¿Qué es regularizar una materia?","¿Qué materias se promocionan?","Sus materias"]; return correlDe(rel[0]||cc, q); }
  if ((rel[0]||cc) && /(se )?abre|abren|esta abierta|sigue abierta|hay inscripcion (para|en|el)|cohorte|implementaci|se dicta (este|el proximo|el ano que viene)|el ano que viene|proximo ano|2027/.test(n) && !/preinscripcion|cuando/.test(n)) { ultimoSig=["¿Cuándo son las inscripciones?","¿Qué necesito para inscribirme?","¿Tiene validez nacional?"]; return implDe(rel[0]||cc); }
  if ((rel[0]||cc) && /resolucion|resoluciones|normativa|documentos? oficial|diseno curricular|papeles oficiales|donde (veo|leo|esta) el plan|pdf/.test(n)) { ultimoSig=["¿Tiene validez nacional?","Correlatividades","Sus materias"]; return docsDe(rel[0]||cc); }
  if ((rel[0]||cc) && /validez|nacional|sirve en todo el pais|en otra provincia|reconocid|oficial|sirve el titulo|vale el titulo/.test(n) && !/que es|que significa/.test(n)) { ultimoSig=["¿Qué es la validez nacional?","¿Puedo seguir en la universidad?","Sus materias"]; return validezDe(rel[0]||cc); }
  for (const f of FAQ) { if (f.sinCarrera && (rel[0]||cc)) continue; if (f.re.test(n)) { ultimoSig = f.sig || null; return f.r; } }
  if (/que es (el |la |un )?edi|espacio de definicion/.test(n))
    return `<p><strong>EDI</strong> significa <strong>Espacio de Definición Institucional</strong>: una materia cuyo tema lo elige el instituto según las necesidades de la carrera y la región.</p>`;
  if (/que es (el |la )?(udi|unidad de definicion)/.test(n))
    return `<p><strong>UDI</strong> es la <strong>Unidad Curricular de Definición Institucional</strong> de los profesorados: el tema lo define el instituto.</p>`;
  if (/que es (una |la )?tecnicatura|diferencia entre (una )?tecnicatura y (un )?profesorado|tecnicatura o profesorado/.test(n))
    return `<p><strong>Tecnicatura superior:</strong> carrera de 3 años que forma para trabajar en un área técnica o profesional.</p><p><strong>Profesorado:</strong> carrera de 4 años (Ciencias de la Educación, 5) que forma para dar clases en el nivel que corresponda.</p><p class="t-note">En el IES N°10 hay ${CARRERAS.filter(c=>c.tipo==="tecnicatura").length} tecnicaturas y ${CARRERAS.filter(c=>c.tipo==="profesorado").length} profesorados.</p>`;
  if (/\bdura\b|duracion|cuantos? anos|cuanto tiempo/.test(n) && !/hora catedra|una hora|las clases|cada clase/.test(n)) { const c = carreraConv(q);
    if (c) return `<p><strong>${esc(c.nombre)}</strong> dura <strong>${c.anios} años</strong>.</p><p class="t-note">${esc(c.tipo==="profesorado"?"Profesorado":"Tecnicatura Superior")} · ${esc(sede(c.sede).nombre)}</p>`; }
  if (/titulo|me dan|me recibo de/.test(n)) { const c = carreraConv(q); if (c) { const l = c.md.split("\n").find(x=>/^\s*-\s*(Título|Título que otorga)/i.test(x));
    if (l) return `<p><strong>${esc(c.nombre)}</strong></p><p>🎓 ${esc(l.replace(/^\s*-\s*/,"").replace(/ · .*$/,""))}</p>`; } }
  const pideHoras = /cuantas horas|carga horaria|horas catedra|horas tiene|horas por semana/.test(n);
  if (/materia|plan de estudio|que se estudia|que voy a estudiar|asignatura/.test(n) || (pideHoras && (estado.carrera || relevantes(q).length))) {
    const c = estado.carrera ? (relevantes(q)[0] || carrera(estado.carrera)) : carreraConv(q);
    if (!c) return null;
    const anio = anioPedido(n), horas = pideHoras || /hora|catedra/.test(n), tb = tablaPlan(c,{anio,horas});
    if (!tb) return `<p>No tengo el plan de estudio de <strong>${esc(c.nombre)}</strong> en los documentos oficiales. Consultá en secretaría.</p>`;
    return `<p><strong>${esc(c.nombre)}</strong>${anio?` · ${anio}° año`:""}</p>${tb}<p class="t-note">${horas?"Horas cátedra semanales. ":""}Fuente: Diseño Curricular Res. ${esc(c.res)}.</p>${REGIMEN[c.id]?"":`<p class="t-note">Cómo se aprueba cada materia (promoción o examen final) no figura materia por materia en el diseño de esta carrera${c.tipo==="profesorado"?" (el diseño de los profesorados solo indica el formato: materia, taller, seminario o práctica, y remite al Régimen Académico provincial)":""}. Consultá en la secretaría de tu sede qué materias se aprueban por promoción y cuáles por examen final.</p>`}`;
  }
  if (/que carreras|carreras hay|oferta|todas las carreras/.test(n) && !relevantes(q).length) {
    const corto = s => s.replace(/^Tec\. Sup\. en /,"").replace(/^Prof\. de /,"").replace(/^Educación /,"Educ. ");
    const ss = estado.sede ? [sede(estado.sede)] : SEDES;
    return `<p><strong>Carreras del IES N°10</strong>${estado.sede?" · "+esc(sede(estado.sede).nombre):""}</p><table class="plan"><thead><tr><th>Carrera</th><th>Tipo</th><th>Años</th></tr></thead><tbody>` +
      ss.map(s => `<tr class="yr"><td colspan="3">${esc(s.nombre)}</td></tr>` + CARRERAS.filter(c=>c.sede===s.id).sort((a,b)=>a.tipo>b.tipo?-1:a.tipo<b.tipo?1:a.nombre.localeCompare(b.nombre))
        .map(c=>`<tr><td>${esc(corto(c.nombre))}</td><td class="n">${c.tipo==="profesorado"?"Profesorado":"Tecnicatura"}</td><td class="n">${c.anios}</td></tr>`).join("")).join("") +
      `</tbody></table><p class="t-note">Preguntame por cualquiera para ver requisitos, materias o salida laboral.</p>`;
  }
  const conv = estado.carrera || estado.conv;
  if (/horario|a que hora|que hora/.test(n) && !relevantes(q).length && conv && !/horarios|cada sede|todas las sedes/.test(n)) {
    const c = carrera(conv), s = sede(c.sede), cur = (secciones(c.md).secs.find(x=>/^cursado/i.test(x.t))||{lines:[]}).lines.join(" ").trim();
    return `<p><strong>${esc(c.nombre)}</strong></p><ul><li><strong>Sede:</strong> ${esc(s.nombre)} (${esc(s.lugar)})</li><li><strong>Horario:</strong> ${esc(horarioDe(c))}</li>${cur?`<li><strong>Turno:</strong> ${esc(cur)}</li>`:""}</ul>`;
  }
  if (/horario|a que hora|que hora/.test(n) && !relevantes(q).length)
    return `<p><strong>Horarios de cursado</strong> (lunes a viernes)</p><table class="plan"><thead><tr><th>Sede</th><th>Horario</th></tr></thead><tbody>${SEDES.map(s=>`<tr><td>${esc(s.nombre)}</td><td>${esc(s.horario.replace(/^Lunes a viernes\s*(·\s*)?(de\s)?/,""))}</td></tr>`).join("")}</tbody></table>`;
  if (/sedes|donde quedan|direccion/.test(n) && !estado.carrera && !relevantes(q).length)
    return `<p><strong>Sedes del IES N°10</strong></p><table class="plan"><thead><tr><th>Sede</th><th>Dirección</th></tr></thead><tbody>${SEDES.map(s=>`<tr><td>${esc(s.nombre)}<br><small>${esc(s.lugar)}</small></td><td>${esc(s.dir)}</td></tr>`).join("")}</tbody></table>`;
  if (/papeles|requisit|que necesito|documentacion|inscribirme/.test(n) && !/cuando/.test(n))
    return `<p><strong>Papeles para inscribirte</strong> (todas las carreras):</p><ul>${REQUISITOS.map(r=>`<li>${esc(r)}</li>`).join("")}</ul><p><strong>Cuándo:</strong> ${esc(CALENDARIO)}</p>`;
  if (/cuando|fecha|preinscrip/.test(n) || /ingreso|examen|cupo/.test(n))
    return `<p><strong>Inscripción</strong></p><ul><li>Preinscripción: <strong>diciembre</strong>, online en <a href="https://nexo.jujuy.edu.ar:4200/#/auth/login" target="_blank" rel="noopener"><strong>NEXO</strong></a></li><li>Confirmación (inscripción definitiva): <strong>febrero y marzo</strong></li></ul><p><strong>Ingreso:</strong> ${esc(INGRESO)}</p><p class="t-note">Los días exactos se consultan en secretaría.</p>`;
  return null;
}

let ultimoSig = null;
/* ---------- Botón «Consultar al asistente» de cada ficha de carrera ---------- */
function consultar(texto){
  activo(); burbuja(esc(texto), "user");
  burbuja(respuestaDirecta(texto) || mdLite(respuestaLocal(texto).split("\n")), "bot");
  sonar(); $("#msgs").scrollTop = 1e9;
}

/* ---------- Modo muestra: reinicio automático ---------- */
let tInactivo;
function minutos(){ const v=parseFloat(store.get("idle_min", MINUTOS_REINICIO)); return isNaN(v)?MINUTOS_REINICIO:v; }
function activo(){ clearTimeout(tInactivo); const m=minutos(); if (m>0) tInactivo=setTimeout(()=>{ reiniciar(); toast("Listo para la próxima persona 👋"); }, m*60000); }
["click","keydown","touchstart"].forEach(ev=>document.addEventListener(ev, activo, {passive:true}));
function reiniciar(){ if (typeof cerrarChat==="function") { teaserOff=false; cerrarChat(); } estado.conv=null; estado.sede=null; estado.tipo="todas"; estado.carrera=null; $("#ctx").hidden=true; render(); setChips(); bienvenida(); window.scrollTo({top:0}); }
$("#btnReset").onclick = reiniciar;
/* Botones ocultos: tocá 5 veces seguidas el logo de arriba (o Ctrl+Alt+A) para mostrarlos; se esconden solos a los 15 s */
(() => { let toques=0, tt=null, oculto=null; const bar=document.querySelector(".top-actions");
  const mostrar=()=>{ bar.classList.add("show"); clearTimeout(oculto); oculto=setTimeout(()=>bar.classList.remove("show"),15000); };
  $("#logo").addEventListener("click",()=>{ toques++; clearTimeout(tt); tt=setTimeout(()=>toques=0,1500); if(toques>=5){ toques=0; mostrar(); } });
  document.addEventListener("keydown",e=>{ if(e.ctrlKey&&e.altKey&&e.key.toLowerCase()==="a") mostrar(); });
})();

/* ---------- Configuración ---------- */
$("#btnCfg").onclick = () => { $("#idle").value = minutos(); $("#snd").checked = store.get("sonido","1")==="1"; $("#modal").classList.add("on"); };
$("#cfgCancel").onclick = () => $("#modal").classList.remove("on");
$("#cfgSave").onclick = () => { store.set("idle_min", $("#idle").value||"0"); store.set("sonido", $("#snd").checked?"1":"0"); $("#modal").classList.remove("on"); toast("Configuración guardada"); activo(); };

/* ---------- Lanzador flotante, burbuja y sonido ---------- */
const TEASERS = ["¿Te ayudo a elegir una carrera?","¿Qué carreras hay en cada sede?","¿Qué necesito para inscribirme?","¿No sabés qué estudiar? Te ayudo","Becas y boleto gratuito","¿Cómo es la cursada?"];
let tIdx = 0, teaserOff = false, tHop, tTeaser;
function chatAbierto(){ return $(".chat").classList.contains("open"); }
function abrirChat(){ $(".chat").classList.add("open"); $("#launcher").classList.add("open"); $("#teaser").classList.add("hide");  }
function cerrarChat(){ $(".chat").classList.remove("open","big"); $("#launcher").classList.remove("open"); if(!teaserOff) $("#teaser").classList.remove("hide"); }
$("#launcher").onclick = () => chatAbierto() ? cerrarChat() : abrirChat();
$("#btnClose").onclick = cerrarChat;
$("#btnBig").onclick = () => $(".chat").classList.toggle("big");
$("#teaser").onclick = e => { if (e.target.id==="teaserX"){ e.stopPropagation(); teaserOff=true; $("#teaser").classList.add("hide"); return; } abrirChat(); };
function rotarTeaser(){ const el=$("#teaser"); el.classList.add("fade"); setTimeout(()=>{ tIdx=(tIdx+1)%TEASERS.length; $("#teaserTxt").textContent=TEASERS[tIdx]; el.classList.remove("fade"); },350); }
tTeaser = setInterval(()=>{ if(!chatAbierto() && !teaserOff) rotarTeaser(); }, 5000);
tHop = setInterval(()=>{ if(chatAbierto()) return; const l=$("#launcher"); l.classList.remove("hop"); void l.offsetWidth; l.classList.add("hop"); }, 6000);
let actx = null;
function sonar(){ if (store.get("sonido","1")!=="1") return; try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); const now=actx.currentTime;
  [[880,0],[1318.5,0.11]].forEach(([f,d])=>{ const o=actx.createOscillator(), g=actx.createGain(); o.type="sine"; o.frequency.value=f; g.gain.setValueAtTime(0.0001,now+d); g.gain.exponentialRampToValueAtTime(0.22,now+d+0.02); g.gain.exponentialRampToValueAtTime(0.0001,now+d+0.35); o.connect(g).connect(actx.destination); o.start(now+d); o.stop(now+d+0.4); }); }catch(e){} }
reiniciar(); activo();
setTimeout(()=>{ const l=$("#launcher"); l.classList.add("hop"); }, 900);
