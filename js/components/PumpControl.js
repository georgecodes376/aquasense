/* =========================================================
   PumpControl.js · Control de la motobomba
   ---------------------------------------------------------
   Botón de encendido/apagado, interruptores de automatización,
   paro de emergencia y valores eléctricos.
   ========================================================= */

import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { $, rand, fmtTime, toast } from '../utils.js';
import { sendPumpCommand } from '../api.js';
import { addEvent } from './EventLog.js';

/* onAutomationChange: lo pasa main.js para revisar la automatización
   en cuanto se activa el llenado automático. */
export function initPumpControl({ onAutomationChange } = {}) {
  $('cutLabel').textContent = CONFIG.OVERFLOW_CUT;
  $('fillLabel').textContent = CONFIG.THRESHOLD_CRITICAL;

  $('pumpBtn').addEventListener('click', () => setPump(!state.pumpOn, 'manual'));

  $('autoCutToggle').addEventListener('change', (e) => {
    state.autoCut = e.target.checked;
    addEvent('info', `Corte anti-desborde ${state.autoCut ? 'activado' : 'desactivado'}`,
      `Umbral configurado en ${CONFIG.OVERFLOW_CUT}%.`);
  });

  $('autoFillToggle').addEventListener('change', (e) => {
    state.autoFill = e.target.checked;
    addEvent('info', `Llenado automático ${state.autoFill ? 'activado' : 'desactivado'}`,
      `Se activa por debajo de ${CONFIG.THRESHOLD_CRITICAL}%.`);
    if (onAutomationChange) onAutomationChange();
  });
}

export async function setPump(on, source = 'manual') {
  if (state.pumpBusy || state.pumpOn === on) return;
  state.pumpBusy = true;
  renderPumpControl();

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
    renderPumpControl();
  }
}

export async function emergencyStop() {
  if (state.pumpOn) {
    await setPump(false, 'emergencia');
  } else {
    addEvent('info', 'Corte preventivo', 'La bomba ya estaba apagada.');
    toast('La bomba ya está apagada', 'info');
  }
}

export function renderPumpControl() {
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

/* Cronómetro de "Tiempo activa"; main.js lo llama cada segundo */
export function renderRuntime() {
  if (!state.pumpOn || !state.pumpOnSince) {
    $('runValue').textContent = '--:--';
    return;
  }
  const s = Math.floor((Date.now() - state.pumpOnSince) / 1000);
  $('runValue').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
