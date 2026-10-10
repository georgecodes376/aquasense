/* =========================================================
   Topbar.js · Barra superior y franja de estado
   ---------------------------------------------------------
   Chip de conexión, píldora de nivel, campana de alertas y
   la franja "¡Todo en orden!" con la hora de la última lectura.
   ========================================================= */

import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { $, getStatus, setChip, toLiters, fmtTime } from '../utils.js';
import { renderEventLog } from './EventLog.js';

export function initTopbar() {
  $('pollLabel').textContent = `${CONFIG.POLL_MS / 1000} s`;
  setChip($('modeChip'), CONFIG.API_BASE ? 'chip-ok' : 'chip-info',
    CONFIG.API_BASE ? 'ESP32 en vivo' : 'Modo simulación', false);

  $('bellBtn').addEventListener('click', () => {
    state.unseenAlerts = false;
    renderEventLog();
    $('eventos').scrollIntoView({ behavior: 'smooth' });
  });
}

export function renderTopbar() {
  const on = state.online;
  const lvl = state.level;
  const s = getStatus(lvl);
  const liters = toLiters(lvl);

  setChip($('connChip'), on ? 'chip-ok' : 'chip-crit', on ? 'ESP32 conectado' : 'Sin enlace');
  $('lastUpdate').textContent = state.lastUpdate ? fmtTime(state.lastUpdate) : '--:--:--';

  $('topLevel').textContent = `${lvl.toFixed(1)}%`;
  $('topBar').style.width = `${lvl}%`;
  $('topBar').dataset.status = s.key;
  $('topLiters').textContent = `${liters.toLocaleString('es-MX')} L`;
  setChip($('statusChip'), s.chip, s.headline);
}
