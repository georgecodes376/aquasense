/* =========================================================
   utils.js · Funciones de apoyo que usan varios componentes
   ========================================================= */

import { CONFIG } from './config.js';

export const $ = (id) => document.getElementById(id);
export const rand = (min, max) => min + Math.random() * (max - min);
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const toLiters = (lvl) => Math.round((lvl / 100) * CONFIG.TANK_CAPACITY_L);
export const fmtTime = (d) =>
  d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Clasificación del nivel ---------- */
export function getStatus(level) {
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

/* ---------- Chips de estado ---------- */
export function setChip(el, cls, text, pulse = true) {
  const extra = el.dataset.extra ? ` ${el.dataset.extra}` : '';
  el.className = `chip ${cls}${extra}`;
  el.innerHTML = `<i class="dot${pulse ? ' pulse' : ''}"></i><span>${esc(text)}</span>`;
}

/* ---------- Notificación flotante ---------- */
let toastTimer;
export function toast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
