let portfolio = JSON.parse(localStorage.getItem("portfolio")) || [];
let chart = null;

// Cyan-anchored palette matching the dashboard accent.
const CHART_COLORS = [
  "#22d3ee", "#2fd39b", "#818cf8", "#f0645f",
  "#fbbf24", "#c084fc", "#38bdf8", "#f97316"
];

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
  return data.price;
}

async function render() {
  const table = document.getElementById("table-body");
  table.innerHTML = "";

  let totalValue = 0;
  let totalCost = 0;
  const labels = [];
  const values = [];
  const failed = [];

  document.getElementById("empty").style.display = portfolio.length ? "none" : "block";

  for (const stock of portfolio) {
    let price = null;
    try {
      price = await fetchPrice(stock.ticker);
    } catch (e) {
      failed.push(stock.ticker);
    }

    if (price === null) {
      // Price lookup failed — show the row but flag it instead of breaking.
      table.innerHTML += `
        <tr>
          <td class="ticker">${stock.ticker}</td>
          <td class="num">${stock.shares}</td>
          <td class="num down" colspan="3">price unavailable</td>
          <td><button class="remove" onclick="removeStock('${stock.ticker}')">✕</button></td>
        </tr>
      `;
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

    table.innerHTML += `
      <tr>
        <td class="ticker">${stock.ticker}</td>
        <td class="num">${stock.shares}</td>
        <td class="num">$${price.toFixed(2)}</td>
        <td class="num">$${value.toFixed(2)}</td>
        <td class="num ${cls}">${gain >= 0 ? "+" : ""}${gain.toFixed(2)} (${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%)</td>
        <td><button class="remove" onclick="removeStock('${stock.ticker}')">✕</button></td>
      </tr>
    `;
  }

  document.getElementById("total").innerText = `$${totalValue.toFixed(2)}`;

  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost ? (totalGain / totalCost) * 100 : 0;
  const gainEl = document.getElementById("total-gain");
  if (labels.length) {
    const sign = totalGain >= 0 ? "+" : "";
    gainEl.innerText = `${sign}$${totalGain.toFixed(2)} (${sign}${totalGainPct.toFixed(2)}%)`;
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

function renderChart(labels, values) {
  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderColor: "#0b0d12",
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#8b90a0", padding: 14, font: { size: 12 }, boxWidth: 12 }
        }
      }
    }
  });
}

function addStock() {
  const ticker = document.getElementById("ticker").value.trim().toUpperCase();
  const shares = parseFloat(document.getElementById("shares").value);
  const buy_price = parseFloat(document.getElementById("buy_price").value);

  if (!ticker || isNaN(shares) || isNaN(buy_price)) {
    showBanner("Please enter a ticker, shares, and buy price.");
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

render();
