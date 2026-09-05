"""自选股数据层 —— 用户关注股票列表，持久化到本地 JSON 文件。

存储位置：默认 ~/.vibe-research/watchlist.json（可用 VR_DATA_DIR 覆盖）。
格式：["600519", "000858", ...] —— 6 位 A 股代码数组。
前端 localStorage 做缓存，后端 JSON 做持久化。
"""

from __future__ import annotations

import json
import os
from pathlib import Path

_DATA_DIR = Path(os.environ.get("VR_DATA_DIR", Path.home() / ".vibe-research"))
_WATCH_FILE = _DATA_DIR / "watchlist.json"


def load_watchlist() -> list[str]:
    """读取自选股列表，不存在时返回 []。"""
    if not _WATCH_FILE.exists():
        return []
    try:
        data = json.loads(_WATCH_FILE.read_text("utf-8"))
        if isinstance(data, list):
            return [c for c in data if isinstance(c, str)]
        return []
    except Exception:
        return []


def save_watchlist(codes: list[str]) -> None:
    """保存自选股列表到 JSON 文件。"""
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    clean = [c for c in codes if isinstance(c, str)]
    _WATCH_FILE.write_text(json.dumps(clean, ensure_ascii=False), "utf-8")
