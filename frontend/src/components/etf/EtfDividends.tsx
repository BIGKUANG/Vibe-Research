import { Gift } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { EtfDividendsData } from "@/lib/api";

const fmtDate = (s: string) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s || "—");

export function EtfDividends({ data, loading, error }: { data: EtfDividendsData | null; loading: boolean; error: string | null }) {
  if (error) {
    return (
      <GlassCard className="mb-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Gift className="h-4 w-4 text-primary" /> 分红记录</h3>
        <p className="py-6 text-center text-sm text-muted-foreground">⚠ 分红数据获取失败（tushare · {error}）</p>
      </GlassCard>
    );
  }
  if (loading && !data) {
    return (
      <GlassCard className="mb-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Gift className="h-4 w-4 text-primary" /> 分红记录</h3>
        <p className="py-6 text-center text-sm text-muted-foreground/60">加载中…</p>
      </GlassCard>
    );
  }
  if (!data || data.items.length === 0) return null;

  return (
    <GlassCard className="mb-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <Gift className="h-4 w-4 text-primary" /> 分红记录
        <span className="text-xs font-normal text-muted-foreground/60">tushare fund_div · 最近 {data.items.length} 条</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">除息日</th>
              <th className="px-3 py-2 text-right font-medium">每份分红(元)</th>
              <th className="px-3 py-2 font-medium">权益登记日</th>
              <th className="px-3 py-2 font-medium">派息日</th>
              <th className="px-3 py-2 font-medium">方案进度</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((d, i) => (
              <tr key={`${d.ex_date}-${i}`} className="border-b border-border/30 hover:bg-muted/40">
                <td className="px-3 py-2 font-mono text-xs">{fmtDate(d.ex_date)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{d.div_cash == null ? "—" : d.div_cash.toFixed(3)}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{fmtDate(d.record_date)}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{fmtDate(d.pay_date)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{d.div_proc || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
