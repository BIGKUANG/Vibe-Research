// 关注股票（自选股）—— 优先持久化到后端 JSON，localStorage 做缓存降级。
// 行情复用 /api/quote；复盘时把关注股行情一并喂给用户自己的 AI。

import { api } from "./api";

const KEY = "vr-watchlist";

export async function loadWatch(): Promise<string[]> {
  // 1. 尝试从后端加载
  try {
    const data = await api.watchlistGet();
    if (Array.isArray(data)) {
      const codes = data.filter((c) => /^\d{6}$/.test(c));
      // 同步到 localStorage 做缓存
      localStorage.setItem(KEY, JSON.stringify(codes));
      return codes;
    }
  } catch {
    // 2. 后端不可用时（未启动/未登录等），回退 localStorage
  }
  return loadLocalWatch();
}

export function loadLocalWatch(): string[] {
  // 纯本地读取（用于后端不可用时的兜底）
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((c) => /^\d{6}$/.test(c)) : [];
  } catch {
    return [];
  }
}

export async function saveWatch(codes: string[]) {
  const clean = codes.filter((c) => /^\d{6}$/.test(c));
  // 始终写 localStorage（即时生效）
  localStorage.setItem(KEY, JSON.stringify(clean));
  // 异步写后端
  try {
    await api.watchlistSet(clean);
  } catch {
    // 静默降级，至少已保存到 localStorage
  }
}

// 从任意文本里抽取 6 位 A 股代码（逗号 / 空格 / 换行 / 顿号分隔都行，方便一次粘贴一串）。
export function parseCodes(raw: string): string[] {
  const tokens = raw.split(/[^\d]+/).filter(Boolean);
  return Array.from(new Set(tokens.filter((t) => /^\d{6}$/.test(t))));
}

// 把用户输入的一串代码并入已有自选，返回去重后的新列表 + 实际新增数量。
export function addCodes(existing: string[], raw: string): { next: string[]; added: number } {
  const incoming = parseCodes(raw).filter((c) => !existing.includes(c));
  return { next: [...existing, ...incoming], added: incoming.length };
}
