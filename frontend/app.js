const map = L.map("map", { zoomControl: false, maxBounds: [[4, 65], [39, 100]], maxBoundsViscosity: 0.7 }).setView([22.4, 79.2], 5);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 18 }).addTo(map);

const byId = id => document.getElementById(id);
const coordinateIds = ["west", "south", "east", "north"];
const presets = {
  "western-ghats": [76.90, 10.05, 77.10, 10.23],
  "sundarbans": [88.72, 21.80, 89.02, 22.04],
  "corbett": [78.68, 29.43, 78.92, 29.64],
  "bastar": [81.75, 18.75, 82.02, 18.98],
  "kaziranga": [93.20, 26.52, 93.48, 26.72]
};
const AOI_STYLE = { color: "#ff2f2f", weight: 4, opacity: 1, dashArray: "12 8", lineCap: "round", fillColor: "#ff4d4f", fillOpacity: 0.2, className: "aoi-selection" };
const drawnItems = new L.FeatureGroup().addTo(map);
map.addControl(new L.Control.Draw({
  position: "topleft",
  draw: { polygon: false, polyline: false, circle: false, circlemarker: false, marker: false, rectangle: { shapeOptions: AOI_STYLE, showArea: true, metric: true } },
  edit: { featureGroup: drawnItems, remove: true }
}));

let resultLayers = [];
let resultLayerControl = null;
let demoFiles = null;
let mode = "satellite";
let lastResult = null;
let activeChangeOverlay = null;

function currentBounds() {
  return coordinateIds.reduce((result, id) => ({ ...result, [id]: Number(byId(id).value) }), {});
}

function approximateArea(bounds) {
  const meanLatitude = ((bounds.north + bounds.south) / 2) * Math.PI / 180;
  return Math.abs(111.32 * Math.cos(meanLatitude) * (bounds.east - bounds.west) * 110.574 * (bounds.north - bounds.south));
}

function areaLabel(bounds) {
  const area = approximateArea(bounds);
  return `Selected area · ${area.toLocaleString(undefined, { maximumFractionDigits: area < 10 ? 2 : 1 })} km²`;
}

function styleSelection(layer) {
  layer.setStyle(AOI_STYLE);
  layer.unbindTooltip();
  layer.bindTooltip(areaLabel({
    west: layer.getBounds().getWest(), south: layer.getBounds().getSouth(),
    east: layer.getBounds().getEast(), north: layer.getBounds().getNorth()
  }), { permanent: true, direction: "center", className: "aoi-tooltip", opacity: 1 });
  return layer;
}

function updateArea() {
  const bounds = currentBounds();
  const area = approximateArea(bounds);
  byId("area-value").textContent = Number.isFinite(area) ? `${area.toLocaleString(undefined, { maximumFractionDigits: 1 })} km²` : "—";
  byId("area-value").classList.toggle("over-limit", area > 2500);
}

function setBounds(bounds) {
  byId("west").value = bounds.getWest().toFixed(6);
  byId("south").value = bounds.getSouth().toFixed(6);
  byId("east").value = bounds.getEast().toFixed(6);
  byId("north").value = bounds.getNorth().toFixed(6);
  updateArea();
}

function showAoi(fit = false) {
  const bounds = currentBounds();
  if (![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite) || bounds.west >= bounds.east || bounds.south >= bounds.north) return;
  drawnItems.clearLayers();
  const leafletBounds = [[bounds.south, bounds.west], [bounds.north, bounds.east]];
  drawnItems.addLayer(styleSelection(L.rectangle(leafletBounds, AOI_STYLE)));
  updateArea();
  if (fit) map.fitBounds(leafletBounds, { padding: [45, 45] });
}

map.on(L.Draw.Event.CREATED, event => { drawnItems.clearLayers(); drawnItems.addLayer(styleSelection(event.layer)); setBounds(event.layer.getBounds()); });
map.on(L.Draw.Event.EDITED, event => event.layers.eachLayer(layer => { styleSelection(layer); setBounds(layer.getBounds()); }));
coordinateIds.forEach(id => byId(id).addEventListener("change", () => showAoi(false)));
byId("region-preset").addEventListener("change", event => {
  const values = presets[event.target.value];
  if (!values) return;
  coordinateIds.forEach((id, index) => byId(id).value = values[index]);
  showAoi(true);
});

function setMode(nextMode) {
  mode = nextMode;
  const satellite = mode === "satellite";
  byId("satellite-fields").hidden = !satellite;
  byId("upload-fields").hidden = satellite;
  byId("mode-satellite").classList.toggle("active", satellite);
  byId("mode-upload").classList.toggle("active", !satellite);
  byId("mode-satellite").setAttribute("aria-selected", satellite);
  byId("mode-upload").setAttribute("aria-selected", !satellite);
  byId("analyse").querySelector("span").textContent = satellite ? "Analyse Sentinel-2" : "Analyse uploaded pair";
  byId("map-mode-label").textContent = satellite ? "LIVE · SENTINEL-2 MODE" : "ADVANCED · UPLOAD MODE";
  byId("message").textContent = "";
}
byId("mode-satellite").addEventListener("click", () => setMode("satellite"));
byId("mode-upload").addEventListener("click", () => setMode("upload"));

function clearResults() {
  resultLayers.forEach(layer => map.removeLayer(layer));
  resultLayers = [];
  if (resultLayerControl) { map.removeControl(resultLayerControl); resultLayerControl = null; }
  byId("results").classList.remove("visible");
  activeChangeOverlay = null;
}
byId("clear-result").addEventListener("click", clearResults);

["before", "after"].forEach(id => byId(id).addEventListener("change", event => {
  demoFiles = null;
  byId(`${id}-name`).textContent = event.target.files[0]?.name || "PNG, JPG, WEBP or TIFF";
}));
byId("sensitivity").addEventListener("input", event => byId("sensitivity-value").textContent = `${Math.round(event.target.value * 100)}%`);
byId("cloud").addEventListener("input", event => byId("cloud-value").textContent = `${event.target.value}%`);
byId("minimum-patch").addEventListener("input", event => byId("minimum-patch-value").textContent = `${Number(event.target.value).toFixed(1)} ha`);
byId("overlay-opacity").addEventListener("input", event => activeChangeOverlay?.setOpacity(Number(event.target.value)));

byId("demo").addEventListener("click", async () => {
  const [beforeResponse, afterResponse] = await Promise.all([fetch("/assets/demo_before.png"), fetch("/assets/demo_after.png")]);
  if (!beforeResponse.ok || !afterResponse.ok) { byId("message").textContent = "Sample files are unavailable."; return; }
  demoFiles = {
    before: new File([await beforeResponse.blob()], "demo_before.png", { type: "image/png" }),
    after: new File([await afterResponse.blob()], "demo_after.png", { type: "image/png" })
  };
  byId("before-name").textContent = "demo_before.png";
  byId("after-name").textContent = "demo_after.png";
  [byId("west").value, byId("south").value, byId("east").value, byId("north").value] = [77.0, 10.0, 77.3, 10.3];
  showAoi(true);
  byId("message").textContent = "Sample ready — run the analysis.";
});

function renderHotspots(hotspots) {
  const list = byId("hotspot-list");
  list.replaceChildren();
  hotspots.forEach(hotspot => {
    const item = document.createElement("li");
    item.innerHTML = `<b>#${hotspot.rank}</b><span>${hotspot.latitude.toFixed(4)}, ${hotspot.longitude.toFixed(4)}</span><strong>${hotspot.area_sq_km.toLocaleString()} km²</strong>`;
    list.appendChild(item);
    const marker = L.circleMarker([hotspot.latitude, hotspot.longitude], { radius: 7, color: "#fff", weight: 2, fillColor: "#ef4444", fillOpacity: 1 })
      .bindTooltip(`Priority ${hotspot.rank}: ${hotspot.area_sq_km} km² loss`).addTo(map);
    resultLayers.push(marker);
  });
  byId("hotspots").hidden = hotspots.length === 0;
  byId("hotspot-count").textContent = hotspots.length;
}

function renderResult(result, bounds) {
  clearResults();
  lastResult = result;
  const leafletBounds = [[bounds.south, bounds.west], [bounds.north, bounds.east]];
  const overlay = L.imageOverlay(result.overlay_data_url, leafletBounds, { opacity: Number(byId("overlay-opacity").value), interactive: false }).addTo(map);
  activeChangeOverlay = overlay;
  const shapes = L.geoJSON(result.change_geojson, { style: feature => ({ color: feature.properties.change === "loss" ? "#ef4444" : "#22c55e", weight: 1, fillOpacity: 0.18 }) }).addTo(map);
  resultLayers = [overlay, shapes];
  const overlays = { "Change detection": overlay, "Change polygons": shapes };
  if (result.ndvi_delta_overlay_data_url) {
    const ndviLayer = L.imageOverlay(result.ndvi_delta_overlay_data_url, leafletBounds, { opacity: 0.72 });
    resultLayers.push(ndviLayer);
    overlays["NDVI change intensity"] = ndviLayer;
  }
  const automatic = result.source?.type === "automatic_satellite";
  if (automatic) {
    const beforeLayer = L.imageOverlay(result.source.before.preview_data_url, leafletBounds, { opacity: 0.9 });
    const afterLayer = L.imageOverlay(result.source.after.preview_data_url, leafletBounds, { opacity: 0.9 });
    resultLayers.push(beforeLayer, afterLayer);
    overlays[`Before · ${result.source.before.date}`] = beforeLayer;
    overlays[`After · ${result.source.after.date}`] = afterLayer;
  }
  resultLayerControl = L.control.layers({}, overlays, { position: "topright", collapsed: true }).addTo(map);
  map.fitBounds(leafletBounds, { padding: [45, 45] });

  byId("loss-value").textContent = result.summary.forest_loss_sq_km.toLocaleString();
  byId("gain-value").textContent = result.summary.forest_gain_sq_km.toLocaleString();
  byId("net-value").textContent = result.summary.net_change_sq_km.toLocaleString();
  byId("percent-value").textContent = result.summary.changed_percent.toLocaleString();
  byId("cover-before-value").textContent = result.summary.forest_cover_before_percent == null ? "Upload mode" : `${result.summary.forest_cover_before_percent}%`;
  byId("cover-after-value").textContent = result.summary.forest_cover_after_percent == null ? "Upload mode" : `${result.summary.forest_cover_after_percent}%`;
  byId("annual-loss-value").textContent = result.summary.annualized_loss_sq_km == null ? "—" : `${result.summary.annualized_loss_sq_km.toLocaleString()} km²/yr`;
  byId("loss-hectares-value").textContent = `${result.summary.forest_loss_hectares.toLocaleString()} ha`;
  byId("engine-label").textContent = result.engine.replaceAll("-", " ");
  byId("priority-value").textContent = result.insights.field_priority;
  byId("recommendation-value").textContent = result.insights.recommendation;
  byId("confidence-value").textContent = `${result.insights.analysis_confidence_percent}%`;
  byId("confidence-bar").style.width = `${result.insights.analysis_confidence_percent}%`;
  const carbon = result.insights.carbon_exposure_tonnes_co2e;
  byId("carbon-value").textContent = carbon.high ? `${carbon.low.toLocaleString()}–${carbon.high.toLocaleString()} t` : "No exposure";
  byId("valid-value").textContent = `${result.insights.valid_pixel_percent}%`;
  byId("comparison-value").textContent = result.insights.comparison_quality;
  byId("gap-value").textContent = result.insights.observation_gap_days == null ? "—" : `${result.insights.observation_gap_days.toLocaleString()} days`;
  byId("season-value").textContent = result.insights.seasonal_gap_days == null ? "—" : `${result.insights.seasonal_gap_days} days`;
  byId("ndvi-value").textContent = result.insights.mean_ndvi_before == null ? "—" : `${result.insights.mean_ndvi_before} → ${result.insights.mean_ndvi_after}`;
  byId("retrieval-value").textContent = result.source?.retrieval_seconds == null ? "Upload mode" : `${result.source.retrieval_seconds}s`;
  byId("trend-value").textContent = result.insights.trend;
  byId("result-note").textContent = result.warnings.join(" ");
  renderHotspots(result.insights.loss_hotspots);

  byId("evidence-grid").hidden = !automatic;
  if (automatic) {
    byId("before-preview").src = result.source.before.preview_data_url;
    byId("after-preview").src = result.source.after.preview_data_url;
    byId("before-scene").textContent = `${result.source.before.date} · ${result.source.before.cloud_cover_percent}% cloud`;
    byId("after-scene").textContent = `${result.source.after.date} · ${result.source.after.cloud_cover_percent}% cloud`;
  }
  byId("results").classList.add("visible");
  byId("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

byId("analyse").addEventListener("click", async () => {
  const bounds = currentBounds();
  const area = approximateArea(bounds);
  if (!Number.isFinite(area) || area <= 0) { byId("message").textContent = "Draw a valid analysis area first."; return; }
  if (area > 2500) { byId("message").textContent = "The selected area exceeds 2,500 km². Draw a smaller rectangle."; return; }
  let request;
  if (mode === "satellite") {
    const payload = {
      ...bounds,
      before_start: byId("before-start").value,
      before_end: byId("before-end").value,
      after_start: byId("after-start").value,
      after_end: byId("after-end").value,
      max_cloud: Number(byId("cloud").value),
      sensitivity: Number(byId("sensitivity").value),
      minimum_patch_hectares: Number(byId("minimum-patch").value)
    };
    request = fetch("/api/v1/detect/satellite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } else {
    const before = demoFiles?.before || byId("before").files[0];
    const after = demoFiles?.after || byId("after").files[0];
    if (!before || !after) { byId("message").textContent = "Add both a before and an after image."; return; }
    const form = new FormData(); form.append("before", before); form.append("after", after);
    coordinateIds.forEach(id => form.append(id, bounds[id])); form.append("sensitivity", byId("sensitivity").value); form.append("minimum_patch_hectares", byId("minimum-patch").value);
    request = fetch("/api/v1/detect", { method: "POST", body: form });
  }

  const button = byId("analyse");
  button.disabled = true;
  button.querySelector("span").textContent = mode === "satellite" ? "Finding clear scenes…" : "Analysing pixels…";
  byId("message").textContent = mode === "satellite" ? "This can take up to a minute for new satellite scenes." : "";
  try {
    const response = await request;
    const result = await response.json();
    if (!response.ok) throw new Error(Array.isArray(result.detail) ? result.detail[0]?.msg : result.detail || "Detection failed");
    byId("message").textContent = "";
    renderResult(result, bounds);
  } catch (error) {
    byId("message").textContent = error.message;
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = mode === "satellite" ? "Analyse Sentinel-2" : "Analyse uploaded pair";
  }
});

byId("download-geojson").addEventListener("click", () => {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult.change_geojson, null, 2)], { type: "application/geo+json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `vandrishti-change-${new Date().toISOString().slice(0, 10)}.geojson`; link.click();
  URL.revokeObjectURL(link.href);
});
byId("download-csv").addEventListener("click", () => {
  if (!lastResult) return;
  const summary = lastResult.summary;
  const rows = [
    ["metric", "value", "unit"],
    ["forest_loss", summary.forest_loss_sq_km, "km2"],
    ["forest_gain", summary.forest_gain_sq_km, "km2"],
    ["net_change", summary.net_change_sq_km, "km2"],
    ["area_changed", summary.changed_percent, "percent"],
    ["forest_cover_before", summary.forest_cover_before_percent ?? "", "percent"],
    ["forest_cover_after", summary.forest_cover_after_percent ?? "", "percent"],
    ["annualized_loss", summary.annualized_loss_sq_km ?? "", "km2_per_year"],
    ["analysis_confidence", lastResult.insights.analysis_confidence_percent, "percent"],
    ["field_priority", lastResult.insights.field_priority, ""]
  ];
  const blob = new Blob([rows.map(row => row.join(",")).join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `vandrishti-summary-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  URL.revokeObjectURL(link.href);
});
byId("print-report").addEventListener("click", () => window.print());

fetch("/api/v1/health").then(response => response.json()).then(data => {
  byId("api-status").textContent = "Satellite engine ready";
  byId("api-status").parentElement.classList.add("ready");
}).catch(() => byId("api-status").textContent = "API offline");
showAoi(false);
setMode("satellite");
