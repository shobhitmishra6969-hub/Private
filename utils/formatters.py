from __future__ import annotations

import re


def ms_to_time(ms: int) -> str:
    if ms <= 0:
        return "0:00"
    total_sec = ms // 1000
    hours, remainder = divmod(total_sec, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def time_to_ms(time_str: str) -> int:
    parts = time_str.strip().split(":")
    try:
        if len(parts) == 3:
            return (int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])) * 1000
        if len(parts) == 2:
            return (int(parts[0]) * 60 + int(parts[1])) * 1000
        return int(parts[0]) * 1000
    except (ValueError, IndexError):
        return 0


def progress_bar(position: int, length: int, size: int = 22) -> str:
    if length <= 0:
        return "─" * size + "●"
    pct = max(0.0, min(1.0, position / length))
    knob = round(size * pct)
    return "─" * knob + "●" + "─" * (size - knob)


def clean_author(author: str | None) -> str:
    if not author:
        return "Unknown Artist"
    return re.sub(r"\s*-\s*Topic\s*$", "", author, flags=re.IGNORECASE).strip()


def clean_thumbnail(url: str | None) -> str | None:
    if not url:
        return None
    m = re.search(r"vi/([^/]+)/", url)
    if m and ("ytimg.com" in url or "img.youtube.com" in url):
        return f"https://i.ytimg.com/vi/{m.group(1)}/maxresdefault.jpg"
    return url


def short_number(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def duration_str(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        m, s = divmod(seconds, 60)
        return f"{m}m {s}s"
    h, remainder = divmod(seconds, 3600)
    m, s = divmod(remainder, 60)
    return f"{h}h {m}m {s}s"
