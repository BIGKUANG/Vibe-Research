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

// 从 kline close 数组计算统计量（样本标准差）
function stats(closes: number[]) {
  const n = closes.length;
  if (n < 2) return null;
  const mu = closes.reduce((a, b) => a + b, 0) / n;
  const variance = closes.reduce((sum, v) => sum + (v - mu) ** 2, 0) / (n - 1);
  const sigma = Math.sqrt(variance);
  if (sigma < 1e-10) return null;
  return { mu, sigma, n };
}

// 当前价相对均值的分区（决定竖线与区域配色）：
//   |z| ≤ 2σ → 绿（常态区间）；2σ < |z| ≤ 3σ → 黄（偏离）；|z| > 3σ → 红（极端）
type Zone = "in" | "mid" | "out";
function zoneOf(z: number): Zone {
  const a = Math.abs(z);
  return a <= 2 ? "in" : a <= 3 ? "mid" : "out";
}
const ZONE_STROKE: Record<Zone, string> = {
  in: "hsl(var(--success))",
  mid: "hsl(var(--warning))",
  out: "hsl(var(--danger))",
};
const ZONE_BG: Record<Zone, string> = {
  in: "hsl(var(--success) / 0.08)",
  mid: "hsl(var(--warning) / 0.08)",
  out: "hsl(var(--danger) / 0.08)",
};
const ZONE_TEXT: Record<Zone, string> = {
  in: "text-success",
  mid: "text-warning",
  out: "text-danger",
};

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

  const priceValid = currentPrice != null && Number.isFinite(currentPrice);

  // 分布主区间 μ±4σ；若当前价落在区间外，把坐标轴扩展以纳入当前价（上限 μ±6σ），
  // 保证「当前价竖线」始终可见（此前直接隐藏，遇到连续涨停/跌停就看不出位置）。
  const baseLo = dist.mu - 4 * dist.sigma;
  const baseHi = dist.mu + 4 * dist.sigma;
  const hardLo = dist.mu - 6 * dist.sigma;
  const hardHi = dist.mu + 6 * dist.sigma;
  let axisLo = baseLo;
  let axisHi = baseHi;
  if (priceValid) {
    axisLo = Math.max(hardLo, Math.min(axisLo, currentPrice! - 0.3 * dist.sigma));
    axisHi = Math.min(hardHi, Math.max(axisHi, currentPrice! + 0.3 * dist.sigma));
  }
  const xOf = (v: number) => ((v - axisLo) / (axisHi - axisLo)) * W;

  // 曲线只在 μ±4σ 内采样（远端概率≈0），再映射到当前轴
  const pdfMax = normalPDF(dist.mu, dist.mu, dist.sigma);
  const points: { x: number; y: number }[] = [];
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const x = baseLo + (baseHi - baseLo) * (i / steps);
    const pdf = normalPDF(x, dist.mu, dist.sigma);
    points.push({ x: xOf(x), y: H - (pdf / pdfMax) * H * 0.85 });
  }
  const curve = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
  const pathD = `${curve}L${xOf(baseHi).toFixed(1)},${H}L${xOf(baseLo).toFixed(1)},${H}Z`;

  // 当前价格位置：夹到轴内；超出轴（价格极远）时标注「超出」
  const clampedPrice = priceValid ? Math.min(Math.max(currentPrice!, axisLo), axisHi) : axisLo;
  const markerX = priceValid ? xOf(clampedPrice) : -1;
  const offScale = priceValid && (currentPrice! < axisLo || currentPrice! > axisHi);
  const stdFromMean = priceValid ? (currentPrice! - dist.mu) / dist.sigma : 0;
  // 竖线按当前价所在分区着色：±2σ 内绿 / ±2σ~±3σ 黄 / 超出 ±3σ 红
  const zone: Zone | null = priceValid ? zoneOf(stdFromMean) : null;
  const priceStroke = zone ? ZONE_STROKE[zone] : "hsl(var(--muted-foreground))";

// SVG x-pos kσ 偏离
const sx = (k: number) => xOf(dist.mu + k * dist.sigma);
const muX = sx(0);

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
        {priceValid && (
          <span className={cn("ml-2 font-mono text-[11px]", zone ? ZONE_TEXT[zone] : "text-muted-foreground")}>
            当前 {stdFromMean > 0 ? "+" : ""}{stdFromMean.toFixed(2)}σ
          </span>
        )}
      </span>
      <span className="text-[10px] text-muted-foreground/50">{dist.n} 交易日</span>
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ maxWidth: 500 }}>
      {/* 分区底色：绿 ±2σ 内 / 黄 ±2σ–±3σ / 红 ±3σ 外 */}
      <rect x={sx(-2)} y={0} width={sx(2) - sx(-2)} height={H} fill={ZONE_BG.in} />
      <rect x={sx(-3)} y={0} width={sx(-2) - sx(-3)} height={H} fill={ZONE_BG.mid} />
      <rect x={sx(2)} y={0} width={sx(3) - sx(2)} height={H} fill={ZONE_BG.mid} />
      <rect x={0} y={0} width={Math.max(0, sx(-3))} height={H} fill={ZONE_BG.out} />
      <rect x={sx(3)} y={0} width={Math.max(0, W - sx(3))} height={H} fill={ZONE_BG.out} />
      {/* 填充曲线（中性灰，避免与红/绿分区混淆） */}
      <path d={pathD} fill="hsl(var(--muted-foreground) / 0.12)" />
      {/* 曲线轮廓 */}
      <path
        d={curve}
        fill="none"
        stroke="hsl(var(--muted-foreground) / 0.55)"
        strokeWidth="1.5"
      />
      {/* σ 标记线 */}
      {SIGMA_MARKS.map(({ k, label }) => {
        const x = sx(k);
        const val = dist.mu + k * dist.sigma;
        const isOuter = Math.abs(k) === 3;
        return (
          <g key={k}>
            <line
              x1={x} y1={0} x2={x} y2={H}
              stroke={isOuter ? "hsl(var(--danger) / 0.45)" : "hsl(var(--success) / 0.45)"}
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
        stroke="hsl(var(--primary) / 0.35)"
        strokeWidth="1"
        strokeDasharray="3,3"
      />
      {/* 当前价格标记线（按分区着色：±2σ 内绿 / ±2σ~±3σ 黄 / 超出 ±3σ 红） */}
      {priceValid && (
        <>
          <line
            x1={markerX} y1={0} x2={markerX} y2={H}
            stroke={priceStroke}
            strokeWidth={offScale ? 1.5 : 2}
            strokeDasharray={offScale ? "4,3" : undefined}
          />
          <circle cx={markerX} cy={4} r="3" fill={priceStroke} />
          <text
            x={markerX} y={-4}
            textAnchor="middle"
            className="text-[9px]"
            fill={priceStroke}
            style={{ fontFamily: "monospace" }}
          >
            {currentPrice?.toFixed(2)}{offScale ? (currentPrice! > axisHi ? " ▲" : " ▼") : ""}
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
        基于近 N 日收盘价的正态分布模拟，标记当前价格在分布中的位置（标准差 σ）。竖线分区：
        <span className="text-success">绿 = 在 ±2σ 内</span> ·
        <span className="text-warning">黄 = ±2σ ~ ±3σ</span> ·
        <span className="text-danger">红 = 超出 ±3σ</span>。不构成买卖建议。
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
