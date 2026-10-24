import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface LinePoint { x: string; y: number | null }
export interface LineSeries { name: string; color: string; points: LinePoint[]; width?: number; dashed?: boolean }

interface Props {
  series: LineSeries[];
  height?: number;
  formatValue?: (v: number) => string;
  formatDate?: (s: string) => string;
  zeroLine?: boolean;
  emptyText?: string;
  className?: string;
}

const M_L = 52, M_R = 16, M_T = 14, M_B = 28;

function niceTicks(min: number, max: number, target = 4): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  const step = mult * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

const fmtDate = (s: string) => {
  const t = s.replace(/-/g, "");
  return t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}` : s;
};

/** 轻量 SVG 折线图：多序列、缺失值断线、悬停十字线；不引入图表库。 */
export function LineChart({
  series, height = 200, formatValue = (v) => v.toFixed(2), formatDate = fmtDate,
  zeroLine = false, emptyText = "暂无数据", className,
}: Props) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const attach = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    roRef.current = ro;
    if (el.clientWidth > 0) setWidth(el.clientWidth);
  }, []);

  const geom = useMemo(() => {
    if (width <= 0 || series.length === 0) return null;
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
    if (dates.length === 0) return null;
    const maps = series.map((s) => new Map(s.points.map((p) => [p.x, p.y])));
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const p of s.points) {
      if (p.y == null || !Number.isFinite(p.y)) continue;
      lo = Math.min(lo, p.y); hi = Math.max(hi, p.y);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    if (zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    const yMin = lo - pad, yMax = hi + pad;
    const innerW = Math.max(10, width - M_L - M_R);
    const innerH = height - M_T - M_B;
    const x = (i: number) => M_L + (dates.length === 1 ? innerW / 2 : (i / (dates.length - 1)) * innerW);
    const y = (v: number) => M_T + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    return { dates, maps, yMin, yMax, x, y, innerW, innerH };
  }, [series, width, height, zeroLine]);

  if (!geom) {
    return (
      <div ref={attach} className={cn("flex items-center justify-center text-sm text-muted-foreground/60", className)} style={{ height }}>
        {emptyText}
      </div>
    );
  }

  const { dates, maps, yMin, yMax, x, y } = geom;
  const ticks = niceTicks(yMin, yMax, 4);
  const xStep = Math.max(1, Math.floor(dates.length / 6));
  const xTicks: number[] = [];
  for (let i = 0; i < dates.length; i += xStep) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== dates.length - 1) xTicks.push(dates.length - 1);
  const activeIdx = hover != null ? Math.min(dates.length - 1, Math.max(0, hover)) : null;

  return (
    <div ref={attach} className={cn("relative", className)}>
      <div className="mb-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/70">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
      <svg
        width={width}
        height={height}
        className="block touch-none select-none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const idx = Math.round(((px - M_L) / Math.max(1, geom.innerW)) * (dates.length - 1));
          setHover(idx);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M_L} x2={M_L + geom.innerW} y1={y(t)} y2={y(t)} stroke="rgba(148,163,184,0.14)" />
            <text x={M_L - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground/60 text-[10px]">{formatValue(t)}</text>
          </g>
        ))}
        {zeroLine && 0 > yMin && 0 < yMax && (
          <line x1={M_L} x2={M_L + geom.innerW} y1={y(0)} y2={y(0)} stroke="rgba(148,163,184,0.45)" strokeDasharray="3 3" />
        )}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-muted-foreground/60 text-[10px]">
            {formatDate(dates[i]).slice(2)}
          </text>
        ))}
        {series.map((s) => {
          const m = maps[series.indexOf(s)];
          let d = "";
          let pen = false;
          dates.forEach((date, i) => {
            const v = m.get(date);
            if (v == null || !Number.isFinite(v)) { pen = false; return; }
            d += `${pen ? "L" : "M"}${x(i)},${y(v)} `;
            pen = true;
          });
          return (
            <path
              key={s.name}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width ?? 1.6}
              strokeDasharray={s.dashed ? "4 3" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {activeIdx != null && (
          <>
            <line x1={x(activeIdx)} x2={x(activeIdx)} y1={M_T} y2={M_T + geom.innerH} stroke="rgba(148,163,184,0.4)" />
            {series.map((s) => {
              const v = maps[series.indexOf(s)].get(dates[activeIdx]);
              return v == null || !Number.isFinite(v) ? null : (
                <circle key={s.name} cx={x(activeIdx)} cy={y(v)} r={2.6} fill={s.color} />
              );
            })}
          </>
        )}
      </svg>
      {activeIdx != null && (
        <div
          className="pointer-events-none absolute top-5 z-10 rounded-md border border-border bg-card/95 px-2 py-1 text-[11px] shadow-lg"
          style={{ left: Math.min(Math.max(x(activeIdx) + 8, 8), Math.max(8, width - 150)) }}
        >
          <p className="mb-0.5 font-mono text-muted-foreground">{formatDate(dates[activeIdx])}</p>
          {series.map((s) => {
            const v = maps[series.indexOf(s)].get(dates[activeIdx]);
            return (
              <p key={s.name} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                <span className="text-muted-foreground">{s.name}</span>
                <b className="font-mono">{v == null ? "—" : formatValue(v)}</b>
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
