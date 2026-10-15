"""Isolation check for the new CLI tree. Does not walk open/ or trylo cli/src."""

from __future__ import annotations

from pathlib import Path

OPEN_IMPORT_MARKERS = ('from "open/', "from 'open/", "open/00-protocols")


def find_open_imports(repo_root: Path) -> list[str]:
    hits: list[str] = []
    src = repo_root / "src"
    if not src.is_dir():
        return hits
    for path in src.rglob("*.ts"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if any(marker in text for marker in OPEN_IMPORT_MARKERS):
            hits.append(str(path.relative_to(repo_root)).replace("\\", "/"))
    return hits


def find_open_deps(repo_root: Path) -> list[str]:
    hits: list[str] = []
    package_path = repo_root / "package.json"
    if not package_path.is_file():
        return hits
    text = package_path.read_text(encoding="utf-8", errors="ignore")
    if "open/" in text or '"open"' in text:
        hits.append("package.json")
    return hits


def check(repo_root: Path) -> dict[str, object]:
    imports = find_open_imports(repo_root)
    deps = find_open_deps(repo_root)
    return {
        "ok": not imports and not deps,
        "importHits": imports,
        "depHits": deps,
        "skipped": ["open/", "trylo cli/src"],
    }
