import { useMemo, useState } from "react";
import { CandlestickChart } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

interface KRow {
  date: string | number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

interface Props {
  data: Record<string, number>[] | null;
  symbol?: string;
  loading?: boolean;
  error?: string | null;
}

// A 股配色：红涨绿跌（与全站一致）
const UP = "#f43f5e";    // 阳线（涨）
const DOWN = "#10b981";  // 阴线（跌）
const MA_COLORS = ["#fbbf24", "#60a5fa", "#a78bfa"]; // MA5 / MA10 / MA20
const GRID = "rgba(148,163,184,0.14)";

const M_L = 46, M_R = 14, M_T = 12, M_B = 26;
const STEP = 9, CW = 7, PRICE_H = 240, VOL_H = 52, GAP = 6;

function ma(closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

export function KLineChart({ data, symbol, loading, error }: Props) {
  const rows = useMemo<KRow[]>(() => (data ?? []) as unknown as KRow[], [data]);
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (rows.length === 0) return null;
    let hi = -Infinity, lo = Infinity, maxVol = 0;
    for (const r of rows) {
      hi = Math.max(hi, r.high); lo = Math.min(lo, r.low);
      maxVol = Math.max(maxVol, r.volume);
    }
    const pad = (hi - lo) * 0.06 || lo * 0.01 || 1;
    const priceMin = lo - pad, priceMax = hi + pad;
    const closes = rows.map((r) => r.close);
    const priceY = (p: number) => M_T + PRICE_H - ((p - priceMin) / (priceMax - priceMin)) * PRICE_H;
    const volMax = maxVol || 1;
    const volY = (v: number) => M_T + PRICE_H + GAP + VOL_H - (v / volMax) * VOL_H;
    const W = M_L + rows.length * STEP + M_R;
    const H = M_T + PRICE_H + GAP + VOL_H + M_B;
    return { hi, lo, priceMin, priceMax, priceY, volY, volBottom: M_T + PRICE_H + GAP + VOL_H, W, H,
      ma5: ma(closes, 5), ma10: ma(closes, 10), ma20: ma(closes, 20) };
  }, [rows]);

  const active = hover != null ? rows[hover] : null;

  // 价格刻度（5 档）
  const ticks = useMemo(() => {
    if (!geom) return [];
    const n = 5;
    const out: { y: number; v: string }[] = [];
    for (let i = 0; i < n; i++) {
      const p = geom.priceMin + ((geom.priceMax - geom.priceMin) * i) / (n - 1);
      out.push({ y: geom.priceY(p), v: p.toFixed(2) });
    }
    return out;
  }, [geom]);

  // 时间刻度（最多 ~7 档）
  const dateTicks = useMemo(() => {
    if (rows.length === 0) return [];
    const step = Math.max(1, Math.floor(rows.length / 7));
    const idxs: number[] = [];
    for (let i = rows.length - 1; i >= 0; i -= step) idxs.unshift(i);
    if (idxs[0] !== 0 && rows.length > 1) idxs.unshift(0);
    return idxs;
  }, [rows]);

  if (!geom) {
    return (
      <GlassCard className="mb-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><CandlestickChart className="h-4 w-4 text-primary" /> K 线图{symbol ? ` · ${symbol}` : ""}</h3>
        <p className="py-8 text-center text-sm text-muted-foreground/60">
          {loading ? "加载中…" : error || (rows.length === 0 && "暂无 K 线数据")}
        </p>
      </GlassCard>
    );
  }

  const legend: [string, string][] = [["MA5", MA_COLORS[0]], ["MA10", MA_COLORS[1]], ["MA20", MA_COLORS[2]]];
  const fmtDate = (d: string | number) => String(d).slice(0, 10);

  return (
    <GlassCard className="mb-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <CandlestickChart className="h-4 w-4 text-primary" /> K 线图{symbol ? ` · ${symbol}` : ""}
        <span className="text-xs font-normal text-muted-foreground/60">日K · 前复权 · 腾讯源</span>
        <span className="ml-auto flex items-center gap-2 text-[11px] font-normal">
          {legend.map(([label, color]) => (
            <span key={label} className="flex items-center gap-1 text-muted-foreground/70">
              <span className="inline-block h-0.5 w-3" style={{ background: color }} /> {label}
            </span>
          ))}
        </span>
      </h3>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
        <span>开 <b className={cn("text-xs font-bold", active ? (active.open >= active.close ? "text-danger" : "text-success") : "")}>{active?.open ?? "--"}</b></span>
        <span>高 <b className="text-xs font-bold text-danger">{active?.high ?? "--"}</b></span>
        <span>低 <b className="text-xs font-bold text-success">{active?.low ?? "--"}</b></span>
        <span>收 <b className="text-xs font-bold">{active?.close ?? "--"}</b></span>
        <span>量 <b className="text-xs font-bold">{active ? (active.volume / 1e4).toFixed(1) + "万" : "--"}</b></span>
        <span className="text-muted-foreground/50">{active ? fmtDate(active.date) : "--"}</span>
      </div>

      <div className="mt-2 overflow-x-auto">
        <svg
          width={geom.W} height={geom.H}
          className="block"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * geom.W - M_L;
            setHover(Math.max(0, Math.min(rows.length - 1, Math.floor(x / STEP))));
          }}
        >
          {/* 价格网格 + 刻度 */}
          {ticks.map((t) => (
            <g key={t.v}>
              <line x1={M_L} x2={geom.W - M_R} y1={t.y} y2={t.y} stroke={GRID} strokeDasharray="3 3" />
              <text x={M_L - 6} y={t.y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{t.v}</text>
            </g>
          ))}

          {/* 成交量 */}
          {rows.map((r, i) => {
            const x = M_L + i * STEP + (STEP - CW) / 2;
            const y0 = geom.volY(r.volume);
            const up = r.close >= r.open;
            return (
              <rect key={`v${i}`} x={x} y={y0} width={CW} height={Math.max(0.5, geom.volBottom - y0)}
                fill={up ? UP : DOWN} fillOpacity={0.45} />
            );
          })}

          {/* MA 均线 */}
          {[
            [geom.ma5, MA_COLORS[0]],
            [geom.ma10, MA_COLORS[1]],
            [geom.ma20, MA_COLORS[2]],
          ].map(([arr, color], mi) => {
            const pts: string[] = [];
            (arr as (number | null)[]).forEach((v, i) => {
              if (v == null) return;
              pts.push(`${(M_L + i * STEP + STEP / 2).toFixed(1)},${geom.priceY(v).toFixed(1)}`);
            });
            return pts.length > 1 && (
              <polyline key={mi} points={pts.join(" ")} fill="none" stroke={color as string} strokeWidth={1.2} opacity={0.9} />
            );
          })}

          {/* K 线蜡烛 + 影线 */}
          {rows.map((r, i) => {
            const cx = M_L + i * STEP + STEP / 2;
            const up = r.close >= r.open;
            const color = up ? UP : DOWN;
            const yTop = geom.priceY(Math.max(r.open, r.close));
            const yBot = geom.priceY(Math.min(r.open, r.close));
            return (
              <g key={i}>
                <line x1={cx} x2={cx} y1={geom.priceY(r.high)} y2={geom.priceY(r.low)} stroke={color} strokeWidth={1} />
                <rect x={cx - CW / 2} y={yTop} width={CW} height={Math.max(1, yBot - yTop)} fill={color} rx={0.5} />
              </g>
            );
          })}

          {/* 悬停参考线 */}
          {hover != null && (
            <line x1={M_L + hover * STEP + STEP / 2} x2={M_L + hover * STEP + STEP / 2} y1={M_T} y2={geom.H - M_B}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
          )}

          {/* 日期刻度 */}
          {dateTicks.map((i) => (
            <text key={i} x={M_L + i * STEP + STEP / 2} y={geom.H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">
              {fmtDate(rows[i].date)}
            </text>
          ))}
        </svg>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground/50">悬停查看单日明细。客观行情数据，非推荐 / 非预测。</p>
    </GlassCard>
  );
}