#!/usr/bin/env python
"""把 ocr_book.py 的 blocks 还原成按阅读顺序排列的行。

用法：
  python scripts/ocr/lines.py --pages work/ocr/book/pages.jsonl --out work/ocr/book/lines.txt
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def box_xy(box):
    xs = [point[0] for point in box]
    ys = [point[1] for point in box]
    return min(xs), min(ys), max(xs), max(ys)


def join_texts(texts):
    result = ""
    for text in texts:
        text = text.strip()
        if not text:
            continue
        if not result:
            result = text
        elif re.search(r"[A-Za-z0-9]$", result) and re.match(r"[A-Za-z0-9]", text):
            result += " " + text
        else:
            result += text
    return re.sub(r"\s+", " ", result).strip()


def group_column(blocks, tolerance):
    blocks = sorted(blocks, key=lambda block: box_xy(block["box"])[1])
    rows = []
    for block in blocks:
        _, y0, _, y1 = box_xy(block["box"])
        center = (y0 + y1) / 2
        placed = False
        for row in rows:
            if abs(row["center"] - center) <= tolerance:
                row["blocks"].append(block)
                row["center"] = (row["center"] * (len(row["blocks"]) - 1) + center) / len(
                    row["blocks"]
                )
                placed = True
                break
        if not placed:
            rows.append({"center": center, "blocks": [block]})
    for row in rows:
        row["blocks"].sort(key=lambda block: box_xy(block["box"])[0])
    return rows


def page_lines(record, mode="auto"):
    width = record["width"]
    option_like = sum(
        1 for block in record["blocks"] if re.match(r"^[A-E][.、．)]", block["text"].strip())
    )
    if mode == "auto":
        mode = "row" if option_like >= 3 else "column"
    if mode == "row":
        rows = group_column(record["blocks"], max(8, record["height"] * 0.008))
        lines = []
        for row in rows:
            text = join_texts([block["text"] for block in row["blocks"]])
            if text:
                score = min(block["score"] for block in row["blocks"])
                lines.append((row["center"], text, score))
        return lines

    left, right = [], []
    for block in record["blocks"]:
        x0, _, x1, _ = box_xy(block["box"])
        (left if (x0 + x1) / 2 < width * 0.52 else right).append(block)
    tolerance = max(8, record["height"] * 0.008)
    lines = []
    for column in (left, right):
        for row in group_column(column, tolerance):
            text = join_texts([block["text"] for block in row["blocks"]])
            if text:
                score = min(block["score"] for block in row["blocks"])
                lines.append((row["center"], text, score))
    return lines


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--mode", choices=["auto", "row", "column"], default="auto")
    args = parser.parse_args()

    pages = []
    with Path(args.pages).open("r", encoding="utf-8") as handle:
        for line in handle:
            pages.append(json.loads(line))
    pages.sort(key=lambda record: record["page"])

    output = []
    for record in pages:
        output.append(f"\n===== PAGE {record['page']} =====")
        for _, text, score in page_lines(record, args.mode):
            output.append(f"{score:.2f}\t{text}")
    Path(args.out).write_text("\n".join(output), encoding="utf-8")
    print(f"wrote {args.out} ({len(pages)} pages)")


if __name__ == "__main__":
    main()
