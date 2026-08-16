"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { Crosshair, LoaderCircle, Minus, Plus } from "lucide-react";

import styles from "./earth-map.module.css";

export type EarthBounds = { west: number; south: number; east: number; north: number };

type EarthMapProps = {
  bounds: EarthBounds;
  results: ForestChangeGeoJson | null | undefined;
  onBoundsChange: (bounds: EarthBounds) => void;
  onAnalyse: (bounds?: EarthBounds) => void;
};

export type ForestChangeGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { change: "loss" | "gain"; area_sq_km: number };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  }>;
};

type DrawRectangle = { x: number; y: number; width: number; height: number } | null;

function toPolygon(bounds: EarthBounds) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [[
        [bounds.west, bounds.south],
        [bounds.east, bounds.south],
        [bounds.east, bounds.north],
        [bounds.west, bounds.north],
        [bounds.west, bounds.south],
      ]],
    },
  };
}

const emptyResults: ForestChangeGeoJson = { type: "FeatureCollection", features: [] };

function updateMapLayers(map: MapLibreMap, bounds: EarthBounds, results?: ForestChangeGeoJson | null) {
  const areaSource = map.getSource("selected-area") as GeoJSONSource | undefined;
  const resultSource = map.getSource("analysis-results") as GeoJSONSource | undefined;
  areaSource?.setData(toPolygon(bounds));
  resultSource?.setData(results ?? emptyResults);
}

export function EarthMap({ bounds, results, onBoundsChange, onAnalyse }: EarthMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const latestRef = useRef({ bounds, results });
  const [isLoaded, setIsLoaded] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rectangle, setRectangle] = useState<DrawRectangle>(null);

  useEffect(() => {
    latestRef.current = { bounds, results };
  }, [bounds, results]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialBounds = latestRef.current.bounds;
    const map = new maplibregl.Map({
      container,
      center: [(initialBounds.west + initialBounds.east) / 2, (initialBounds.south + initialBounds.north) / 2],
      zoom: 10.1,
      minZoom: 1.4,
      maxZoom: 17,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "Tiles © Esri",
          },
        },
        layers: [
          { id: "satellite", type: "raster", source: "satellite", paint: { "raster-saturation": -0.18, "raster-contrast": 0.12, "raster-brightness-min": 0.05, "raster-brightness-max": 0.88 } },
        ],
      },
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      map.addSource("selected-area", { type: "geojson", data: toPolygon(latestRef.current.bounds) });
      map.addLayer({ id: "selected-area-fill", type: "fill", source: "selected-area", paint: { "fill-color": "#00e87a", "fill-opacity": 0.13 } });
      map.addLayer({ id: "selected-area-line", type: "line", source: "selected-area", paint: { "line-color": "#00e87a", "line-width": 2, "line-opacity": 0.96 } });
      map.addSource("analysis-results", { type: "geojson", data: latestRef.current.results ?? emptyResults });
      map.addLayer({ id: "analysis-result-fill", type: "fill", source: "analysis-results", paint: { "fill-color": ["match", ["get", "change"], "loss", "#ef765e", "#16e784"], "fill-opacity": 0.42 } });
      map.addLayer({ id: "analysis-result-line", type: "line", source: "analysis-results", paint: { "line-color": ["match", ["get", "change"], "loss", "#ff8872", "#3ff39a"], "line-width": 1.4, "line-opacity": 0.95 } });
      loadedRef.current = true;
      setIsLoaded(true);
      updateMapLayers(map, latestRef.current.bounds, latestRef.current.results);
    });

    return () => {
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    updateMapLayers(map, bounds, results);
  }, [bounds, results]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    const frame = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - frame.left;
    const y = event.clientY - frame.top;
    setStart({ x, y });
    setRectangle({ x, y, width: 0, height: 0 });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawing || !start) return;
    const frame = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - frame.left;
    const y = event.clientY - frame.top;
    setRectangle({ x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) });
  };

  const finishDrawing = () => {
    const map = mapRef.current;
    if (!drawing || !start || !rectangle || !map) return;
    const southwest = map.unproject([rectangle.x, rectangle.y + rectangle.height]);
    const northeast = map.unproject([rectangle.x + rectangle.width, rectangle.y]);
    const nextBounds = { west: southwest.lng, south: southwest.lat, east: northeast.lng, north: northeast.lat };
    onBoundsChange(nextBounds);
    setDrawing(false);
    setStart(null);
    setRectangle(null);
    onAnalyse(nextBounds);
  };

  const zoomBy = (amount: number) => mapRef.current?.zoomTo(mapRef.current.getZoom() + amount, { duration: 250 });

  return (
    <div className={styles.mapShell}>
      <div ref={containerRef} className={styles.map} aria-label="Interactive satellite map. Pan and zoom to an area, then draw a rectangle to select it." />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.mapStatus} aria-hidden="true"><span><i /> LIVE SATELLITE BASEMAP</span><span>EPSG:4326</span></div>
      <div className={styles.legend} aria-hidden="true"><span><i className={styles.growth} /> Growth</span><span><i className={styles.loss} /> Loss</span></div>
      <div className={styles.zoomControls}><button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}><Plus size={15} /></button><button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}><Minus size={15} /></button></div>
      <button type="button" className={`${styles.drawButton} ${drawing ? styles.drawButtonActive : ""}`} onClick={() => setDrawing((active) => !active)}><Crosshair size={14} /> {drawing ? "Drag a rectangle" : "Draw area"}</button>
      <div className={`${styles.drawSurface} ${drawing ? styles.drawSurfaceActive : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishDrawing} onPointerLeave={finishDrawing}>
        {rectangle && <div className={styles.drawingRectangle} style={{ left: rectangle.x, top: rectangle.y, width: rectangle.width, height: rectangle.height }}><span>Area of interest</span></div>}
      </div>
      {!isLoaded && <div className={styles.loading}><LoaderCircle size={21} /> Loading Earth imagery</div>}
    </div>
  );
}
