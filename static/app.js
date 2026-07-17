const TICKER_PATTERN = /^[A-Z0-9.^=-]{1,20}$/;

function isValidPosition(ticker, shares, buyPrice) {
  return TICKER_PATTERN.test(ticker)
    && Number.isFinite(shares) && shares > 0
    && Number.isFinite(buyPrice) && buyPrice > 0;
}

function loadPortfolio() {
  try {
    const saved = JSON.parse(localStorage.getItem("portfolio"));
    if (!Array.isArray(saved)) return [];

    return saved.filter(stock => isValidPosition(
      typeof stock?.ticker === "string" ? stock.ticker : "",
      stock?.shares,
      stock?.buy_price
    ));
  } catch {
    return [];
  }
}

function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem("watchlist"));
    if (!Array.isArray(saved)) return [];
    return saved.filter(t => typeof t === "string" && TICKER_PATTERN.test(t));
  } catch {
    return [];
  }
}

let portfolio = loadPortfolio();
let watchlist = loadWatchlist();
let chart = null;
let lastChart = { labels: [], values: [] };
let renderVersion = 0;
let watchlistVersion = 0;

const CHART_COLORS = [
  "#22d3ee", "#2fd39b", "#818cf8", "#f0645f",
  "#fbbf24", "#c084fc", "#38bdf8", "#f97316"
];

function formatAmount(amount) {
  return Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCurrency(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${formatAmount(amount)}`;
}

function formatSignedCurrency(amount) {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}$${formatAmount(amount)}`;
}

function formatSignedPct(pct, decimals = 2) {
  const sign = pct < 0 ? "-" : "+";
  return `${sign}${Math.abs(pct).toFixed(decimals)}%`;
}

function gainParts(gain, gainPct, decimals) {
  const amount = document.createElement("span");
  amount.className = "gain-amt";
  amount.textContent = formatSignedCurrency(gain);
  const pct = document.createElement("span");
  pct.className = "gain-pct";
  pct.textContent = formatSignedPct(gainPct, decimals);
  return [amount, pct];
}

// Table cells: dollars stacked above the percent.
function gainStack(gain, gainPct, decimals) {
  const wrap = document.createElement("span");
  wrap.className = "gain";
  wrap.append(...gainParts(gain, gainPct, decimals));
  return wrap;
}

// Hero: "TOTAL GAIN +$5,234.56 +36.33%" — label, then inline values.
// A null gain renders as a muted dash.
function heroStat(label, gain, gainPct) {
  const stat = document.createElement("span");
  stat.className = "stat";
  const labelEl = document.createElement("span");
  labelEl.className = "stat-label";
  labelEl.textContent = label;
  const value = document.createElement("span");
  if (gain === null) {
    value.className = "stat-value stat-empty";
    value.textContent = "—";
  } else {
    value.className = "stat-value " + (gain >= 0 ? "up" : "down");
    const [amount, pct] = gainParts(gain, gainPct, 2);
    value.append(amount, " ", pct);
  }
  stat.append(labelEl, value);
  return stat;
}

function savePortfolio() {
  localStorage.setItem("portfolio", JSON.stringify(portfolio));
}

function saveWatchlist() {
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
}

function showBanner(msg) {
  const b = document.getElementById("banner");
  b.textContent = msg;
  b.hidden = false;
}

function clearBanner() {
  const b = document.getElementById("banner");
  b.hidden = true;
  b.textContent = "";
}

async function fetchQuote(ticker) {
  const res = await fetch(`/price?ticker=${encodeURIComponent(ticker)}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Failed to fetch ${ticker}`);
  }
  const price = Number(data.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Invalid price returned for ${ticker}`);
  }
  const prevClose = Number(data.previous_close);
  return {
    price,
    prevClose: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : null
  };
}

async function render() {
  const version = ++renderVersion;
  const holdings = portfolio.map(stock => ({ ...stock }));
  const table = document.getElementById("table-body");

  document.getElementById("empty").style.display = holdings.length ? "none" : "block";

  const results = await Promise.all(holdings.map(async stock => {
    try {
      return { stock, quote: await fetchQuote(stock.ticker) };
    } catch {
      return { stock, quote: null };
    }
  }));

  // A newer render was requested while price lookups were in flight.
  if (version !== renderVersion) return;

  const rows = document.createDocumentFragment();
  let totalValue = 0;
  let totalCost = 0;
  let dailyGain = 0;
  let prevValue = 0;
  const labels = [];
  const values = [];
  const failed = [];

  for (const { stock, quote } of results) {
    if (quote === null) {
      failed.push(stock.ticker);
      rows.append(createRow([
        { text: stock.ticker, className: "ticker", label: "Ticker" },
        { text: stock.shares, className: "num", label: "Shares" },
        { text: "price unavailable", className: "num down", colSpan: 4, label: "Price" }
      ], () => removeStock(stock.ticker)));
      continue;
    }

    const price = quote.price;
    const value = price * stock.shares;
    const cost = stock.buy_price * stock.shares;
    const gain = value - cost;
    const gainPct = cost ? (gain / cost) * 100 : 0;
    const cls = gain >= 0 ? "up" : "down";

    let dailyCell = { text: "—", className: "num", label: "Daily Gain" };
    if (quote.prevClose !== null) {
      const day = (price - quote.prevClose) * stock.shares;
      const dayPct = ((price - quote.prevClose) / quote.prevClose) * 100;
      dailyGain += day;
      prevValue += quote.prevClose * stock.shares;
      dailyCell = {
        nodes: [gainStack(day, dayPct, 2)],
        className: `num ${day >= 0 ? "up" : "down"}`,
        label: "Daily Gain"
      };
    }

    totalValue += value;
    totalCost += cost;
    labels.push(stock.ticker);
    values.push(value);

    rows.append(createRow([
      { text: stock.ticker, className: "ticker", label: "Ticker" },
      { text: stock.shares, className: "num", label: "Shares" },
      { text: formatCurrency(price), className: "num", label: "Price" },
      { text: formatCurrency(value), className: "num", label: "Value" },
      { nodes: [gainStack(gain, gainPct, 2)], className: `num ${cls}`, label: "Total Gain" },
      dailyCell
    ], () => removeStock(stock.ticker)));
  }

  table.replaceChildren(rows);

  document.getElementById("total").innerText = formatCurrency(totalValue);

  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost ? (totalGain / totalCost) * 100 : 0;
  const statsEl = document.getElementById("hero-stats");
  statsEl.replaceChildren(
    heroStat("Total Gain", labels.length ? totalGain : null, totalGainPct),
    heroStat("Daily Gain", labels.length && prevValue ? dailyGain : null,
      prevValue ? (dailyGain / prevValue) * 100 : 0)
  );

  if (failed.length) {
    showBanner(`Couldn't fetch a price for: ${failed.join(", ")}. Check the ticker symbol.`);
  } else {
    clearBanner();
  }

  renderChart(labels, values);
}

function createRow(cells, onRemove) {
  const row = document.createElement("tr");
  for (const { text, nodes, className, colSpan, label } of cells) {
    const cell = document.createElement("td");
    if (nodes) cell.append(...nodes);
    else cell.textContent = text;
    if (className) cell.className = className;
    if (colSpan) cell.colSpan = colSpan;
    if (label) cell.setAttribute("data-label", label);
    row.append(cell);
  }

  const actionCell = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove";
  removeButton.textContent = "✕";
  removeButton.addEventListener("click", onRemove);
  actionCell.append(removeButton);
  row.append(actionCell);
  return row;
}

function renderChart(labels, values) {
  lastChart = { labels, values };
  const ctx = document.getElementById("chart");
  const styles = getComputedStyle(document.documentElement);
  const borderColor = styles.getPropertyValue("--bg").trim() || "#0b0d12";
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderColor: borderColor,
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      cutout: "62%",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      }
    }
  });
  renderLegend(labels, values);
}

function renderLegend(labels, values) {
  const legend = document.getElementById("chart-legend");
  const total = values.reduce((sum, v) => sum + v, 0);
  const rows = document.createDocumentFragment();
  labels.forEach((ticker, i) => {
    const row = document.createElement("div");
    row.className = "legend-row";

    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = CHART_COLORS[i % CHART_COLORS.length];

    const name = document.createElement("span");
    name.className = "legend-ticker";
    name.textContent = ticker;

    const pct = document.createElement("span");
    pct.className = "legend-pct";
    pct.textContent = total ? `${((values[i] / total) * 100).toFixed(1)}%` : "0.0%";

    row.append(dot, name, pct);
    rows.append(row);
  });
  legend.replaceChildren(rows);
}

async function renderWatchlist() {
  const version = ++watchlistVersion;
  const tickers = [...watchlist];
  const table = document.getElementById("watchlist-body");

  document.getElementById("watchlist-empty").style.display = tickers.length ? "none" : "block";

  const results = await Promise.all(tickers.map(async ticker => {
    try {
      return { ticker, quote: await fetchQuote(ticker) };
    } catch {
      return { ticker, quote: null };
    }
  }));

  // A newer watchlist render was requested while lookups were in flight.
  if (version !== watchlistVersion) return;

  const rows = document.createDocumentFragment();
  for (const { ticker, quote } of results) {
    if (quote === null) {
      rows.append(createRow([
        { text: ticker, className: "ticker", label: "Ticker" },
        { text: "price unavailable", className: "num down", colSpan: 2, label: "Price" }
      ], () => removeWatch(ticker)));
      continue;
    }

    let changeCell;
    if (quote.prevClose === null) {
      changeCell = { text: "—", className: "num", label: "Day" };
    } else {
      const change = quote.price - quote.prevClose;
      const changePct = (change / quote.prevClose) * 100;
      const cls = change >= 0 ? "up" : "down";
      changeCell = { nodes: [gainStack(change, changePct, 2)], className: `num ${cls}`, label: "Day" };
    }

    rows.append(createRow([
      { text: ticker, className: "ticker", label: "Ticker" },
      { text: formatCurrency(quote.price), className: "num", label: "Price" },
      changeCell
    ], () => removeWatch(ticker)));
  }

  table.replaceChildren(rows);
}

function addWatch() {
  const input = document.getElementById("watch-ticker");
  const ticker = input.value.trim().toUpperCase();

  if (!TICKER_PATTERN.test(ticker)) {
    showBanner("Enter a valid ticker to add to the watchlist.");
    return;
  }

  if (!watchlist.includes(ticker)) {
    watchlist.push(ticker);
    saveWatchlist();
  }
  input.value = "";
  renderWatchlist();
}

function removeWatch(ticker) {
  watchlist = watchlist.filter(t => t !== ticker);
  saveWatchlist();
  renderWatchlist();
}

function addStock() {
  const ticker = document.getElementById("ticker").value.trim().toUpperCase();
  const shares = parseFloat(document.getElementById("shares").value);
  const buy_price = parseFloat(document.getElementById("buy_price").value);

  if (!isValidPosition(ticker, shares, buy_price)) {
    showBanner("Enter a valid ticker and positive shares and buy price.");
    return;
  }

  const existing = portfolio.find(s => s.ticker === ticker);
  if (existing) {
    // Merge into the existing position with a weighted-average cost basis,
    // so total cost (and gain) stays correct across multiple buys.
    const totalShares = existing.shares + shares;
    const totalCost = existing.shares * existing.buy_price + shares * buy_price;
    existing.shares = totalShares;
    existing.buy_price = totalShares ? totalCost / totalShares : buy_price;
  } else {
    portfolio.push({ ticker, shares, buy_price });
  }
  savePortfolio();

  document.getElementById("ticker").value = "";
  document.getElementById("shares").value = "";
  document.getElementById("buy_price").value = "";

  render();
}

function removeStock(ticker) {
  portfolio = portfolio.filter(s => s.ticker !== ticker);
  savePortfolio();
  render();
}

async function refresh() {
  const btn = document.getElementById("refresh");
  btn.disabled = true;
  btn.classList.add("spinning");
  const original = btn.textContent;
  btn.textContent = "↻ Refreshing…";
  try {
    await Promise.all([render(), renderWatchlist()]);
  } finally {
    btn.disabled = false;
    btn.classList.remove("spinning");
    btn.textContent = original;
  }
}

function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);
  // Button shows the mode you'd switch to.
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = t === "dark" ? "☀" : "🌙";
  if (chart) renderChart(lastChart.labels, lastChart.values);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  setTheme(saved === "light" ? "light" : "dark");
}

initTheme();
render();
renderWatchlist();
