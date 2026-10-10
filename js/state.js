/* =========================================================
   state.js · Estado compartido de la app
   ---------------------------------------------------------
   Todos los componentes leen de este objeto. main.js lo actualiza
   con cada lectura nueva y luego pide a los componentes redibujarse.
   ========================================================= */

export const state = {
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
