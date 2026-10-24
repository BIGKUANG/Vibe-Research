import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { Pager } from "@/components/ui/Pager";
import { IndexScreenerFilters } from "@/components/index-screener/IndexScreenerFilters";
import { IndexScreenerToolbar } from "@/components/index-screener/IndexScreenerToolbar";
import { IndexScreenerTable } from "@/components/index-screener/IndexScreenerTable";
import { api, ApiError, type IndexScreenerSnapshot } from "@/lib/api";
import { storageGet, storageSet } from "@/lib/storage";
import {
  INDEX_COLUMNS,
  decodeIndexSnapshot, defaultIndexConditions, filterIndexRows, indexActiveCount,
  indexConditionChips, indexOptions, indexToCsv, normalizeIndexConditions,
  sortIndexRows,
  type IndexColumnKey, type IndexConditions, type IndexRow, type SortDir,
} from "@/lib/index-screener";

const COND_KEY = "vr-index-screener-conditions-v1";
const COLLAPSE_KEY = "vr-index-screener-collapsed";
const COLS_KEY = "vr-index-screener-columns";
const PAGE_SIZES = [50, 100, 200];

function loadConditions(): IndexConditions {
  const raw = storageGet(COND_KEY);
  if (!raw) return defaultIndexConditions();
  try {
    return normalizeIndexConditions(JSON.parse(raw) as Partial<IndexConditions>);
  } catch {
    return defaultIndexConditions();
  }
}

function loadHiddenCols(): Set<IndexColumnKey> {
  const raw = storageGet(COLS_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw) as IndexColumnKey[];
      if (Array.isArray(arr)) return new Set(arr);
    } catch { /* 回退默认 */ }
  }
  return new Set(INDEX_COLUMNS.filter((c) => c.hidden).map((c) => c.key));
}

function saveBlob(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function IndexScreener() {
  const [snapshot, setSnapshot] = useState<IndexScreenerSnapshot | null>(null);
  const [rows, setRows] = useState<IndexRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<IndexConditions>(loadConditions);
  const [applied, setApplied] = useState<IndexConditions>(loadConditions);
  const [collapsed, setCollapsed] = useState(() => storageGet(COLLAPSE_KEY) === "1");
  const [hidden, setHidden] = useState<Set<IndexColumnKey>>(loadHiddenCols);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [sortKey, setSortKey] = useState<IndexColumnKey>("etf_size_yi");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const resultsRef = useRef<HTMLDivElement>(null);

  const fetchSnapshot = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const snap = await api.indexScreenerSnapshot(refresh);
      setSnapshot(snap);
      setRows(decodeIndexSnapshot(snap));
      setPage(1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "指数快照加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchSnapshot(); }, [fetchSnapshot]);

  const categoryOptions = useMemo(() => indexOptions(rows, "category"), [rows]);
  const publisherOptions = useMemo(() => indexOptions(rows, "publisher"), [rows]);
  const marketCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.market] = (c[r.market] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => filterIndexRows(rows, applied), [rows, applied]);
  const sorted = useMemo(() => sortIndexRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  const visibleColumns = useMemo(() => INDEX_COLUMNS.filter((c) => !hidden.has(c.key)), [hidden]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(applied), [draft, applied]);
  const activeCount = useMemo(() => indexActiveCount(draft), [draft]);
  const chips = useMemo(() => indexConditionChips(collapsed ? applied : draft), [collapsed, applied, draft]);

  const patchDraft = useCallback((patch: Partial<IndexConditions>) => setDraft((d) => ({ ...d, ...patch })), []);

  const onStart = useCallback(() => {
    setApplied(draft);
    storageSet(COND_KEY, JSON.stringify(draft));
    setPage(1);
    window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [draft]);

  const onReset = useCallback(() => {
    const base = defaultIndexConditions();
    setDraft(base);
    setApplied(base);
    storageSet(COND_KEY, JSON.stringify(base));
    setPage(1);
  }, []);

  const onToggleCollapse = useCallback(() => {
    setCollapsed((v) => {
      storageSet(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  }, []);

  const onSort = useCallback((key: IndexColumnKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "market" || key === "category" || key === "publisher" || key === "status" ? "asc" : "desc");
    }
  }, [sortKey]);

  const onToggleColumn = useCallback((key: IndexColumnKey) => {
    if (key === "name") return;
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      storageSet(COLS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const onExport = useCallback(() => {
    if (sorted.length === 0) { toast.info("当前结果为空，无可导出"); return; }
    saveBlob(indexToCsv(sorted, visibleColumns.map((c) => c.key)), `index-screener-${snapshot?.quote_date ?? "export"}.csv`);
  }, [sorted, visibleColumns, snapshot]);

  const noToken = error?.includes("TUSHARE_TOKEN") ?? false;

  return (
    <div>
      <PageHeader
        title="指数筛选"
        subtitle="国内指数全量目录 · 行情 · ETF 跟踪 · 数据仅作客观呈现，不构成投资建议"
      />

      <IndexScreenerFilters
        draft={draft}
        onChange={patchDraft}
        onStart={onStart}
        onReset={onReset}
        onToggleCollapse={onToggleCollapse}
        collapsed={collapsed}
        activeCount={activeCount}
        chips={chips}
        categoryOptions={categoryOptions}
        publisherOptions={publisherOptions}
        marketCounts={marketCounts}
        dirty={dirty}
        loading={false}
      />

      <div ref={resultsRef} className="scroll-mt-4">
        <GlassCard className="overflow-hidden p-0">
          <IndexScreenerToolbar
            count={sorted.length}
            quoteDate={snapshot?.quote_date ?? null}
            etfSizeDate={snapshot?.etf_size_date ?? null}
            noQuote={snapshot?.no_quote ?? 0}
            etfSizeMissing={snapshot?.etf_size_missing ?? 0}
            asOf={snapshot?.as_of ?? null}
            stale={Boolean(snapshot?.stale)}
            refreshing={refreshing}
            columns={INDEX_COLUMNS}
            hidden={hidden}
            onToggleColumn={onToggleColumn}
            onExport={onExport}
            onRefresh={() => void fetchSnapshot(true)}
          />

          {error ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <p className="max-w-xl text-sm text-muted-foreground">{error}</p>
              {noToken && (
                <p className="max-w-xl text-xs text-muted-foreground/70">
                  在项目根目录 <code className="font-mono text-foreground">.env</code> 配置{" "}
                  <code className="font-mono text-foreground">TUSHARE_TOKEN</code> 后重启后端。
                </p>
              )}
              <button type="button" onClick={() => void fetchSnapshot()}
                className="mt-1 rounded-lg bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/25">
                重试
              </button>
            </div>
          ) : loading ? (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground/70">
              正在加载指数目录与行情（首次约 20–40 秒，之后走缓存）…
            </div>
          ) : (
            <>
              <IndexScreenerTable
                rows={pageRows}
                columns={visibleColumns}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                emptyHint="没有符合条件的指数，试试放宽市场/类别/ETF 条件。"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>共 {sorted.length.toLocaleString("zh-CN")} 条</span>
                  <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="h-7 rounded-md border border-border bg-black/20 px-2 text-xs outline-none focus:border-primary/50">
                    {PAGE_SIZES.map((s) => <option key={s} value={s} className="bg-card">每页 {s}</option>)}
                  </select>
                </div>
                <Pager page={safePage} totalPages={totalPages} onPage={setPage} />
              </div>
            </>
          )}
        </GlassCard>
      </div>

      <Disclaimer />
    </div>
  );
}
