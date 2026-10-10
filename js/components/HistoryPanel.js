/* =========================================================
   HistoryPanel.js · Historial de lecturas
   ---------------------------------------------------------
   Gráfica SVG del nivel en el tiempo, tabla de lecturas
   recientes y botones de exportar CSV y limpiar.
   ========================================================= */

import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { $, fmtTime, getStatus, toast } from '../utils.js';

export function initHistoryPanel() {
  $('exportBtn').addEventListener('click', exportCSV);
  $('clearBtn').addEventListener('click', () => {
    state.history = [];
    renderHistoryPanel();
    toast('Historial limpiado', 'info');
  });
}

export function renderHistoryPanel(highlight = false) {
  renderTable(highlight);
  renderChart();
}

function renderTable(highlight) {
  const rows = state.history.slice(0, CONFIG.HISTORY_TABLE_ROWS);
  $('historyCount').textContent = `${state.history.length} lecturas`;

  if (!rows.length) {
    $('historyBody').innerHTML =
      '<tr><td colspan="5" class="empty">Sin lecturas todavía. Esperando datos del sensor…</td></tr>';
    return;
  }

  $('historyBody').innerHTML = rows.map((h, i) => {
    const s = getStatus(h.level);
    return `
      <tr class="${i === 0 && highlight ? 'fresh' : ''}">
        <td class="mono">${fmtTime(h.time)}</td>
        <td class="num strong">${h.level.toFixed(1)}%</td>
        <td class="num">${h.liters} L</td>
        <td><span class="pump-pill${h.pumpOn ? ' on' : ''}">${h.pumpOn ? 'ON' : 'OFF'}</span></td>
        <td><span class="chip ${s.chip}">${s.emoji} ${s.label}</span></td>
      </tr>`;
  }).join('');
}

function renderChart() {
  const svg = $('chart');
  const pts = state.history.slice(0, CONFIG.CHART_POINTS).reverse(); // antiguo → reciente
  const W = 600, H = 180, L = 36, R = 10, T = 10, B = 12;

  if (pts.length < 2) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="ax">Esperando lecturas…</text>`;
    $('chartFrom').textContent = '--';
    return;
  }

  const x = (i) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v) => T + (1 - v / 100) * (H - T - B);

  const grid = [0, 25, 50, 75, 100].map((v) => `
    <line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="ax" x="${L - 8}" y="${y(v) + 3}" text-anchor="end">${v}%</text>`).join('');

  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${y(0)} ${line} ${x(pts.length - 1).toFixed(1)},${y(0)}`;
  const last = pts[pts.length - 1];

  svg.innerHTML = `
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#06b6d4" stop-opacity="0.28"/>
        <stop offset="1" stop-color="#0284c7" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="lineGrad" gradientUnits="userSpaceOnUse" x1="${L}" y1="0" x2="${W - R}" y2="0">
        <stop offset="0" stop-color="#06b6d4"/>
        <stop offset="1" stop-color="#0284c7"/>
      </linearGradient>
    </defs>
    ${grid}
    <line class="th th-low"  x1="${L}" x2="${W - R}" y1="${y(CONFIG.THRESHOLD_LOW)}" y2="${y(CONFIG.THRESHOLD_LOW)}"/>
    <line class="th th-crit" x1="${L}" x2="${W - R}" y1="${y(CONFIG.THRESHOLD_CRITICAL)}" y2="${y(CONFIG.THRESHOLD_CRITICAL)}"/>
    <polygon points="${area}" fill="url(#areaGrad)"/>
    <polyline points="${line}" fill="none" stroke="url(#lineGrad)" stroke-width="2.5"
              stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last.level).toFixed(1)}" r="5"
            fill="#fff" stroke="#0284c7" stroke-width="2.5"/>`;

  $('chartFrom').textContent = fmtTime(pts[0].time);
}

function exportCSV() {
  if (!state.history.length) {
    toast('No hay lecturas para exportar', 'info');
    return;
  }
  const head = 'fecha,hora,nivel_pct,litros,bomba,estado';
  const lines = [...state.history].reverse().map((h) => [
    h.time.toLocaleDateString('en-CA'),   // AAAA-MM-DD en hora local
    fmtTime(h.time),
    h.level.toFixed(1),
    h.liters,
    h.pumpOn ? 1 : 0,
    getStatus(h.level).label,
  ].join(','));

  const blob = new Blob([`${head}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aquasense_lecturas_${Date.now()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSV descargado', 'ok');
}
