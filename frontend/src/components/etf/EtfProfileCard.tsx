import { Building2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { EtfProfile } from "@/lib/api";

const fmtDate = (s: string) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s || "—");

export function EtfProfileCard({ profile }: { profile: EtfProfile }) {
  const fields: { k: string; v: string }[] = [
    { k: "基金全称", v: profile.full_name || "—" },
    { k: "跟踪指数", v: profile.index_name ? `${profile.index_name}${profile.index_code ? `（${profile.index_code}）` : ""}` : "—" },
    { k: "基金类型", v: profile.fund_type || "—" },
    { k: "投资通道", v: profile.etf_type || "—" },
    { k: "管理人", v: profile.mgr_name || "—" },
    { k: "托管人", v: profile.custodian || "—" },
    { k: "成立日期", v: fmtDate(profile.setup_date) },
    { k: "上市日期", v: fmtDate(profile.list_date) },
    { k: "管理费率", v: profile.mgt_fee == null ? "—" : `${profile.mgt_fee.toFixed(2)} %/年` },
    { k: "交易所", v: profile.exchange === "SH" ? "上海证券交易所" : profile.exchange === "SZ" ? "深圳证券交易所" : profile.exchange || "—" },
    { k: "基金代码", v: profile.ts_code || profile.code },
    { k: "存续状态", v: profile.list_status === "L" ? "上市" : profile.list_status === "D" ? "已退市" : profile.list_status || "—" },
  ];
  return (
    <GlassCard className="mb-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <Building2 className="h-4 w-4 text-primary" /> 基本档案
        <span className="text-xs font-normal text-muted-foreground/60">
          {profile.source === "local" ? "本地快照" : "tushare etf_basic"}
        </span>
      </h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {fields.map((f) => (
          <div key={f.k} className="rounded-lg bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{f.k}</p>
            <p className={cn("mt-0.5 text-sm font-medium", f.k === "基金全称" && "text-xs leading-relaxed")}>{f.v}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
