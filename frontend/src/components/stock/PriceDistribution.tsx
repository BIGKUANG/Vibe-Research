import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

interface Props {
  data: Record<string, number>[] | null;
  currentPrice: number | null;
  loading: boolean;
  error: string | null;
}

// 正态分布 PDF
function normalPDF(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
}

// 从 kline close 数组计算统计量
function stats(closes: number[]) {
  const n = closes.length;
  if (n < 2) return null;
  const mu = closes.reduce((a, b) => a + b, 0) / n;
  const variance = closes.reduce((sum, v) => sum + (v - mu) ** 2, 0) / (n - 1);
  const sigma = Math.sqrt(variance);
  if (sigma < 1e-10) return null;
  return { mu, sigma, min: mu - 4 * sigma, max: mu + 4 * sigma, n };
}

// SVG 高斯曲线
function DistChart({
  label,
  closes,
  currentPrice,
}: {
  label: string;
  closes: number[];
  currentPrice: number | null;
}) {
  const W = 400, H = 80;

  const dist = useMemo(() => stats(closes), [closes]);

  if (!dist) return null;

  // SVG 路径点：计算 120 个采样点
  const points: { x: number; y: number }[] = [];
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const x = dist.min + (dist.max - dist.min) * (i / steps);
    const pdf = normalPDF(x, dist.mu, dist.sigma);
    points.push({
      x: ((x - dist.min) / (dist.max - dist.min)) * W,
      y: H - (pdf / normalPDF(dist.mu, dist.mu, dist.sigma)) * H * 0.85,
    });
  }

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("") + `L${W},${H}L0,${H}Z`;

  // 当前价格位置
  const currentX = currentPrice != null
    ? ((Math.min(Math.max(currentPrice, dist.min), dist.max) - dist.min) / (dist.max - dist.min)) * W
    : -1;

// SVG x-pos kσ 偏离
const xAt = (k: number) => ((dist.mu + k * dist.sigma - dist.min) / (dist.max - dist.min)) * W;
const muX = xAt(0);
const showMarker = currentPrice != null && currentPrice >= dist.min && currentPrice <= dist.max;
const stdFromMean = currentPrice != null ? ((currentPrice - dist.mu) / dist.sigma) : 0;

// σ 标注：±2σ（95%）、±3σ（99.7%）
const SIGMA_MARKS = [
  { k: -3, label: "-3σ" },
  { k: -2, label: "-2σ" },
  { k: 2, label: "+2σ" },
  { k: 3, label: "+3σ" },
];

return (
  <div>
    <div className="mb-2 flex items-baseline justify-between">
      <span className="text-xs font-medium text-muted-foreground">
        {label} · <span className="font-mono">μ={dist.mu.toFixed(2)}</span>
        <span className="ml-2 text-muted-foreground/60">σ={dist.sigma.toFixed(2)}</span>
        {currentPrice != null && (
          <span className={cn(
            "ml-2 font-mono text-[11px]",
            stdFromMean > 0 ? "text-danger" : stdFromMean < 0 ? "text-success" : "text-muted-foreground",
          )}>
            当前 {stdFromMean > 0 ? "+" : ""}{stdFromMean.toFixed(2)}σ
          </span>
        )}
      </span>
      <span className="text-[10px] text-muted-foreground/50">{dist.n} 交易日</span>
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ maxWidth: 500 }}>
      {/* ±2σ 浅色区域 */}
      <rect
        x={xAt(-2)}
        y={0}
        width={xAt(2) - xAt(-2)}
        height={H}
        fill="hsl(var(--primary) / 0.06)"
      />
      {/* 填充曲线 */}
      <path d={pathD} fill="hsl(var(--primary) / 0.20)" />
      {/* 曲线轮廓 */}
      <path
        d={points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("")}
        fill="none"
        stroke="hsl(var(--primary) / 0.6)"
        strokeWidth="1.5"
      />
      {/* σ 标记线 */}
      {SIGMA_MARKS.map(({ k, label }) => {
        const x = xAt(k);
        const val = dist.mu + k * dist.sigma;
        const isOuter = Math.abs(k) === 3;
        return (
          <g key={k}>
            <line
              x1={x} y1={0} x2={x} y2={H}
              stroke={isOuter ? "hsl(var(--muted-foreground) / 0.35)" : "hsl(var(--primary) / 0.20)"}
              strokeWidth={isOuter ? 0.5 : 1}
              strokeDasharray={isOuter ? "2,3" : "4,4"}
            />
          <text
              x={x} y={10}
              textAnchor="middle"
              fill="hsl(var(--muted-foreground) / 0.50)"
              className="text-[7px]"
              style={{ fontFamily: "monospace" }}
            >
              {label} {val.toFixed(2)}
            </text>
          </g>
        );
      })}
      {/* 均值虚线 */}
      <line
        x1={muX} y1={0} x2={muX} y2={H}
        stroke="hsl(var(--primary) / 0.25)"
        strokeWidth="1"
        strokeDasharray="3,3"
      />
      {/* 当前价格标记线 */}
      {showMarker && (
        <>
          <line
            x1={currentX} y1={0} x2={currentX} y2={H}
            stroke="hsl(var(--primary))"
            strokeWidth="2"
          />
          <circle cx={currentX} cy={4} r="3" fill="hsl(var(--primary))" />
          <text
            x={currentX} y={-4}
            textAnchor="middle"
            className="text-[9px]"
            fill="hsl(var(--primary))"
            style={{ fontFamily: "monospace" }}
          >
            {currentPrice?.toFixed(2)}
          </text>
        </>
      )}
    </svg>
  </div>
);
}

export function PriceDistribution({ data, currentPrice, loading, error }: Props) {
  const closes = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data
      .filter((d) => typeof d["close"] === "number")
      .map((d) => d["close"] as number);
  }, [data]);

  if (loading) return null; // 主数据加载时等主流程
  if (error) return null;   // 数据源不可用时静默降级
  if (closes.length < 30) return null; // 数据不足

  return (
    <GlassCard className="mb-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <BarChart3 className="h-4 w-4 text-primary" /> 价格正态分布
      </h3>
      <p className="mb-4 text-[11px] text-muted-foreground/60">
        基于近 N 日收盘价的正态分布模拟，标记当前价格在分布中的位置（标准差 σ）。不构成买卖建议。
      </p>
      <div className="space-y-5">
        {[30, 60, 90, 120].map((days) => {
          const slice = closes.length >= days ? closes.slice(-days) : closes;
          return (
            <DistChart
              key={days}
              label={`近 ${days} 日`}
              closes={slice}
              currentPrice={currentPrice}
            />
          );
        })}
      </div>
    </GlassCard>
  );
}
