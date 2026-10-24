import { Layers } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { EtfHoldingsData } from "@/lib/api";

const fmtDate = (s: string) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s || "—");
const num = (v: number | null, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

export function EtfHoldings({ data, loading, error }: { data: EtfHoldingsData | null; loading: boolean; error: string | null }) {
  if (error) {
    return (
      <GlassCard className="mb-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Layers className="h-4 w-4 text-primary" /> 前十大持仓</h3>
        <p className="py-6 text-center text-sm text-muted-foreground">⚠ 持仓数据获取失败（tushare · {error}）</p>
      </GlassCard>
    );
  }
  if (loading && !data) {
    return (
      <GlassCard className="mb-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Layers className="h-4 w-4 text-primary" /> 前十大持仓</h3>
        <p className="py-6 text-center text-sm text-muted-foreground/60">加载中…</p>
      </GlassCard>
    );
  }
  if (!data || data.items.length === 0) return null;

  return (
    <GlassCard className="mb-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Layers className="h-4 w-4 text-primary" /> 前十大持仓</h3>
        <span className="text-xs text-muted-foreground">
          报告期 {fmtDate(data.period)} · 披露 {fmtDate(data.ann_date)} · 共 {data.total_count} 只
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground/60">基金季报，存在披露滞后</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">代码</th>
              <th className="px-3 py-2 font-medium">名称</th>
              <th className="px-3 py-2 text-right font-medium">持仓市值(亿)</th>
              <th className="px-3 py-2 text-right font-medium">持股数(万股)</th>
              <th className="px-3 py-2 text-right font-medium">占股票市值比</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((h, i) => (
              <tr key={`${h.symbol}-${i}`} className="border-b border-border/30 hover:bg-muted/40">
                <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{h.symbol}</td>
                <td className="px-3 py-2">{h.name || "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{num(h.mkv_yi)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{num(h.amount_wan)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{h.ratio_pct == null ? "—" : `${h.ratio_pct.toFixed(2)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
