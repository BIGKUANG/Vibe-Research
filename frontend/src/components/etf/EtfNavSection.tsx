import { LineChart } from "./LineChart";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { EtfNavData } from "@/lib/api";

interface Props {
  data: EtfNavData | null;
  loading: boolean;
  error: string | null;
  range: string;
  onRange: (r: "1y" | "3y" | "all") => void;
}

const RANGES: { key: "1y" | "3y" | "all"; label: string }[] = [
  { key: "1y", label: "1年" }, { key: "3y", label: "3年" }, { key: "all", label: "全部" },
];

export function EtfNavSection({ data, loading, error, range, onRange }: Props) {
  const items = data?.items ?? [];
  const navPts = items.map((p) => ({ x: p.date, y: p.unit_nav }));
  const closePts = items.map((p) => ({ x: p.date, y: p.close }));
  const premPts = items.map((p) => ({ x: p.date, y: p.premium_pct }));
  return (
    <GlassCard className="mb-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">净值与折溢价</h3>
        <span className="text-xs font-normal text-muted-foreground/60">tushare fund_nav + etf_share_size · T-1</span>
        <div className="ml-auto flex items-center gap-1">
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => onRange(r.key)}
              className={cn("rounded px-2 py-0.5 text-[11px] transition-colors",
                range === r.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">⚠ 净值数据获取失败（tushare · {error}）</p>
      ) : loading && items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground/60">加载中…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground/60">暂无净值数据</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">单位净值 vs 收盘价（元）</p>
            <LineChart
              series={[
                { name: "单位净值", color: "hsl(var(--primary))", points: navPts },
                { name: "收盘价", color: "#94a3b8", points: closePts, dashed: true },
              ]}
              height={200}
              formatValue={(v) => v.toFixed(3)}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">折溢价率（%）· 收盘价 ÷ 净值 − 1</p>
            <LineChart
              series={[{ name: "折溢价", color: "#fbbf24", points: premPts }]}
              height={150}
              zeroLine
              formatValue={(v) => `${v.toFixed(2)}%`}
            />
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              折溢价为收盘价与净值的客观差异，不构成高估/低估判断；净值日期以图内数据为准。
            </p>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
