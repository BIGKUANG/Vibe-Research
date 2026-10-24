import type { ReactNode } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INDEX_MARKETS, MARKET_LABEL,
  type IndexConditions,
} from "@/lib/index-screener";
import { RangeInput } from "@/components/screener/RangeInput";
import { MultiSelect } from "@/components/screener/MultiSelect";

interface Props {
  draft: IndexConditions;
  onChange: (patch: Partial<IndexConditions>) => void;
  onStart: () => void;
  onReset: () => void;
  onToggleCollapse: () => void;
  collapsed: boolean;
  activeCount: number;
  chips: string[];
  categoryOptions: string[];
  publisherOptions: string[];
  marketCounts: Record<string, number>;
  dirty: boolean;
  loading: boolean;
}

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
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
      <span className={cn("relative h-4 w-7 rounded-full transition-colors", checked ? "bg-primary/70" : "bg-muted")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", checked ? "left-3.5" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

const dateStr = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const YEARS_AGO = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return dateStr(d);
};
const TODAY = dateStr(new Date());

export function IndexScreenerFilters({
  draft, onChange, onStart, onReset, onToggleCollapse, collapsed,
  activeCount, chips, categoryOptions, publisherOptions,
  marketCounts, dirty, loading,
}: Props) {
  if (collapsed) {
    return (
      <div className="glass mb-4 flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-xs text-muted-foreground">已选条件：</span>
        {chips.length === 0 ? (
          <span className="text-xs text-muted-foreground/50">未设置条件</span>
        ) : (
          chips.map((c) => <span key={c} className="rounded-full bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">{c}</span>)
        )}
        <button type="button" onClick={onToggleCollapse} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" /> 展开筛选
        </button>
      </div>
    );
  }

  const toggleMarket = (m: string) => {
    const has = draft.markets.includes(m);
    const next = has ? draft.markets.filter((x) => x !== m) : [...draft.markets, m];
    onChange({ markets: next.length ? next : [...INDEX_MARKETS] });
  };
  const toggleCategory = (c: string) => {
    onChange({ categories: draft.categories.includes(c) ? draft.categories.filter((x) => x !== c) : [...draft.categories, c] });
  };
  const toggleStatus = (s: string) => {
    const has = draft.statuses.includes(s);
    const next = has ? draft.statuses.filter((x) => x !== s) : [...draft.statuses, s];
    onChange({ statuses: next.length ? next : ["存续", "终止"] });
  };

  return (
    <div className="glass glass-glow mb-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">筛选条件</h2>
          {activeCount > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">已选 {activeCount} 项</span>}
        </div>
        <button type="button" onClick={onToggleCollapse} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          收起 <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card title="市场 / 类别">
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {INDEX_MARKETS.map((m) => {
              const checked = draft.markets.includes(m);
              return (
                <label key={m} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <input type="checkbox" checked={checked} onChange={() => toggleMarket(m)} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />
                  <span className={cn(checked && "text-foreground")}>{MARKET_LABEL[m]}</span>
                  {marketCounts[m] != null && <span className="text-muted-foreground/50">{marketCounts[m]}</span>}
                </label>
              );
            })}
          </div>
          <div className="mt-2 max-h-28 overflow-auto border-t border-border/40 pt-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {categoryOptions.map((c) => {
                const checked = draft.categories.includes(c);
                return (
                  <label key={c} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <input type="checkbox" checked={checked} onChange={() => toggleCategory(c)} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />
                    <span className={cn("truncate", checked && "text-foreground")}>{c}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </Card>

        <Card title="发布方">
          <MultiSelect options={publisherOptions} value={draft.publishers} onChange={(publishers) => onChange({ publishers })} placeholder="全部发布方" />
          <p className="mt-2 text-[11px] text-muted-foreground/60">当前数据源的指数风格字段为空，暂不提供「指数类型」筛选。</p>
        </Card>

        <Card title="发布日期">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">上市/发布日</span>
            <RangeInput value={draft.listDate} onChange={(listDate) => onChange({ listDate })} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { label: "近1年", min: YEARS_AGO(1), max: TODAY },
              { label: "近3年", min: YEARS_AGO(3), max: TODAY },
              { label: "2020后", min: "20200101", max: TODAY },
            ].map((p) => (
              <button key={p.label} type="button" onClick={() => onChange({ listDate: { min: p.min, max: p.max } })}
                className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors",
                  draft.listDate.min === p.min && draft.listDate.max === p.max
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/60">格式 YYYYMMDD；空 = 不限。</p>
        </Card>

        <Card title="ETF 跟踪">
          <Toggle label="仅看有 ETF 跟踪" checked={draft.onlyEtf} onChange={(onlyEtf) => onChange({ onlyEtf })} />
          <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">跟踪 ETF 数</span>
              <RangeInput value={draft.etfCount} onChange={(etfCount) => onChange({ etfCount })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">合计规模(亿)</span>
              <RangeInput value={draft.etfSize} onChange={(etfSize) => onChange({ etfSize })} />
            </div>
          </div>
        </Card>

        <Card title="行情 / 搜索" className="md:col-span-1 xl:col-span-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">名称/代码</span>
              <input value={draft.query} onChange={(e) => onChange({ query: e.target.value.replace(/[^\w\u4e00-\u9fa5.\-]/g, "") })} placeholder="如 沪深300 / 000300"
                className="h-8 w-full max-w-[190px] rounded-md border border-border bg-black/20 px-2 text-xs outline-none focus:border-primary/50 placeholder:text-muted-foreground/40" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">涨跌幅%</span>
              <RangeInput value={draft.change} onChange={(change) => onChange({ change })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">状态</span>
              <div className="flex items-center gap-3">
                {["存续", "终止"].map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={draft.statuses.includes(s)} onChange={() => toggleStatus(s)} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">行情</span>
              <Toggle label="仅有行情" checked={draft.onlyQuote} onChange={(onlyQuote) => onChange({ onlyQuote })} />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        <button type="button" onClick={onReset} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 px-4 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> 重置
        </button>
        <button type="button" onClick={onStart} disabled={loading}
          className={cn("inline-flex h-9 items-center rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-50",
            dirty ? "bg-primary/20 text-primary shadow-glow hover:bg-primary/30" : "bg-primary/10 text-primary/80 hover:bg-primary/20")}>
          {loading ? "筛选中…" : "开始筛选"}
        </button>
      </div>
    </div>
  );
}
