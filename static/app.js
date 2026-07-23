// Constants and state
const TICKER_PATTERN = /^[A-Z0-9.^=-]{1,20}$/;
const EMPTY_VALUE = "—";
const CHART_COLORS = [
  "#22d3ee", "#2fd39b", "#818cf8", "#f0645f",
  "#fbbf24", "#c084fc", "#38bdf8", "#f97316"
];

let portfolio = loadPortfolio();
let watchlist = loadWatchlist();
let chart = null;
let lastChartData = { labels: [], values: [] };

// Bumped each render so a stale response can bail out
let portfolioRenderVersion = 0;
let watchlistRenderVersion = 0;

// Storage and validation
function isValidTicker(ticker) {
  return TICKER_PATTERN.test(ticker);
}

function isValidPosition(ticker, shares, buyPrice) {
  return isValidTicker(ticker)
    && Number.isFinite(shares) && shares > 0
    && Number.isFinite(buyPrice) && buyPrice > 0;
}

function loadSavedArray(storageKey, isValidItem) {
  try {
    const savedValue = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(savedValue) ? savedValue.filter(isValidItem) : [];
  } catch {
    return [];
  }
}

function loadPortfolio() {
  return loadSavedArray("portfolio", (stock) => isValidPosition(
    typeof stock?.ticker === "string" ? stock.ticker : "",
    stock?.shares,
    stock?.buy_price
  ));
}

function loadWatchlist() {
  return loadSavedArray(
    "watchlist",
    (ticker) => typeof ticker === "string" && isValidTicker(ticker)
  );
}

function savePortfolio() {
  localStorage.setItem("portfolio", JSON.stringify(portfolio));
}

function saveWatchlist() {
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
}

// Formatting and UI helpers
function getElement(id) {
  return document.getElementById(id);
}

function formatAmount(amount) {
  return Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCurrency(amount) {
  return `${amount < 0 ? "-" : ""}$${formatAmount(amount)}`;
}

function formatSignedCurrency(amount) {
  return `${amount < 0 ? "-" : "+"}$${formatAmount(amount)}`;
}

function formatSignedPercent(percent, decimals = 2) {
  return `${percent < 0 ? "-" : "+"}${Math.abs(percent).toFixed(decimals)}%`;
}

function getGainClass(amount) {
  return amount >= 0 ? "up" : "down";
}

function createGainParts(gain, gainPercent, decimals) {
  const amount = document.createElement("span");
  amount.className = "gain-amt";
  amount.textContent = formatSignedCurrency(gain);

  const percent = document.createElement("span");
  percent.className = "gain-pct";
  percent.textContent = formatSignedPercent(gainPercent, decimals);

  return [amount, percent];
}

function createGainStack(gain, gainPercent, decimals) {
  const container = document.createElement("span");
  container.className = "gain";
  container.append(...createGainParts(gain, gainPercent, decimals));
  return container;
}

function createHeroStat(label, gain, gainPercent) {
  const stat = document.createElement("span");
  stat.className = "stat";

  const labelElement = document.createElement("span");
  labelElement.className = "stat-label";
  labelElement.textContent = label;

  const value = document.createElement("span");
  if (gain === null) {
    value.className = "stat-value stat-empty";
    value.textContent = EMPTY_VALUE;
  } else {
    value.className = `stat-value ${getGainClass(gain)}`;
    value.append(...createGainParts(gain, gainPercent, 2));
  }

  stat.append(labelElement, value);
  return stat;
}

function showBanner(message) {
  const banner = getElement("banner");
  banner.textContent = message;
  banner.hidden = false;
}

function clearBanner() {
  const banner = getElement("banner");
  banner.hidden = true;
  banner.textContent = "";
}

function setEmptyStateVisible(elementId, isVisible) {
  getElement(elementId).style.display = isVisible ? "block" : "none";
}

// Price API
async function fetchQuote(ticker) {
  const response = await fetch(`/price?ticker=${encodeURIComponent(ticker)}`);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || `Failed to fetch ${ticker}`);
  }

  const price = Number(data.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Invalid price returned for ${ticker}`);
  }

  const previousClose = Number(data.previous_close);
  return {
    price,
    previousClose: Number.isFinite(previousClose) && previousClose > 0
      ? previousClose
      : null
  };
}

async function fetchQuotes(items, getTicker) {
  return Promise.all(items.map(async (item) => {
    try {
      return { item, quote: await fetchQuote(getTicker(item)) };
    } catch {
      return { item, quote: null };
    }
  }));
}

// Table and chart rendering
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
  removeButton.textContent = "×";
  removeButton.addEventListener("click", onRemove);
  actionCell.append(removeButton);
  row.append(actionCell);

  return row;
}

function renderChart(labels, values) {
  lastChartData = { labels, values };

  const canvas = getElement("chart");
  const styles = getComputedStyle(document.documentElement);
  const borderColor = styles.getPropertyValue("--bg").trim() || "#0b0d12";

  if (chart) chart.destroy();

  chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
        borderColor,
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      cutout: "62%",
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  renderChartLegend(labels, values);
}

function renderChartLegend(labels, values) {
  const totalValue = values.reduce((sum, value) => sum + value, 0);
  const rows = document.createDocumentFragment();

  labels.forEach((ticker, index) => {
    const row = document.createElement("div");
    row.className = "legend-row";

    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = CHART_COLORS[index % CHART_COLORS.length];

    const name = document.createElement("span");
    name.className = "legend-ticker";
    name.textContent = ticker;

    const percentage = document.createElement("span");
    percentage.className = "legend-pct";
    percentage.textContent = totalValue
      ? `${((values[index] / totalValue) * 100).toFixed(1)}%`
      : "0.0%";

    row.append(dot, name, percentage);
    rows.append(row);
  });

  getElement("chart-legend").replaceChildren(rows);
}

// Portfolio rendering
function createUnavailablePortfolioRow(stock) {
  return createRow([
    { text: stock.ticker, className: "ticker", label: "Ticker" },
    { text: stock.shares, className: "num", label: "Shares" },
    { text: "price unavailable", className: "num down", colSpan: 4, label: "Price" }
  ], () => removeStock(stock.ticker));
}

function createPortfolioRow(stock, quote) {
  const value = quote.price * stock.shares;
  const cost = stock.buy_price * stock.shares;
  const totalGain = value - cost;
  const totalGainPercent = cost ? (totalGain / cost) * 100 : 0;

  let dailyCell = { text: EMPTY_VALUE, className: "num", label: "Daily Gain" };
  let dailyGain = 0;
  let previousValue = 0;

  if (quote.previousClose !== null) {
    dailyGain = (quote.price - quote.previousClose) * stock.shares;
    previousValue = quote.previousClose * stock.shares;
    const dailyGainPercent = ((quote.price - quote.previousClose) / quote.previousClose) * 100;
    dailyCell = {
      nodes: [createGainStack(dailyGain, dailyGainPercent, 2)],
      className: `num ${getGainClass(dailyGain)}`,
      label: "Daily Gain"
    };
  }

  return {
    row: createRow([
      { text: stock.ticker, className: "ticker", label: "Ticker" },
      { text: stock.shares, className: "num", label: "Shares" },
      { text: formatCurrency(quote.price), className: "num", label: "Price" },
      { text: formatCurrency(value), className: "num", label: "Value" },
      {
        nodes: [createGainStack(totalGain, totalGainPercent, 2)],
        className: `num ${getGainClass(totalGain)}`,
        label: "Total Gain"
      },
      dailyCell
    ], () => removeStock(stock.ticker)),
    value,
    cost,
    dailyGain,
    previousValue
  };
}

function updatePortfolioSummary(totalValue, totalCost, dailyGain, previousValue, hasQuotes) {
  getElement("total").textContent = formatCurrency(totalValue);

  const totalGain = totalValue - totalCost;
  const totalGainPercent = totalCost ? (totalGain / totalCost) * 100 : 0;
  const dailyGainPercent = previousValue ? (dailyGain / previousValue) * 100 : 0;

  getElement("hero-stats").replaceChildren(
    createHeroStat("Total Gain", hasQuotes ? totalGain : null, totalGainPercent),
    createHeroStat("Daily Gain", hasQuotes && previousValue ? dailyGain : null, dailyGainPercent)
  );
}

async function render() {
  const currentVersion = ++portfolioRenderVersion;
  const holdings = portfolio.map((stock) => ({ ...stock }));
  setEmptyStateVisible("empty", !holdings.length);

  const results = await fetchQuotes(holdings, (stock) => stock.ticker);
  if (currentVersion !== portfolioRenderVersion) return;

  const rows = document.createDocumentFragment();
  const chartLabels = [];
  const chartValues = [];
  const unavailableTickers = [];
  let totalValue = 0;
  let totalCost = 0;
  let dailyGain = 0;
  let previousValue = 0;

  for (const { item: stock, quote } of results) {
    if (quote === null) {
      unavailableTickers.push(stock.ticker);
      rows.append(createUnavailablePortfolioRow(stock));
      continue;
    }

    const renderedStock = createPortfolioRow(stock, quote);
    rows.append(renderedStock.row);
    totalValue += renderedStock.value;
    totalCost += renderedStock.cost;
    dailyGain += renderedStock.dailyGain;
    previousValue += renderedStock.previousValue;
    chartLabels.push(stock.ticker);
    chartValues.push(renderedStock.value);
  }

  getElement("table-body").replaceChildren(rows);
  updatePortfolioSummary(totalValue, totalCost, dailyGain, previousValue, chartLabels.length > 0);

  if (unavailableTickers.length) {
    showBanner(`Couldn't fetch a price for: ${unavailableTickers.join(", ")}. Check the ticker symbol.`);
  } else {
    clearBanner();
  }

  renderChart(chartLabels, chartValues);
}

// Watchlist rendering
function createWatchlistRow(ticker, quote) {
  if (quote === null) {
    return createRow([
      { text: ticker, className: "ticker", label: "Ticker" },
      { text: "price unavailable", className: "num down", colSpan: 2, label: "Price" }
    ], () => removeWatch(ticker));
  }

  let changeCell = { text: EMPTY_VALUE, className: "num", label: "Day" };
  if (quote.previousClose !== null) {
    const change = quote.price - quote.previousClose;
    const changePercent = (change / quote.previousClose) * 100;
    changeCell = {
      nodes: [createGainStack(change, changePercent, 2)],
      className: `num ${getGainClass(change)}`,
      label: "Day"
    };
  }

  return createRow([
    { text: ticker, className: "ticker", label: "Ticker" },
    { text: formatCurrency(quote.price), className: "num", label: "Price" },
    changeCell
  ], () => removeWatch(ticker));
}

async function renderWatchlist() {
  const currentVersion = ++watchlistRenderVersion;
  const tickers = [...watchlist];
  setEmptyStateVisible("watchlist-empty", !tickers.length);

  const results = await fetchQuotes(tickers, (ticker) => ticker);
  if (currentVersion !== watchlistRenderVersion) return;

  const rows = document.createDocumentFragment();
  for (const { item: ticker, quote } of results) {
    rows.append(createWatchlistRow(ticker, quote));
  }

  getElement("watchlist-body").replaceChildren(rows);
}

// User actions
function addWatch() {
  const input = getElement("watch-ticker");
  const ticker = input.value.trim().toUpperCase();

  if (!isValidTicker(ticker)) {
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
  watchlist = watchlist.filter((savedTicker) => savedTicker !== ticker);
  saveWatchlist();
  renderWatchlist();
}

function addStock() {
  const ticker = getElement("ticker").value.trim().toUpperCase();
  const shares = parseFloat(getElement("shares").value);
  const buyPrice = parseFloat(getElement("buy_price").value);

  if (!isValidPosition(ticker, shares, buyPrice)) {
    showBanner("Enter a valid ticker and positive shares and buy price.");
    return;
  }

  const existingPosition = portfolio.find((stock) => stock.ticker === ticker);
  if (existingPosition) {
    const totalShares = existingPosition.shares + shares;
    const totalCost = (existingPosition.shares * existingPosition.buy_price) + (shares * buyPrice);
    existingPosition.shares = totalShares;
    existingPosition.buy_price = totalCost / totalShares;
  } else {
    portfolio.push({ ticker, shares, buy_price: buyPrice });
  }

  savePortfolio();
  getElement("ticker").value = "";
  getElement("shares").value = "";
  getElement("buy_price").value = "";
  render();
}

function removeStock(ticker) {
  portfolio = portfolio.filter((stock) => stock.ticker !== ticker);
  savePortfolio();
  render();
}

async function refresh() {
  const button = getElement("refresh");
  const label = getElement("refresh-label");
  button.disabled = true;
  button.classList.add("spinning");
  label.textContent = "Refreshing…";

  try {
    await Promise.all([render(), renderWatchlist()]);
  } finally {
    button.disabled = false;
    button.classList.remove("spinning");
    label.textContent = "Refresh";
  }
}

// Theme and startup
function setTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", selectedTheme);
  localStorage.setItem("theme", selectedTheme);

  if (chart) {
    renderChart(lastChartData.labels, lastChartData.values);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("theme");
  setTheme(savedTheme === "light" ? "light" : "dark");
}

initializeTheme();
render();
renderWatchlist();
