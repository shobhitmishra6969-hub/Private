from __future__ import annotations

import logging
import sys
from datetime import datetime

RESET   = "\033[0m"
BOLD    = "\033[1m"
GREEN   = "\033[92m"
CYAN    = "\033[96m"
YELLOW  = "\033[93m"
RED     = "\033[91m"
MAGENTA = "\033[95m"
BLUE    = "\033[94m"

LEVEL_COLORS = {
    "ready": GREEN,
    "info":  CYAN,
    "warn":  YELLOW,
    "error": RED,
    "log":   MAGENTA,
    "debug": BLUE,
    "cmd":   BLUE,
    "event": CYAN,
    "db":    GREEN,
}

LEVEL_LABELS = {
    "ready": "READY",
    "info":  "INFO ",
    "warn":  "WARN ",
    "error": "ERROR",
    "log":   "LOG  ",
    "debug": "DEBUG",
    "cmd":   "CMD  ",
    "event": "EVENT",
    "db":    "DB   ",
}


def log(message: str, level: str = "info") -> None:
    ts = datetime.now().strftime("%d-%m-%Y %H:%M:%S")
    color = LEVEL_COLORS.get(level, RESET)
    label = LEVEL_LABELS.get(level, level.upper()[:5].ljust(5))
    print(f"{BOLD}[{ts}]{RESET} {color}{label}{RESET} :: {message}", flush=True)


logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logging.getLogger("discord").setLevel(logging.WARNING)
logging.getLogger("ravelink").setLevel(logging.INFO)
