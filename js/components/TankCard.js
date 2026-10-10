/* =========================================================
   TankCard.js · Tarjeta del depósito
   ---------------------------------------------------------
   Tanque animado, lectura central, métricas laterales
   (distancia, tendencia, capacidad) y barra de nivel con leyenda.
   ========================================================= */

import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { $, getStatus, setChip, toLiters } from '../utils.js';

/* Coloca las marcas y textos según los umbrales de CONFIG */
export function initTankCard() {
  [
    ['markCut', CONFIG.OVERFLOW_CUT, `Corte ${CONFIG.OVERFLOW_CUT}%`],
    ['markLow', CONFIG.THRESHOLD_LOW, `Bajo ${CONFIG.THRESHOLD_LOW}%`],
    ['markCrit', CONFIG.THRESHOLD_CRITICAL, `Crítico ${CONFIG.THRESHOLD_CRITICAL}%`],
  ].forEach(([id, at, txt]) => {
    const el = $(id);
    el.style.setProperty('--at', `${at}%`);
    el.querySelector('span').textContent = txt;
  });

  $('tickLow').style.left = `${CONFIG.THRESHOLD_LOW}%`;
  $('tickCrit').style.left = `${CONFIG.THRESHOLD_CRITICAL}%`;
  $('legendNormal').textContent = `🟢 Normal ≥ ${CONFIG.THRESHOLD_LOW}%`;
  $('legendLow').textContent = `🟡 Bajo ${CONFIG.THRESHOLD_CRITICAL}–${CONFIG.THRESHOLD_LOW - 1}%`;
  $('legendCrit').textContent = `🔴 Crítico < ${CONFIG.THRESHOLD_CRITICAL}%`;
  $('capValue').textContent = `${CONFIG.TANK_CAPACITY_L.toLocaleString('es-MX')} L`;
}

export function renderTankCard() {
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
}
