#!/usr/bin/env bash
# =============================================================
# Vibe-Research 一键启停脚本
# 用法: ./run.sh {start|stop|status|restart}
#
# 使用当前本机 Python 环境（无需 .venv），自动加载 .env 配置。
# =============================================================
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"

# ── 加载 .env（只导出非空变量，避免覆盖已有环境变量） ─────────
if [[ -f .env ]]; then
  while IFS='=' read -r key val; do
    # 跳过注释 / 空行 / 无等号行
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    val="${val%\"}" ; val="${val#\"}"
    val="${val%\'}" ; val="${val#\'}"
    # 展开 ${VAR} 和 $VAR
    val="$(eval echo "$val")"
    if [[ -n "$key" && -n "$val" ]]; then
      export "$key=$val"
    fi
  done < <(grep -E '^[A-Z_][A-Z_0-9]*=' .env)
fi

# ── 路径常量 ────────────────────────────────────────────────────
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_PORT=8900
FRONTEND_PORT=8901
PID_FILE_BACKEND="/tmp/vibe-research-backend.pid"
PID_FILE_FRONTEND="/tmp/vibe-research-frontend.pid"
CLOUDFLARED_PIDFILE="/tmp/vibe-research-cloudflared.pid"
CLOUDFLARED_LOG="/tmp/vibe-research-cloudflared.log"
LOG_DIR="$PROJECT_ROOT/logs"

mkdir -p "$LOG_DIR"

# ── 检测命令是否存在 ────────────────────────────────────────────
command -v python3 >/dev/null 2>&1 || { echo "❌ 需要 python3"; exit 1; }
command -v node     >/dev/null 2>&1 || { echo "❌ 需要 node";   exit 1; }

# ── 端口检测（macOS: lsof） ─────────────────────────────────────
port_in_use() {
  local port=$1
  lsof -iTCP:"$port" -sTCP:LISTEN -Fn 2>/dev/null | grep -q "^n" && return 0 || return 1
}

kill_pidfile() {
  local pidfile=$1 name=$2
  if [[ ! -f "$pidfile" ]]; then
    echo "   ${name} 未启动 (无 PID 文件)"
    return 1
  fi
  local pid
  pid=$(cat "$pidfile" 2>/dev/null || echo "")
  if [[ -z "$pid" ]]; then
    rm -f "$pidfile"
    return 1
  fi
  if kill "$pid" 2>/dev/null; then
    echo "   ${name} (PID $pid) 已停止"
  else
    echo "   ${name} (PID $pid) 不存在，清理 PID 文件"
  fi
  rm -f "$pidfile"
  return 0
}

# ── cloudflared 隧道 ──────────────────────────────────────────
start_tunnel() {
  local target_url=$1 label=$2

  if ! command -v cloudflared &>/dev/null; then
    echo "  (cloudflared not found — no public tunnel for ${label})"
    return 0
  fi

  rm -f "$CLOUDFLARED_PIDFILE" "$CLOUDFLARED_LOG"

  nohup cloudflared tunnel --url "$target_url" > "$CLOUDFLARED_LOG" 2>&1 &
  local cf_pid=$!
  echo "$cf_pid" > "$CLOUDFLARED_PIDFILE"

  local cf_url=""
  for i in $(seq 1 30); do
    cf_url=$(grep -oE 'https?://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" 2>/dev/null || true)
    if [ -n "$cf_url" ]; then
      break
    fi
    sleep 0.5
  done

  if [ -n "$cf_url" ]; then
    echo "  External URL: $cf_url"
  else
    echo "  (cloudflared tunnel starting... check $CLOUDFLARED_LOG)"
  fi
}

stop_tunnel() {
  if [[ ! -f "$CLOUDFLARED_PIDFILE" ]]; then
    return 0
  fi
  local cf_pid
  cf_pid=$(cat "$CLOUDFLARED_PIDFILE")
  if kill -0 "$cf_pid" 2>/dev/null; then
    echo "  停止 cloudflared 隧道 (PID $cf_pid)..."
    kill "$cf_pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$cf_pid" 2>/dev/null; then
      kill -9 "$cf_pid" 2>/dev/null || true
    fi
  fi
  rm -f "$CLOUDFLARED_PIDFILE" "$CLOUDFLARED_LOG"
}

# ===============================================================
# start
# ===============================================================
cmd_start() {
  echo "🚀 启动 Vibe-Research ..."
  echo ""

  # ── 后端 ────────────────────────────────────────────────────
  if [[ -f "$PID_FILE_BACKEND" ]]; then
    pid=$(cat "$PID_FILE_BACKEND")
    if kill -0 "$pid" 2>/dev/null; then
      echo "✅ 后端已在运行 (PID $pid, :$BACKEND_PORT)"
    else
      echo "⚠️  后端 PID 文件残留，清理"
      rm -f "$PID_FILE_BACKEND"
    fi
  fi

  if [[ ! -f "$PID_FILE_BACKEND" ]]; then
    if port_in_use $BACKEND_PORT; then
      echo "❌ 端口 $BACKEND_PORT 已被占用，无法启动后端"
      exit 1
    fi

    # 检查关键包，缺则自动安装（当前本机环境，跳过外部管理限制）
    python3 -c "import fastapi, uvicorn" 2>/dev/null || {
      echo "📦 安装后端核心依赖（fastapi / uvicorn / requests）..."
      python3 -m pip config set global.break-system-packages true 2>/dev/null || true
      python3 -m pip install --break-system-packages fastapi uvicorn requests 2>&1 | tail -3
      python3 -c "import fastapi, uvicorn" 2>/dev/null || {
        echo "❌ 自动安装失败，请手动执行:"
        echo "   python3 -m pip install --break-system-packages fastapi uvicorn requests"
        exit 1
      }
      echo "   核心依赖安装完成"
    }

    # 可选依赖：akshare / mootdx / tushare
    for _pkg in akshare mootdx tushare; do
      python3 -c "import $_pkg" 2>/dev/null && continue
      echo "📦 安装可选依赖: $_pkg ..."
      python3 -m pip install --break-system-packages "$_pkg" 2>&1 | tail -2
    done

    cd "$BACKEND_DIR"

    # 构造 Tushare 初始化脚本：在 app 启动前注入 tushare 配置
    # 通过环境变量让 astock.py 有条件地初始化 tushare
    export TUSHARE_ENABLED=1

    echo "  启动后端 (uvicorn :$BACKEND_PORT) ..."
    nohup python3 -m uvicorn app:app \
      --host 127.0.0.1 --port "$BACKEND_PORT" \
      --log-level info \
      > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$PID_FILE_BACKEND"
    cd "$PROJECT_ROOT"

    # 等 3 秒确认启动
    sleep 3
    if kill -0 "$(cat "$PID_FILE_BACKEND")" 2>/dev/null; then
      echo "   ✅ 后端已启动 (PID $(cat "$PID_FILE_BACKEND"))"
    else
      echo "   ❌ 后端启动失败，查看日志: tail -20 $LOG_DIR/backend.log"
      rm -f "$PID_FILE_BACKEND"
      exit 1
    fi
  fi

  echo ""

  # ── 前端 ────────────────────────────────────────────────────
  if [[ -f "$PID_FILE_FRONTEND" ]]; then
    pid=$(cat "$PID_FILE_FRONTEND")
    if kill -0 "$pid" 2>/dev/null; then
      echo "✅ 前端已在运行 (PID $pid, :$FRONTEND_PORT)"
    else
      echo "⚠️  前端 PID 文件残留，清理"
      rm -f "$PID_FILE_FRONTEND"
    fi
  fi

  if [[ ! -f "$PID_FILE_FRONTEND" ]]; then
    if port_in_use $FRONTEND_PORT; then
      echo "❌ 端口 $FRONTEND_PORT 已被占用，无法启动前端"
      exit 1
    fi

    if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
      echo "📦 前端依赖未安装，执行 npm install ..."
      cd "$FRONTEND_DIR"
      npm install
      cd "$PROJECT_ROOT"
    fi

    cd "$FRONTEND_DIR"
    echo "  启动前端 (Vite :$FRONTEND_PORT) ..."
    nohup npm run dev -- --port "$FRONTEND_PORT" \
      > "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$PID_FILE_FRONTEND"
    cd "$PROJECT_ROOT"

    sleep 3
    if kill -0 "$(cat "$PID_FILE_FRONTEND")" 2>/dev/null; then
      echo "   ✅ 前端已启动 (PID $(cat "$PID_FILE_FRONTEND"))"
    else
      echo "   ⚠️  前端可能启动缓慢，查看日志: tail -20 $LOG_DIR/frontend.log"
    fi
  fi

  echo ""

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Vibe-Research 已启动"
  echo "  前端:  http://localhost:${FRONTEND_PORT}"
  echo "  后端:  http://127.0.0.1:${BACKEND_PORT}"
  echo "  日志:  $LOG_DIR/"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ===============================================================
# stop
# ===============================================================
cmd_stop() {
  echo "🛑 停止 Vibe-Research ..."
  echo ""
  stop_tunnel
  kill_pidfile "$PID_FILE_BACKEND"  "后端" || true
  kill_pidfile "$PID_FILE_FRONTEND" "前端" || true
  echo ""
  echo "✅ 已停止"
}

# ===============================================================
# status
# ===============================================================
cmd_status() {
  echo "📊 Vibe-Research 状态"
  echo ""

  local backend_running=false
  local frontend_running=false

  # 后端
  if [[ -f "$PID_FILE_BACKEND" ]]; then
    pid=$(cat "$PID_FILE_BACKEND")
    if kill -0 "$pid" 2>/dev/null; then
      echo "  后端: ✅ 运行中 (PID $pid, :$BACKEND_PORT)"
      backend_running=true
    else
      echo "  后端: ❌ PID 文件存在但进程已死 ($PID_FILE_BACKEND)"
      rm -f "$PID_FILE_BACKEND"
    fi
  else
    if port_in_use $BACKEND_PORT; then
      local actual_pid
      actual_pid=$(lsof -tiTCP:"$BACKEND_PORT" -sTCP:LISTEN 2>/dev/null || echo "")
      echo "  后端: ⚠️  端口 :$BACKEND_PORT 被占用 (PID $actual_pid)，但非本脚本启动"
    else
      echo "  后端: ⚪ 未启动"
    fi
  fi

  # 前端
  if [[ -f "$PID_FILE_FRONTEND" ]]; then
    pid=$(cat "$PID_FILE_FRONTEND")
    if kill -0 "$pid" 2>/dev/null; then
      echo "  前端: ✅ 运行中 (PID $pid, :$FRONTEND_PORT)"
      frontend_running=true
    else
      echo "  前端: ❌ PID 文件存在但进程已死 ($PID_FILE_FRONTEND)"
      rm -f "$PID_FILE_FRONTEND"
    fi
  else
    if port_in_use $FRONTEND_PORT; then
      local actual_pid
      actual_pid=$(lsof -tiTCP:"$FRONTEND_PORT" -sTCP:LISTEN 2>/dev/null || echo "")
      echo "  前端: ⚠️  端口 :$FRONTEND_PORT 被占用 (PID $actual_pid)，但非本脚本启动"
    else
      echo "  前端: ⚪ 未启动"
    fi
  fi

  # 隧道
  if [[ -f "$CLOUDFLARED_PIDFILE" ]]; then
    local cf_pid
    cf_pid=$(cat "$CLOUDFLARED_PIDFILE")
    if kill -0 "$cf_pid" 2>/dev/null; then
      local cf_url
      cf_url=$(grep -oE 'https?://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" 2>/dev/null || true)
      if [ -n "$cf_url" ]; then
        echo "  隧道: ✅ 运行中 (PID $cf_pid)"
        echo "  外网:  $cf_url"
      else
        echo "  隧道: ⏳ 连接中 (PID $cf_pid)"
      fi
    else
      echo "  隧道: ❌ PID 文件存在但进程已死"
      rm -f "$CLOUDFLARED_PIDFILE" "$CLOUDFLARED_LOG"
    fi
  fi

  echo ""
  if $backend_running || $frontend_running; then
    echo "日志目录: $LOG_DIR/"
  fi
}

# ===============================================================
# tunnel
# ===============================================================
cmd_tunnel() {
  echo "🌐 启动 cloudflared 外网隧道 ..."
  start_tunnel "http://localhost:${FRONTEND_PORT}" "前端"
}

# ===============================================================
# restart
# ===============================================================
cmd_restart() {
  cmd_stop
  echo ""
  echo "────────── 等待 2 秒 ──────────"
  sleep 2
  cmd_start
}

# ===============================================================
# main
# ===============================================================
case "${1:-}" in
  start)
    cmd_start
    ;;
  stop)
    cmd_stop
    ;;
  status)
    cmd_status
    ;;
  restart)
    cmd_restart
    ;;
  tunnel)
    cmd_tunnel
    ;;
  *)
    echo "用法: $0 {start|stop|status|restart|tunnel}"
    echo ""
    echo "  start   启动后端 (:8900) + 前端 (:$FRONTEND_PORT)"
    echo "  stop    停止所有服务（含外网隧道）"
    echo "  status  查看运行状态"
    echo "  restart 重启所有服务（不含外网隧道）"
    echo "  tunnel  启动外网隧道（cloudflared，需先 start）"
    exit 1
    ;;
esac
