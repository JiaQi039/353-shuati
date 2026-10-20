#!/usr/bin/env python
"""从 lines.py 输出的行文本中提取选择题（试点/通用）。

用法：
  python scripts/ocr/parse_choice.py --lines work/ocr/epi-ch5/lines-auto.txt ^
    --out work/ocr/epi-ch5/choice.json --chapter "第五章 队列研究"
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HEADER_PATTERNS = [
    re.compile(r"^第[一二三四五六七八九十]+章.*\d+$"),
    re.compile(r"^\d+第[一二三四五六七八九十]+章.*$"),
    re.compile(r"^\d+$"),
]
OPTION_RE = re.compile(r"(?<![A-Za-z])([A-E])[.．、]\s*")
QUESTION_RE = re.compile(r"^(\d{1,2})[.．、]\s*")
SHARED_RE = re.compile(r"[（(]\s*(\d{1,2})\s*[～~\-]\s*(\d{1,2})\s*题共用备选答案\s*[）)]")


def clean(text: str) -> str:
    return re.sub(r"\s+", "", text).strip()


def is_header(text: str) -> bool:
    return any(pattern.match(text) for pattern in HEADER_PATTERNS)


def split_options(text: str):
    matches = list(OPTION_RE.finditer(text))
    if not matches:
        return None, text
    stem = text[: matches[0].start()].strip()
    options = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        options.append(clean(text[match.end() : end]))
    return options, stem


def parse(lines_path: Path, chapter: str):
    lines = []
    page = 0
    for raw in lines_path.read_text(encoding="utf-8").splitlines():
        if raw.startswith("===== PAGE"):
            page = int(re.search(r"PAGE (\d+)", raw).group(1))
            continue
        if not raw.strip():
            continue
        if "\t" in raw:
            score, text = raw.split("\t", 1)
        else:
            score, text = "0", raw
        text = text.strip()
        if text and not is_header(text):
            lines.append({"page": page, "score": float(score), "text": text})

    questions = []
    current = None
    shared = []
    shared_range = None
    collecting_shared = False
    in_section = False
    section = ""
    section_changed = False
    expected = 1

    def flush():
        nonlocal current
        if not current:
            return
        if current.get("options"):
            for index, option in enumerate(current["options"]):
                current["options"][index] = clean(option)
        questions.append(current)
        current = None

    for item in lines:
        text = item["text"]
        if any(keyword in text for keyword in ("选择题", "单选题", "多选题")) and "答案" not in text and not text.startswith("【"):
            in_section = True
            section_changed = True
            continue
        if any(keyword in text for keyword in ("简答题", "分析计算题", "论述题")):
            if in_section:
                break
        if not in_section:
            continue
        if text.startswith("【") and "型题" in text:
            section = text.strip("【】")
            section_changed = True
            continue
        share = SHARED_RE.search(text)
        if share:
            flush()
            shared = []
            shared_range = (int(share.group(1)), int(share.group(2)))
            collecting_shared = True
            continue
        if collecting_shared:
            if re.match(r"^[A-E][.．、]", text):
                options, _ = split_options(text)
                shared.extend(options or [])
                continue
            collecting_shared = False
        match = QUESTION_RE.match(text)
        if match:
            number = int(match.group(1))
            if not (
                number == expected
                or number == expected + 1
                or (number == 1 and section_changed)
            ):
                if current and current.get("options"):
                    current["options"][-1] += text
                continue
            if number == 1 and section_changed:
                expected = 1
            flush()
            current = {
                "number": number,
                "stem": text[match.end() :].strip(),
                "options": [],
                "page": item["page"],
                "score": item["score"],
                "section": section,
            }
            expected = number + 1
            section_changed = False
            if shared_range and shared_range[0] <= number <= shared_range[1]:
                current["options"] = list(shared)
            continue
        if current is None:
            continue
        options, stem_tail = split_options(text)
        if options:
            if not current["stem"]:
                current["stem"] = stem_tail
            current["options"].extend(options)
        elif current["options"]:
            current["options"][-1] += text
        else:
            current["stem"] += text
    flush()

    for question in questions:
        question["stem"] = clean(question["stem"])
        question["options"] = [clean(option) for option in question["options"]]
        question["type"] = "single"
    return questions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lines", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--chapter", required=True)
    args = parser.parse_args()
    questions = parse(Path(args.lines), args.chapter)
    Path(args.out).write_text(
        json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"parsed {len(questions)} questions -> {args.out}")
    for question in questions:
        print(
            f'{question["number"]:>3} opts={len(question["options"])} '
            f'stem={question["stem"][:40]}'
        )


if __name__ == "__main__":
    main()
