import { BadgeCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { EtfNavPoint, EtfProfile, EtfSizePoint, Quote } from "@/lib/api";

interface Props {
  profile: EtfProfile;
  quote: Quote | null;
  size: EtfSizePoint | null;
  nav: EtfNavPoint | null;
  quoteError?: string | null;
}

const fmt = (v: number | null | undefined, digits = 2, suffix = "") =>
  v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(digits)}${suffix}`;
const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
const pctColor = (v: number | null | undefined) =>
  v == null ? "text-muted-foreground" : v > 0 ? "text-danger" : v < 0 ? "text-success" : "text-muted-foreground";

export function EtfOverview({ profile, quote, size, nav, quoteError }: Props) {
  const metrics = [
    { k: "最新价", v: fmt(quote?.price, 3), cls: "" },
    { k: "涨跌幅", v: pct(quote?.change_pct), cls: pctColor(quote?.change_pct) },
    { k: "成交额", v: quote?.amount_wan != null ? `${(quote.amount_wan / 1e4).toFixed(2)} 亿` : "—", cls: "" },
    { k: "换手率", v: fmt(quote?.turnover_pct, 2, "%"), cls: "" },
    { k: "基金规模(T-1)", v: fmt(size?.size_yi, 2, " 亿"), cls: "" },
    { k: "总份额(T-1)", v: fmt(size?.share_yi, 2, " 亿份"), cls: "" },
    { k: "折溢价(T-1)", v: pct(nav?.premium_pct), cls: pctColor(nav?.premium_pct) },
    { k: "管理费率", v: fmt(profile.mgt_fee, 2, "%"), cls: "" },
  ];
  return (
    <GlassCard className="glass-glow mb-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{profile.name || profile.code}</h2>
            <span className="font-mono text-sm text-muted-foreground">{profile.code}</span>
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">ETF</span>
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {profile.exchange === "SH" ? "沪市" : profile.exchange === "SZ" ? "深市" : profile.exchange || "—"}
            </span>
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{profile.fund_type}</span>
            {profile.is_qdii && <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">跨境</span>}
            {profile.list_status === "D" && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">已退市</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            跟踪 {profile.index_name || "未获取"}
            {profile.index_code && <span className="ml-1 font-mono text-muted-foreground/60">{profile.index_code}</span>}
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            {profile.mgr_name || "管理人未获取"}
          </p>
        </div>
        {profile.as_of && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
            <BadgeCheck className="h-3 w-3" /> 档案 {profile.source === "local" ? "本地快照" : "tushare"}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.k} className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{m.k}</p>
            <p className={cn("mt-0.5 font-mono text-base font-bold", m.cls)}>{m.v}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
        <span>今开 <b className="text-foreground">{fmt(quote?.open, 3)}</b></span>
        <span>最高 <b className="text-danger">{fmt(quote?.high, 3)}</b></span>
        <span>最低 <b className="text-success">{fmt(quote?.low, 3)}</b></span>
        <span>昨收 <b className="text-foreground">{fmt(quote?.last_close, 3)}</b></span>
        <span>振幅 <b className="text-foreground">{fmt(quote?.amplitude_pct, 2, "%")}</b></span>
        {quoteError && <span className="text-warning">行情获取失败：{quoteError}</span>}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground/60">
        行情 {quote?.ts ? `${quote.ts.slice(8, 10)}:${quote.ts.slice(10, 12)}:${quote.ts.slice(12, 14)}` : "—"}
        <span className="mx-1.5">·</span>规模 {size?.date || "—"}
        <span className="mx-1.5">·</span>净值 {nav?.date || "—"}
        <span className="ml-2 text-muted-foreground/40">规模/净值为 T-1 日终口径</span>
      </p>
    </GlassCard>
  );
}
