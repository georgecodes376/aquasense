/* =========================================================
   config.js · Configuración general del dashboard
   ---------------------------------------------------------
   Este es el archivo que se edita para conectar el prototipo:
   cambia API_BASE de null a la IP del ESP32.
   Los endpoints que espera el dashboard están descritos en api.js.
   ========================================================= */

export const CONFIG = {
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
