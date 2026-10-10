/* =========================================================
   api.js · Comunicación con el ESP32 (o simulación)
   ---------------------------------------------------------
   Es el único archivo que habla con el hardware.

   Con CONFIG.API_BASE en null, genera lecturas de prueba.
   Con la IP del ESP32, usa estos dos endpoints:

     GET  /api/lectura  →  { "nivel": 76.1, "bomba": 0 }
     POST /api/bomba    ←  { "estado": 1 }   (1 = encender, 0 = apagar)

   Si la página NO se sirve desde el propio ESP32, el firmware
   debe responder con la cabecera  Access-Control-Allow-Origin: *
   (si no, el navegador bloquea la petición por CORS).
   ========================================================= */

import { CONFIG } from './config.js';
import { state } from './state.js';
import { rand, clamp, wait } from './utils.js';

export async function readSensor() {
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

export async function sendPumpCommand(on) {
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
