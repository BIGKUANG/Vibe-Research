import type { ReactNode } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BOARD_OPTIONS,
  type ScreenerConditions,
} from "@/lib/screener";
import { RangeInput } from "./RangeInput";
import { MultiSelect } from "./MultiSelect";

interface Props {
  draft: ScreenerConditions;
  onChange: (patch: Partial<ScreenerConditions>) => void;
  onStart: () => void;
  onReset: () => void;
  onToggleCollapse: () => void;
  collapsed: boolean;
  activeCount: number;
  chips: string[];
  industryOptions: string[];
  boardCounts: Record<string, number>;
  dirty: boolean;
  loading: boolean;
  finPeriod: string | null;
  finAsOf: string | null;
  finPartial: boolean;
  finLoading: boolean;
  finError: string | null;
}

// 市值快捷档位（亿元）。末档无上限。
const MCAP_PRESETS: { label: string; min: string; max: string }[] = [
  { label: "≤50", min: "", max: "50" },
  { label: "50–100", min: "50", max: "100" },
  { label: "100–300", min: "100", max: "300" },
  { label: "300–1000", min: "300", max: "1000" },
  { label: "≥1000", min: "1000", max: "" },
];

type FinKey = "revenueYoy" | "profitYoy" | "roe" | "grossMargin";

const FIN_METRICS: { key: FinKey; label: string; presets: { label: string; min: string; max: string }[] }[] = [
  { key: "revenueYoy", label: "营收同比%", presets: [
    { label: "≥20", min: "20", max: "" }, { label: "≥0", min: "0", max: "" }, { label: "↓20", min: "", max: "-20" },
  ] },
  { key: "profitYoy", label: "净利同比%", presets: [
    { label: "≥20", min: "20", max: "" }, { label: "≥0", min: "0", max: "" }, { label: "↓20", min: "", max: "-20" },
  ] },
  { key: "roe", label: "ROE(%)", presets: [
    { label: "≥15", min: "15", max: "" }, { label: "≥8", min: "8", max: "" }, { label: "≥0", min: "0", max: "" },
  ] },
  { key: "grossMargin", label: "毛利率(%)", presets: [
    { label: "≥40", min: "40", max: "" }, { label: "≥20", min: "20", max: "" }, { label: "≥0", min: "0", max: "" },
  ] },
];

/** 报告期 YYYYMMDD → 2026Q3。 */
function periodLabel(period: string | null): string {
  if (!period || period.length !== 8) return "报告期未获取";
  const y = period.slice(0, 4);
  const q = period.slice(4, 6) === "03" ? 1 : period.slice(4, 6) === "06" ? 2 : period.slice(4, 6) === "09" ? 3 : 4;
  return `${y}Q${q}`;
}

function finTime(asOf: string | null): string {
  if (!asOf) return "";
  // 后端格式 +0800：补成 +08:00，避免部分浏览器解析失败。
  const d = new Date(asOf.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function Card({ title, children, className, extra }: {
  title: string;
  children: ReactNode;
  className?: string;
  extra?: ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-border/50 bg-muted/10 p-3", className)}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="h-3.5 w-[3px] rounded-full bg-primary/70" />
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {extra && <div className="ml-auto flex items-center gap-1.5">{extra}</div>}
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

export function ScreenerFilters({
  draft,
  onChange,
  onStart,
  onReset,
  onToggleCollapse,
  collapsed,
  activeCount,
  chips,
  industryOptions,
  boardCounts,
  dirty,
  loading,
  finPeriod,
  finAsOf,
  finPartial,
  finLoading,
  finError,
}: Props) {
  if (collapsed) {
    return (
      <div className="glass mb-4 flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-xs text-muted-foreground">已选条件：</span>
        {chips.length === 0 ? (
          <span className="text-xs text-muted-foreground/50">未设置条件（默认排除 ST / 停牌）</span>
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

  const toggleBoard = (b: string) => {
    const boards = draft.boards.includes(b) ? draft.boards.filter((x) => x !== b) : [...draft.boards, b];
    onChange({ boards });
  };

  const finDisabled = finLoading || !finPeriod;

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
        <Card title="市场板块">
          <div className="space-y-1.5">
            {BOARD_OPTIONS.map((b) => {
              const checked = draft.boards.includes(b);
              return (
                <label key={b} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBoard(b)}
                    className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                  />
                  <span className={cn(checked && "text-foreground")}>{b}</span>
                  {boardCounts[b] != null && <span className="ml-auto text-muted-foreground/50">{boardCounts[b]}</span>}
                </label>
              );
            })}
          </div>
        </Card>

        <Card title="行业">
          <MultiSelect options={industryOptions} value={draft.industries} onChange={(industries) => onChange({ industries })} placeholder="全部行业" />
          <div className="mt-2 border-t border-border/40 pt-2">
            <Toggle label="排除 ST / 退市" checked={draft.excludeSt} onChange={(excludeSt) => onChange({ excludeSt })} />
            <div className="mt-2">
              <Toggle label="排除停牌 / 僵尸报价" checked={draft.excludeStale} onChange={(excludeStale) => onChange({ excludeStale })} />
            </div>
          </div>
        </Card>

        <Card title="估值">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">PE(TTM)</span>
              <RangeInput value={draft.pe} onChange={(pe) => onChange({ pe })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">PB</span>
              <RangeInput value={draft.pb} onChange={(pb) => onChange({ pb })} />
            </div>
            <Toggle label="仅正 PE" checked={draft.onlyPositivePe} onChange={(onlyPositivePe) => onChange({ onlyPositivePe })} />
          </div>
        </Card>

        <Card title="市值范围（总市值）">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">总市值</span>
            <RangeInput value={draft.mcap} onChange={(mcap) => onChange({ mcap })} suffix="亿" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MCAP_PRESETS.map((p) => {
              const active = draft.mcap.min === p.min && draft.mcap.max === p.max;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChange({ mcap: { min: p.min, max: p.max } })}
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
        </Card>

        <Card
          title="财报"
          className="md:col-span-2 xl:col-span-4"
          extra={(
            <>
              <span className={cn(
                "rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]",
                finPeriod ? "text-muted-foreground" : "text-warning",
              )}>
                {periodLabel(finPeriod)}
              </span>
              {finPeriod && <span className="text-[11px] text-muted-foreground/60">累计口径</span>}
              {finPartial && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">部分披露</span>}
              {finError && <span className="text-[11px] text-warning" title={finError}>财报数据未获取</span>}
            </>
          )}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {FIN_METRICS.map(({ key, label, presets }) => (
              <div key={key}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <RangeInput
                    value={draft[key]}
                    onChange={(v) => onChange({ [key]: v } as Partial<ScreenerConditions>)}
                    disabled={finDisabled}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {presets.map((p) => {
                    const active = draft[key].min === p.min && draft[key].max === p.max;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        disabled={finDisabled}
                        onClick={() => {
                          const next = draft[key].min === p.min && draft[key].max === p.max
                            ? { min: "", max: "" }
                            : { min: p.min, max: p.max };
                          onChange({ [key]: next } as Partial<ScreenerConditions>);
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          active
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          finDisabled && "cursor-not-allowed opacity-50 hover:border-border/60 hover:text-muted-foreground",
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
            <Toggle label="仅显示已披露财报" checked={draft.onlyDisclosed} onChange={(onlyDisclosed) => onChange({ onlyDisclosed })} />
            <span className="text-[11px] text-muted-foreground/60">
              {finLoading ? "财报数据加载中…" : finAsOf ? `数据 ${finTime(finAsOf)} 更新` : ""}
            </span>
          </div>
        </Card>

        <Card title="行情" className="md:col-span-2 xl:col-span-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">涨跌幅%</span>
              <RangeInput value={draft.change} onChange={(change) => onChange({ change })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">换手率%</span>
              <RangeInput value={draft.turnover} onChange={(turnover) => onChange({ turnover })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">量比</span>
              <RangeInput value={draft.volRatio} onChange={(volRatio) => onChange({ volRatio })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">成交额(万)</span>
              <RangeInput value={draft.amount} onChange={(amount) => onChange({ amount })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">振幅%</span>
              <RangeInput value={draft.amplitude} onChange={(amplitude) => onChange({ amplitude })} />
            </div>
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
