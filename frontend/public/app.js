/* ═══════════════════════════════════════════
   CV RANKER — app.js v3
   Con autenticación JWT completa
═══════════════════════════════════════════ */

/* ─── CONFIG ─── */
const API = '';

/* ─── AUTH ─────────────────────────────────────────────────── */
function getToken()          { return localStorage.getItem('cvr_token'); }
function getUsername()       { return localStorage.getItem('cvr_username'); }
function setAuth(token, username) {
  localStorage.setItem('cvr_token', token);
  localStorage.setItem('cvr_username', username);
}
function clearAuth() {
  localStorage.removeItem('cvr_token');
  localStorage.removeItem('cvr_username');
}
function isLoggedIn() { return !!getToken(); }

/* Fetch con JWT automático */
async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + url, { ...options, headers });
  if (res.status === 401) {
    clearAuth();
    showLogin();
    throw new Error('Sesión expirada');
  }
  return res;
}

/* ─── STATE ─── */
let currentJob = null;
let pollTimer  = null;
let historyDB  = JSON.parse(localStorage.getItem('cvr_history') || '[]');
let _ranking   = [];
let _topSkills = [];

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem('cvr_theme') || 'dark');
  if (isLoggedIn()) {
    showApp();
    updateHistBadge();
  } else {
    showLogin();
  }
});

/* ─── LOGIN / LOGOUT VIEWS ─── */
function showLogin() {
  const loginEl = document.getElementById('login-screen');
  const shellEl = document.getElementById('shell');
  if (loginEl) loginEl.classList.remove('hidden');
  if (shellEl) shellEl.style.display = 'none';
  setTimeout(() => document.getElementById('login-username')?.focus(), 80);
}

function showApp() {
  const loginEl = document.getElementById('login-screen');
  const shellEl = document.getElementById('shell');
  if (loginEl) loginEl.classList.add('hidden');
  if (shellEl) shellEl.style.display = 'grid';
  const u = getUsername();
  const el = document.getElementById('user-display');
  if (el && u) el.textContent = u;
}

function logout() {
  clearAuth();
  historyDB = [];
  _ranking  = [];
  localStorage.removeItem('cvr_history');
  clearInterval(pollTimer);
  showLogin();
}

/* ─── LOGIN FORM ─── */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    const err      = document.getElementById('login-error');

    btn.disabled    = true;
    btn.textContent = 'Accediendo…';
    err.textContent = '';

    const fd = new FormData();
    fd.append('username', username);
    fd.append('password', password);

    try {
      const res  = await fetch(`${API}/api/login`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        err.textContent  = data.detail || 'Usuario o contraseña incorrectos';
        btn.disabled     = false;
        btn.textContent  = 'Iniciar sesión';
        return;
      }
      setAuth(data.access_token, data.username);
      showApp();
      updateHistBadge();
    } catch {
      err.textContent = 'No se pudo conectar con el servidor';
      btn.disabled    = false;
      btn.textContent = 'Iniciar sesión';
    }
  });
});
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const sw  = document.getElementById('theme-sw');
  const lbl = document.getElementById('theme-lbl');
  const ico = document.getElementById('theme-icon');
  const isDark = t === 'dark';
  if (sw)  sw.classList.toggle('on', isDark);
  if (sw)  sw.setAttribute('aria-checked', String(isDark));
  if (lbl) lbl.textContent = isDark ? 'Modo oscuro' : 'Modo claro';
  if (ico) {
    ico.innerHTML = isDark
      ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
           <path d="M12.5 8.5A5.5 5.5 0 015.5 1.5a5.5 5.5 0 107 7z"
                 stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
         </svg>`
      : `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
           <circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.3"/>
           <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M9.01 9.01l1.06 1.06M2.93 11.07l1.06-1.06M9.01 4.99l1.06-1.06"
                 stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
         </svg>`;
  }
  localStorage.setItem('cvr_theme', t);
}

function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ─── NAV ─── */
const VIEW_TITLES = {
  upload:  'Nuevo análisis',
  history: 'Historial de análisis',
  results: 'Resultados del análisis',
};

function nav(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
    el.removeAttribute('aria-current');
  });
  document.getElementById('view-' + v).classList.add('active');
  const ni = document.querySelector(`[data-view="${v}"]`);
  if (ni) { ni.classList.add('active'); ni.setAttribute('aria-current', 'page'); }
  document.getElementById('page-title').textContent = VIEW_TITLES[v] || v;
  if (v === 'history') renderHistory();
  document.getElementById('main-content')?.scrollTo(0, 0);
}

/* ─── UPLOAD ─── */
const fileInput   = document.getElementById('file-input');
const dropZone    = document.getElementById('drop-zone');
const ofertaInput = document.getElementById('oferta-input');
const btnSubmit   = document.getElementById('btn-submit');
const charCount   = document.getElementById('char-count');

function checkReady() {
  const len = ofertaInput?.value.trim().length || 0;
  if (btnSubmit) btnSubmit.disabled = !(fileInput?.files.length && len > 20);
  if (charCount) {
    charCount.textContent = len + ' caracteres';
    charCount.style.color = len > 20 ? 'var(--jade-500)' : 'var(--text-3)';
  }
}

ofertaInput?.addEventListener('input', checkReady);
fileInput?.addEventListener('change', () => {
  if (fileInput.files[0]) setDropReady(fileInput.files[0].name);
  checkReady();
});

dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone?.addEventListener('dragleave', e => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag');
});
dropZone?.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f?.name.toLowerCase().endsWith('.zip')) {
    const dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files;
    setDropReady(f.name); checkReady();
  } else { toast('Solo se aceptan archivos .zip'); }
});
dropZone?.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput?.click(); }
});

function setDropReady(name) {
  document.getElementById('drop-idle').hidden  = true;
  document.getElementById('drop-ready').hidden = false;
  document.getElementById('drop-fname').textContent = name;
}

btnSubmit?.addEventListener('click', async () => {
  if (!isLoggedIn()) { showLogin(); return; }
  const oferta = ofertaInput.value.trim();
  const file   = fileInput.files[0];
  if (!oferta || !file) return;

  btnSubmit.disabled = true;
  setStatus('Enviando…', 'running');

  const fd = new FormData();
  fd.append('oferta', oferta);
  fd.append('file', file);

  try {
    const r = await apiFetch('/api/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) { toast(d.detail || 'Error'); btnSubmit.disabled = false; setStatus('Error', 'error'); return; }
    currentJob = { id: d.job_id, oferta: oferta.slice(0, 140), total: d.candidatos, ts: Date.now() };
    document.getElementById('prog-card').style.display = 'block';
    updateProg(0, d.candidatos);
    startPoll(d.candidatos);
  } catch (err) {
    if (err.message !== 'Sesión expirada') toast('No se pudo conectar');
    btnSubmit.disabled = false;
    setStatus('Listo', 'idle');
  }
});

/* ─── POLLING ─── */
function startPoll(total) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const r = await apiFetch(`/api/status/${currentJob.id}`);
      const d = await r.json();
      updateProg(d.done || 0, d.total || total);
      setStatus(`${d.done || 0} / ${d.total || total}`, 'running');
      if (d.status === 'done')  { clearInterval(pollTimer); await loadResults(currentJob.id, currentJob.oferta, currentJob.ts); }
      if (d.status === 'error') { clearInterval(pollTimer); toast('Error: ' + (d.error || '?')); setStatus('Error', 'error'); }
    } catch { }
  }, 1200);
}

function updateProg(done, total) {
  const pct   = total ? done / total * 100 : 0;
  const fill  = document.getElementById('prog-fill');
  const val   = document.getElementById('prog-val');
  const track = fill?.parentElement;
  if (fill)  fill.style.width = pct + '%';
  if (val)   val.textContent  = `${done} / ${total}`;
  if (track) track.setAttribute('aria-valuenow', Math.round(pct));
}

async function loadResults(jobId, ofertaPreview, ts) {
  const r = await apiFetch(`/api/results/${jobId}`);
  const d = await r.json();
  const entry = {
    jobId,
    ofertaPreview: ofertaPreview || d.oferta.descripcion,
    ts:    ts || Date.now(),
    total: d.oferta.total_candidatos,
    data:  d,
  };
  historyDB = historyDB.filter(e => e.jobId !== jobId);
  historyDB.unshift(entry);
  localStorage.setItem('cvr_history', JSON.stringify(historyDB));
  updateHistBadge();
  document.getElementById('prog-card').style.display = 'none';
  renderResults(d);
  nav('results');
  setStatus('Completado', 'done');
}

function openHistEntry(jobId) {
  const e = historyDB.find(x => x.jobId === jobId);
  if (e) { renderResults(e.data); nav('results'); }
}

/* ─── HISTORY ─── */
function updateHistBadge() {
  const b = document.getElementById('hist-badge');
  if (b) b.textContent = historyDB.length || '';
}

function renderHistory() {
  const el = document.getElementById('hist-content');
  if (!historyDB.length) {
    el.innerHTML = `<div class="hist-empty">
      <span class="hist-empty-icon">◫</span>
      <p class="hist-empty-title">Sin análisis todavía</p>
      <p class="hist-empty-sub">Inicia uno en <strong>Nuevo análisis</strong> para verlo aquí.</p>
    </div>`;
    return;
  }
  el.innerHTML = `<div class="hist-grid">
    ${historyDB.map((e, i) => {
      const sc  = Object.values(e.data.ranking).map(c => c.score);
      const avg = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length);
      const d   = new Date(e.ts);
      const ds  = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
      return `<div class="card hist-card anim-in" style="animation-delay:${i * 50}ms"
        onclick="openHistEntry('${e.jobId}')" role="button" tabindex="0">
        <div class="hist-head">
          <div class="hist-title">${esc(e.ofertaPreview.slice(0, 52))}…</div>
          <div class="hist-date">${ds}</div>
        </div>
        <div class="hist-preview">${esc(e.ofertaPreview)}</div>
        <div class="hist-stats">
          <div><div class="hstat-val">${e.total}</div><div class="hstat-lbl">Candidatos</div></div>
          <div><div class="hstat-val">${avg}</div><div class="hstat-lbl">Score medio</div></div>
          <div><div class="hstat-val">${Math.max(...sc)}</div><div class="hstat-lbl">Score máx</div></div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
  el.querySelectorAll('.hist-card').forEach(card => {
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
  });
}

/* ─── RESULTS ─── */
function scColor(s) {
  if (s >= 75) return 'var(--score-hi)';
  if (s >= 50) return 'var(--score-mid)';
  if (s >= 30) return 'var(--accent)';
  return 'var(--score-lo)';
}
function rnumClass(i) { return ['gold', 'silver', 'bronze'][i] || ''; }

function renderResults(data) {
  _ranking = Object.values(data.ranking);
  const scores = _ranking.map(c => c.score);
  const avg    = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const max    = Math.max(...scores);
  const q60    = _ranking.filter(c => c.score >= 60).length;

  const sm = {};
  _ranking.forEach(c => (c.habilidades || []).forEach(s => {
    const k = s.toLowerCase().trim();
    if (k) sm[k] = (sm[k] || 0) + 1;
  }));
  _topSkills = Object.entries(sm).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const buckets = Array.from({ length: 10 }, (_, i) => ({
    lbl: i * 10 + '',
    cnt: scores.filter(s => s >= i * 10 && s < (i + 1) * 10).length,
  }));
  const maxB = Math.max(...buckets.map(b => b.cnt), 1);

  const el = document.getElementById('results-content');
  el.innerHTML = `
    <div class="stat-row">
      ${[['Candidatos', _ranking.length], ['Score medio', avg], ['Score máximo', max], ['Calificados ≥60', q60]]
        .map(([l, v], i) => `<div class="card stat-box anim-in" style="animation-delay:${i * 60}ms">
          <div class="stat-val">${v}</div><div class="stat-lbl">${l}</div></div>`).join('')}
    </div>
    <div class="results-grid">
      <div class="card table-card">
        <div class="table-card-header">
          <span class="table-card-title">Ranking de candidatos</span>
          <span class="table-card-count">${_ranking.length} evaluados</span>
        </div>
        <table class="rank-table">
          <thead><tr><th>#</th><th>Candidato</th><th>Score</th><th>Habilidades</th></tr></thead>
          <tbody>
            ${_ranking.map((c, i) => `
              <tr onclick="openDrawer(${i})" tabindex="0" role="button"
                  onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDrawer(${i})}">
                <td><div class="rnum ${rnumClass(i)}">${i + 1}</div></td>
                <td><div class="rname">${esc(c.nombre || c.id)}</div><div class="rrole">${esc(c.puesto || '—')}</div></td>
                <td><div class="score-cell">
                  <div class="score-track"><div class="score-fill" data-w="${c.score}" style="width:0%;background:${scColor(c.score)}"></div></div>
                  <div class="score-num" style="color:${scColor(c.score)}">${c.score}</div>
                </div></td>
                <td>${(c.habilidades || []).slice(0, 3).map(h => `<span class="skill-pill ${i < 3 ? 'hi' : ''}">${esc(h)}</span>`).join('')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="rsidebar">
        <div class="card scard">
          <div class="scard-title">Radar de habilidades</div>
          <div class="radar-wrap" id="radar-wrap">${buildRadar(_topSkills)}</div>
        </div>
        <div class="card scard">
          <div class="scard-title">Frecuencia de habilidades</div>
          ${_topSkills.map(([sk, cnt]) => {
            const maxSk = _topSkills[0]?.[1] || 1;
            return `<div class="skbar-row">
              <div class="skbar-name" title="${esc(sk)}">${esc(sk)}</div>
              <div class="skbar-track"
                onmouseenter="tip(event,'${esc(sk)}: ${cnt} candidatos')"
                onmousemove="tipMove(event)" onmouseleave="tipOff()">
                <div class="skbar-fill" data-w="${(cnt / maxSk) * 100}" style="width:0"></div>
              </div>
              <div class="skbar-cnt">${cnt}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="card scard">
          <div class="scard-title">Distribución de scores</div>
          <div class="dist-wrap">
            ${buckets.map(b => `
              <div class="dist-col">
                <div class="dist-bar"
                  style="height:${Math.max(3, (b.cnt / maxB) * 52)}px;background:${b.cnt ? 'var(--accent)' : 'var(--bg-muted)'}"
                  onmouseenter="tip(event,'${b.lbl}–${+b.lbl + 9}: ${b.cnt} candidatos')"
                  onmousemove="tipMove(event)" onmouseleave="tipOff()"></div>
                <div class="dist-lbl">${b.lbl}</div>
              </div>`).join('')}
          </div>
        </div>
        <div class="card scard">
          <div class="scard-title">Oferta evaluada</div>
          <div class="oferta-text">${esc(data.oferta.descripcion)}</div>
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.score-fill[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
      document.querySelectorAll('.skbar-fill[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
    }, 80);
    initRadar();
  });
}

/* ─── RADAR ─── */
function buildRadar(skills) {
  if (!skills.length) return `<p style="text-align:center;padding:24px 0;color:var(--text-3);font-size:13px">Sin datos</p>`;
  const n = skills.length, cx = 130, cy = 130, R = 86;
  const ang = i => Math.PI * 2 * i / n - Math.PI / 2;
  const pt  = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const maxVal = skills[0][1];
  let grid = '';
  for (let l = 1; l <= 4; l++) {
    const ps = Array.from({length:n},(_,i)=>pt(i,R*l/4).join(',')).join(' ');
    grid += `<polygon points="${ps}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
  }
  const axes = Array.from({length:n},(_,i)=>{const[x,y]=pt(i,R);return`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`;}).join('');
  const dataPts  = skills.map(([,c],i)=>pt(i,R*(c/maxVal)));
  const dataPoly = dataPts.map(p=>p.join(',')).join(' ');
  const innerPts  = skills.map(([,c],i)=>pt(i,R*(c/maxVal)*0.4));
  const innerPoly = innerPts.map(p=>p.join(',')).join(' ');
  const labels = Array.from({length:n},(_,i)=>{
    const[x,y]=pt(i,R+22);
    const anchor=x<cx-4?'end':x>cx+4?'start':'middle';
    return`<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" class="radar-label" data-idx="${i}" style="cursor:pointer">${esc(skills[i][0].slice(0,12))}</text>`;
  }).join('');
  const dots = dataPts.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="4" fill="var(--accent)" stroke="var(--bg-overlay)" stroke-width="2" class="radar-dot" data-idx="${i}" style="cursor:pointer"/>`).join('');
  return `<svg class="radar-svg" viewBox="0 0 260 260" width="250" height="250" id="radar-svg">
    ${grid}${axes}
    <polygon points="${innerPoly}" fill="var(--accent)" fill-opacity=".06" stroke="var(--accent)" stroke-opacity=".2" stroke-width="1" stroke-dasharray="3 3"/>
    <polygon points="${dataPoly}" fill="var(--accent)" fill-opacity=".12" stroke="var(--accent)" stroke-width="2" id="radar-poly"/>
    ${dots}${labels}</svg>`;
}

function initRadar() {
  const svg = document.getElementById('radar-svg');
  if (!svg) return;
  const poly = document.getElementById('radar-poly');
  if (poly) {
    const len = poly.getTotalLength?.() ?? 600;
    poly.style.strokeDasharray = len;
    poly.style.strokeDashoffset = len;
    poly.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)';
    requestAnimationFrame(() => { poly.style.strokeDashoffset = '0'; });
  }
  svg.querySelectorAll('.radar-dot, .radar-label').forEach(el => {
    const i = +el.getAttribute('data-idx');
    const [sk, cnt] = _topSkills[i] || [];
    if (!sk) return;
    el.addEventListener('mouseenter', e => tip(e, `${sk}: ${cnt} candidatos`));
    el.addEventListener('mousemove',  tipMove);
    el.addEventListener('mouseleave', tipOff);
  });
}

/* ─── DRAWER ─── */
function openDrawer(idx) {
  const c = _ranking[idx], col = scColor(c.score);
  document.getElementById('drawer-content').innerHTML = `
    <div class="d-rank">Candidato ${idx+1} de ${_ranking.length}</div>
    <div class="d-name" id="drawer-name">${esc(c.nombre||c.id)}</div>
    <div class="d-role">${esc(c.puesto||'—')}</div>
    <div class="d-score-wrap"><div class="d-score" style="color:${col}">${c.score}</div><div class="d-score-max">/100</div></div>
    <div class="d-score-bar"><div class="d-score-bar-fill" data-w="${c.score}" style="width:0%;background:${col}"></div></div>
    <div class="d-section"><div class="d-section-lbl">Razón del score</div><div class="d-section-val">${esc(c.razon||'—')}</div></div>
    <div class="d-divider"></div>
    <div class="d-section"><div class="d-section-lbl">Experiencia</div><div class="d-section-val">${esc(c.experiencia||'—')}</div></div>
    <div class="d-section"><div class="d-section-lbl">Educación</div><div class="d-section-val">${esc(c.educacion||'—')}</div></div>
    <div class="d-divider"></div>
    <div class="d-section"><div class="d-section-lbl">Habilidades</div>
      <div class="d-pills">${(c.habilidades||[]).map(h=>`<span class="skill-pill hi">${esc(h)}</span>`).join('')||'—'}</div>
    </div>
    ${c.error?`<div class="d-error">⚠ ${esc(c.error)}</div>`:''}`;
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('overlay');
  drawer.hidden = false;
  overlay.classList.add('open');
  requestAnimationFrame(() => {
    drawer.classList.add('open');
    setTimeout(() => {
      const bar = drawer.querySelector('.d-score-bar-fill');
      if (bar) bar.style.width = bar.dataset.w + '%';
    }, 80);
  });
  setTimeout(() => drawer.querySelector('.drawer-close')?.focus(), 320);
  drawer.addEventListener('keydown', trapFocus);
}

function closeDrawer() {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('overlay');
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  drawer.removeEventListener('keydown', trapFocus);
  setTimeout(() => { drawer.hidden = true; }, 360);
}

function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const focusable = Array.from(document.getElementById('drawer').querySelectorAll(
    'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
  )).filter(el => !el.disabled);
  if (!focusable.length) return;
  const [first, last] = [focusable[0], focusable[focusable.length-1]];
  if (e.shiftKey) { if (document.activeElement===first){e.preventDefault();last.focus();} }
  else            { if (document.activeElement===last) {e.preventDefault();first.focus();} }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ─── TOOLTIP ─── */
const gTip = document.getElementById('g-tip');
function tip(e, txt)  { gTip.textContent=txt; gTip.classList.add('on'); tipMove(e); }
function tipMove(e)   { gTip.style.left=(e.clientX+16)+'px'; gTip.style.top=(e.clientY-8)+'px'; }
function tipOff()     { gTip.classList.remove('on'); }
document.addEventListener('mousemove', e => { if (gTip.classList.contains('on')) tipMove(e); });

/* ─── STATUS / TOAST / UTILS ─── */
function setStatus(text, state='idle') {
  const b = document.getElementById('status-badge');
  const d = document.getElementById('status-dot');
  if (b) b.textContent = text;
  if (d) d.setAttribute('data-state', state);
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 3000);
}
function esc(s='') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── TOGGLE PASSWORD ─── */
function togglePass() {
  const inp = document.getElementById('login-password');
  const ico = document.getElementById('eye-icon');
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  ico.innerHTML = show
    ? `<path d="M2 2l12 12M6.5 6.7A3 3 0 0010.3 10M4.2 4.5C2.6 5.7 1 8 1 8s2.5 5 7 5a7 7 0 003.8-1.2M6 3.1A7 7 0 0115 8s-.8 1.6-2 2.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`
    : `<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.4"/>`;
}