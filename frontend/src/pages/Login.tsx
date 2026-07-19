import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useAuth } from "@/components/auth/AuthProvider";
import { ApiError } from "@/lib/api";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!username.trim() || !password) {
      setErr("请输入用户名和密码");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate("/daily-review", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "登录失败，请检查后端是否启动");
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <GlassCard glow className="w-full max-w-sm">
        <form onSubmit={handleLogin} className="flex flex-col items-center gap-6">
          {/* Brand */}
          <div className="flex flex-col items-center gap-2">
            <LineChart className="h-10 w-10 text-primary text-glow" />
            <h1 className="text-2xl font-extrabold tracking-tight">
              Vibe-<span className="text-primary">Research</span>
            </h1>
            <p className="text-sm text-muted-foreground">个人 AI 投研系统</p>
          </div>

          {/* Error */}
          {err && (
            <div className="flex w-full items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {err}
            </div>
          )}

          {/* Fields */}
          <div className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">用户名</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                autoComplete="username"
                className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">密码</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 pr-10 text-sm outline-none transition-colors focus:border-primary/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary shadow-glow transition-colors hover:bg-primary/25 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "登录中…" : "登  录"}
          </button>

          <p className="text-[11px] leading-relaxed text-muted-foreground/60">
            不荐股 · 不预测 · 无倾向
          </p>
        </form>
      </GlassCard>
    </div>
  );
}
