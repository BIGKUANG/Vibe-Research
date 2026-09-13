import { useMemo, useState, useEffect, useRef } from "react";
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

// A 股配色：红涨绿跌（高对比，一眼可辨）
const UP = "#ff3b30";    // 阳线（涨）红
const DOWN = "#00c853";  // 阴线（跌）绿
const MA_COLORS = ["#fbbf24", "#60a5fa", "#a78bfa"]; // MA5 / MA10 / MA20
const GRID = "rgba(148,163,184,0.14)";

const M_L = 46, M_R = 48, M_T = 12, M_B = 38;
const STEP = 9, PRICE_H = 240, VOL_H = 52, GAP = 6;  // STEP：容器宽度未知时的兜底间距

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

// 生成「漂亮」的价格刻度：步长取 1 / 2 / 2.5 / 5 × 10^n，避免 11.63、12.14 这类零碎值
function niceTicks(min: number, max: number, target = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const rawStep = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = mult * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

// 成交量简写（股 → 万手/万）
function fmtVol(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}万`;
  return `${v}`;
}

export function KLineChart({ data, symbol, loading, error }: Props) {
  const rows = useMemo<KRow[]>(() => (data ?? []) as unknown as KRow[], [data]);
  const [hover, setHover] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);  // 十字星水平线（价格轴）位置
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);  // 容器宽度：按它把所有 K 线铺满，免横向滑动

  // 监听容器宽度（响应式）：宽度变化时重算每根 K 线间距，始终展示全部数据
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

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
    const volTop = M_T + PRICE_H + GAP;
    // 每根宽度按容器自适应：全部数据铺满一屏（最小 2.5px，避免极多数据时糊成一片）
    const n = rows.length;
    const step = width > M_L + M_R ? Math.max(2.5, (width - M_L - M_R) / n) : STEP;
    const cw = Math.max(1, Math.min(9, step * 0.7));
    const W = width > M_L + M_R ? width : M_L + n * STEP + M_R;
    const H = M_T + PRICE_H + GAP + VOL_H + M_B;
    return { hi, lo, priceMin, priceMax, priceY, volY, volTop, volMax,
      volBottom: M_T + PRICE_H + GAP + VOL_H, W, H, step, cw,
      ma5: ma(closes, 5), ma10: ma(closes, 10), ma20: ma(closes, 20) };
  }, [rows, width]);

  const active = hover != null ? rows[hover] : null;
  // 十字星处对应的价格（hoverY 在价格面板内）
  const hoverPrice = geom && hoverY != null
    ? geom.priceMin + (1 - (hoverY - M_T) / PRICE_H) * (geom.priceMax - geom.priceMin)
    : null;

  // 价格刻度（漂亮步长，附网格线 + 刻度短线）
  const ticks = useMemo(() => {
    if (!geom) return [];
    return niceTicks(geom.priceMin, geom.priceMax, 5)
      .map((p) => ({ y: geom.priceY(p), v: p.toFixed(2) }))
      .filter((t) => t.y >= M_T - 0.5 && t.y <= M_T + PRICE_H + 0.5);
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

      <div ref={wrapRef} className="mt-2 overflow-hidden">
        <svg
          width={geom.W} height={geom.H}
          className="block"
          onMouseLeave={() => { setHover(null); setHoverY(null); }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * geom.W - M_L;
            const yPx = ((e.clientY - rect.top) / rect.height) * geom.H;
            setHover(Math.max(0, Math.min(rows.length - 1, Math.floor(x / geom.step))));
            setHoverY(Math.max(M_T, Math.min(M_T + PRICE_H, yPx)));
          }}
        >
          {/* 左侧 Y 轴（价格）+ 网格线：刻度用漂亮步长，带轴线与刻度短线 */}
          <line x1={M_L} x2={M_L} y1={M_T} y2={geom.volBottom} stroke="rgba(148,163,184,0.4)" />
          {ticks.map((t) => (
            <g key={t.v}>
              <line x1={M_L} x2={geom.W - M_R} y1={t.y} y2={t.y} stroke={GRID} strokeDasharray="3 3" />
              <line x1={M_L - 4} x2={M_L} y1={t.y} y2={t.y} stroke="rgba(148,163,184,0.4)" />
              <text x={M_L - 6} y={t.y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{t.v}</text>
            </g>
          ))}

          {/* 成交量轴：轴线 + 最高量标注 */}
          <line x1={M_L} x2={M_L} y1={geom.volTop} y2={geom.volBottom} stroke="rgba(148,163,184,0.4)" />
          <line x1={M_L - 4} x2={M_L} y1={geom.volTop} y2={geom.volTop} stroke="rgba(148,163,184,0.4)" />
          <text x={M_L - 6} y={geom.volTop + 9} textAnchor="end" fontSize="9" fill="#94a3b8">{fmtVol(geom.volMax)}</text>

          {/* 成交量 */}
          {rows.map((r, i) => {
            const x = M_L + i * geom.step + (geom.step - geom.cw) / 2;
            const y0 = geom.volY(r.volume);
            const up = r.close >= r.open;
            return (
              <rect key={`v${i}`} x={x} y={y0} width={geom.cw} height={Math.max(0.5, geom.volBottom - y0)}
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
              pts.push(`${(M_L + i * geom.step + geom.step / 2).toFixed(1)},${geom.priceY(v).toFixed(1)}`);
            });
            return pts.length > 1 && (
              <polyline key={mi} points={pts.join(" ")} fill="none" stroke={color as string} strokeWidth={1.2} opacity={0.9} />
            );
          })}

          {/* K 线蜡烛 + 影线 */}
          {rows.map((r, i) => {
            const cx = M_L + i * geom.step + geom.step / 2;
            const up = r.close >= r.open;
            const color = up ? UP : DOWN;
            const yTop = geom.priceY(Math.max(r.open, r.close));
            const yBot = geom.priceY(Math.min(r.open, r.close));
            return (
              <g key={i}>
                <line x1={cx} x2={cx} y1={geom.priceY(r.high)} y2={geom.priceY(r.low)} stroke={color} strokeWidth={1} />
                <rect x={cx - geom.cw / 2} y={yTop} width={geom.cw} height={Math.max(1, yBot - yTop)} fill={color} rx={0.5} />
              </g>
            );
          })}

          {/* 十字星：纵向线 + 横向线 + 左侧价格标签 + 底部日期标签 */}
          {hover != null && (
            <line x1={M_L + hover * geom.step + geom.step / 2} x2={M_L + hover * geom.step + geom.step / 2}
              y1={M_T} y2={geom.volBottom} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" opacity={0.9} />
          )}
          {hover != null && hoverY != null && (
            <>
              <line x1={M_L} x2={geom.W - M_R} y1={hoverY} y2={hoverY}
                stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" opacity={0.9} />
              <g>
                <rect x={2} y={hoverY - 7} width={M_L - 6} height={14} rx={2} fill="#334155" />
                <text x={M_L - 4} y={hoverY + 3} textAnchor="end" fontSize="10" fill="#f8fafc">
                  {hoverPrice != null ? hoverPrice.toFixed(2) : "--"}
                </text>
              </g>
            </>
          )}

          {/* 日期刻度：末根右对齐避免出界，其余居中 */}
          {dateTicks.map((i) => {
            const isLast = i === rows.length - 1;
            return (
              <text key={i}
                x={M_L + i * geom.step + geom.step / 2 + (isLast ? -4 : 0)}
                y={geom.H - 24}
                textAnchor={isLast ? "end" : "middle"}
                fontSize="10" fill="#94a3b8">
                {fmtDate(rows[i].date)}
              </text>
            );
          })}

          {/* 悬停日期标签（底部，随游标移动并对左右边界做夹取） */}
          {hover != null && (() => {
            const cx = M_L + hover * geom.step + geom.step / 2;
            const lx = Math.max(M_L + 30, Math.min(geom.W - M_R - 30, cx));
            return (
              <g>
                <rect x={lx - 30} y={geom.H - 15} width={60} height={13} rx={2} fill="#334155" />
                <text x={lx} y={geom.H - 5} textAnchor="middle" fontSize="10" fill="#f8fafc">{fmtDate(rows[hover].date)}</text>
              </g>
            );
          })()}
        </svg>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground/50">悬停查看单日明细。客观行情数据，非推荐 / 非预测。</p>
    </GlassCard>
  );
}