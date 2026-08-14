const state = { hours: 24, efficiency: 0, renewables: 0, region: "demo", forecast: null, history: [] };
const $ = (id) => document.getElementById(id);
const format = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const timeFormat = new Intl.DateTimeFormat("en", { weekday: "short", hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function svgEl(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function linePath(points) {
  return points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" ");
}

function drawEnergyChart(history, forecast) {
  const svg = $("energy-chart");
  const width = Math.max(500, svg.clientWidth || 800);
  const height = Math.max(220, svg.clientHeight || 282);
  const margin = { top: 14, right: 12, bottom: 30, left: 44 };
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const actual = history.slice(-24);
  const values = [...actual.map(d => d.energy_kwh), ...forecast.flatMap(d => [d.lower, d.upper])];
  const min = Math.floor((Math.min(...values) - 5) / 10) * 10;
  const max = Math.ceil((Math.max(...values) + 5) / 10) * 10;
  const total = actual.length + forecast.length;
  const x = index => margin.left + index * (width - margin.left - margin.right) / Math.max(1, total - 1);
  const y = value => margin.top + (max - value) * (height - margin.top - margin.bottom) / Math.max(1, max - min);

  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4;
    const yy = y(value);
    svg.append(svgEl("line", { x1: margin.left, y1: yy, x2: width - margin.right, y2: yy, class: "chart-grid" }));
    const label = svgEl("text", { x: margin.left - 8, y: yy + 3, "text-anchor": "end", class: "chart-axis" });
    label.textContent = Math.round(value);
    svg.append(label);
  }

  const upper = forecast.map((d, i) => [x(actual.length + i), y(d.upper)]);
  const lower = forecast.map((d, i) => [x(actual.length + i), y(d.lower)]).reverse();
  svg.append(svgEl("path", { d: `${linePath(upper)} ${linePath(lower).replace(/^M/, "L")} Z`, class: "chart-band" }));
  svg.append(svgEl("path", { d: linePath(actual.map((d, i) => [x(i), y(d.energy_kwh)])), class: "chart-actual" }));
  const forecastPoints = forecast.map((d, i) => [x(actual.length + i), y(d.energy_kwh)]);
  const connector = actual.length ? [[x(actual.length - 1), y(actual.at(-1).energy_kwh)], ...forecastPoints] : forecastPoints;
  svg.append(svgEl("path", { d: linePath(connector), class: "chart-forecast" }));
  const dividerX = x(Math.max(0, actual.length - .5));
  svg.append(svgEl("line", { x1: dividerX, y1: margin.top, x2: dividerX, y2: height - margin.bottom, class: "chart-divider" }));
  const nowLabel = svgEl("text", { x: dividerX + 6, y: margin.top + 10, class: "chart-axis" });
  nowLabel.textContent = "FORECAST";
  svg.append(nowLabel);

  const combined = [...actual, ...forecast];
  const ticks = Math.min(6, combined.length);
  for (let i = 0; i < ticks; i++) {
    const index = Math.round(i * (combined.length - 1) / Math.max(1, ticks - 1));
    const label = svgEl("text", { x: x(index), y: height - 8, "text-anchor": i === 0 ? "start" : i === ticks - 1 ? "end" : "middle", class: "chart-axis" });
    label.textContent = timeFormat.format(new Date(combined[index].timestamp));
    svg.append(label);
  }
}

function drawCarbonChart(forecast) {
  const svg = $("carbon-chart");
  const width = Math.max(420, svg.clientWidth || 700);
  const height = Math.max(180, svg.clientHeight || 220);
  const margin = { top: 10, right: 12, bottom: 28, left: 42 };
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const maxIntensity = Math.max(...forecast.map(d => d.carbon_intensity_kg_per_kwh)) * 1.15;
  const x = index => margin.left + index * (width - margin.left - margin.right) / Math.max(1, forecast.length - 1);
  const yIntensity = value => margin.top + (maxIntensity - value) * (height - margin.top - margin.bottom) / maxIntensity;
  const yRenewable = value => margin.top + (100 - value) * (height - margin.top - margin.bottom) / 100;
  const barWidth = Math.max(2, (width - margin.left - margin.right) / forecast.length * .68);

  for (let i = 0; i <= 3; i++) {
    const yy = margin.top + i * (height - margin.top - margin.bottom) / 3;
    svg.append(svgEl("line", { x1: margin.left, y1: yy, x2: width - margin.right, y2: yy, class: "chart-grid" }));
  }
  forecast.forEach((point, index) => {
    const yy = yRenewable(point.renewable_share_percent);
    svg.append(svgEl("rect", { x: x(index) - barWidth / 2, y: yy, width: barWidth, height: height - margin.bottom - yy, class: "chart-renewable" }));
  });
  svg.append(svgEl("path", { d: linePath(forecast.map((d, i) => [x(i), yIntensity(d.carbon_intensity_kg_per_kwh)])), class: "chart-carbon" }));
  const leftLabel = svgEl("text", { x: margin.left - 8, y: margin.top + 4, "text-anchor": "end", class: "chart-axis" });
  leftLabel.textContent = maxIntensity.toFixed(2);
  svg.append(leftLabel);
  const zeroLabel = svgEl("text", { x: margin.left - 8, y: height - margin.bottom + 3, "text-anchor": "end", class: "chart-axis" });
  zeroLabel.textContent = "0";
  svg.append(zeroLabel);
  const ticks = Math.min(5, forecast.length);
  for (let i = 0; i < ticks; i++) {
    const index = Math.round(i * (forecast.length - 1) / Math.max(1, ticks - 1));
    const label = svgEl("text", { x: x(index), y: height - 7, "text-anchor": i === 0 ? "start" : i === ticks - 1 ? "end" : "middle", class: "chart-axis" });
    label.textContent = timeFormat.format(new Date(forecast[index].timestamp));
    svg.append(label);
  }
}

function renderTable(forecast) {
  $("forecast-table").innerHTML = forecast.slice(0, 12).map(point => `
    <tr>
      <td><strong>${dateFormat.format(new Date(point.timestamp))}</strong></td>
      <td>${format.format(point.energy_kwh)} kWh</td>
      <td>${format.format(point.lower)}–${format.format(point.upper)}</td>
      <td class="renewable-cell">${format.format(point.renewable_share_percent)}%</td>
      <td class="intensity-cell">${point.carbon_intensity_kg_per_kwh.toFixed(3)}</td>
      <td>${format.format(point.co2_kg)} kg</td>
    </tr>`).join("");
}

function render(data, quality, metrics) {
  state.forecast = data;
  const summary = data.summary;
  const totalRenewableShare = 100 * summary.renewable_energy_kwh / Math.max(summary.total_energy_kwh, 1);
  $("model-name").textContent = data.model;
  $("data-through").textContent = `Through ${dateFormat.format(new Date(data.data_through))}`;
  $("total-co2").textContent = format.format(summary.total_co2_kg);
  $("total-energy").textContent = format.format(summary.total_energy_kwh);
  $("renewable-share").textContent = `${format.format(totalRenewableShare)}%`;
  $("quality-score").textContent = `${quality.score}/100`;
  $("co2-context").textContent = `${summary.average_carbon_intensity.toFixed(3)} kgCO₂e per kWh average`;
  $("peak-context").textContent = `Peak ${format.format(summary.peak_hour.energy_kwh)} kWh · ${timeFormat.format(new Date(summary.peak_hour.timestamp))}`;
  $("clean-window-context").textContent = `Clean window · ${timeFormat.format(new Date(summary.cleanest_window.start))}`;
  $("quality-context").textContent = `${quality.completeness_percent}% complete · ${quality.missing_hours} gaps`;
  $("shift-from-time").textContent = timeFormat.format(new Date(summary.shift_opportunity.from_timestamp));
  $("shift-to-time").textContent = timeFormat.format(new Date(summary.shift_opportunity.to_timestamp));
  $("shift-load").textContent = `${format.format(summary.shift_opportunity.flexible_load_kwh)} kWh`;
  $("shift-savings").textContent = `${format.format(summary.shift_opportunity.estimated_savings_kg)} kg`;
  $("primary-recommendation").textContent = summary.recommendation;
  $("recommendations").innerHTML = summary.recommendations.slice(1).map(item => `<li>${item}</li>`).join("");
  $("avg-intensity").textContent = `${summary.average_carbon_intensity.toFixed(3)} kg/kWh`;
  $("quality-ring-value").textContent = quality.score;
  $("quality-ring").style.setProperty("--score", `${quality.score * 3.6}deg`);
  $("model-mae").textContent = `${metrics.test_metrics.mae.toFixed(2)} kWh`;
  $("baseline-mae").textContent = `${metrics.previous_day_baseline_metrics.mae.toFixed(2)} kWh`;
  $("coverage-days").textContent = `${quality.coverage_days} days`;
  $("missing-hours").textContent = quality.missing_hours;
  drawEnergyChart(state.history, data.forecast);
  drawCarbonChart(data.forecast);
  renderTable(data.forecast);
}

async function loadDashboard() {
  const status = $("status-message");
  status.className = "status-message";
  status.textContent = "Recomputing forecast and carbon-shift plan…";
  const query = new URLSearchParams({
    hours: state.hours,
    region: state.region,
    efficiency_percent: state.efficiency,
    renewable_growth_percent: state.renewables,
  });
  try {
    const [forecastResponse, historyResponse, qualityResponse, metricsResponse] = await Promise.all([
      fetch(`/api/v1/energy/forecast?${query}`),
      fetch("/api/v1/energy/history?hours=48"),
      fetch("/api/v1/data/quality"),
      fetch("/api/v1/model/metrics"),
    ]);
    if (![forecastResponse, historyResponse, qualityResponse, metricsResponse].every(response => response.ok)) throw new Error("One or more API requests failed");
    const [forecast, history, quality, metrics] = await Promise.all([
      forecastResponse.json(), historyResponse.json(), qualityResponse.json(), metricsResponse.json(),
    ]);
    state.history = history.history;
    render(forecast, quality, metrics);
    status.textContent = `Scenario updated · ${state.hours} forecast hours · generated ${new Date(forecast.generated_at).toLocaleTimeString()}`;
  } catch (error) {
    status.className = "status-message error";
    status.textContent = `Unable to load dashboard: ${error.message}`;
  }
}

function debounce(callback, delay = 220) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); };
}

document.querySelectorAll("[data-hours]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-hours]").forEach(item => item.classList.toggle("selected", item === button));
  state.hours = Number(button.dataset.hours);
  loadDashboard();
}));

const updateScenario = debounce(loadDashboard);
$("region").addEventListener("change", event => { state.region = event.target.value; loadDashboard(); });
$("efficiency").addEventListener("input", event => { state.efficiency = Number(event.target.value); $("efficiency-value").textContent = `${state.efficiency}%`; updateScenario(); });
$("renewables").addEventListener("input", event => { state.renewables = Number(event.target.value); $("renewables-value").textContent = `${state.renewables}%`; updateScenario(); });
$("refresh").addEventListener("click", loadDashboard);
$("download-csv").addEventListener("click", () => {
  if (!state.forecast) return;
  const headers = ["timestamp", "energy_kwh", "lower", "upper", "renewable_share_percent", "carbon_intensity_kg_per_kwh", "co2_kg"];
  const rows = state.forecast.forecast.map(point => headers.map(header => point[header]).join(","));
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `carbonsense-${state.hours}h-forecast.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

window.addEventListener("resize", debounce(() => {
  if (state.forecast) {
    drawEnergyChart(state.history, state.forecast.forecast);
    drawCarbonChart(state.forecast.forecast);
  }
}, 120));

loadDashboard();
