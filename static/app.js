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

let portfolio = loadPortfolio();
let chart = null;
let lastChart = { labels: [], values: [] };
let renderVersion = 0;

const CHART_COLORS = [
  "#22d3ee", "#2fd39b", "#818cf8", "#f0645f",
  "#fbbf24", "#c084fc", "#38bdf8", "#f97316"
];

function formatCurrency(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function formatSignedCurrency(amount) {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function formatSignedPct(pct, decimals = 2) {
  const sign = pct < 0 ? "-" : "+";
  return `${sign}${Math.abs(pct).toFixed(decimals)}%`;
}

function savePortfolio() {
  localStorage.setItem("portfolio", JSON.stringify(portfolio));
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

async function fetchPrice(ticker) {
  const res = await fetch(`/price?ticker=${encodeURIComponent(ticker)}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Failed to fetch ${ticker}`);
  }
  const price = Number(data.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Invalid price returned for ${ticker}`);
  }
  return price;
}

async function render() {
  const version = ++renderVersion;
  const holdings = portfolio.map(stock => ({ ...stock }));
  const table = document.getElementById("table-body");

  document.getElementById("empty").style.display = holdings.length ? "none" : "block";

  const results = await Promise.all(holdings.map(async stock => {
    try {
      return { stock, price: await fetchPrice(stock.ticker) };
    } catch {
      return { stock, price: null };
    }
  }));

  // A newer render was requested while price lookups were in flight.
  if (version !== renderVersion) return;

  const rows = document.createDocumentFragment();
  let totalValue = 0;
  let totalCost = 0;
  const labels = [];
  const values = [];
  const failed = [];

  for (const { stock, price } of results) {
    if (price === null) {
      failed.push(stock.ticker);
      rows.append(createRow(stock, [
        { text: stock.ticker, className: "ticker", label: "Ticker" },
        { text: stock.shares, className: "num", label: "Shares" },
        { text: "price unavailable", className: "num down", colSpan: 3, label: "Price" }
      ]));
      continue;
    }

    const value = price * stock.shares;
    const cost = stock.buy_price * stock.shares;
    const gain = value - cost;
    const gainPct = cost ? (gain / cost) * 100 : 0;
    const cls = gain >= 0 ? "up" : "down";

    totalValue += value;
    totalCost += cost;
    labels.push(stock.ticker);
    values.push(value);

    rows.append(createRow(stock, [
      { text: stock.ticker, className: "ticker", label: "Ticker" },
      { text: stock.shares, className: "num", label: "Shares" },
      { text: formatCurrency(price), className: "num", label: "Price" },
      { text: formatCurrency(value), className: "num", label: "Value" },
      { text: `${formatSignedCurrency(gain)} (${formatSignedPct(gainPct, 1)})`, className: `num ${cls}`, label: "Gain" }
    ]));
  }

  table.replaceChildren(rows);

  document.getElementById("total").innerText = formatCurrency(totalValue);

  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost ? (totalGain / totalCost) * 100 : 0;
  const gainEl = document.getElementById("total-gain");
  if (labels.length) {
    gainEl.innerText = `${formatSignedCurrency(totalGain)} (${formatSignedPct(totalGainPct)})`;
    gainEl.className = "hero-gain " + (totalGain >= 0 ? "up" : "down");
  } else {
    gainEl.innerText = "—";
    gainEl.className = "hero-gain";
  }

  if (failed.length) {
    showBanner(`Couldn't fetch a price for: ${failed.join(", ")}. Check the ticker symbol.`);
  } else {
    clearBanner();
  }

  renderChart(labels, values);
}

function createRow(stock, cells) {
  const row = document.createElement("tr");
  for (const { text, className, colSpan, label } of cells) {
    const cell = document.createElement("td");
    cell.textContent = text;
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
  removeButton.addEventListener("click", () => removeStock(stock.ticker));
  actionCell.append(removeButton);
  row.append(actionCell);
  return row;
}

function renderChart(labels, values) {
  lastChart = { labels, values };
  const ctx = document.getElementById("chart");
  const styles = getComputedStyle(document.documentElement);
  const borderColor = styles.getPropertyValue("--bg").trim() || "#0b0d12";
  const legendColor = styles.getPropertyValue("--muted").trim() || "#8b90a0";
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
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: legendColor, padding: 14, font: { size: 12 }, boxWidth: 12 }
        }
      }
    }
  });
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
    await render();
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
