import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { Pager } from "@/components/ui/Pager";
import { ScreenerFilters } from "@/components/screener/ScreenerFilters";
import { ScreenerToolbar, type RoeStatus } from "@/components/screener/ScreenerToolbar";
import { ScreenerTable } from "@/components/screener/ScreenerTable";
import { api, ApiError, type ScreenerSnapshot } from "@/lib/api";
import { STOCK_CODES } from "@/data/stock_codes";
import { loadWatch, saveWatch, addCodes } from "@/lib/watchlist";
import { storageGet, storageSet } from "@/lib/storage";
import {
  activeConditionCount, BOARD_OPTIONS, conditionChips, decodeSnapshot, defaultConditions,
  filterRows, SCREENER_COLUMNS, sortRows, toCsv,
  type ColumnKey, type ScreenerConditions, type ScreenerRow, type SortDir,
} from "@/lib/screener";

const COND_KEY = "vr-screener-conditions-v2"; // v2：默认市场板块改为「主板」
const COLLAPSE_KEY = "vr-screener-collapsed";
const COLS_KEY = "vr-screener-columns";
const A_SHARE_MARKETS = new Set<string>(BOARD_OPTIONS);
const PAGE_SIZES = [50, 100, 200];

function loadConditions(): ScreenerConditions {
  const base = defaultConditions();
  const raw = storageGet(COND_KEY);
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<ScreenerConditions>;
    const merged: ScreenerConditions = { ...base, ...p };
    // 区间字段逐项兜底，避免旧版本缺字段导致运行时 undefined。
    for (const k of ["pe", "pb", "roe", "mcap", "change", "turnover", "volRatio", "amount", "amplitude"] as const) {
      merged[k] = { ...base[k], ...(p[k] ?? {}) };
    }
    merged.boards = Array.isArray(p.boards) ? p.boards : base.boards;
    merged.industries = Array.isArray(p.industries) ? p.industries : [];
    return merged;
  } catch {
    return base;
  }
}

function loadHiddenCols(): Set<ColumnKey> {
  const raw = storageGet(COLS_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw) as ColumnKey[];
      if (Array.isArray(arr)) return new Set(arr);
    } catch { /* 回退默认 */ }
  }
  return new Set(SCREENER_COLUMNS.filter((c) => c.hidden).map((c) => c.key));
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

export function Screener() {
  const [snapshot, setSnapshot] = useState<ScreenerSnapshot | null>(null);
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<ScreenerConditions>(loadConditions);
  const [applied, setApplied] = useState<ScreenerConditions>(loadConditions);
  const [collapsed, setCollapsed] = useState(() => storageGet(COLLAPSE_KEY) === "1");
  const [hidden, setHidden] = useState<Set<ColumnKey>>(loadHiddenCols);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [sortKey, setSortKey] = useState<ColumnKey>("mcap_yi");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [roeMap, setRoeMap] = useState<Record<string, number | null>>({});
  const [roeStatus, setRoeStatus] = useState<RoeStatus>("idle");
  const requestedRoe = useRef<Set<string>>(new Set());
  const roeUnavailable = useRef(false);
  const [watchCodes, setWatchCodes] = useState<Set<string>>(new Set());
  const resultsRef = useRef<HTMLDivElement>(null);

  const fetchSnapshot = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const snap = await api.screenerSnapshot();
      setSnapshot(snap);
      setRows(decodeSnapshot(snap));
      setPage(1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "全市场快照加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchSnapshot(); }, [fetchSnapshot]);
  useEffect(() => {
    loadWatch().then((cs) => setWatchCodes(new Set(cs))).catch(() => { /* 忽略：本地兜底 */ });
  }, []);

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of STOCK_CODES) if (A_SHARE_MARKETS.has(s.market) && s.industry) set.add(s.industry);
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, []);

  const boardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STOCK_CODES) if (A_SHARE_MARKETS.has(s.market)) counts[s.market] = (counts[s.market] ?? 0) + 1;
    return counts;
  }, []);

  // ROE 增量合并进行数据（仅当前页候选），使 ROE 过滤与展示同步生效。
  const mergedRows = useMemo(
    () => rows.map((r) => (r.code in roeMap ? { ...r, roe: roeMap[r.code] } : r)),
    [rows, roeMap],
  );

  const filtered = useMemo(() => filterRows(mergedRows, applied), [mergedRows, applied]);
  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );
  const pageCodes = useMemo(() => pageRows.map((r) => r.code), [pageRows]);

  // 按需拉取当前页 ROE（≤50 只；后端 4 路并发 + 12h 缓存）。依赖缺失时不再重试。
  useEffect(() => {
    if (roeUnavailable.current || pageCodes.length === 0) return;
    const missing = pageCodes.filter((c) => !(c in roeMap) && !requestedRoe.current.has(c));
    if (missing.length === 0) return;
    missing.forEach((c) => requestedRoe.current.add(c));
    setRoeStatus("loading");
    api.screenerEnrich(missing)
      .then((data) => {
        setRoeMap((prev) => {
          const next = { ...prev };
          for (const [code, v] of Object.entries(data)) next[code] = v.roe ?? null;
          return next;
        });
        setRoeStatus("done");
      })
      .catch((e) => {
        missing.forEach((c) => requestedRoe.current.delete(c));
        if (e instanceof ApiError && e.status === 501) {
          roeUnavailable.current = true;
          setRoeStatus("unavailable");
        } else {
          setRoeStatus("error");
        }
      });
  }, [pageCodes, roeMap]);

  const visibleColumns = useMemo(() => SCREENER_COLUMNS.filter((c) => !hidden.has(c.key)), [hidden]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(applied), [draft, applied]);
  const activeCount = useMemo(() => activeConditionCount(draft), [draft]);
  const chips = useMemo(() => conditionChips(collapsed ? applied : draft), [collapsed, applied, draft]);

  const patchDraft = useCallback((patch: Partial<ScreenerConditions>) => setDraft((d) => ({ ...d, ...patch })), []);

  const onStart = useCallback(() => {
    setApplied(draft);
    storageSet(COND_KEY, JSON.stringify(draft));
    setPage(1);
    window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [draft]);

  const onReset = useCallback(() => {
    const base = defaultConditions();
    setDraft(base);
    setApplied(base);
    storageSet(COND_KEY, JSON.stringify(base));
    setPage(1);
    setRoeMap({});
    requestedRoe.current.clear();
    setRoeStatus("idle");
  }, []);

  const onToggleCollapse = useCallback(() => {
    setCollapsed((v) => {
      storageSet(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  }, []);

  const onSort = useCallback((key: ColumnKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }, [sortKey]);

  const onToggleColumn = useCallback((key: ColumnKey) => {
    if (key === "name") return; // 名称列常显，不可隐藏
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
      else toast.info("该股已在自选");
    } catch {
      toast.error("加入自选失败");
    }
  }, []);

  const onExport = useCallback(() => {
    if (sorted.length === 0) { toast.info("当前结果为空，无可导出"); return; }
    saveBlob(toCsv(sorted, visibleColumns.map((c) => c.key)), `screener-${snapshot?.as_of?.slice(0, 10) ?? "export"}.csv`);
  }, [sorted, visibleColumns, snapshot]);

  return (
    <div>
      <PageHeader
        title="股票筛选"
        subtitle="全市场 A 股条件过滤 · 数据仅作客观呈现，不构成投资建议"
      />

      <ScreenerFilters
        draft={draft}
        onChange={patchDraft}
        onStart={onStart}
        onReset={onReset}
        onToggleCollapse={onToggleCollapse}
        collapsed={collapsed}
        activeCount={activeCount}
        chips={chips}
        industryOptions={industryOptions}
        boardCounts={boardCounts}
        dirty={dirty}
        loading={false}
      />

      <div ref={resultsRef} className="scroll-mt-4">
        <GlassCard className="overflow-hidden p-0">
          <ScreenerToolbar
            count={sorted.length}
            asOf={snapshot?.as_of ?? null}
            stale={Boolean(snapshot?.stale)}
            roeStatus={roeStatus}
            refreshing={refreshing}
            columns={SCREENER_COLUMNS}
            hidden={hidden}
            onToggleColumn={onToggleColumn}
            onExport={onExport}
            onRefresh={() => void fetchSnapshot(true)}
          />

          {error ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <button
                type="button"
                onClick={() => void fetchSnapshot()}
                className="mt-1 rounded-lg bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
              >
                重试
              </button>
            </div>
          ) : loading ? (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground/70">正在加载全市场快照…</div>
          ) : (
            <>
              <ScreenerTable
                rows={pageRows}
                columns={visibleColumns}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                onAddWatch={onAddWatch}
                added={watchCodes}
                roeLoading={roeStatus === "loading"}
                emptyHint="没有符合条件的股票，试试放宽筛选条件。"
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
