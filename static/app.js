let portfolio = JSON.parse(localStorage.getItem("portfolio")) || [];
let chart = null;

function savePortfolio() {
  localStorage.setItem("portfolio", JSON.stringify(portfolio));
}

async function fetchPrice(ticker) {
  const res = await fetch(`/price?ticker=${encodeURIComponent(ticker)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.price;
}

async function render() {
  const table = document.getElementById("table-body");
  table.innerHTML = "";

  let totalValue = 0;
  let totalCost = 0;
  const labels = [];
  const values = [];

  document.getElementById("empty").style.display = portfolio.length ? "none" : "block";

  for (const stock of portfolio) {
    let price;
    try {
      price = await fetchPrice(stock.ticker);
    } catch (e) {
      price = 0;
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
  if (portfolio.length) {
    const sign = totalGain >= 0 ? "+" : "";
    gainEl.innerText = `${sign}$${totalGain.toFixed(2)} (${sign}${totalGainPct.toFixed(2)}%)`;
    gainEl.className = "hero-gain " + (totalGain >= 0 ? "up" : "down");
  } else {
    gainEl.innerText = "—";
    gainEl.className = "hero-gain";
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
        backgroundColor: ["#26c281", "#4a90d9", "#ec5b56", "#e2b93b", "#9b6dd6", "#3bcfd4", "#e07b39"],
        borderColor: "#0f1115",
        borderWidth: 2
      }]
    },
    options: {
      plugins: { legend: { labels: { color: "#8b8f98" } } }
    }
  });
}

function addStock() {
  const ticker = document.getElementById("ticker").value.trim().toUpperCase();
  const shares = parseFloat(document.getElementById("shares").value);
  const buy_price = parseFloat(document.getElementById("buy_price").value);

  if (!ticker || isNaN(shares) || isNaN(buy_price)) {
    alert("Please enter a ticker, shares, and buy price.");
    return;
  }

  portfolio.push({ ticker, shares, buy_price });
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

render();
