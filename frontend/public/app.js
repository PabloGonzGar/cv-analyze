/* ═══════════════════════════════════════════
   CV RANKER — app.js
   Actualizado para el nuevo sistema de diseño
═══════════════════════════════════════════ */

/* ─── STATE ─── */
const API      = '';
let currentJob = null;
let pollTimer  = null;
let historyDB  = JSON.parse(localStorage.getItem('cvr_history') || '[]');
let _ranking   = [];
let _topSkills = [];

/* ─── THEME ─── */
(function () {
  const t = localStorage.getItem('cvr_theme') || 'dark';
  applyTheme(t);
})();

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const sw  = document.getElementById('theme-sw');
  const lbl = document.getElementById('theme-lbl');
  const ico = document.getElementById('theme-icon');
  const isDark = t === 'dark';

  sw.classList.toggle('on', isDark);
  sw.setAttribute('aria-checked', String(isDark));
  lbl.textContent = isDark ? 'Modo oscuro' : 'Modo claro';

  // Swap icono: luna ↔ sol
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
  applyTheme(
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  );
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

  // Scroll to top
  document.getElementById('main-content')?.scrollTo(0, 0);
}

/* ─── UPLOAD ─── */
const fileInput   = document.getElementById('file-input');
const dropZone    = document.getElementById('drop-zone');
const ofertaInput = document.getElementById('oferta-input');
const btnSubmit   = document.getElementById('btn-submit');
const charCount   = document.getElementById('char-count');

function checkReady() {
  const len = ofertaInput.value.trim().length;
  btnSubmit.disabled = !(fileInput.files.length && len > 20);
  if (charCount) {
    charCount.textContent = len + ' caracteres';
    charCount.style.color = len > 20 ? 'var(--jade-500)' : 'var(--text-3)';
  }
}

ofertaInput.addEventListener('input', checkReady);

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setDropReady(fileInput.files[0].name);
  checkReady();
});

// Drag & drop
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', e => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag');
});
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f?.name.toLowerCase().endsWith('.zip')) {
    const dt = new DataTransfer();
    dt.items.add(f);
    fileInput.files = dt.files;
    setDropReady(f.name);
    checkReady();
  } else {
    toast('Solo se aceptan archivos .zip');
  }
});

// Teclado en drop zone
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

function setDropReady(name) {
  document.getElementById('drop-idle').hidden  = true;
  document.getElementById('drop-ready').hidden = false;
  document.getElementById('drop-fname').textContent = name;
  dropZone.setAttribute('aria-label', `Archivo seleccionado: ${name}. Clic para cambiar.`);
}

/* Submit */
btnSubmit.addEventListener('click', async () => {
  const oferta = ofertaInput.value.trim();
  const file   = fileInput.files[0];
  if (!oferta || !file) return;

  btnSubmit.disabled = true;
  setStatus('Enviando…', 'running');

  const fd = new FormData();
  fd.append('oferta', oferta);
  fd.append('file', file);

  try {
    const r = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) { toast(d.detail || 'Error en el servidor'); btnSubmit.disabled = false; setStatus('Error', 'error'); return; }

    currentJob = { id: d.job_id, oferta: oferta.slice(0, 140), total: d.candidatos, ts: Date.now() };
    document.getElementById('prog-card').style.display = 'block';
    updateProg(0, d.candidatos);
    startPoll(d.candidatos);
  } catch {
    toast('No se pudo conectar con el servidor');
    btnSubmit.disabled = false;
    setStatus('Listo', 'idle');
  }
});

/* ─── POLLING ─── */
function startPoll(total) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const r = await fetch(`${API}/api/status/${currentJob.id}`);
      const d = await r.json();
      updateProg(d.done || 0, d.total || total);
      setStatus(`${d.done || 0} / ${d.total || total}`, 'running');

      if (d.status === 'done') {
        clearInterval(pollTimer);
        await loadResults(currentJob.id, currentJob.oferta, currentJob.ts);
      }
      if (d.status === 'error') {
        clearInterval(pollTimer);
        toast('Error: ' + (d.error || 'desconocido'));
        setStatus('Error', 'error');
      }
    } catch { /* silenciar errores de red */ }
  }, 1200);
}

function updateProg(done, total) {
  const pct = total ? done / total * 100 : 0;
  const fill = document.getElementById('prog-fill');
  const val  = document.getElementById('prog-val');
  const track = fill?.parentElement;

  if (fill)  fill.style.width = pct + '%';
  if (val)   val.textContent  = `${done} / ${total}`;
  if (track) {
    track.setAttribute('aria-valuenow', Math.round(pct));
    track.setAttribute('aria-valuemax', 100);
  }
}

async function loadResults(jobId, ofertaPreview, ts) {
  const r = await fetch(`${API}/api/results/${jobId}`);
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
updateHistBadge();

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
      return `<div class="card hist-card anim-in" style="animation-delay:${i * 50}ms" onclick="openHistEntry('${e.jobId}')" role="button" tabindex="0" aria-label="Ver análisis del ${ds}">
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

  // Teclado en hist cards
  el.querySelectorAll('.hist-card').forEach(card => {
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
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

  // Agregación de habilidades
  const sm = {};
  _ranking.forEach(c => (c.habilidades || []).forEach(s => {
    const k = s.toLowerCase().trim();
    if (k) sm[k] = (sm[k] || 0) + 1;
  }));
  _topSkills = Object.entries(sm).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Distribución
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    lbl: i * 10 + '',
    cnt: scores.filter(s => s >= i * 10 && s < (i + 1) * 10).length,
  }));
  const maxB = Math.max(...buckets.map(b => b.cnt), 1);

  const el = document.getElementById('results-content');
  el.innerHTML = `
    <!-- Stats -->
    <div class="stat-row">
      ${[['Candidatos', _ranking.length], ['Score medio', avg], ['Score máximo', max], ['Calificados ≥60', q60]]
        .map(([l, v], i) => `
          <div class="card stat-box anim-in" style="animation-delay:${i * 60}ms">
            <div class="stat-val">${v}</div>
            <div class="stat-lbl">${l}</div>
          </div>`).join('')}
    </div>

    <!-- Grid -->
    <div class="results-grid">

      <!-- Tabla -->
      <div class="card table-card">
        <div class="table-card-header">
          <span class="table-card-title">Ranking de candidatos</span>
          <span class="table-card-count">${_ranking.length} evaluados</span>
        </div>
        <table class="rank-table" aria-label="Ranking de candidatos">
          <thead>
            <tr>
              <th scope="col" style="width:44px">#</th>
              <th scope="col">Candidato</th>
              <th scope="col" style="width:140px">Score</th>
              <th scope="col">Habilidades</th>
            </tr>
          </thead>
          <tbody>
            ${_ranking.map((c, i) => `
              <tr onclick="openDrawer(${i})" tabindex="0" role="button"
                  aria-label="Ver detalle de ${esc(c.nombre || c.id)}, score ${c.score}"
                  onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDrawer(${i})}">
                <td><div class="rnum ${rnumClass(i)}">${i + 1}</div></td>
                <td>
                  <div class="rname">${esc(c.nombre || c.id)}</div>
                  <div class="rrole">${esc(c.puesto || '—')}</div>
                </td>
                <td>
                  <div class="score-cell">
                    <div class="score-track">
                      <div class="score-fill" data-w="${c.score}"
                           style="width:0%;background:${scColor(c.score)}"></div>
                    </div>
                    <div class="score-num" style="color:${scColor(c.score)}">${c.score}</div>
                  </div>
                </td>
                <td>
                  ${(c.habilidades || []).slice(0, 3)
                    .map(h => `<span class="skill-pill ${i < 3 ? 'hi' : ''}">${esc(h)}</span>`)
                    .join('')}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Sidebar derecha -->
      <div class="rsidebar">

        <!-- Radar -->
        <div class="card scard">
          <div class="scard-title">Radar de habilidades</div>
          <div class="radar-wrap" id="radar-wrap">${buildRadar(_topSkills)}</div>
        </div>

        <!-- Barras -->
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

        <!-- Distribución -->
        <div class="card scard">
          <div class="scard-title">Distribución de scores</div>
          <div class="dist-wrap">
            ${buckets.map(b => `
              <div class="dist-col">
                <div class="dist-bar"
                  style="height:${Math.max(3, (b.cnt / maxB) * 52)}px;background:${b.cnt ? 'var(--accent)' : 'var(--bg-muted)'};opacity:${b.cnt ? '.85' : '1'}"
                  onmouseenter="tip(event,'${b.lbl}–${+b.lbl + 9}: ${b.cnt} candidatos')"
                  onmousemove="tipMove(event)" onmouseleave="tipOff()">
                </div>
                <div class="dist-lbl">${b.lbl}</div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Oferta -->
        <div class="card scard">
          <div class="scard-title">Oferta evaluada</div>
          <div class="oferta-text">${esc(data.oferta.descripcion)}</div>
        </div>

      </div>
    </div>`;

  // Animar barras tras paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.score-fill[data-w]')
        .forEach(el => { el.style.width = el.dataset.w + '%'; });
      document.querySelectorAll('.skbar-fill[data-w]')
        .forEach(el => { el.style.width = el.dataset.w + '%'; });
    }, 80);
    initRadar();
  });
}

/* ─── RADAR SVG ─── */
function buildRadar(skills) {
  if (!skills.length) {
    return `<p style="text-align:center;padding:24px 0;color:var(--text-3);font-size:13px">Sin datos de habilidades</p>`;
  }

  const n      = skills.length;
  const cx     = 130, cy = 130, R = 86;
  const ang    = i => Math.PI * 2 * i / n - Math.PI / 2;
  const pt     = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const maxVal = skills[0][1];

  // Grid concéntrico
  let grid = '';
  for (let l = 1; l <= 4; l++) {
    const r  = R * l / 4;
    const ps = Array.from({ length: n }, (_, i) => pt(i, r).join(',')).join(' ');
    const opacity = .3 + l * .05;
    grid += `<polygon points="${ps}" fill="none" stroke="var(--border)" stroke-width="${l === 4 ? 1.5 : 1}" opacity="${opacity}"/>`;
  }

  // Ejes
  const axes = Array.from({ length: n }, (_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)" stroke-width="1" opacity=".5"/>`;
  }).join('');

  // Polígono de datos
  const dataPts  = skills.map(([, c], i) => pt(i, R * (c / maxVal)));
  const dataPoly = dataPts.map(p => p.join(',')).join(' ');

  // Polígono interior traslúcido (40% escala → vértices más cerca del centro para habilidades menos frecuentes)
  const innerPts  = skills.map(([, c], i) => pt(i, R * (c / maxVal) * 0.4));
  const innerPoly = innerPts.map(p => p.join(',')).join(' ');

  // Etiquetas
  const labels = Array.from({ length: n }, (_, i) => {
    const [x, y] = pt(i, R + 22);
    const anchor = x < cx - 4 ? 'end' : x > cx + 4 ? 'start' : 'middle';
    return `<text x="${x}" y="${y}"
      text-anchor="${anchor}" dominant-baseline="middle"
      class="radar-label" data-idx="${i}"
      style="cursor:pointer">${esc(skills[i][0].slice(0, 12))}</text>`;
  }).join('');

  // Puntos de datos
  const dots = dataPts.map(([x, y], i) => `
    <circle cx="${x}" cy="${y}" r="4"
      fill="var(--accent)" stroke="var(--bg-overlay)" stroke-width="2"
      class="radar-dot" data-idx="${i}" style="cursor:pointer"/>`).join('');

  return `<svg class="radar-svg" viewBox="0 0 260 260" width="250" height="250" id="radar-svg" role="img" aria-label="Gráfico radar de habilidades">
    <title>Radar de las ${n} habilidades más frecuentes</title>
    ${grid}
    ${axes}
    <polygon points="${innerPoly}"
      fill="var(--accent)" fill-opacity=".06"
      stroke="var(--accent)" stroke-opacity=".2"
      stroke-width="1" stroke-dasharray="3 3"/>
    <polygon points="${dataPoly}"
      fill="var(--accent)" fill-opacity=".12"
      stroke="var(--accent)" stroke-width="2"
      id="radar-poly"/>
    ${dots}
    ${labels}
  </svg>`;
}

function initRadar() {
  const svg  = document.getElementById('radar-svg');
  if (!svg) return;

  // Animar el polígono dibujándose
  const poly = document.getElementById('radar-poly');
  if (poly) {
    const len = poly.getTotalLength ? poly.getTotalLength() : 600;
    poly.style.strokeDasharray  = len;
    poly.style.strokeDashoffset = len;
    poly.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)';
    requestAnimationFrame(() => { poly.style.strokeDashoffset = '0'; });
  }

  // Tooltips en puntos y etiquetas
  svg.querySelectorAll('.radar-dot, .radar-label').forEach(el => {
    const i        = +el.getAttribute('data-idx');
    const [sk, cnt] = _topSkills[i] || [];
    if (!sk) return;
    el.addEventListener('mouseenter', e => tip(e, `${sk}: ${cnt} candidatos`));
    el.addEventListener('mousemove',  tipMove);
    el.addEventListener('mouseleave', tipOff);
  });
}

/* ─── DRAWER ─── */
function openDrawer(idx) {
  const c   = _ranking[idx];
  const col = scColor(c.score);

  document.getElementById('drawer-content').innerHTML = `
    <div class="d-rank">Candidato ${idx + 1} de ${_ranking.length}</div>
    <div class="d-name" id="drawer-name">${esc(c.nombre || c.id)}</div>
    <div class="d-role">${esc(c.puesto || '—')}</div>

    <div class="d-score-wrap">
      <div class="d-score" style="color:${col}">${c.score}</div>
      <div class="d-score-max">/100</div>
    </div>
    <div class="d-score-bar">
      <div class="d-score-bar-fill"
           data-w="${c.score}"
           style="width:0%;background:${col}"></div>
    </div>

    <div class="d-section">
      <div class="d-section-lbl">Razón del score</div>
      <div class="d-section-val">${esc(c.razon || '—')}</div>
    </div>
    <div class="d-divider"></div>
    <div class="d-section">
      <div class="d-section-lbl">Experiencia</div>
      <div class="d-section-val">${esc(c.experiencia || '—')}</div>
    </div>
    <div class="d-section">
      <div class="d-section-lbl">Educación</div>
      <div class="d-section-val">${esc(c.educacion || '—')}</div>
    </div>
    <div class="d-divider"></div>
    <div class="d-section">
      <div class="d-section-lbl">Habilidades</div>
      <div class="d-pills">
        ${(c.habilidades || []).map(h => `<span class="skill-pill hi">${esc(h)}</span>`).join('') || '—'}
      </div>
    </div>
    ${c.error ? `<div class="d-error">⚠ ${esc(c.error)}</div>` : ''}`;

  const drawer  = document.getElementById('drawer');
  const overlay = document.getElementById('overlay');
  drawer.hidden = false;
  overlay.classList.add('open');
  requestAnimationFrame(() => {
    drawer.classList.add('open');
    // Animar barra de score del drawer
    setTimeout(() => {
      const bar = drawer.querySelector('.d-score-bar-fill');
      if (bar) bar.style.width = bar.dataset.w + '%';
    }, 80);
  });

  // Foco en el botón cerrar
  setTimeout(() => drawer.querySelector('.drawer-close')?.focus(), 320);

  // Trampa de foco básica
  drawer.addEventListener('keydown', trapFocus);
}

function closeDrawer() {
  const drawer  = document.getElementById('drawer');
  const overlay = document.getElementById('overlay');
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  drawer.removeEventListener('keydown', trapFocus);
  setTimeout(() => { drawer.hidden = true; }, 360);
}

function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const focusable = Array.from(
    document.getElementById('drawer').querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => !el.disabled);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

// Cerrar con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDrawer();
});

/* ─── TOOLTIP ─── */
const gTip = document.getElementById('g-tip');

function tip(e, txt) {
  gTip.textContent = txt;
  gTip.classList.add('on');
  gTip.removeAttribute('aria-hidden');
  tipMove(e);
}
function tipMove(e) {
  gTip.style.left = (e.clientX + 16) + 'px';
  gTip.style.top  = (e.clientY - 8) + 'px';
}
function tipOff() {
  gTip.classList.remove('on');
  gTip.setAttribute('aria-hidden', 'true');
}
document.addEventListener('mousemove', e => {
  if (gTip.classList.contains('on')) tipMove(e);
});

/* ─── STATUS ─── */
function setStatus(text, state = 'idle') {
  document.getElementById('status-badge').textContent = text;
  const dot = document.getElementById('status-dot');
  if (dot) dot.setAttribute('data-state', state);
}

/* ─── TOAST ─── */
function toast(msg, duration = 3200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), duration);
}

/* ─── UTILS ─── */
function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
