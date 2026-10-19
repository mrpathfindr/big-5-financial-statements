"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  barsPerSession,
  formatBarTime,
  formatChange,
  formatClock,
  formatPrice,
  formatVolume,
  isIntraday,
  SESSION_OPEN_MINUTE,
  type Candle,
  type CandleSeries,
  type Timeframe,
} from "@/lib/candles";
import type { ChartMarker } from "@/lib/markers";

// Canvas candlestick chart (no chart library: the project has no charting
// dependency and the drawing is simple enough). Features modelled on
// TradingView / Yahoo Finance: candles + volume pane, right price axis with
// last-price marker, bottom time axis with adaptive labels, crosshair with
// axis readouts and an OHLC legend, wheel zoom, drag pan, keyboard control.

export interface ChartView {
  /** Number of bars spanning the plot width (fractional allowed). */
  barsVisible: number;
  /** Bars between the last bar and the right edge; negative = blank space on the right. */
  rightOffset: number;
  /**
   * Set by `defaultView`: `barsVisible` is then an upper bound and the chart
   * shows fewer bars on narrow plots so candles stay legible. Cleared by the
   * first zoom/pan.
   */
  auto?: boolean;
  /** One-shot hint: centre the viewport on this bar (consumed by `clampView`). */
  focusIndex?: number;
}

const MIN_DEFAULT_PX_PER_BAR = 7;

export function defaultView(tf: Timeframe): ChartView {
  return { barsVisible: tf.defaultVisibleBars, rightOffset: -Math.round(tf.defaultVisibleBars * 0.08), auto: true };
}

const UP = "#16a34a";
const DOWN = "#dc2626";
const UP_VOLUME = "rgba(22, 163, 74, 0.28)";
const DOWN_VOLUME = "rgba(220, 38, 38, 0.28)";
const TEXT = "#1a1d24";
const MUTED = "#6b7280";
const MARKER = "#2563eb";
const GRID = "#f0f1f3";
const BORDER = "#e3e5e9";

const AXIS_WIDTH = 68; // right price axis
const TIME_AXIS_HEIGHT = 28;
const VOLUME_PANE_RATIO = 0.2; // share of the price pane used by the volume overlay
const MIN_BARS = 8;
const MAX_BARS = 1500;
const MIN_LABEL_SPACING = 64; // px between time-axis labels
const MIN_SESSION_WIDTH = 12; // px per session before intraday day separators are drawn
const TOP_INSET = 26; // px kept clear above the highest visible price (legend overlay lives there)
const MARKER_GAP = 3; // px between a bar's high and the arrow tip
const MARKER_HEIGHT = 18; // arrow height
const MARKER_LABEL_HEIGHT = 16; // label pill above the arrow
const MARKER_SPACE = MARKER_GAP + MARKER_HEIGHT + MARKER_LABEL_HEIGHT + 4; // extra headroom when a marker is in view
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Layout {
  plotW: number;
  plotH: number; // price pane height (time axis excluded)
  volH: number;
  pxPerBar: number;
  view: ChartView; // clamped
  left: number; // fractional bar index at the left edge: bar i spans [i, i + 1)
  right: number; // fractional bar index at the right edge
  first: number; // first visible integer bar index
  last: number; // last visible integer bar index (inclusive); < first when none
  priceMin: number;
  priceMax: number;
  volMax: number;
}

interface Hover {
  x: number;
  y: number;
  index: number | null; // bar under the pointer, null when over blank space
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Resolve a view against the data and (optionally) the plot width; the result carries no hints. */
export function clampView(view: ChartView, barCount: number, plotW?: number): ChartView {
  let barsVisible = view.barsVisible;
  let rightOffset = view.rightOffset;
  if (view.auto && plotW !== undefined && plotW > 0) {
    barsVisible = Math.min(barsVisible, Math.max(MIN_BARS, Math.floor(plotW / MIN_DEFAULT_PX_PER_BAR)));
    rightOffset = -Math.round(barsVisible * 0.08);
  }
  const maxBars = Math.max(MIN_BARS, Math.min(MAX_BARS, Math.ceil(barCount * 1.2)));
  barsVisible = clamp(barsVisible, MIN_BARS, maxBars);
  if (view.focusIndex !== undefined) rightOffset = barCount - (view.focusIndex + 0.5 + barsVisible / 2);
  // Keep at least half a screen of bars in view, allow half a screen of blank space on the right.
  const right = clamp(barCount - rightOffset, Math.min(barCount, barsVisible * 0.5), barCount + barsVisible * 0.5);
  return { barsVisible, rightOffset: barCount - right };
}

function computeLayout(
  bars: readonly Candle[],
  markers: readonly ChartMarker[],
  view: ChartView,
  width: number,
  height: number
): Layout {
  const n = bars.length;
  const plotW = Math.max(0, width - AXIS_WIDTH);
  const plotH = Math.max(0, height - TIME_AXIS_HEIGHT);
  const v = clampView(view, n, plotW);
  const pxPerBar = v.barsVisible > 0 ? plotW / v.barsVisible : 0;
  const right = n - v.rightOffset;
  const left = right - v.barsVisible;
  const first = Math.max(0, Math.floor(left));
  const last = Math.min(n - 1, Math.ceil(right) - 1);

  let priceMin = Infinity;
  let priceMax = -Infinity;
  let volMax = 0;
  if (n > 0) {
    // Fall back to the nearest bar when the viewport shows only blank space.
    const a = first <= last ? first : left >= n ? n - 1 : 0;
    const b = first <= last ? last : a;
    for (let i = a; i <= b; i++) {
      const bar = bars[i];
      if (bar.low < priceMin) priceMin = bar.low;
      if (bar.high > priceMax) priceMax = bar.high;
      if (bar.volume > volMax) volMax = bar.volume;
    }
    const span = priceMax - priceMin;
    const pad = span > 0 ? span * 0.08 : Math.max(priceMax * 0.01, 0.01);
    priceMin -= pad;
    priceMax += pad;
    // Extend the top so the highest candle sits TOP_INSET px below the edge
    // (plus room for an arrow + label when a marker is in view).
    const inset = TOP_INSET + (markers.some((m) => m.index >= first && m.index <= last) ? MARKER_SPACE : 0);
    if (plotH > inset) priceMax += ((priceMax - priceMin) * inset) / (plotH - inset);
  } else {
    priceMin = 0;
    priceMax = 1;
  }

  return {
    plotW,
    plotH,
    volH: plotH * VOLUME_PANE_RATIO,
    pxPerBar,
    view: v,
    left,
    right,
    first,
    last,
    priceMin,
    priceMax,
    volMax,
  };
}

/** "Nice" axis step (1, 2, 2.5, 5 × 10^k) for roughly `maxTicks` ticks. */
function niceStep(range: number, maxTicks: number): number {
  const rough = range / Math.max(1, maxTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const r = rough / magnitude;
  const m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return m * magnitude;
}

interface TimeLabel {
  x: number;
  text: string;
  strong: boolean;
  level: number;
  index: number;
}

// Significance of a bar as a time-axis label candidate: year > month > day >
// intraday boundaries. Mirrors how TradingView picks its axis labels.
function labelCandidate(bars: readonly Candle[], i: number, tf: Timeframe): { level: number; text: string; strong: boolean } {
  const d = new Date(bars[i].time);
  const p = i > 0 ? new Date(bars[i - 1].time) : null;
  if (!p || d.getUTCFullYear() !== p.getUTCFullYear()) {
    return { level: 4, text: String(d.getUTCFullYear()), strong: true };
  }
  if (d.getUTCMonth() !== p.getUTCMonth()) return { level: 3, text: MONTHS[d.getUTCMonth()], strong: true };
  if (d.getUTCDate() !== p.getUTCDate()) return { level: 2, text: String(d.getUTCDate()), strong: false };

  const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
  let level: number;
  if (tf.minutes < 60) {
    level = minute % 60 === 0 ? 1 : minute % 30 === 0 ? 0.6 : minute % 15 === 0 ? 0.3 : 0.1;
  } else {
    level = (minute - SESSION_OPEN_MINUTE) % 180 === 0 ? 1 : 0.6;
  }
  return { level, text: formatClock(bars[i].time), strong: false };
}

/** Nominal distance (in bars) between labels of an intraday level. */
function nominalSpacing(level: number, tf: Timeframe): number {
  if (tf.minutes < 60) {
    const minutes = level >= 1 ? 60 : level >= 0.6 ? 30 : level >= 0.3 ? 15 : tf.minutes;
    return minutes / tf.minutes;
  }
  return (level >= 1 ? 180 : 60) / tf.minutes;
}

function computeTimeLabels(bars: readonly Candle[], layout: Layout, tf: Timeframe, xOf: (i: number) => number): TimeLabel[] {
  const intraday = isIntraday(tf);
  const candidates: TimeLabel[] = [];
  for (let i = layout.first; i <= layout.last; i++) {
    const c = labelCandidate(bars, i, tf);
    // Finer levels are only used once their regular spacing fits, so labels
    // stay evenly spaced (every 15 minutes rather than every 3 bars; day
    // numbers on the daily chart only once a trading week has room).
    if (c.level === 2 && !intraday && 5 * layout.pxPerBar < MIN_LABEL_SPACING) continue;
    if (c.level < 2 && nominalSpacing(c.level, tf) * layout.pxPerBar < MIN_LABEL_SPACING) continue;
    candidates.push({ x: xOf(i), text: c.text, strong: c.strong, level: c.level, index: i });
  }
  candidates.sort((a, b) => b.level - a.level || a.index - b.index);

  const placed: TimeLabel[] = [];
  for (const c of candidates) {
    const halfWidth = c.text.length * 3.4 + 3; // ~11px font; avoids clipped edge labels
    if (c.x - halfWidth < 0 || c.x + halfWidth > layout.plotW) continue;
    if (placed.every((p) => Math.abs(p.x - c.x) >= MIN_LABEL_SPACING)) placed.push(c);
  }
  return placed.sort((a, b) => a.x - b.x);
}

interface DrawOptions {
  bars: readonly Candle[];
  markers: readonly ChartMarker[];
  layout: Layout;
  timeframe: Timeframe;
  hover: Hover | null;
  fontFamily: string;
}

function draw(ctx: CanvasRenderingContext2D, width: number, height: number, o: DrawOptions): void {
  const { bars, markers, layout, timeframe, hover } = o;
  const { plotW, plotH, volH, pxPerBar, left, first, last, priceMin, priceMax, volMax } = layout;
  const n = bars.length;
  const font = `11px ${o.fontFamily}`;
  const strongFont = `600 11px ${o.fontFamily}`;
  const intraday = isIntraday(timeframe);

  const xOf = (i: number) => (i + 0.5 - left) * pxPerBar;
  const yOf = (price: number) => ((priceMax - price) / (priceMax - priceMin)) * plotH;
  const priceAt = (y: number) => priceMax - (y / plotH) * (priceMax - priceMin);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.font = font;
  ctx.lineWidth = 1;

  // --- horizontal grid + price axis labels --------------------------------
  const step = niceStep(priceMax - priceMin, Math.floor(plotH / 44));
  const ticks: number[] = [];
  for (let p = Math.ceil(priceMin / step) * step; p <= priceMax; p += step) ticks.push(p);

  ctx.strokeStyle = GRID;
  ctx.beginPath();
  for (const p of ticks) {
    const y = Math.round(yOf(p)) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(plotW, y);
  }
  ctx.stroke();

  // --- time axis labels + vertical grid ------------------------------------
  const timeLabels = n > 0 ? computeTimeLabels(bars, layout, timeframe, xOf) : [];
  ctx.strokeStyle = GRID;
  ctx.beginPath();
  for (const l of timeLabels) {
    const x = Math.round(l.x) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, plotH);
  }
  ctx.stroke();

  // Session separators on intraday charts (when sessions are wide enough to tell apart).
  if (intraday && pxPerBar * barsPerSession(timeframe) >= MIN_SESSION_WIDTH) {
    ctx.strokeStyle = BORDER;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = Math.max(first, 1); i <= last; i++) {
      if (Math.floor(bars[i].time / 86_400_000) !== Math.floor(bars[i - 1].time / 86_400_000)) {
        const x = Math.round(xOf(i) - pxPerBar / 2) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotH);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- volume pane (overlay at the bottom of the price pane) ----------------
  const bodyW = Math.max(1, Math.min(Math.floor(pxPerBar * 0.72), pxPerBar > 3 ? Math.floor(pxPerBar) - 2 : 1));
  if (volMax > 0) {
    for (let i = first; i <= last; i++) {
      const bar = bars[i];
      const h = Math.max(1, Math.round((bar.volume / volMax) * volH));
      const xc = Math.round(xOf(i));
      ctx.fillStyle = bar.close >= bar.open ? UP_VOLUME : DOWN_VOLUME;
      ctx.fillRect(xc - Math.floor(bodyW / 2), plotH - h, bodyW, h);
    }
  }

  // --- candles -------------------------------------------------------------
  for (let i = first; i <= last; i++) {
    const bar = bars[i];
    const up = bar.close >= bar.open;
    const color = up ? UP : DOWN;
    const xc = Math.round(xOf(i));
    const yHigh = Math.round(yOf(bar.high));
    const yLow = Math.round(yOf(bar.low));
    const yOpen = Math.round(yOf(bar.open));
    const yClose = Math.round(yOf(bar.close));

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(xc + 0.5, yHigh);
    ctx.lineTo(xc + 0.5, Math.max(yLow, yHigh + 1));
    ctx.stroke();

    const top = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.abs(yOpen - yClose));
    ctx.fillStyle = color;
    if (bodyW <= 1) {
      ctx.fillRect(xc, top, 1, bodyH);
    } else {
      ctx.fillRect(xc - Math.floor(bodyW / 2), top, bodyW, bodyH);
    }
  }

  // --- filing markers: blue arrow pointing down at the bar, label above ----
  for (const m of markers) {
    if (m.index < first || m.index > last) continue;
    const xc = Math.round(xOf(m.index)) + 0.5;
    const tip = Math.round(yOf(bars[m.index].high)) - MARKER_GAP;
    drawDownArrow(ctx, xc, tip, MARKER_HEIGHT, MARKER);
    // Label in a white pill so it stays readable over neighbouring candles.
    ctx.font = `600 10px ${o.fontFamily}`;
    const labelW = Math.ceil(ctx.measureText(m.label).width) + 10;
    const labelX = clamp(xc - labelW / 2, 2, Math.max(2, plotW - labelW - 2));
    const labelY = tip - MARKER_HEIGHT - 2 - MARKER_LABEL_HEIGHT;
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.strokeStyle = MARKER;
    ctx.beginPath();
    ctx.roundRect(labelX + 0.5, labelY + 0.5, labelW, MARKER_LABEL_HEIGHT, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = MARKER;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.label, labelX + labelW / 2, labelY + MARKER_LABEL_HEIGHT / 2 + 0.5);
    ctx.font = font;
  }

  // --- axes ----------------------------------------------------------------
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(plotW, 0, AXIS_WIDTH, height);
  ctx.fillRect(0, plotH, width, TIME_AXIS_HEIGHT);
  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(plotW + 0.5, 0);
  ctx.lineTo(plotW + 0.5, height);
  ctx.moveTo(0, plotH + 0.5);
  ctx.lineTo(width, plotH + 0.5);
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const p of ticks) {
    const y = Math.round(yOf(p));
    if (y >= 8 && y <= plotH - 8) ctx.fillText(formatPrice(p), plotW + 8, y);
  }

  ctx.textAlign = "center";
  for (const l of timeLabels) {
    ctx.font = l.strong ? strongFont : font;
    ctx.fillStyle = l.strong ? TEXT : MUTED;
    ctx.fillText(l.text, Math.round(l.x), plotH + TIME_AXIS_HEIGHT / 2);
  }
  ctx.font = font;

  // --- last price marker ---------------------------------------------------
  if (n > 0) {
    const lastBar = bars[n - 1];
    const y = Math.round(yOf(lastBar.close)) + 0.5;
    const color = lastBar.close >= lastBar.open ? UP : DOWN;
    if (y >= 0 && y <= plotH) {
      ctx.strokeStyle = color;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawAxisTag(ctx, plotW, clamp(y, 9, plotH - 9), formatPrice(lastBar.close), color);
  }

  // --- crosshair -----------------------------------------------------------
  if (hover && plotW > 0) {
    const xc = hover.index !== null ? Math.round(xOf(hover.index)) : Math.round(hover.x);
    ctx.strokeStyle = MUTED;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    if (xc >= 0 && xc <= plotW) {
      ctx.moveTo(xc + 0.5, 0);
      ctx.lineTo(xc + 0.5, plotH);
    }
    if (hover.y >= 0 && hover.y <= plotH) {
      ctx.moveTo(0, Math.round(hover.y) + 0.5);
      ctx.lineTo(plotW, Math.round(hover.y) + 0.5);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (hover.y >= 0 && hover.y <= plotH) {
      drawAxisTag(ctx, plotW, Math.round(hover.y), formatPrice(priceAt(hover.y)), TEXT);
    }
    if (hover.index !== null) {
      const text = formatBarTime(bars[hover.index].time, intraday);
      const w = Math.ceil(ctx.measureText(text).width) + 12;
      const x = clamp(xc - w / 2, 0, Math.max(0, plotW - w));
      ctx.fillStyle = TEXT;
      ctx.fillRect(x, plotH + 1, w, TIME_AXIS_HEIGHT - 2);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(text, x + w / 2, plotH + TIME_AXIS_HEIGHT / 2);
    }
  }
}

/** Filled arrow whose tip is at (x, tipY), pointing down, with a white outline for contrast. */
function drawDownArrow(ctx: CanvasRenderingContext2D, x: number, tipY: number, h: number, color: string): void {
  const headH = Math.round(h * 0.45);
  const headW = 6; // half-width of the head
  const shaftW = 2.5; // half-width of the shaft
  ctx.beginPath();
  ctx.moveTo(x, tipY);
  ctx.lineTo(x - headW, tipY - headH);
  ctx.lineTo(x - shaftW, tipY - headH);
  ctx.lineTo(x - shaftW, tipY - h);
  ctx.lineTo(x + shaftW, tipY - h);
  ctx.lineTo(x + shaftW, tipY - headH);
  ctx.lineTo(x + headW, tipY - headH);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
}

function drawAxisTag(ctx: CanvasRenderingContext2D, plotW: number, y: number, text: string, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(plotW + 1, Math.round(y) - 9, AXIS_WIDTH - 1, 18);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, plotW + 8, Math.round(y));
}

// ---------------------------------------------------------------------------

interface Props {
  series: CandleSeries;
  /** Event markers (e.g. report filings), sorted by bar index. */
  markers?: readonly ChartMarker[];
  timeframe: Timeframe;
  view: ChartView;
  onViewChange: (next: ChartView) => void;
  ariaLabel: string;
}

const NO_MARKERS: readonly ChartMarker[] = [];

export default function CandlestickChart({
  series,
  markers = NO_MARKERS,
  timeframe,
  view,
  onViewChange,
  ariaLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<Hover | null>(null);

  const bars = series.bars;
  const n = bars.length;
  const intraday = isIntraday(timeframe);
  const layout = useMemo(
    () => computeLayout(bars, markers, view, size.width, size.height),
    [bars, markers, view, size]
  );

  // Track the container size (initial notification included).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fontFamily = getComputedStyle(canvas).fontFamily || "system-ui, sans-serif";
    draw(ctx, size.width, size.height, { bars, markers, layout, timeframe, hover, fontFamily });
  }, [bars, markers, layout, timeframe, hover, size]);

  // Wheel: zoom around the cursor (vertical) or pan (horizontal / trackpad).
  // Attached natively because React registers wheel listeners as passive.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { pxPerBar, plotW, left, view: v } = layout;
      if (pxPerBar <= 0 || n === 0) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        onViewChange(clampView({ ...v, rightOffset: v.rightOffset - e.deltaX / pxPerBar }, n));
        return;
      }
      const x = clamp(e.clientX - canvas.getBoundingClientRect().left, 0, plotW);
      const factor = Math.exp(e.deltaY * 0.0015);
      const barsVisible = clamp(v.barsVisible * factor, MIN_BARS, MAX_BARS);
      const anchor = left + x / pxPerBar; // bar position under the cursor stays put
      const newLeft = anchor - (x / plotW) * barsVisible;
      onViewChange(clampView({ barsVisible, rightOffset: n - (newLeft + barsVisible) }, n));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [layout, n, onViewChange]);

  function pointerPosition(e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hoverAt(x: number, y: number): Hover {
    const { pxPerBar, left, plotW } = layout;
    const i = pxPerBar > 0 ? Math.floor(left + x / pxPerBar) : -1;
    const index = i >= 0 && i < n && x <= plotW ? i : null;
    return { x, y, index };
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startOffset: layout.view.rightOffset };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = "grabbing";
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const { x, y } = pointerPosition(e);
    const drag = dragRef.current;
    if (drag && layout.pxPerBar > 0) {
      const dx = e.clientX - drag.startX;
      onViewChange(clampView({ ...layout.view, rightOffset: drag.startOffset + dx / layout.pxPerBar }, n));
    }
    setHover(hoverAt(x, y));
  }

  function endDrag(e: PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current) {
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      e.currentTarget.style.cursor = "";
    }
  }

  function onPointerLeave(e: PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) setHover(null);
    else endDrag(e);
  }

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    const v = layout.view;
    const pan = v.barsVisible * 0.1;
    let next: ChartView;
    switch (e.key) {
      case "ArrowLeft":
        next = { ...v, rightOffset: v.rightOffset + pan };
        break;
      case "ArrowRight":
        next = { ...v, rightOffset: v.rightOffset - pan };
        break;
      case "ArrowUp":
      case "+":
      case "=":
        next = { ...v, barsVisible: v.barsVisible / 1.25 };
        break;
      case "ArrowDown":
      case "-":
        next = { ...v, barsVisible: v.barsVisible * 1.25 };
        break;
      case "Home":
        next = { ...v, rightOffset: n - v.barsVisible };
        break;
      case "End":
        e.preventDefault();
        onViewChange(defaultView(timeframe));
        return;
      default:
        return;
    }
    e.preventDefault();
    onViewChange(clampView(next, n));
  }

  // Legend: hovered bar, else the latest bar.
  const legendIndex = hover?.index ?? (n > 0 ? n - 1 : null);
  const legendBar = legendIndex !== null ? bars[legendIndex] : null;
  const legendPrev = legendIndex !== null && legendIndex > 0 ? bars[legendIndex - 1] : null;
  const legendChange = legendBar ? legendBar.close - (legendPrev ? legendPrev.close : legendBar.open) : 0;
  const legendPct = legendBar ? (legendChange / (legendPrev ? legendPrev.close : legendBar.open)) * 100 : 0;
  const legendUp = legendBar ? legendBar.close >= legendBar.open : true;
  const legendMarkers = legendIndex !== null ? markers.filter((m) => m.index === legendIndex) : [];

  return (
    <div ref={containerRef} className="relative h-[360px] w-full select-none sm:h-[440px]">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="block h-full w-full cursor-crosshair touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={onPointerLeave}
        onDoubleClick={() => onViewChange(defaultView(timeframe))}
        onKeyDown={onKeyDown}
      />
      {legendBar && (
        <div
          className="pointer-events-none absolute left-2 right-[72px] top-1.5 flex items-center gap-x-3 overflow-hidden whitespace-nowrap font-mono text-[11px] text-[#6b7280]"
          data-testid="legend"
        >
          <span className="hidden text-[#1a1d24] sm:inline">{formatBarTime(legendBar.time, intraday)}</span>
          <span>
            O <b className={legendUp ? "text-[#16a34a]" : "text-[#dc2626]"}>{formatPrice(legendBar.open)}</b>
          </span>
          <span>
            H <b className={legendUp ? "text-[#16a34a]" : "text-[#dc2626]"}>{formatPrice(legendBar.high)}</b>
          </span>
          <span>
            L <b className={legendUp ? "text-[#16a34a]" : "text-[#dc2626]"}>{formatPrice(legendBar.low)}</b>
          </span>
          <span>
            C <b className={legendUp ? "text-[#16a34a]" : "text-[#dc2626]"}>{formatPrice(legendBar.close)}</b>
          </span>
          <span className={`hidden sm:inline ${legendChange >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
            {formatChange(legendChange, legendPct)}
          </span>
          <span className="hidden sm:inline">
            Vol <b className="text-[#1a1d24]">{formatVolume(legendBar.volume)}</b>
          </span>
        </div>
      )}
      {legendMarkers.length > 0 && (
        <div
          className="pointer-events-none absolute left-2 top-6 font-mono text-[11px] font-semibold text-[#2563eb]"
          data-testid="legend-marker"
        >
          {legendMarkers.map((m) => (
            <div key={m.label}>▼ {m.description}</div>
          ))}
        </div>
      )}
      {n === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[#6b7280]">No price data</div>
      )}
    </div>
  );
}
