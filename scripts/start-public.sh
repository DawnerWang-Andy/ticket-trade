#!/bin/bash
# 一键启动公网演示：本机服务 + Cloudflare 快速隧道
# 用法：bash scripts/start-public.sh（Ctrl+C 同时结束两个进程）
cd "$(dirname "$0")/.." || exit 1

CLOUDFLARED=$(command -v cloudflared || echo /opt/homebrew/opt/cloudflared/bin/cloudflared)
if [ ! -x "$CLOUDFLARED" ]; then
  echo "未找到 cloudflared，请先安装：brew install cloudflared"
  exit 1
fi

node server/index.js &
APP_PID=$!
echo "[1/2] 应用服务已启动 (PID $APP_PID) → http://localhost:8321"
sleep 1

"$CLOUDFLARED" tunnel --url http://localhost:8321 --no-autoupdate &
TUN_PID=$!
echo "[2/2] 公网隧道已启动 (PID $TUN_PID)，公网地址见上方 Visit it at 一行"

trap 'kill $APP_PID $TUN_PID 2>/dev/null' EXIT INT TERM
wait
