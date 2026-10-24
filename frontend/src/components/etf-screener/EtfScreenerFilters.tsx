import type { ReactNode } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ETF_TYPES, EXCHANGE_OPTIONS,
  type EtfConditions,
} from "@/lib/etf-screener";
import { RangeInput } from "@/components/screener/RangeInput";
import { MultiSelect } from "@/components/screener/MultiSelect";

interface Props {
  draft: EtfConditions;
  onChange: (patch: Partial<EtfConditions>) => void;
  onStart: () => void;
  onReset: () => void;
  onToggleCollapse: () => void;
  collapsed: boolean;
  activeCount: number;
  chips: string[];
  indexOptions: string[];
  managerOptions: string[];
  dirty: boolean;
  loading: boolean;
}

const SIZE_PRESETS: { label: string; min: string; max: string }[] = [
  { label: "≤10", min: "", max: "10" },
  { label: "10–50", min: "10", max: "50" },
  { label: "50–100", min: "50", max: "100" },
  { label: "100–300", min: "100", max: "300" },
  { label: "≥300", min: "300", max: "" },
];

const FEE_PRESETS: { label: string; min: string; max: string }[] = [
  { label: "≤0.15", min: "", max: "0.15" },
  { label: "0.15–0.50", min: "0.15", max: "0.50" },
  { label: "≥0.50", min: "0.50", max: "" },
];

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border/50 bg-muted/10 p-3", className)}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="h-3.5 w-[3px] rounded-full bg-primary/70" />
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className={cn("relative h-4 w-7 rounded-full transition-colors", checked ? "bg-primary/70" : "bg-muted")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", checked ? "left-3.5" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

function Chips({
  presets, value, onPick,
}: {
  presets: { label: string; min: string; max: string }[];
  value: EtfConditions["size"];
  onPick: (v: { min: string; max: string }) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {presets.map((p) => {
        const active = value.min === p.min && value.max === p.max;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onPick({ min: p.min, max: p.max })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              active
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function EtfScreenerFilters({
  draft, onChange, onStart, onReset, onToggleCollapse, collapsed,
  activeCount, chips, indexOptions, managerOptions, dirty, loading,
}: Props) {
  if (collapsed) {
    return (
      <div className="glass mb-4 flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-xs text-muted-foreground">已选条件：</span>
        {chips.length === 0 ? (
          <span className="text-xs text-muted-foreground/50">未设置条件（默认排除无报价）</span>
        ) : (
          chips.map((c) => (
            <span key={c} className="rounded-full bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">{c}</span>
          ))
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> 展开筛选
        </button>
      </div>
    );
  }

  const toggleExchange = (v: string) => {
    const has = draft.exchanges.includes(v);
    if (has && draft.exchanges.length === 1) return;
    onChange({ exchanges: has ? draft.exchanges.filter((x) => x !== v) : [...draft.exchanges, v] });
  };

  const toggleType = (v: string) => {
    const has = draft.types.includes(v);
    if (has && draft.types.length === 1) return;
    onChange({ types: has ? draft.types.filter((x) => x !== v) : [...draft.types, v] });
  };

  return (
    <div className="glass glass-glow mb-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">筛选条件</h2>
          {activeCount > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">已选 {activeCount} 项</span>}
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          收起 <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card title="交易所 / 类型">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {EXCHANGE_OPTIONS.map((e) => {
              const checked = draft.exchanges.includes(e.value);
              return (
                <label key={e.value} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleExchange(e.value)}
                    className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                  />
                  <span className={cn(checked && "text-foreground")}>{e.label}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/40 pt-2">
            {ETF_TYPES.map((t) => {
              const checked = draft.types.includes(t);
              return (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(t)}
                    className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                  />
                  <span className={cn(checked && "text-foreground")}>{t}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-2 border-t border-border/40 pt-2">
            <Toggle label="仅跨境 QDII" checked={draft.onlyQdii} onChange={(onlyQdii) => onChange({ onlyQdii })} />
          </div>
        </Card>

        <Card title="跟踪指数">
          <MultiSelect
            options={indexOptions}
            value={draft.indices}
            onChange={(indices) => onChange({ indices })}
            placeholder="全部跟踪指数"
          />
          <p className="mt-2 text-[11px] text-muted-foreground/60">货币 ETF 等无跟踪指数，归入「无跟踪指数」。</p>
        </Card>

        <Card title="管理人">
          <MultiSelect
            options={managerOptions}
            value={draft.managers}
            onChange={(managers) => onChange({ managers })}
            placeholder="全部管理人"
          />
        </Card>

        <Card title="规模（T-1，亿元）">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">总规模</span>
            <RangeInput value={draft.size} onChange={(size) => onChange({ size })} suffix="亿" />
          </div>
          <Chips presets={SIZE_PRESETS} value={draft.size} onPick={(size) => onChange({ size })} />
        </Card>

        <Card title="管理费率（%/年）">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">费率</span>
            <RangeInput value={draft.fee} onChange={(fee) => onChange({ fee })} suffix="%" />
          </div>
          <Chips presets={FEE_PRESETS} value={draft.fee} onPick={(fee) => onChange({ fee })} />
        </Card>

        <Card title="行情（同一交易日 T-1）" className="md:col-span-1 xl:col-span-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">涨跌幅%</span>
              <RangeInput value={draft.change} onChange={(change) => onChange({ change })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">成交额(亿)</span>
              <RangeInput value={draft.amount} onChange={(amount) => onChange({ amount })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">换手率%</span>
              <RangeInput value={draft.turnover} onChange={(turnover) => onChange({ turnover })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">折溢价%</span>
              <RangeInput value={draft.premium} onChange={(premium) => onChange({ premium })} />
            </div>
          </div>
          <div className="mt-2 border-t border-border/40 pt-2">
            <Toggle
              label="排除无报价 / 无成交"
              checked={draft.excludeNoQuote}
              onChange={(excludeNoQuote) => onChange({ excludeNoQuote })}
            />
          </div>
        </Card>
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 px-4 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> 重置
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={loading}
          className={cn(
            "inline-flex h-9 items-center rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-50",
            dirty ? "bg-primary/20 text-primary shadow-glow hover:bg-primary/30" : "bg-primary/10 text-primary/80 hover:bg-primary/20",
          )}
        >
          {loading ? "筛选中…" : "开始筛选"}
        </button>
      </div>
    </div>
  );
}
