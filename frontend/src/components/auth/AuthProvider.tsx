import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";

interface AuthContextType {
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_TOKEN_KEY = "vr-auth-token";

function loadToken(): string {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function saveToken(token: string) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* 隐私模式等 */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(loadToken);
  const [loading, setLoading] = useState(true);

  // 初始化时检查 token 是否有效（快速校验：存在即视为有效，过期由后端 401 处理）
  useEffect(() => {
    setLoading(false);
  }, []);

  // 同步 token 到 localStorage
  useEffect(() => {
    saveToken(token);
  }, [token]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    setToken(res.token);
  }, []);

  const logout = useCallback(() => {
    setToken("");
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** 当前登录 token，供 api.ts 的 authHeaders 使用 */
export function loadAuthToken(): string {
  return loadToken();
}
