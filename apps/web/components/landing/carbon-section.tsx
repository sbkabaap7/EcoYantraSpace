"use client";

/* Code samples intentionally render literal TypeScript syntax. */
/* eslint-disable react/jsx-no-comment-textnodes, react/no-unescaped-entities */

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowUpRight, CheckCircle, TrendingDown, Zap, BarChart3 } from "lucide-react";

type TooltipParam = {
  name?: string;
  seriesName?: string;
  color?: string;
  value?: number | string | null;
};

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/* ── Generate 72h sample forecast data ────────────── */
function genForecastData() {
  const hours: string[] = [];
  const actual: (number | null)[] = [];
  const forecast: (number | null)[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  const co2: number[] = [];

  for (let i = 0; i < 72; i++) {
    const h = i % 24;
    // Diurnal pattern (demand peaks at 10am and 7pm)
    const base = 62 + Math.sin((h - 6) * (Math.PI / 12)) * 18 + Math.sin((h - 18) * (Math.PI / 8)) * 8;
    const noise = (Math.sin(i * 7.3) + Math.cos(i * 3.7)) * 2.2;
    const val = Math.max(30, base + noise);

    hours.push(`${String(Math.floor(i / 24) + 1).padStart(1, "")}d ${String(h).padStart(2, "0")}h`);

    if (i < 48) {
      actual.push(+val.toFixed(1));
      forecast.push(null);
    } else {
      actual.push(null);
      forecast.push(+val.toFixed(1));
    }

    upper.push(+(val + 6 + i * 0.05).toFixed(1));
    lower.push(+(val - 5 - i * 0.04).toFixed(1));
    co2.push(+(val * 0.42).toFixed(1));
  }

  return { hours, actual, forecast, upper, lower, co2 };
}

const { hours, actual, forecast, upper, lower, co2 } = genForecastData();

const chartOption = {
  backgroundColor: "transparent",
  animation: true,
  animationDuration: 1400,
  animationEasing: "cubicOut",
  tooltip: {
    trigger: "axis",
    backgroundColor: "#081410",
    borderColor: "rgba(0,232,122,0.2)",
    borderWidth: 1,
    textStyle: { color: "#deeae4", fontSize: 12, fontFamily: "Inter" },
    formatter: (params: TooltipParam[]) => {
      const p = params[0];
      if (!p) return "";
      return `<div style="font-size:10px;letter-spacing:.1em;color:#4d6a5b;margin-bottom:4px">${p.name}</div>${params.map((s) => `<div>${s.seriesName}: <b style="color:${s.color}">${s.value ?? "—"}</b></div>`).join("")}`;
    },
  },
  legend: {
    bottom: 0,
    textStyle: { color: "#4d6a5b", fontSize: 10, fontFamily: "Inter" },
    inactiveColor: "#2a4035",
    icon: "roundRect",
    itemWidth: 14,
    itemHeight: 4,
  },
  grid: { top: 12, bottom: 44, left: 12, right: 60, containLabel: true },
  xAxis: {
    type: "category",
    data: hours,
    axisLine: { lineStyle: { color: "#0e2018" } },
    axisLabel: {
      color: "#4d6a5b",
      fontSize: 9,
      interval: 11,
      fontFamily: "Inter",
      rotate: 30,
    },
    splitLine: { show: false },
  },
  yAxis: [
    {
      name: "kWh",
      nameTextStyle: { color: "#4d6a5b", fontSize: 9 },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#4d6a5b", fontSize: 9 },
      splitLine: { lineStyle: { color: "#0e2018", type: "dashed" } },
    },
    {
      name: "kg CO₂",
      nameTextStyle: { color: "#3d6b52", fontSize: 9 },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#3d6b52", fontSize: 9 },
      splitLine: { show: false },
    },
  ],
  series: [
    {
      name: "Confidence band",
      type: "line",
      data: upper,
      lineStyle: { opacity: 0 },
      areaStyle: { color: "rgba(0,232,122,0.07)" },
      stack: "confidence",
      symbol: "none",
      silent: true,
    },
    {
      name: "Lower bound",
      type: "line",
      data: lower,
      lineStyle: { opacity: 0 },
      areaStyle: { color: "#081410", opacity: 1 },
      stack: "confidence",
      symbol: "none",
      silent: true,
      tooltip: { show: false },
    },
    {
      name: "Actual kWh",
      type: "line",
      data: actual,
      smooth: 0.35,
      lineStyle: { color: "#4fa6e0", width: 2.5 },
      itemStyle: { color: "#4fa6e0" },
      symbol: "none",
      z: 4,
    },
    {
      name: "Forecast kWh",
      type: "line",
      data: forecast,
      smooth: 0.35,
      lineStyle: { color: "#00e87a", width: 2.5, type: "dashed" },
      itemStyle: { color: "#00e87a" },
      symbol: "none",
      z: 4,
    },
    {
      name: "CO₂ kg",
      type: "bar",
      yAxisIndex: 1,
      data: co2,
      barWidth: 5,
      barGap: "-100%",
      itemStyle: {
        color: {
          type: "linear",
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "rgba(79,166,224,0.55)" },
            { offset: 1, color: "rgba(79,166,224,0.05)" },
          ],
        },
        borderRadius: [2, 2, 0, 0],
      },
      z: 2,
    },
  ],
};

const features = [
  {
    icon: <BarChart3 size={13} />,
    color: "var(--carbon-color)",
    text: "1–168 hour recursive forecast with 90% calibrated confidence intervals",
  },
  {
    icon: <TrendingDown size={13} />,
    color: "var(--green)",
    text: "Carbon Shift optimizer recommends low-carbon 3-hour operating windows",
  },
  {
    icon: <Zap size={13} />,
    color: "var(--anomaly-color)",
    text: "Scenario lab: compare efficiency, renewable growth, temperature delta",
  },
  {
    icon: <CheckCircle size={13} />,
    color: "var(--green)",
    text: "Submit real hourly history via the custom forecast endpoint",
  },
];

export function CarbonSection() {
  return (
    <section className="deepdive" id="carbon" aria-labelledby="carbon-title">
      <div className="deepdive__inner">
        {/* Left: copy */}
        <div>
          <div className="deepdive__eyebrow" style={{ color: "var(--carbon-color)" }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
              border: "1px solid rgba(79,166,224,0.3)", borderRadius: 4,
              padding: "2px 7px", background: "rgba(79,166,224,0.08)",
            }}>01</span>
            Carbon Intelligence
          </div>
          <h2 className="deepdive__title" id="carbon-title">TRACE<br />IMPACT.</h2>
          <p className="deepdive__desc">
            CarbonSense forecasts building and microgrid energy demand up to 168 hours ahead,
            estimates CO₂ emissions, and identifies when flexible load should move to
            minimize carbon. Powered by a regularised linear demand model with conformal
            residual intervals.
          </p>

          <ul className="feature-list" role="list">
            {features.map((f, i) => (
              <li key={i}>
                <div className="feature-icon" style={{ background: `${f.color}18`, color: f.color }}>
                  {f.icon}
                </div>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>

          <Link href="/carbon" className="carbon-dashboard-cta">
            <span className="carbon-dashboard-cta__icon" aria-hidden="true"><BarChart3 size={16} /></span>
            <span>
              <small>Carbon Intelligence Workspace</small>
              <strong>Open live planning view <ArrowUpRight size={14} aria-hidden="true" /></strong>
            </span>
          </Link>

          {/* Code snippet */}
          <div className="code-block">
            <div className="code-block__header">
              <div className="code-block__dots">
                <span /><span /><span />
              </div>
              <span className="code-block__lang">TypeScript</span>
            </div>
            <div className="code-block__body">
              <span className="t-comment">// POST /api/v1/carbon/forecasts</span>{"\n"}
              <span className="t-key">const</span>{" "}<span className="t-var">response</span>{" = await "}<span className="t-method">fetch</span>{"("}
              <span className="t-string">"/api/v1/carbon/forecasts"</span>{", {"}{"\n"}
              {"  "}<span className="t-key">method</span>{": "}<span className="t-string">"POST"</span>{",\n"}
              {"  "}<span className="t-key">body</span>{": JSON.stringify({"}{"\n"}
              {"    "}<span className="t-key">projectId</span>{": "}<span className="t-string">"66e..."</span>{",\n"}
              {"    "}<span className="t-key">hours</span>{": "}<span className="t-number">72</span>{",\n"}
              {"    "}<span className="t-key">region</span>{": "}<span className="t-string">"demo"</span>{",\n"}
              {"    "}<span className="t-key">efficiency_percent</span>{": "}<span className="t-number">10</span>{",\n"}
              {"  "}{"})"}{")"}{"\n"}
              {"}"});{"\n\n"}
              <span className="t-comment">// Returns: forecast[], summary.cleanest_window</span>
            </div>
          </div>
        </div>

        {/* Right: chart */}
        <div>
          <div className="chart-card">
            <div className="chart-card__header">
              <span className="chart-card__title">Energy Forecast — 72h Horizon</span>
              <span className="chart-card__badge live-badge">Live</span>
            </div>
            <div className="chart-card__body">
              <ReactECharts
                option={chartOption}
                style={{ height: 300 }}
                opts={{ renderer: "canvas" }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="stats-row">
            <div className="stat-box">
              <span className="stat-box__value" style={{ color: "var(--carbon-color)" }}>94.2%</span>
              <span className="stat-box__label">Forecast accuracy</span>
            </div>
            <div className="stat-box">
              <span className="stat-box__value" style={{ color: "var(--green)" }}>168h</span>
              <span className="stat-box__label">Max horizon</span>
            </div>
            <div className="stat-box">
              <span className="stat-box__value" style={{ color: "var(--anomaly-color)" }}>90%</span>
              <span className="stat-box__label">Interval coverage</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
