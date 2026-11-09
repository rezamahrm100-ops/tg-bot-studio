#!/usr/bin/env python3
"""Generate an EN->FA machine-translation candidate while preserving human translations.

This does not certify linguistic quality or authorize production deployment.
The caller must supply an externally verified Argos en_fa model archive.
"""
from __future__ import annotations
import json
import os
import re
from pathlib import Path
from argostranslate import package, translate

ROOT = Path("src/client/src/i18n/locales")
REPORT = Path("docs/FA_FULL_TRANSLATION_CANDIDATE.md")
MODEL = Path(os.environ["ARGOS_MODEL_PATH"])
PERSIAN = re.compile(r"[\u0600-\u06ff]")
ENGLISH = re.compile(r"[A-Za-z]")
PLACEHOLDER = re.compile(r"\{\{[^{}]+\}\}|\{[^{}]+\}")
TECHNICAL = re.compile(r"^[A-Z0-9_./@:{}<>=+-]+$")
PROTECTED = re.compile(
    r"(\x60[^\x60]*\x60"
    r"|\{\{[^{}]+\}\}|\{[^{}]+\}"
    r"|https?://[^\s)<>]+"
    r"|(?<![A-Za-z0-9_])@[A-Za-z0-9_]+"
    r"|(?<![A-Za-z0-9_])/[A-Za-z][A-Za-z0-9_-]*"
    r"|</?[A-Za-z][^>]*>)"
)

def flatten(node: object, path: str = "") -> dict[str, str]:
    if isinstance(node, dict):
        return {k: v for name, value in node.items()
                for k, v in flatten(value, f"{path}.{name}" if path else name).items()}
    if isinstance(node, list):
        return {k: v for i, value in enumerate(node)
                for k, v in flatten(value, f"{path}[{i}]").items()}
    if not isinstance(node, str):
        raise TypeError(f"Non-string locale leaf: {path}")
    return {path: node}

def translate_segment(text: str, cache: dict[str, str]) -> str:
    if not ENGLISH.search(text) or not text.strip() or TECHNICAL.fullmatch(text.strip()):
        return text
    left = text[:len(text) - len(text.lstrip())]
    right = text[len(text.rstrip()):]
    body = text.strip()
    if body not in cache:
        candidate = translate.translate(body, "en", "fa").strip()
        if not candidate or len(candidate) > max(1200, len(body) * 6):
            raise RuntimeError("Unusable machine translation output")
        cache[body] = candidate
    return left + cache[body] + right

def translate_protected(text: str, cache: dict[str, str]) -> str:
    pieces = []
    start = 0
    for match in PROTECTED.finditer(text):
        pieces.append(translate_segment(text[start:match.start()], cache))
        pieces.append(match.group())
        start = match.end()
    pieces.append(translate_segment(text[start:], cache))
    return "".join(pieces)

def transform(name: str, cache: dict[str, str]) -> tuple[int, int, list[str], list[str]]:
    en = json.loads((ROOT / name).read_text(encoding="utf-8"))
    target_path = ROOT / ("fa.json" if name == "en.json" else "modules.fa.json")
    existing = json.loads(target_path.read_text(encoding="utf-8"))
    src_flat, fa_flat = flatten(en), flatten(existing)
    if set(src_flat) != set(fa_flat):
        raise RuntimeError("Catalog keys do not match")
    attempted = 0
    changed = 0
    missing, mixed = [], []
    def visit(node: object, path: str = "") -> object:
        nonlocal attempted, changed
        if isinstance(node, dict):
            return {k: visit(v, f"{path}.{k}" if path else k) for k, v in node.items()}
        if isinstance(node, list):
            return [visit(v, f"{path}[{i}]") for i, v in enumerate(node)]
        assert isinstance(node, str)
        old = fa_flat[path]
        if old != node:  # Keep all prior human-reviewed translations.
            return old
        if not ENGLISH.search(node) or TECHNICAL.fullmatch(node.strip()):
            return old
        attempted += 1
        candidate = translate_protected(node, cache)
        if sorted(PLACEHOLDER.findall(candidate)) != sorted(PLACEHOLDER.findall(node)):
            raise RuntimeError(f"Placeholder corruption in {path}")
        if candidate != node:
            changed += 1
        if not PERSIAN.search(candidate):
            missing.append(path)
        elif ENGLISH.search(candidate):
            mixed.append(path)
        if attempted % 100 == 0:
            print(f"{name}: processed {attempted} entries", flush=True)
        return candidate
    result = visit(en)
    if set(flatten(result)) != set(src_flat):
        raise RuntimeError("Catalog key parity failure")
    for key, value in flatten(result).items():
        if sorted(PLACEHOLDER.findall(value)) != sorted(PLACEHOLDER.findall(src_flat[key])):
            raise RuntimeError(f"Interpolation mismatch in {key}")
    target_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return attempted, changed, missing, mixed

def main() -> None:
    if not MODEL.is_file() or MODEL.stat().st_size < 50_000_000:
        raise RuntimeError("Verified en-fa model archive missing")
    package.install_from_path(str(MODEL))
    cache: dict[str, str] = {}
    stats = []
    missing, mixed = [], []
    for name in ("en.json", "modules.en.json"):
        attempted, changed, absent, dual = transform(name, cache)
        stats.append((name, attempted, changed, len(absent), len(dual)))
        missing.extend(f"{name}: {key}" for key in absent)
        mixed.extend(f"{name}: {key}" for key in dual)
    lines = [
        "# Persian full-catalog machine translation candidate",
        "",
        "> DRAFT — NOT HUMAN-REVIEWED OR APPROVED FOR PRODUCTION.",
        "> Existing hand-translated Persian strings remain unmodified.",
        "> Uses pinned Argos Translate English-to-Persian model 1.5.",
        "",
        "| Catalog | Attempted | Changed | No Persian glyphs | Mixed Latin/Persian |",
        "| --- | ---: | ---: | ---: | ---: |",
        *[f"| {n} | {a} | {c} | {m} | {x} |" for n,a,c,m,x in stats],
        "",
        f"Unique source spans translated: {len(cache)}.",
        "",
        "## Release gates",
        "1. Human Persian review of ALL machine-generated text, especially security, permissions,",
        "   payments, bot actions and module docs. A complete key tree is not linguistic QA.",
        "2. Review technical identifiers and the items flagged below.",
        "3. Pass the existing i18n parity tests, lint, typecheck, build and Docker checks.",
        "4. Visual RTL testing on desktop/mobile and authenticated browser flows.",
        "5. Only then plan a scoped frontend-only VPS deployment with backup and rollback;",
        "   do not change production DB, Caddy, TCS, WorldFeed or bot tokens.",
        "",
        "## Missing Persian glyphs — review or document technical exception",
        *[f"- {x}" for x in missing] if missing else ["- None"],
        "",
        "## Mixed Latin/Persian — preserve only valid technical literals",
        *[f"- {x}" for x in mixed] if mixed else ["- None"],
        "",
    ]
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print("FA_TRANSLATION_CANDIDATE=CREATED; HUMAN_QA=REQUIRED; PRODUCTION_DEPLOY=NO",flush=True)

if __name__ == "__main__":
    main()
