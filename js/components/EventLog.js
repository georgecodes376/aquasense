/* =========================================================
   EventLog.js · Registro de eventos y alertas
   ---------------------------------------------------------
   Cualquier componente puede llamar a addEvent() para dejar
   constancia de algo. También enciende el punto rojo de la
   campana del topbar cuando hay alertas sin ver.
   ========================================================= */

import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { $, esc, fmtTime } from '../utils.js';

const EVENT_ICON = { ok: 'i-check', info: 'i-info', warn: 'i-alert', crit: 'i-alert' };

export function addEvent(type, title, desc) {
  state.events.unshift({ type, title, desc, time: new Date() });
  if (state.events.length > CONFIG.EVENTS_MAX) state.events.length = CONFIG.EVENTS_MAX;
  if (type === 'warn' || type === 'crit') state.unseenAlerts = true;
  renderEventLog();
}

export function renderEventLog() {
  $('eventCount').textContent = `${state.events.length} ${state.events.length === 1 ? 'evento' : 'eventos'}`;
  $('eventList').innerHTML = state.events.map((e) => `
    <li class="event ${e.type}">
      <svg class="ico ev-ico"><use href="#${EVENT_ICON[e.type]}"/></svg>
      <div><strong>${esc(e.title)}</strong><p>${esc(e.desc)}</p></div>
      <time>${fmtTime(e.time)}</time>
    </li>`).join('');
  $('bellDot').classList.toggle('show', state.unseenAlerts);
}
