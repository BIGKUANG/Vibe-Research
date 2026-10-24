import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { Pager } from "@/components/ui/Pager";
import { EtfScreenerFilters } from "@/components/etf-screener/EtfScreenerFilters";
import { EtfScreenerToolbar } from "@/components/etf-screener/EtfScreenerToolbar";
import { EtfScreenerTable } from "@/components/etf-screener/EtfScreenerTable";
import { api, ApiError, type EtfScreenerSnapshot } from "@/lib/api";
import { loadWatch, saveWatch, addCodes } from "@/lib/watchlist";
import { storageGet, storageSet } from "@/lib/storage";
import {
  ETF_COLUMNS,
  decodeEtfSnapshot, defaultEtfConditions, etfActiveConditionCount, etfConditionChips,
  etfOptions, etfToCsv, filterEtfRows, normalizeEtfConditions, sortEtfRows,
  type EtfColumnKey, type EtfConditions, type EtfScreenerRow, type SortDir,
} from "@/lib/etf-screener";

const COND_KEY = "vr-etf-screener-conditions-v1";
const COLLAPSE_KEY = "vr-etf-screener-collapsed";
const COLS_KEY = "vr-etf-screener-columns";
const PAGE_SIZES = [50, 100, 200];

function loadConditions(): EtfConditions {
  const raw = storageGet(COND_KEY);
  if (!raw) return defaultEtfConditions();
  try {
    return normalizeEtfConditions(JSON.parse(raw) as Partial<EtfConditions>);
  } catch {
    return defaultEtfConditions();
  }
}

function loadHiddenCols(): Set<EtfColumnKey> {
  const raw = storageGet(COLS_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw) as EtfColumnKey[];
      if (Array.isArray(arr)) return new Set(arr);
    } catch { /* 回退默认 */ }
  }
  return new Set(ETF_COLUMNS.filter((c) => c.hidden).map((c) => c.key));
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

export function EtfScreener() {
  const [snapshot, setSnapshot] = useState<EtfScreenerSnapshot | null>(null);
  const [rows, setRows] = useState<EtfScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<EtfConditions>(loadConditions);
  const [applied, setApplied] = useState<EtfConditions>(loadConditions);
  const [collapsed, setCollapsed] = useState(() => storageGet(COLLAPSE_KEY) === "1");
  const [hidden, setHidden] = useState<Set<EtfColumnKey>>(loadHiddenCols);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [sortKey, setSortKey] = useState<EtfColumnKey>("size_yi");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [watchCodes, setWatchCodes] = useState<Set<string>>(new Set());
  const resultsRef = useRef<HTMLDivElement>(null);

  const fetchSnapshot = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const snap = await api.etfScreenerSnapshot(refresh);
      setSnapshot(snap);
      setRows(decodeEtfSnapshot(snap));
      setPage(1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ETF 快照加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchSnapshot(); }, [fetchSnapshot]);
  useEffect(() => {
    loadWatch().then((cs) => setWatchCodes(new Set(cs))).catch(() => { /* 忽略：本地兜底 */ });
  }, []);

  const indexOptions = useMemo(() => etfOptions(rows, "index_name"), [rows]);
  const managerOptions = useMemo(() => etfOptions(rows, "mgr_name"), [rows]);

  const filtered = useMemo(() => filterEtfRows(rows, applied), [rows, applied]);
  const sorted = useMemo(() => sortEtfRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  const visibleColumns = useMemo(() => ETF_COLUMNS.filter((c) => !hidden.has(c.key)), [hidden]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(applied), [draft, applied]);
  const activeCount = useMemo(() => etfActiveConditionCount(draft), [draft]);
  const chips = useMemo(() => etfConditionChips(collapsed ? applied : draft), [collapsed, applied, draft]);

  const patchDraft = useCallback((patch: Partial<EtfConditions>) => setDraft((d) => ({ ...d, ...patch })), []);

  const onStart = useCallback(() => {
    setApplied(draft);
    storageSet(COND_KEY, JSON.stringify(draft));
    setPage(1);
    window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [draft]);

  const onReset = useCallback(() => {
    const base = defaultEtfConditions();
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

  const onSort = useCallback((key: EtfColumnKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "index_name" || key === "mgr_name" || key === "fund_type" || key === "list_date" ? "asc" : "desc");
    }
  }, [sortKey]);

  const onToggleColumn = useCallback((key: EtfColumnKey) => {
    if (key === "name") return;
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      storageSet(COLS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const onAddWatch = useCallback(async (code: string) => {
    try {
      const existing = await loadWatch();
      const { next, added } = addCodes(existing, code);
      await saveWatch(next);
      setWatchCodes(new Set(next));
      if (added > 0) toast.success("已加入自选");
      else toast.info("该代码已在自选");
    } catch {
      toast.error("加入自选失败");
    }
  }, []);

  const onExport = useCallback(() => {
    if (sorted.length === 0) { toast.info("当前结果为空，无可导出"); return; }
    saveBlob(
      etfToCsv(sorted, visibleColumns.map((c) => c.key)),
      `etf-screener-${snapshot?.trade_date ?? "export"}.csv`,
    );
  }, [sorted, visibleColumns, snapshot]);

  const noToken = error?.includes("TUSHARE_TOKEN") ?? false;

  return (
    <div>
      <PageHeader
        title="ETF 筛选"
        subtitle="场内 ETF 条件过滤 · 盘后日频（T-1）· 数据仅作客观呈现，不构成投资建议"
      />

      <EtfScreenerFilters
        draft={draft}
        onChange={patchDraft}
        onStart={onStart}
        onReset={onReset}
        onToggleCollapse={onToggleCollapse}
        collapsed={collapsed}
        activeCount={activeCount}
        chips={chips}
        indexOptions={indexOptions}
        managerOptions={managerOptions}
        dirty={dirty}
        loading={false}
      />

      <div ref={resultsRef} className="scroll-mt-4">
        <GlassCard className="overflow-hidden p-0">
          <EtfScreenerToolbar
            count={sorted.length}
            tradeDate={snapshot?.trade_date ?? null}
            asOf={snapshot?.as_of ?? null}
            sizeMissing={snapshot?.size_missing ?? 0}
            stale={Boolean(snapshot?.stale)}
            refreshing={refreshing}
            columns={ETF_COLUMNS}
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
              <button
                type="button"
                onClick={() => void fetchSnapshot()}
                className="mt-1 rounded-lg bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
              >
                重试
              </button>
            </div>
          ) : loading ? (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground/70">正在加载 ETF 日频快照…</div>
          ) : (
            <>
              <EtfScreenerTable
                rows={pageRows}
                columns={visibleColumns}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                onAddWatch={onAddWatch}
                added={watchCodes}
                emptyHint="没有符合条件的 ETF，试试放宽规模/类型条件。"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>共 {sorted.length.toLocaleString("zh-CN")} 条</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="h-7 rounded-md border border-border bg-black/20 px-2 text-xs outline-none focus:border-primary/50"
                  >
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
