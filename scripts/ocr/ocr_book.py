#!/usr/bin/env python
"""逐页 OCR 扫描版 PDF，输出可断点续跑的 JSONL。

用法：
  work\ocr-venv\Scripts\python.exe scripts\ocr\ocr_book.py ^
    --pdf "C:\path\book.pdf" --out work\ocr\book --start 1 --end 50 --dpi 300

输出：
  <out>/pages.jsonl  每行一页，包含 blocks（box/text/score）与尺寸
  <out>/errors.jsonl 失败页

注意：临时 PNG 在识别后立即删除；pages.jsonl 已存在的页会自动跳过。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path

from PIL import Image
import numpy as np
from rapidocr_onnxruntime import RapidOCR


def render_page(pdf: Path, page: int, dpi: int, workdir: Path, poppler: str) -> Path:
    prefix = workdir / f"page-{page:04d}"
    cmd = [
        poppler,
        "-f",
        str(page),
        "-l",
        str(page),
        "-r",
        str(dpi),
        "-png",
        "-singlefile",
        str(pdf),
        str(prefix),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    image = prefix.with_suffix(".png")
    if not image.exists():
        raise FileNotFoundError(f"pdftoppm 未生成图片: {image}")
    return image


def ocr_page(engine: RapidOCR, image: Path) -> dict:
    with Image.open(image) as im:
        width, height = im.size
        pixels = np.array(im.convert("RGB"))
    result, elapse = engine(pixels)
    blocks = []
    for box, text, score in result or []:
        blocks.append(
            {
                "box": [[float(x), float(y)] for x, y in box],
                "text": str(text).strip(),
                "score": round(float(score), 4),
            }
        )
    return {
        "width": width,
        "height": height,
        "blocks": blocks,
        "elapse": [round(float(item), 3) for item in elapse],
    }


def read_done(path: Path) -> set[int]:
    done: set[int] = set()
    if not path.exists():
        return done
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            try:
                record = json.loads(line)
                if "page" in record and "blocks" in record:
                    done.add(int(record["page"]))
            except json.JSONDecodeError:
                continue
    return done


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int, default=0)
    parser.add_argument("--pages", default="", help="逗号分隔的页码/区间，如 12-15,20,30-32")
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument(
        "--poppler",
        default=os.environ.get(
            "POPPLER_PDFTOPPM",
            r"C:\Users\sjq\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe",
        ),
    )
    args = parser.parse_args()

    pdf = Path(args.pdf)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    pages_path = out / "pages.jsonl"
    errors_path = out / "errors.jsonl"
    done = read_done(pages_path)
    if args.pages:
        page_numbers = []
        for part in args.pages.split(","):
            part = part.strip()
            if not part:
                continue
            if "-" in part:
                start, end = part.split("-", 1)
                page_numbers.extend(range(int(start), int(end) + 1))
            else:
                page_numbers.append(int(part))
        page_numbers = sorted(set(page_numbers))
    else:
        if not args.end:
            parser.error("必须提供 --end 或 --pages")
        page_numbers = list(range(args.start, args.end + 1))

    engine = RapidOCR()
    started = time.time()
    with pages_path.open("a", encoding="utf-8") as pages_file, errors_path.open(
        "a", encoding="utf-8"
    ) as errors_file:
        with tempfile.TemporaryDirectory(prefix="ocr-page-") as tmp:
            workdir = Path(tmp)
            for page in page_numbers:
                if page in done:
                    continue
                page_started = time.time()
                try:
                    image = render_page(pdf, page, args.dpi, workdir, args.poppler)
                    record = ocr_page(engine, image)
                    image.unlink(missing_ok=True)
                    record["page"] = page
                    record["dpi"] = args.dpi
                    pages_file.write(json.dumps(record, ensure_ascii=False) + "\n")
                    pages_file.flush()
                    print(
                        f"[{page}] blocks={len(record['blocks'])} "
                        f"{time.time() - page_started:.1f}s",
                        flush=True,
                    )
                except Exception as error:  # noqa: BLE001 - keep batch running
                    errors_file.write(
                        json.dumps(
                            {
                                "page": page,
                                "error": str(error),
                                "trace": traceback.format_exc(),
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                    errors_file.flush()
                    print(f"[{page}] ERROR {error}", file=sys.stderr, flush=True)

    print(f"done in {time.time() - started:.1f}s -> {pages_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
