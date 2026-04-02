
/* ═══════════════════════════════
   STATE
═══════════════════════════════ */
const API = '';
let currentJob = null;
let pollTimer  = null;
let historyDB  = JSON.parse(localStorage.getItem('cvr_history') || '[]');
let _ranking   = [];
let _topSkills = [];

/* ═══════════════════════════════
   THEME
═══════════════════════════════ */
(function() {
  const t = localStorage.getItem('cvr_theme') || 'dark';
  applyTheme(t);
})();

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const sw  = document.getElementById('theme-sw');
  const lbl = document.getElementById('theme-lbl');
  sw.classList.toggle('on', t === 'dark');
  lbl.textContent = t === 'dark' ? 'Modo oscuro' : 'Modo claro';
  localStorage.setItem('cvr_theme', t);
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ═══════════════════════════════
   NAV
═══════════════════════════════ */
const VIEW_TITLES = { upload:'Nuevo análisis', history:'Historial de análisis', results:'Resultados' };

function nav(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  const ni = document.querySelector(`[data-view="${v}"]`);
  if (ni) ni.classList.add('active');
  document.getElementById('page-title').textContent = VIEW_TITLES[v] || v;
  if (v === 'history') renderHistory();
}

/* ═══════════════════════════════
   UPLOAD
═══════════════════════════════ */
const fileInput   = document.getElementById('file-input');
const dropZone    = document.getElementById('drop-zone');
const ofertaInput = document.getElementById('oferta-input');
const btnSubmit   = document.getElementById('btn-submit');

function checkReady() {
  btnSubmit.disabled = !(fileInput.files.length && ofertaInput.value.trim().length > 10);
}
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) document.getElementById('drop-fname').textContent = '✓ ' + fileInput.files[0].name;
  checkReady();
});
ofertaInput.addEventListener('input', checkReady);
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f?.name.endsWith('.zip')) {
    const dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files;
    document.getElementById('drop-fname').textContent = '✓ ' + f.name;
    checkReady();
  } else toast('Solo se aceptan archivos .zip');
});

btnSubmit.addEventListener('click', async () => {
  const oferta = ofertaInput.value.trim();
  const file   = fileInput.files[0];
  if (!oferta || !file) return;
  btnSubmit.disabled = true;
  setBadge('ENVIANDO…');
  const fd = new FormData();
  fd.append('oferta', oferta);
  fd.append('file', file);
  try {
    const r = await fetch(`${API}/api/upload`, { method:'POST', body:fd });
    const d = await r.json();
    if (!r.ok) { toast(d.detail || 'Error'); btnSubmit.disabled = false; return; }
    currentJob = { id: d.job_id, oferta: oferta.slice(0,120), total: d.candidatos, ts: Date.now() };
    document.getElementById('prog-card').style.display = 'block';
    updateProg(0, d.candidatos);
    startPoll(d.candidatos);
  } catch { toast('No se pudo conectar'); btnSubmit.disabled = false; }
});

/* ═══════════════════════════════
   POLLING
═══════════════════════════════ */
function startPoll(total) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const r = await fetch(`${API}/api/status/${currentJob.id}`);
      const d = await r.json();
      updateProg(d.done||0, d.total||total);
      setBadge(`${d.done||0}/${d.total||total}`);
      if (d.status === 'done') { clearInterval(pollTimer); await loadResults(currentJob.id, currentJob.oferta, currentJob.ts); }
      if (d.status === 'error') { clearInterval(pollTimer); toast('Error: '+(d.error||'?')); setBadge('ERROR'); }
    } catch {}
  }, 1200);
}

function updateProg(done, total) {
  const pct = total ? done/total*100 : 0;
  document.getElementById('prog-fill').style.width = pct+'%';
  document.getElementById('prog-val').textContent  = `${done} / ${total}`;
}

async function loadResults(jobId, ofertaPreview, ts) {
  const r = await fetch(`${API}/api/results/${jobId}`);
  const d = await r.json();
  const entry = { jobId, ofertaPreview: ofertaPreview||d.oferta.descripcion, ts: ts||Date.now(), total:d.oferta.total_candidatos, data:d };
  historyDB = historyDB.filter(e => e.jobId !== jobId);
  historyDB.unshift(entry);
  localStorage.setItem('cvr_history', JSON.stringify(historyDB));
  updateHistBadge();
  document.getElementById('prog-card').style.display = 'none';
  renderResults(d);
  nav('results');
  setBadge('COMPLETADO');
}

function openHistEntry(jobId) {
  const e = historyDB.find(x => x.jobId === jobId);
  if (e) { renderResults(e.data); nav('results'); }
}

/* ═══════════════════════════════
   HISTORY
═══════════════════════════════ */
function updateHistBadge() {
  document.getElementById('hist-badge').textContent = historyDB.length || '';
}
updateHistBadge();

function renderHistory() {
  const el = document.getElementById('hist-content');
  if (!historyDB.length) {
    el.innerHTML = `<div class="hist-empty">
      <div class="hist-empty-icon">◫</div>
      <div class="hist-empty-txt">Sin análisis guardados.<br>Inicia uno en <b>Nuevo análisis</b>.</div>
    </div>`; return;
  }
  el.innerHTML = `<div class="hist-grid">${historyDB.map(e => {
    const sc = Object.values(e.data.ranking).map(c=>c.score);
    const avg = Math.round(sc.reduce((a,b)=>a+b,0)/sc.length);
    const d   = new Date(e.ts);
    const ds  = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    return `<div class="card hist-card" onclick="openHistEntry('${e.jobId}')">
      <div class="hist-head">
        <div class="hist-title">${esc(e.ofertaPreview.slice(0,48))}…</div>
        <div class="hist-date">${ds}</div>
      </div>
      <div class="hist-preview">${esc(e.ofertaPreview.slice(0,90))}…</div>
      <div class="hist-stats">
        <div><div class="hstat-val">${e.total}</div><div class="hstat-lbl">Candidatos</div></div>
        <div><div class="hstat-val">${avg}</div><div class="hstat-lbl">Score medio</div></div>
        <div><div class="hstat-val">${Math.max(...sc)}</div><div class="hstat-lbl">Score máx</div></div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

/* ═══════════════════════════════
   RESULTS
═══════════════════════════════ */
function scColor(s) {
  if (s>=75) return 'var(--accent)';
  if (s>=50) return 'var(--accent3)';
  if (s>=30) return 'var(--accent2)';
  return 'var(--text3)';
}
function rnumClass(i) { return ['gold','silver','bronze'][i]||''; }

function renderResults(data) {
  _ranking = Object.values(data.ranking);
  const scores = _ranking.map(c=>c.score);
  const avg    = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
  const max    = Math.max(...scores);
  const q60    = _ranking.filter(c=>c.score>=60).length;

  // Skills
  const sm = {};
  _ranking.forEach(c=>(c.habilidades||[]).forEach(s=>{
    const k=s.toLowerCase().trim(); if(k) sm[k]=(sm[k]||0)+1;
  }));
  _topSkills = Object.entries(sm).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Distribution
  const buckets = Array.from({length:10},(_,i)=>({
    lbl: i*10+'',
    cnt: scores.filter(s=>s>=i*10&&s<(i+1)*10).length
  }));
  const maxB = Math.max(...buckets.map(b=>b.cnt),1);

  const el = document.getElementById('results-content');
  el.innerHTML = `
    <div class="stat-row">
      ${[['Candidatos',_ranking.length],['Score medio',avg],['Score máximo',max],['Calificados ≥60',q60]]
        .map(([l,v],i)=>`<div class="card stat-box" style="animation-delay:${i*40}ms">
          <div class="stat-val">${v}</div><div class="stat-lbl">${l}</div></div>`).join('')}
    </div>

    <div class="results-grid">

      <!-- TABLE -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:20px 22px 0"><div class="card-title">Ranking de candidatos</div></div>
        <table class="rank-table">
          <thead><tr><th>#</th><th>Candidato</th><th>Score</th><th>Habilidades</th></tr></thead>
          <tbody>
            ${_ranking.map((c,i)=>`
              <tr onclick="openDrawer(${i})">
                <td><div class="rnum ${rnumClass(i)}">${i+1}</div></td>
                <td><div class="rname">${esc(c.nombre||c.id)}</div><div class="rrole">${esc(c.puesto||'—')}</div></td>
                <td><div class="score-cell">
                  <div class="score-track"><div class="score-fill" data-w="${c.score}" style="width:0;background:${scColor(c.score)}"></div></div>
                  <div class="score-num" style="color:${scColor(c.score)}">${c.score}</div>
                </div></td>
                <td>${(c.habilidades||[]).slice(0,3).map(h=>`<span class="skill-pill ${i<3?'hi':''}">${esc(h)}</span>`).join('')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- SIDEBAR -->
      <div class="rsidebar">

        <!-- RADAR -->
        <div class="card scard">
          <div class="card-title">Radar de habilidades</div>
          <div class="radar-wrap" id="radar-wrap">${buildRadar(_topSkills)}</div>
        </div>

        <!-- SKILL BARS -->
        <div class="card scard">
          <div class="card-title">Frecuencia de habilidades</div>
          ${_topSkills.map(([sk,cnt])=>{
            const maxSk = _topSkills[0][1];
            return `<div class="skbar-row">
              <div class="skbar-name">${esc(sk)}</div>
              <div class="skbar-track"
                onmouseenter="tip(event,'${esc(sk)}: ${cnt} candidatos')"
                onmousemove="tipMove(event)" onmouseleave="tipOff()">
                <div class="skbar-fill" data-w="${(cnt/maxSk)*100}" style="width:0"></div>
              </div>
              <div class="skbar-cnt">${cnt}</div>
            </div>`;
          }).join('')}
        </div>

        <!-- DIST -->
        <div class="card scard">
          <div class="card-title">Distribución de scores</div>
          <div class="dist-wrap">
            ${buckets.map(b=>`
              <div class="dist-col">
                <div class="dist-bar"
                  style="height:${Math.max(3,(b.cnt/maxB)*52)}px;background:${b.cnt?'var(--accent)':'var(--bg3)'}"
                  onmouseenter="tip(event,'${b.lbl}–${+b.lbl+9}: ${b.cnt} candidatos')"
                  onmousemove="tipMove(event)" onmouseleave="tipOff()"></div>
                <div class="dist-lbl">${b.lbl}</div>
              </div>`).join('')}
          </div>
        </div>

        <!-- OFERTA -->
        <div class="card scard">
          <div class="card-title">Oferta evaluada</div>
          <div style="font-size:13px;color:var(--text2);line-height:1.7;border-left:2px solid var(--accent);padding-left:12px">
            ${esc(data.oferta.descripcion)}
          </div>
        </div>

      </div>
    </div>`;

  // Animate fills
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.score-fill[data-w]').forEach(el => { el.style.width = el.dataset.w+'%'; });
      document.querySelectorAll('.skbar-fill[data-w]').forEach(el => { el.style.width = el.dataset.w+'%'; });
    }, 60);
    initRadar();
  });
}

/* ═══════════════════════════════
   RADAR SVG
═══════════════════════════════ */
function buildRadar(skills) {
  if (!skills.length) return `<div style="text-align:center;padding:30px;color:var(--text3);font-size:13px">Sin datos</div>`;

  const n  = skills.length;
  const cx = 130, cy = 130, R = 88;
  const ang = i => Math.PI*2*i/n - Math.PI/2;
  const pt  = (i, r) => [cx + r*Math.cos(ang(i)), cy + r*Math.sin(ang(i))];
  const maxVal = skills[0][1];

  // Grid (4 levels)
  let grid = '';
  for (let l=1; l<=4; l++) {
    const r  = R*l/4;
    const ps = Array.from({length:n},(_,i)=>pt(i,r).join(',')).join(' ');
    grid += `<polygon points="${ps}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
  }

  // Axis lines
  let axes = Array.from({length:n},(_,i)=>{
    const [x,y] = pt(i,R);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`;
  }).join('');

  // Data polygon
  const dataPts    = skills.map(([,c],i) => pt(i, R*(c/maxVal)));
  const dataPoly   = dataPts.map(p=>p.join(',')).join(' ');

  // Inner translucent polygon (~40% scale — shows relative position toward center)
  const innerPts   = skills.map(([,c],i) => pt(i, R*(c/maxVal)*0.4));
  const innerPoly  = innerPts.map(p=>p.join(',')).join(' ');

  // Labels
  const labels = Array.from({length:n},(_,i)=>{
    const [x,y] = pt(i, R+20);
    const anchor = x < cx-4 ? 'end' : x > cx+4 ? 'start' : 'middle';
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle"
      class="radar-label" data-idx="${i}" style="cursor:pointer">${esc(skills[i][0].slice(0,13))}</text>`;
  }).join('');

  // Dots
  const dots = dataPts.map(([x,y],i)=>`
    <circle cx="${x}" cy="${y}" r="4.5" fill="var(--accent)"
      stroke="var(--card)" stroke-width="2"
      class="radar-dot" data-idx="${i}" style="cursor:pointer"/>`).join('');

  return `<svg class="radar-svg" viewBox="0 0 260 260" width="260" height="260" id="radar-svg">
    ${grid}${axes}
    <polygon points="${innerPoly}"
      fill="var(--accent)" fill-opacity=".07"
      stroke="var(--accent)" stroke-opacity=".25"
      stroke-width="1" stroke-dasharray="4 3"/>
    <polygon points="${dataPoly}"
      fill="var(--accent)" fill-opacity=".15"
      stroke="var(--accent)" stroke-width="2"
      id="radar-poly"/>
    ${dots}${labels}
  </svg>`;
}

function initRadar() {
  const svg = document.getElementById('radar-svg');
  if (!svg) return;

  // Animate polygon drawing via stroke-dasharray trick
  const poly = document.getElementById('radar-poly');
  if (poly) {
    const len = poly.getTotalLength ? poly.getTotalLength() : 600;
    poly.style.strokeDasharray  = len;
    poly.style.strokeDashoffset = len;
    poly.style.transition = 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)';
    requestAnimationFrame(() => { poly.style.strokeDashoffset = '0'; });
  }

  // Tooltips on dots + labels
  svg.querySelectorAll('.radar-dot, .radar-label').forEach(el => {
    const i = +el.getAttribute('data-idx');
    const [sk, cnt] = _topSkills[i] || [];
    if (!sk) return;
    el.addEventListener('mouseenter', e => tip(e, `${sk}: ${cnt} candidatos`));
    el.addEventListener('mousemove',  tipMove);
    el.addEventListener('mouseleave', tipOff);
  });
}

/* ═══════════════════════════════
   DRAWER
═══════════════════════════════ */
function openDrawer(idx) {
  const c   = _ranking[idx];
  const col = scColor(c.score);
  document.getElementById('drawer-content').innerHTML = `
    <div class="drawer-rank">PUESTO ${idx+1} DE ${_ranking.length}</div>
    <div class="drawer-name">${esc(c.nombre||c.id)}</div>
    <div class="drawer-role">${esc(c.puesto||'—')}</div>
    <div class="drawer-score" style="color:${col}">${c.score}</div>
    <div class="drawer-score-sub">puntos sobre 100</div>
    <div class="dsec"><div class="dsec-lbl">Razón del score</div><div class="dsec-val">${esc(c.razon||'—')}</div></div>
    <div class="dsec"><div class="dsec-lbl">Experiencia</div><div class="dsec-val">${esc(c.experiencia||'—')}</div></div>
    <div class="dsec"><div class="dsec-lbl">Educación</div><div class="dsec-val">${esc(c.educacion||'—')}</div></div>
    <div class="dsec">
      <div class="dsec-lbl">Habilidades</div>
      <div style="margin-top:6px">${(c.habilidades||[]).map(h=>`<span class="skill-pill hi">${esc(h)}</span>`).join('')||'—'}</div>
    </div>
    ${c.error?`<div class="dsec" style="color:var(--accent2)">⚠ ${esc(c.error)}</div>`:''}`;
  document.getElementById('drawer').classList.add('open');
  document.getElementById('overlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

/* ═══════════════════════════════
   TOOLTIP
═══════════════════════════════ */
const gTip = document.getElementById('g-tip');
function tip(e, txt) { gTip.textContent = txt; gTip.classList.add('on'); tipMove(e); }
function tipMove(e)   { gTip.style.left = (e.clientX+14)+'px'; gTip.style.top = (e.clientY-10)+'px'; }
function tipOff()     { gTip.classList.remove('on'); }
document.addEventListener('mousemove', e => { if (gTip.classList.contains('on')) tipMove(e); });

/* ═══════════════════════════════
   TOAST / STATUS / UTILS
═══════════════════════════════ */
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 3000);
}
function setBadge(t) { document.getElementById('status-badge').textContent = t; }
function esc(s='') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
