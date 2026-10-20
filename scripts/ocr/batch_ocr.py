#!/usr/bin/env python
"""按 sources.json 顺序批量 OCR，断点续跑。

用法：
  work\\ocr-venv\\Scripts\\python.exe scripts\\ocr\\batch_ocr.py
  work\\ocr-venv\\Scripts\\python.exe scripts\\ocr\\batch_ocr.py --only stat-6 env-1

每本书输出到 work/ocr/<slug>/pages.jsonl；已完成的页会自动跳过。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[2]
config = json.loads((root / "scripts" / "ocr" / "sources.json").read_text(encoding="utf-8"))
base_dir = Path(config["base_dir"])
python = Path(sys.executable)
ocr_script = root / "scripts" / "ocr" / "ocr_book.py"


def count_pages(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="只跑指定 slug")
    parser.add_argument("--dpi", type=int, default=300)
    args = parser.parse_args()

    for book in config["books"]:
        if book["pages"] <= 0:
            continue
        if args.only and book["slug"] not in args.only:
            continue
        pdf = base_dir / book["file"]
        out = root.parent.parent / "work" / "ocr" / book["slug"]
        pages_file = out / "pages.jsonl"
        done = count_pages(pages_file)
        if done >= book["pages"]:
            print(f"SKIP {book['slug']} ({done}/{book['pages']})", flush=True)
            continue
        if not pdf.exists():
            print(f"MISS {book['slug']} {pdf}", flush=True)
            continue
        print(f"START {book['slug']} {done}/{book['pages']}", flush=True)
        started = time.time()
        subprocess.run(
            [
                str(python),
                str(ocr_script),
                "--pdf",
                str(pdf),
                "--out",
                str(out),
                "--start",
                "1",
                "--end",
                str(book["pages"]),
                "--dpi",
                str(args.dpi),
            ],
            check=True,
        )
        print(f"DONE {book['slug']} in {time.time() - started:.0f}s", flush=True)


if __name__ == "__main__":
    main()
