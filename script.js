'use strict';

const CONFIG = {
  API_BASE: null,            // Ej: 'http://192.168.1.50'  ·  null = simulación
  POLL_MS: 3000,             // cada cuánto se pide una lectura
  TANK_CAPACITY_L: 1000,     // capacidad del depósito en litros
  TANK_DEPTH_CM: 100,        // distancia sensor → fondo con el tanque vacío
  THRESHOLD_LOW: 50,         // por debajo de esto: 🟡 Bajo
  THRESHOLD_CRITICAL: 20,    // por debajo de esto: 🔴 Crítico
  OVERFLOW_CUT: 90,          // corte anti-desborde
  HISTORY_TABLE_ROWS: 12,    // filas visibles en la tabla
  HISTORY_KEEP: 120,         // lecturas guardadas en memoria (para CSV)
  CHART_POINTS: 30,          // puntos en la gráfica
  EVENTS_MAX: 6,             // eventos visibles
};

/* ---------- Estado de la app ---------- */
const state = {
  level: 76.1,
  prevLevel: 76.1,
  pumpOn: false,
  pumpBusy: false,
  pumpOnSince: null,
  autoCut: true,
  autoFill: false,
  online: true,
  latency: 0,
  lastUpdate: null,
  lastStatusKey: null,
  history: [],               // del más reciente al más antiguo
  events: [],
  unseenAlerts: false,
};

/* ---------- Utilidades ---------- */
const $ = (id) => document.getElementById(id);
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const toLiters = (lvl) => Math.round((lvl / 100) * CONFIG.TANK_CAPACITY_L);
const fmtTime = (d) =>
  d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Clasificación del nivel ---------- */
function getStatus(level) {
  if (level < CONFIG.THRESHOLD_CRITICAL) {
    return { key: 'critico', label: 'Crítico', emoji: '🔴', chip: 'chip-crit',
             headline: 'Alerta: nivel crítico', msg: 'Nivel crítico: riesgo de quedarse sin agua.' };
  }
  if (level < CONFIG.THRESHOLD_LOW) {
    return { key: 'bajo', label: 'Bajo', emoji: '🟡', chip: 'chip-warn',
             headline: 'Atención: nivel bajo', msg: 'Nivel bajo: considera encender la bomba.' };
  }
  return { key: 'normal', label: 'Normal', emoji: '🟢', chip: 'chip-ok',
           headline: '¡Todo en orden!', msg: 'Nivel saludable de agua.' };
}

/* =========================================================
   CAPA DE DATOS  (aquí es donde se conecta el ESP32)
   ========================================================= */
async function readSensor() {
  if (CONFIG.API_BASE) {
    const res = await fetch(`${CONFIG.API_BASE}/api/lectura`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      level: Number(data.nivel),
      pumpOn: data.bomba === undefined ? null : Boolean(Number(data.bomba)),
    };
  }

  // Simulación: con la bomba encendida el tanque sube, apagada baja por consumo
  const delta = state.pumpOn ? rand(0.9, 2.2) : -rand(0.3, 1.2);
  return { level: clamp(state.level + delta, 0, 100), pumpOn: state.pumpOn };
}

async function sendPumpCommand(on) {
  if (CONFIG.API_BASE) {
    const res = await fetch(`${CONFIG.API_BASE}/api/bomba`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: on ? 1 : 0 }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return;
  }
  await wait(450); // simula la latencia del relé
}

/* =========================================================
   LÓGICA
   ========================================================= */
function seedHistory() {
  // Lecturas de ejemplo para que la tabla y la gráfica no arranquen vacías
  const now = Date.now();
  let lvl = state.level;
  for (let i = 0; i < 20; i++) {
    state.history.push({
      time: new Date(now - i * CONFIG.POLL_MS),
      level: lvl,
      liters: toLiters(lvl),
      pumpOn: false,
    });
    lvl = clamp(lvl + rand(0.3, 1.0), 0, 100);
  }
  state.lastUpdate = state.history[0].time;
  state.lastStatusKey = getStatus(state.level).key;
}

function pushReading() {
  state.history.unshift({
    time: new Date(),
    level: state.level,
    liters: toLiters(state.level),
    pumpOn: state.pumpOn,
  });
  if (state.history.length > CONFIG.HISTORY_KEEP) state.history.length = CONFIG.HISTORY_KEEP;
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  const t0 = performance.now();

  try {
    const r = await readSensor();
    state.latency = CONFIG.API_BASE ? Math.round(performance.now() - t0) : Math.round(rand(18, 32));

    if (!state.online) addEvent('ok', 'Enlace restablecido', 'El ESP32 vuelve a responder.');
    state.online = true;

    state.prevLevel = state.level;
    state.level = clamp(r.level, 0, 100);

    // En modo real, el estado del relé lo manda el ESP32
    if (CONFIG.API_BASE && r.pumpOn !== null && r.pumpOn !== state.pumpOn && !state.pumpBusy) {
      state.pumpOn = r.pumpOn;
      state.pumpOnSince = r.pumpOn ? Date.now() : null;
    }

    state.lastUpdate = new Date();
    pushReading();
    checkStatusChange();
    applyAutomation();
    renderAll(true);
  } catch (err) {
    if (state.online) addEvent('crit', 'Sin enlace con el ESP32', err.message || 'Tiempo de espera agotado.');
    state.online = false;
    renderConnection();
  } finally {
    ticking = false;
  }
}

function checkStatusChange() {
  const s = getStatus(state.level);
  if (s.key === state.lastStatusKey) return;
  const type = s.key === 'normal' ? 'ok' : s.key === 'bajo' ? 'warn' : 'crit';
  addEvent(type, `Nivel ${s.label.toLowerCase()} ${s.emoji}`,
    `El depósito está al ${state.level.toFixed(1)}% (${toLiters(state.level)} L).`);
  state.lastStatusKey = s.key;
}

function applyAutomation() {
  if (state.autoCut && state.pumpOn && state.level >= CONFIG.OVERFLOW_CUT) {
    addEvent('warn', 'Corte automático anti-desborde',
      `Nivel ${state.level.toFixed(1)}% ≥ ${CONFIG.OVERFLOW_CUT}%. Se apaga la bomba.`);
    setPump(false, 'auto');
  } else if (state.autoFill && !state.pumpOn && state.level < CONFIG.THRESHOLD_CRITICAL) {
    addEvent('info', 'Llenado automático',
      `Nivel ${state.level.toFixed(1)}% < ${CONFIG.THRESHOLD_CRITICAL}%. Se enciende la bomba.`);
    setPump(true, 'auto');
  }
}

async function setPump(on, source = 'manual') {
  if (state.pumpBusy || state.pumpOn === on) return;
  state.pumpBusy = true;
  renderPump();

  try {
    await sendPumpCommand(on);
    state.pumpOn = on;
    state.pumpOnSince = on ? Date.now() : null;

    const how = source === 'manual' ? 'manualmente'
              : source === 'emergencia' ? 'por corte de emergencia'
              : 'automáticamente';
    const type = on ? 'ok' : source === 'emergencia' ? 'crit' : 'info';
    addEvent(type, on ? 'Bomba encendida' : 'Bomba apagada',
      `Acción ejecutada ${how} · GPIO 23 ${on ? 'HIGH' : 'LOW'}`);
    toast(on ? 'Bomba encendida' : 'Bomba apagada', on ? 'ok' : source === 'emergencia' ? 'crit' : 'info');
  } catch (err) {
    addEvent('crit', 'Error al enviar comando', err.message || 'Sin respuesta del ESP32.');
    toast('No se pudo comunicar con el ESP32', 'crit');
  } finally {
    state.pumpBusy = false;
    renderPump();
  }
}

async function emergencyStop() {
  if (state.pumpOn) {
    await setPump(false, 'emergencia');
  } else {
    addEvent('info', 'Corte preventivo', 'La bomba ya estaba apagada.');
    toast('La bomba ya está apagada', 'info');
  }
}

/* =========================================================
   RENDER
   ========================================================= */
function setChip(el, cls, text, pulse = true) {
  const extra = el.dataset.extra ? ` ${el.dataset.extra}` : '';
  el.className = `chip ${cls}${extra}`;
  el.innerHTML = `<i class="dot${pulse ? ' pulse' : ''}"></i><span>${esc(text)}</span>`;
}

function renderAll(highlightRow = false) {
  renderConnection();
  renderLevel();
  renderPump();
  renderHistory(highlightRow);
  renderChart();
}

function renderConnection() {
  const on = state.online;
  setChip($('mcuChip'), on ? 'chip-ok' : 'chip-crit', on ? 'Online' : 'Offline');
  setChip($('connChip'), on ? 'chip-ok' : 'chip-crit', on ? 'ESP32 conectado' : 'Sin enlace');
  $('latency').textContent = on ? `${state.latency} ms` : '—';
  $('lastUpdate').textContent = state.lastUpdate ? fmtTime(state.lastUpdate) : '--:--:--';
}

function renderLevel() {
  const lvl = state.level;
  const s = getStatus(lvl);
  const liters = toLiters(lvl);

  // Tanque
  const tank = $('tank');
  tank.dataset.status = s.key;
  tank.setAttribute('aria-valuenow', lvl.toFixed(1));
  $('tankWater').style.height = `${lvl}%`;
  $('levelValue').textContent = lvl.toFixed(1);
  $('litersValue').textContent = `${liters} / ${CONFIG.TANK_CAPACITY_L} L`;
  setChip($('levelBadge'), s.chip, `${s.emoji} ${s.label}`);

  // Barra horizontal
  $('levelBar').dataset.status = s.key;
  $('levelBarFill').style.width = `${lvl}%`;
  $('levelBarValue').textContent = `${lvl.toFixed(1)}%`;
  $('levelMsg').textContent = s.msg;

  // Métricas laterales
  $('distValue').textContent = `${(CONFIG.TANK_DEPTH_CM * (1 - lvl / 100)).toFixed(1)} cm`;
  const perMin = (lvl - state.prevLevel) / (CONFIG.POLL_MS / 60000);
  const trend = $('trendValue');
  if (Math.abs(perMin) < 0.05) {
    trend.textContent = '● estable';
    trend.className = '';
  } else {
    trend.textContent = `${perMin > 0 ? '▲' : '▼'} ${Math.abs(perMin).toFixed(1)} %/min`;
    trend.className = perMin > 0 ? 'up' : 'down';
  }

  // Topbar y franja de estado
  $('topLevel').textContent = `${lvl.toFixed(1)}%`;
  $('topBar').style.width = `${lvl}%`;
  $('topBar').dataset.status = s.key;
  $('topLiters').textContent = `${liters.toLocaleString('es-MX')} L`;
  setChip($('statusChip'), s.chip, s.headline);
}

function renderPump() {
  const on = state.pumpOn;
  const btn = $('pumpBtn');
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.disabled = state.pumpBusy;
  $('pumpBtnLabel').textContent = state.pumpBusy ? 'Enviando comando…' : on ? 'Apagar bomba' : 'Encender bomba';

  $('bomba').classList.toggle('running', on);
  $('pumpStateDot').className = `state-dot${on ? ' on' : ''}`;
  $('pumpStateText').textContent = on ? 'Estado: Activa (ON)' : 'Estado: Apagada (OFF)';
  $('pumpStateDesc').textContent = on && state.pumpOnSince
    ? `Llenando depósito · encendida a las ${fmtTime(new Date(state.pumpOnSince))}`
    : 'Relé abierto · sin consumo en la línea de 12 V';

  // Valores eléctricos simulados (conecta un sensor INA219 si quieres datos reales)
  const volts = on ? rand(11.95, 12.15) : rand(12.2, 12.3);
  const amps = on ? rand(1.78, 1.9) : 0;
  $('voltValue').textContent = `${volts.toFixed(2)} V`;
  $('ampValue').textContent = `${amps.toFixed(2)} A`;
  $('wattValue').textContent = `${(volts * amps).toFixed(1)} W`;
  renderRuntime();
}

function renderRuntime() {
  if (!state.pumpOn || !state.pumpOnSince) {
    $('runValue').textContent = '--:--';
    return;
  }
  const s = Math.floor((Date.now() - state.pumpOnSince) / 1000);
  $('runValue').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function renderHistory(highlight = false) {
  const rows = state.history.slice(0, CONFIG.HISTORY_TABLE_ROWS);
  $('historyCount').textContent = `${state.history.length} lecturas`;

  if (!rows.length) {
    $('historyBody').innerHTML =
      '<tr><td colspan="5" class="empty">Sin lecturas todavía. Esperando datos del sensor…</td></tr>';
    return;
  }

  $('historyBody').innerHTML = rows.map((h, i) => {
    const s = getStatus(h.level);
    return `
      <tr class="${i === 0 && highlight ? 'fresh' : ''}">
        <td class="mono">${fmtTime(h.time)}</td>
        <td class="num strong">${h.level.toFixed(1)}%</td>
        <td class="num">${h.liters} L</td>
        <td><span class="pump-pill${h.pumpOn ? ' on' : ''}">${h.pumpOn ? 'ON' : 'OFF'}</span></td>
        <td><span class="chip ${s.chip}">${s.emoji} ${s.label}</span></td>
      </tr>`;
  }).join('');
}

function renderChart() {
  const svg = $('chart');
  const pts = state.history.slice(0, CONFIG.CHART_POINTS).reverse(); // antiguo → reciente
  const W = 600, H = 180, L = 36, R = 10, T = 10, B = 12;

  if (pts.length < 2) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="ax">Esperando lecturas…</text>`;
    $('chartFrom').textContent = '--';
    return;
  }

  const x = (i) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v) => T + (1 - v / 100) * (H - T - B);

  const grid = [0, 25, 50, 75, 100].map((v) => `
    <line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="ax" x="${L - 8}" y="${y(v) + 3}" text-anchor="end">${v}%</text>`).join('');

  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${y(0)} ${line} ${x(pts.length - 1).toFixed(1)},${y(0)}`;
  const last = pts[pts.length - 1];

  svg.innerHTML = `
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#06b6d4" stop-opacity="0.28"/>
        <stop offset="1" stop-color="#0284c7" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="lineGrad" gradientUnits="userSpaceOnUse" x1="${L}" y1="0" x2="${W - R}" y2="0">
        <stop offset="0" stop-color="#06b6d4"/>
        <stop offset="1" stop-color="#0284c7"/>
      </linearGradient>
    </defs>
    ${grid}
    <line class="th th-low"  x1="${L}" x2="${W - R}" y1="${y(CONFIG.THRESHOLD_LOW)}" y2="${y(CONFIG.THRESHOLD_LOW)}"/>
    <line class="th th-crit" x1="${L}" x2="${W - R}" y1="${y(CONFIG.THRESHOLD_CRITICAL)}" y2="${y(CONFIG.THRESHOLD_CRITICAL)}"/>
    <polygon points="${area}" fill="url(#areaGrad)"/>
    <polyline points="${line}" fill="none" stroke="url(#lineGrad)" stroke-width="2.5"
              stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last.level).toFixed(1)}" r="5"
            fill="#fff" stroke="#0284c7" stroke-width="2.5"/>`;

  $('chartFrom').textContent = fmtTime(pts[0].time);
}

/* ---------- Eventos ---------- */
const EVENT_ICON = { ok: 'i-check', info: 'i-info', warn: 'i-alert', crit: 'i-alert' };

function addEvent(type, title, desc) {
  state.events.unshift({ type, title, desc, time: new Date() });
  if (state.events.length > CONFIG.EVENTS_MAX) state.events.length = CONFIG.EVENTS_MAX;
  if (type === 'warn' || type === 'crit') state.unseenAlerts = true;
  renderEvents();
}

function renderEvents() {
  $('eventCount').textContent = `${state.events.length} ${state.events.length === 1 ? 'evento' : 'eventos'}`;
  $('eventList').innerHTML = state.events.map((e) => `
    <li class="event ${e.type}">
      <svg class="ico ev-ico"><use href="#${EVENT_ICON[e.type]}"/></svg>
      <div><strong>${esc(e.title)}</strong><p>${esc(e.desc)}</p></div>
      <time>${fmtTime(e.time)}</time>
    </li>`).join('');
  $('bellDot').classList.toggle('show', state.unseenAlerts);
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- Exportar CSV ---------- */
function exportCSV() {
  if (!state.history.length) {
    toast('No hay lecturas para exportar', 'info');
    return;
  }
  const head = 'fecha,hora,nivel_pct,litros,bomba,estado';
  const lines = [...state.history].reverse().map((h) => [
    h.time.toLocaleDateString('en-CA'),   // AAAA-MM-DD en hora local
    fmtTime(h.time),
    h.level.toFixed(1),
    h.liters,
    h.pumpOn ? 1 : 0,
    getStatus(h.level).label,
  ].join(','));

  const blob = new Blob([`${head}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aquasense_lecturas_${Date.now()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSV descargado', 'ok');
}

/* =========================================================
   INICIALIZACIÓN
   ========================================================= */
function applyConfigLabels() {
  // Marcas dentro del tanque
  [
    ['markCut', CONFIG.OVERFLOW_CUT, `Corte ${CONFIG.OVERFLOW_CUT}%`],
    ['markLow', CONFIG.THRESHOLD_LOW, `Bajo ${CONFIG.THRESHOLD_LOW}%`],
    ['markCrit', CONFIG.THRESHOLD_CRITICAL, `Crítico ${CONFIG.THRESHOLD_CRITICAL}%`],
  ].forEach(([id, at, txt]) => {
    const el = $(id);
    el.style.setProperty('--at', `${at}%`);
    el.querySelector('span').textContent = txt;
  });

  // Marcas y leyenda de la barra
  $('tickLow').style.left = `${CONFIG.THRESHOLD_LOW}%`;
  $('tickCrit').style.left = `${CONFIG.THRESHOLD_CRITICAL}%`;
  $('legendNormal').textContent = `🟢 Normal ≥ ${CONFIG.THRESHOLD_LOW}%`;
  $('legendLow').textContent = `🟡 Bajo ${CONFIG.THRESHOLD_CRITICAL}–${CONFIG.THRESHOLD_LOW - 1}%`;
  $('legendCrit').textContent = `🔴 Crítico < ${CONFIG.THRESHOLD_CRITICAL}%`;

  $('cutLabel').textContent = CONFIG.OVERFLOW_CUT;
  $('fillLabel').textContent = CONFIG.THRESHOLD_CRITICAL;
  $('capValue').textContent = `${CONFIG.TANK_CAPACITY_L.toLocaleString('es-MX')} L`;
  $('pollLabel').textContent = `${CONFIG.POLL_MS / 1000} s`;
  $('sourceLabel').textContent = CONFIG.API_BASE ? 'ESP32 (HTTP)' : 'Simulación';
  setChip($('modeChip'), CONFIG.API_BASE ? 'chip-ok' : 'chip-info',
    CONFIG.API_BASE ? 'ESP32 en vivo' : 'Modo simulación', false);
}

function bindUI() {
  $('pumpBtn').addEventListener('click', () => setPump(!state.pumpOn, 'manual'));
  $('emergencyBtn').addEventListener('click', emergencyStop);

  $('autoCutToggle').addEventListener('change', (e) => {
    state.autoCut = e.target.checked;
    addEvent('info', `Corte anti-desborde ${state.autoCut ? 'activado' : 'desactivado'}`,
      `Umbral configurado en ${CONFIG.OVERFLOW_CUT}%.`);
  });
  $('autoFillToggle').addEventListener('change', (e) => {
    state.autoFill = e.target.checked;
    addEvent('info', `Llenado automático ${state.autoFill ? 'activado' : 'desactivado'}`,
      `Se activa por debajo de ${CONFIG.THRESHOLD_CRITICAL}%.`);
    applyAutomation();
  });

  $('exportBtn').addEventListener('click', exportCSV);
  $('clearBtn').addEventListener('click', () => {
    state.history = [];
    renderHistory();
    renderChart();
    toast('Historial limpiado', 'info');
  });

  $('bellBtn').addEventListener('click', () => {
    state.unseenAlerts = false;
    renderEvents();
    $('eventos').scrollIntoView({ behavior: 'smooth' });
  });

  // Menú lateral en móvil / tablet
  const openSidebar = () => { $('sidebar').classList.add('open'); $('backdrop').classList.add('show'); };
  const closeSidebar = () => { $('sidebar').classList.remove('open'); $('backdrop').classList.remove('show'); };
  $('menuBtn').addEventListener('click', openSidebar);
  $('closeSidebar').addEventListener('click', closeSidebar);
  $('backdrop').addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

  document.querySelectorAll('.nav-item').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      link.classList.add('active');
      closeSidebar();
    });
  });
}

function init() {
  applyConfigLabels();
  seedHistory();
  bindUI();
  addEvent('ok', 'Dashboard iniciado',
    CONFIG.API_BASE ? `Leyendo datos de ${CONFIG.API_BASE}` : 'Modo simulación: los datos son de prueba.');
  state.latency = 24;
  renderAll(false);

  setInterval(tick, CONFIG.POLL_MS);
  setInterval(renderRuntime, 1000);
  if (CONFIG.API_BASE) tick();
}

init();