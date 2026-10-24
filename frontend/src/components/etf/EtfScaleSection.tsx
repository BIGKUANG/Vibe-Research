import { LineChart } from "./LineChart";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { EtfSizeData } from "@/lib/api";

interface Props {
  data: EtfSizeData | null;
  loading: boolean;
  error: string | null;
  range: string;
  onRange: (r: "1y" | "3y" | "all") => void;
}

const RANGES: { key: "1y" | "3y" | "all"; label: string }[] = [
  { key: "1y", label: "1年" }, { key: "3y", label: "3年" }, { key: "all", label: "全部" },
];

export function EtfScaleSection({ data, loading, error, range, onRange }: Props) {
  const items = data?.items ?? [];
  const sizePts = items.map((p) => ({ x: p.date, y: p.size_yi }));
  const sharePts = items.map((p) => ({ x: p.date, y: p.share_yi }));
  return (
    <GlassCard className="mb-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">规模与份额趋势</h3>
        <span className="text-xs font-normal text-muted-foreground/60">tushare · T-1 · 规模亿元 / 份额亿份</span>
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
        <p className="py-8 text-center text-sm text-muted-foreground">⚠ 规模数据获取失败（tushare · {error}）</p>
      ) : loading && items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground/60">加载中…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground/60">暂无规模数据</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">总规模（亿元）</p>
            <LineChart series={[{ name: "总规模", color: "hsl(var(--primary))", points: sizePts }]} height={180} formatValue={(v) => v.toFixed(1)} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">总份额（亿份）</p>
            <LineChart series={[{ name: "总份额", color: "#60a5fa", points: sharePts }]} height={160} formatValue={(v) => v.toFixed(1)} />
          </div>
        </div>
      )}
    </GlassCard>
  );
}
