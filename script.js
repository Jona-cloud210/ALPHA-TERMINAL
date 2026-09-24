// Database State & Initializers
const DB_NAME = 'SDTradeJournalDB';
const DB_VERSION = 1;
const STORE_NAME = 'trades';
let db = null;
let trades = [];
let currentDirection = 'LONG';
let currentCalendarDate = new Date();

// View Switching Logic
const navItems = document.querySelectorAll('.nav-item');
const viewSections = document.querySelectorAll('.view-section');
const pageTitle = document.getElementById('pageTitle');

const titlesMap = {
  'view-dashboard': 'Dashboard Overview',
  'view-logger': 'Execute Trade Logger',
  'view-history': 'Trade Execution Records',
  'view-calendar': 'Trading Calendar'
};

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetViewId = item.getAttribute('data-target');

    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    viewSections.forEach(section => {
      if (section.id === targetViewId) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    });

    if (pageTitle && titlesMap[targetViewId]) {
      pageTitle.textContent = titlesMap[targetViewId];
    }

    if (targetViewId === 'view-calendar') renderCalendar();
    if (targetViewId === 'view-dashboard') {
      renderDashboardVisuals();
      triggerChartAnimation();
    }
  });
});

// Utility to re-trigger SVG Chart Drawing Keyframe
function triggerChartAnimation() {
  const chartLine = document.getElementById('chartLine');
  const chartArea = document.getElementById('chartArea');
  if (chartLine && chartArea) {
    chartLine.style.animation = 'none';
    chartArea.style.animation = 'none';
    chartLine.offsetHeight; // Force DOM reflow
    chartArea.offsetHeight;
    chartLine.style.animation = null;
    chartArea.style.animation = null;
  }
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function loadTradesFromDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function saveTradesToDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    trades.forEach(t => store.put(t));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Direction Switcher
function setDirection(dir) {
  currentDirection = dir;
  const btnLong = document.getElementById('btnLong');
  const btnShort = document.getElementById('btnShort');

  if (dir === 'LONG') {
    btnLong.className = 'direction-btn selected-long';
    btnShort.className = 'direction-btn';
  } else {
    btnLong.className = 'direction-btn';
    btnShort.className = 'direction-btn selected-short';
  }
}

document.getElementById('btnLong').addEventListener('click', () => setDirection('LONG'));
document.getElementById('btnShort').addEventListener('click', () => setDirection('SHORT'));

function calculateRR(entry, sl, tp, direction) {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return "0.00R";
  return (reward / risk).toFixed(2) + "R";
}

async function loadTrades() {
  try {
    await initDB();
    trades = await loadTradesFromDB();
    renderDashboardVisuals();
    renderTrades();
    renderCalendar();
  } catch (err) {
    console.error("Initialization failure:", err);
  }
}

document.addEventListener('DOMContentLoaded', loadTrades);

// Animated Number Counter Utility
function animateValue(element, start, end, duration, isCurrency = false) {
  if (start === end) return;
  const range = end - start;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic
    const currentValue = start + (range * easeProgress);

    if (isCurrency) {
      element.innerText = (currentValue >= 0 ? '+$' : '-$') + 
        Math.abs(currentValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      element.innerText = currentValue.toFixed(1) + '%';
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.classList.add('value-updated');
      setTimeout(() => element.classList.remove('value-updated'), 400);
    }
  }

  requestAnimationFrame(update);
}

// Form Submit
document.getElementById('tradeForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const entryPrice = parseFloat(document.getElementById('entryPrice').value);
  const stopLoss = parseFloat(document.getElementById('stopLoss').value);
  const takeProfit = parseFloat(document.getElementById('takeProfit').value);

  const newTrade = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    symbol: document.getElementById('symbol').value.toUpperCase().trim(),
    direction: currentDirection,
    session: document.getElementById('session').value,
    htfBias: document.getElementById('htfBias').value,
    poiType: document.getElementById('poiType').value,
    entryPrice: entryPrice,
    stopLoss: stopLoss,
    takeProfit: takeProfit,
    plannedRR: calculateRR(entryPrice, stopLoss, takeProfit, currentDirection),
    pnl: parseFloat(document.getElementById('pnl').value) || 0,
    liquidityTarget: document.getElementById('liquidityTarget').value.trim(),
    htfChart: document.getElementById('htfChart').value.trim(),
    ltfChart: document.getElementById('ltfChart').value.trim(),
    notes: document.getElementById('notes').value.trim()
  };

  trades.push(newTrade);
  await saveTradesToDB();
  
  document.getElementById('tradeForm').reset();
  setDirection('LONG');
  
  renderDashboardVisuals();
  renderTrades();
  renderCalendar();
  
  document.querySelector('.nav-item[data-target="view-dashboard"]').click();
});

// Dashboard KPI & Visual Chart Rendering
function renderDashboardVisuals() {
  const netPnlEl = document.getElementById('kpiNetPnl');
  const winRateEl = document.getElementById('kpiWinRate');
  const winRateBar = document.getElementById('kpiWinRateBar');
  const winLossRatioEl = document.getElementById('kpiWinLossRatio');
  const profitFactorEl = document.getElementById('kpiProfitFactor');
  const grossBreakdownEl = document.getElementById('kpiGrossBreakdown');
  const avgRREl = document.getElementById('kpiAvgRR');
  const totalTradesEl = document.getElementById('kpiTotalTrades');

  if (trades.length === 0) {
    netPnlEl.innerText = '$0.00';
    netPnlEl.className = 'kpi-value';
    winRateEl.innerText = '0.0%';
    winRateBar.style.width = '0%';
    winLossRatioEl.innerText = '0W / 0L / 0BE';
    profitFactorEl.innerText = '0.00';
    grossBreakdownEl.innerText = 'Gross: +$0 / -$0';
    avgRREl.innerText = '0.00R';
    totalTradesEl.innerText = '0 Total Executions';
    renderEquityChart([]);
    renderRecentTradesWidget([]);
    return;
  }

  let netPnl = 0;
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalRR = 0;

  const sortedChronological = [...trades].sort((a, b) => a.id - b.id);
  const equityPoints = [];

  sortedChronological.forEach(t => {
    netPnl += t.pnl;
    equityPoints.push(netPnl);

    if (t.pnl > 0) {
      wins++;
      grossProfit += t.pnl;
    } else if (t.pnl < 0) {
      losses++;
      grossLoss += Math.abs(t.pnl);
    } else {
      breakevens++;
    }

    totalRR += parseFloat(t.plannedRR) || 0;
  });

  const totalTrades = trades.length;
  const winRate = ((wins / totalTrades) * 100).toFixed(1);
  const profitFactor = grossLoss === 0 ? grossProfit.toFixed(2) : (grossProfit / grossLoss).toFixed(2);
  const avgRR = (totalRR / totalTrades).toFixed(2);

  const prevNetPnl = parseFloat(netPnlEl.getAttribute('data-prev-val') || '0');
  animateValue(netPnlEl, prevNetPnl, netPnl, 600, true);
  netPnlEl.setAttribute('data-prev-val', netPnl);
  netPnlEl.className = `kpi-value ${netPnl >= 0 ? 'text-profit' : 'text-loss'}`;

  const prevWinRate = parseFloat(winRateEl.getAttribute('data-prev-val') || '0');
  animateValue(winRateEl, prevWinRate, parseFloat(winRate), 600, false);
  winRateEl.setAttribute('data-prev-val', winRate);

  winRateBar.style.width = `${winRate}%`;
  winLossRatioEl.innerText = `${wins}W / ${losses}L / ${breakevens}BE`;
  
  profitFactorEl.innerText = profitFactor;
  grossBreakdownEl.innerText = `Gross: +$${Math.round(grossProfit)} / -$${Math.round(grossLoss)}`;
  
  avgRREl.innerText = `${avgRR}R`;
  totalTradesEl.innerText = `${totalTrades} Total Execution${totalTrades > 1 ? 's' : ''}`;

  renderEquityChart(equityPoints);
  renderRecentTradesWidget([...trades].sort((a, b) => b.id - a.id).slice(0, 5));
}

// Render Equity SVG Chart
function renderEquityChart(points) {
  const chartLine = document.getElementById('chartLine');
  const chartArea = document.getElementById('chartArea');
  if (!chartLine || !chartArea) return;

  if (points.length < 2) {
    chartLine.setAttribute('d', '');
    chartArea.setAttribute('d', '');
    return;
  }

  const width = 600;
  const height = 200;
  const padding = 20;

  const minVal = Math.min(0, ...points);
  const maxVal = Math.max(...points);
  const range = (maxVal - minVal) || 1;

  const stepX = (width - padding * 2) / (points.length - 1);

  let pathD = '';
  points.forEach((val, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
    pathD += (i === 0 ? 'M' : 'L') + ` ${x} ${y}`;
  });

  chartLine.setAttribute('d', pathD);

  const firstX = padding;
  const lastX = padding + (points.length - 1) * stepX;
  const areaD = pathD + ` L ${lastX} ${height} L ${firstX} ${height} Z`;
  chartArea.setAttribute('d', areaD);
}

// Render Recent Executions Sub-Widget
function renderRecentTradesWidget(recentTrades) {
  const container = document.getElementById('recentTradesList');
  if (!container) return;
  container.innerHTML = '';

  if (recentTrades.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px;">No executions logged yet.</div>';
    return;
  }

  recentTrades.forEach(t => {
    const isWin = t.pnl > 0;
    const isLoss = t.pnl < 0;
    const pnlClass = isWin ? 'text-profit' : (isLoss ? 'text-loss' : '');
    const formattedPnl = (t.pnl >= 0 ? '+$' : '-$') + Math.abs(t.pnl).toLocaleString('en-US', { minimumFractionDigits: 2 });

    container.innerHTML += `
      <div class="recent-trade-row">
        <div>
          <div style="font-weight:700; color:var(--text-white); font-family:var(--font-mono);">${t.symbol} <span class="direction-badge ${t.direction.toLowerCase()}">${t.direction}</span></div>
          <div style="font-size:11px; color:var(--text-muted);">${t.session} • ${t.poiType}</div>
        </div>
        <div style="text-align:right;">
          <div class="${pnlClass}" style="font-weight:700; font-family:var(--font-mono);">${formattedPnl}</div>
          <div style="font-size:10px; color:var(--text-muted);">${t.plannedRR}</div>
        </div>
      </div>
    `;
  });
}

// History & Delete Mechanics
async function deleteTrade(id) {
  if (confirm('Permanently delete this trade execution record?')) {
    trades = trades.filter(t => t.id !== id);
    await saveTradesToDB();
    renderDashboardVisuals();
    renderTrades();
    renderCalendar();
    closeDayModal();
  }
}

document.getElementById('searchInput').addEventListener('input', renderTrades);
document.getElementById('filterSession').addEventListener('change', renderTrades);
document.getElementById('viewAllExecutionsBtn').addEventListener('click', () => {
  document.querySelector('.nav-item[data-target="view-history"]').click();
});

function createTradeCardHtml(trade) {
  const isWin = trade.pnl > 0;
  const isLoss = trade.pnl < 0;
  const statusClass = isWin ? 'win' : (isLoss ? 'loss' : 'breakeven');
  const formattedPnl = (trade.pnl >= 0 ? "+$" : "-$") + Math.abs(trade.pnl).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const pnlClass = isWin ? 'profit' : (isLoss ? 'loss-text' : 'neutral');

  const formattedDate = trade.timestamp 
    ? new Date(trade.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return `
    <li class="trade-card ${statusClass}">
      <div class="trade-header">
        <div class="trade-symbol-group">
          <span class="trade-symbol">${trade.symbol}</span>
          <span class="direction-badge ${trade.direction.toLowerCase()}">${trade.direction}</span>
          <span style="font-size: 11px; color: var(--text-muted);">${formattedDate}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="trade-pnl ${pnlClass}">${formattedPnl}</div>
          <button class="btn btn-danger btn-sm" onclick="deleteTrade(${trade.id})">Delete</button>
        </div>
      </div>

      <div class="trade-badges">
        <span class="badge badge-accent">${trade.session}</span>
        <span class="badge">Bias: ${trade.htfBias}</span>
        <span class="badge">Zone: ${trade.poiType}</span>
        ${trade.liquidityTarget ? `<span class="badge">Target: ${trade.liquidityTarget}</span>` : ''}
        <span class="badge">Planned: ${trade.plannedRR}</span>
      </div>

      <div class="trade-data-grid">
        <div class="data-item"><span class="data-label">Entry</span><span class="data-value">${trade.entryPrice}</span></div>
        <div class="data-item"><span class="data-label">Stop Loss</span><span class="data-value">${trade.stopLoss}</span></div>
        <div class="data-item"><span class="data-label">Take Profit</span><span class="data-value">${trade.takeProfit}</span></div>
      </div>

      ${trade.notes ? `<div class="trade-notes">${trade.notes}</div>` : ''}

      <div class="trade-footer">
        <div class="chart-links">
          ${trade.htfChart ? `<a href="${trade.htfChart}" target="_blank" class="chart-link">↗ HTF Zone</a>` : ''}
          ${trade.ltfChart ? `<a href="${trade.ltfChart}" target="_blank" class="chart-link">↗ LTF Execution</a>` : ''}
        </div>
        <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">ID: #${trade.id.toString().slice(-6)}</span>
      </div>
    </li>
  `;
}

function renderTrades() {
  const listEl = document.getElementById('tradeList');
  listEl.innerHTML = '';

  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const sessionFilter = document.getElementById('filterSession').value;

  const filteredTrades = trades.filter(t => {
    const matchesSearch = t.symbol.toLowerCase().includes(searchTerm) ||
                          t.poiType.toLowerCase().includes(searchTerm) ||
                          t.liquidityTarget.toLowerCase().includes(searchTerm);
    const matchesSession = sessionFilter === 'ALL' || t.session === sessionFilter;
    return matchesSearch && matchesSession;
  });

  if (filteredTrades.length === 0) {
    listEl.innerHTML = `<div class="empty-state" style="padding:48px; text-align:center; color:var(--text-muted);">No records found matching active criteria.</div>`;
    return;
  }

  [...filteredTrades].sort((a, b) => b.id - a.id).forEach(trade => {
    listEl.innerHTML += createTradeCardHtml(trade);
  });
}

// Calendar View Logic
function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  document.getElementById('calendarMonthTitle').innerText = `${monthNames[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    grid.appendChild(emptyCell);
  }

  for (let day = 1; day <= totalDays; day++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const dayTrades = trades.filter(t => {
      const tDate = new Date(t.timestamp);
      return tDate.getFullYear() === year && tDate.getMonth() === month && tDate.getDate() === day;
    });

    let dayContent = `<span style="font-size:11px; font-weight:600; color:var(--text-white);">${day}</span>`;

    if (dayTrades.length > 0) {
      const netDayPnl = dayTrades.reduce((acc, curr) => acc + curr.pnl, 0);
      if (netDayPnl > 0) dayCell.classList.add('win-day');
      if (netDayPnl < 0) dayCell.classList.add('loss-day');

      dayCell.classList.add('has-trades');
      const formattedDayPnl = (netDayPnl >= 0 ? "+$" : "-$") + Math.abs(netDayPnl).toLocaleString('en-US', { minimumFractionDigits: 2 });
      const pnlClass = netDayPnl > 0 ? 'text-profit' : (netDayPnl < 0 ? 'text-loss' : '');

      dayContent += `
        <div style="text-align:right;">
          <div class="${pnlClass}" style="font-size:11px; font-weight:700; font-family:var(--font-mono);">${formattedDayPnl}</div>
          <div style="font-size:10px; color:var(--text-muted);">${dayTrades.length} trade${dayTrades.length > 1 ? 's' : ''}</div>
        </div>
      `;

      dayCell.addEventListener('click', () => openDayModal(dateStr, dayTrades));
    }

    dayCell.innerHTML = dayContent;
    grid.appendChild(dayCell);
  }
}

document.getElementById('prevMonthBtn').addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); renderCalendar(); });
document.getElementById('nextMonthBtn').addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); renderCalendar(); });
document.getElementById('todayBtn').addEventListener('click', () => { currentCalendarDate = new Date(); renderCalendar(); });

function openDayModal(dateStr, dayTrades) {
  const modalOverlay = document.getElementById('dayModalOverlay');
  const modalTitle = document.getElementById('modalDateTitle');
  const modalList = document.getElementById('modalTradeList');

  const formattedTitleDate = new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  modalTitle.innerText = `Executions: ${formattedTitleDate}`;
  modalList.innerHTML = '';

  dayTrades.forEach(t => { modalList.innerHTML += createTradeCardHtml(t); });
  modalOverlay.classList.remove('hidden');
}

function closeDayModal() { document.getElementById('dayModalOverlay').classList.add('hidden'); }
document.getElementById('modalCloseBtn').addEventListener('click', closeDayModal);

// Import / Export System
document.getElementById('exportJsonBtn').addEventListener('click', () => {
  if (trades.length === 0) return alert("No active data available.");
  const blob = new Blob([JSON.stringify(trades, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sd_journal_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (trades.length === 0) return alert("No active data available.");
  const headers = ["ID", "Timestamp", "Symbol", "Direction", "Session", "HTF Bias", "Zone Type", "Target Zone", "Entry", "SL", "TP", "Planned RR", "P&L", "HTF Chart", "LTF Chart", "Notes"];
  const escapeCsvCell = (cell) => `"${String(cell || '').replace(/"/g, '""')}"`;
  const rows = trades.map(t => [t.id, t.timestamp, t.symbol, t.direction, t.session, t.htfBias, t.poiType, t.liquidityTarget, t.entryPrice, t.stopLoss, t.takeProfit, t.plannedRR, t.pnl, t.htfChart, t.ltfChart, t.notes].map(escapeCsvCell).join(','));
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sd_journal_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedTrades = JSON.parse(event.target.result);
      if (Array.isArray(importedTrades)) {
        trades = importedTrades;
        await saveTradesToDB();
        renderDashboardVisuals();
        renderTrades();
        renderCalendar();
        alert('Database restored successfully!');
      }
    } catch (err) { alert('Error parsing backup file.'); }
  };
  reader.readAsText(file);
});

document.getElementById('clearAllBtn').addEventListener('click', async () => {
  if (confirm('Permanently clear all trade logs?')) {
    trades = [];
    await saveTradesToDB();
    renderDashboardVisuals();
    renderTrades();
    renderCalendar();
  }
});