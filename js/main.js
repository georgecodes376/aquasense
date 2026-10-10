/* =========================================================
   main.js · Punto de arranque del dashboard
   ---------------------------------------------------------
   Inicializa los componentes, pide una lectura cada
   CONFIG.POLL_MS milisegundos, aplica la automatización
   (corte anti-desborde y llenado automático) y redibuja.
   ========================================================= */

import { CONFIG } from './config.js';
import { state } from './state.js';
import { clamp, rand, getStatus, toLiters } from './utils.js';
import { readSensor } from './api.js';

import { initSidebar, renderSidebar } from './components/Sidebar.js';
import { initTopbar, renderTopbar } from './components/Topbar.js';
import { initTankCard, renderTankCard } from './components/TankCard.js';
import { initPumpControl, renderPumpControl, renderRuntime, setPump } from './components/PumpControl.js';
import { initHistoryPanel, renderHistoryPanel } from './components/HistoryPanel.js';
import { addEvent } from './components/EventLog.js';

/* ---------- Dibujar todo ---------- */
function renderAll(highlightRow = false) {
  renderSidebar();
  renderTopbar();
  renderTankCard();
  renderPumpControl();
  renderHistoryPanel(highlightRow);
}

/* ---------- Historial ---------- */
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

/* ---------- Reglas automáticas ---------- */
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

/* ---------- Ciclo de lectura ---------- */
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
    renderSidebar();
    renderTopbar();
  } finally {
    ticking = false;
  }
}

/* ---------- Arranque ---------- */
function init() {
  initSidebar();
  initTopbar();
  initTankCard();
  initPumpControl({ onAutomationChange: applyAutomation });
  initHistoryPanel();

  seedHistory();
  addEvent('ok', 'Dashboard iniciado',
    CONFIG.API_BASE ? `Leyendo datos de ${CONFIG.API_BASE}` : 'Modo simulación: los datos son de prueba.');
  state.latency = 24;
  renderAll(false);

  setInterval(tick, CONFIG.POLL_MS);
  setInterval(renderRuntime, 1000);
  if (CONFIG.API_BASE) tick();
}

init();
