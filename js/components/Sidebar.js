/* =========================================================
   Sidebar.js · Menú lateral
   ---------------------------------------------------------
   Tarjeta de enlace MCU, navegación, paro de emergencia y
   apertura/cierre del menú en celular y tablet.
   ========================================================= */

import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { $, setChip } from '../utils.js';
import { emergencyStop } from './PumpControl.js';

export function initSidebar() {
  $('sourceLabel').textContent = CONFIG.API_BASE ? 'ESP32 (HTTP)' : 'Simulación';
  $('emergencyBtn').addEventListener('click', emergencyStop);

  // Menú deslizable (el botón de abrir vive en el topbar)
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

export function renderSidebar() {
  const on = state.online;
  setChip($('mcuChip'), on ? 'chip-ok' : 'chip-crit', on ? 'Online' : 'Offline');
  $('latency').textContent = on ? `${state.latency} ms` : '—';
}
