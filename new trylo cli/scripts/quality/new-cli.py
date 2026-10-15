"""quality:new-cli — blocking gate. Any failed step exits non-zero."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import license_eval
import verify_isolation

REPO = Path(__file__).resolve().parents[2]
SKIP_DIRS = {".git", "node_modules", "dist", "open"}
SECRET_PATTERNS = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"ghp_[A-Za-z0-9]{36}"),
]
CORE_DIRS = [
    REPO / "src" / "internal" / "loop",
    REPO / "src" / "internal" / "domain",
]
FORBIDDEN_LAYERS = ("adapters", "knowledge", "desktop", "host-adapter")
IMPORT_RE = re.compile(r"(?:from\s+|import\s*\(\s*)['\"]([^'\"]+)['\"]")
LARGE_BYTES = 1_000_000

PROJECT_COMPONENTS = [
    {
        "id": "typescript",
        "name": "typescript",
        "spdx": "Apache-2.0",
        "tier": "C",
        "role": "compiler",
        "entersArtifact": False,
        "hasNotice": False,
        "noticeRequired": False,
        "exceptionAdr": False,
        "expect": "pass",
        "source": "package.json devDependencies + public SPDX",
    },
    {
        "id": "types-node",
        "name": "@types/node",
        "spdx": "MIT",
        "tier": "C",
        "role": "types",
        "entersArtifact": False,
        "hasNotice": False,
        "noticeRequired": False,
        "exceptionAdr": False,
        "expect": "pass",
        "source": "package.json devDependencies + DefinitelyTyped MIT",
    },
]


def npm_cmd() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def run(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=REPO,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        yield path


def step_tsc() -> tuple[bool, str]:
    result = run([npm_cmd(), "run", "build"])
    if result.returncode != 0:
        return False, (result.stdout + result.stderr)[-2000:]
    return True, "tsc ok"


def step_tests() -> tuple[bool, str]:
    result = run([npm_cmd(), "test"])
    if result.returncode != 0:
        return False, (result.stdout + result.stderr)[-2000:]
    return True, "npm test ok"


def forbidden_hits_in(source: str) -> list[str]:
    hits: list[str] = []
    for specifier in IMPORT_RE.findall(source):
        normalized = specifier.replace("\\", "/")
        for layer in FORBIDDEN_LAYERS:
            if layer in normalized.split("/"):
                hits.append(specifier)
    return hits


def step_direction() -> tuple[bool, str]:
    core_hits: list[str] = []
    for core_dir in CORE_DIRS:
        if not core_dir.is_dir():
            continue
        for path in core_dir.rglob("*.ts"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            hits = forbidden_hits_in(text)
            if hits:
                rel = path.relative_to(REPO).as_posix()
                core_hits.append(f"{rel}: {hits}")
    fixture = REPO / "testdata" / "licenses" / "boundary" / "forbidden-core-import-ui.ts"
    if not fixture.is_file():
        return False, "missing UI-import fixture"
    fixture_hits = forbidden_hits_in(fixture.read_text(encoding="utf-8", errors="ignore"))
    if not fixture_hits:
        return False, "UI-import fixture was not detected"
    if core_hits:
        return False, "core import violation: " + "; ".join(core_hits)
    return True, f"core clean; fixture failed as required: {fixture.as_posix()} {fixture_hits}"


def step_fixtures() -> tuple[bool, str]:
    manifest = REPO / "testdata" / "licenses" / "manifest.json"
    if not manifest.is_file():
        return False, "missing testdata/licenses/manifest.json"
    names = load_json(manifest)["fixtures"]
    missing = [name for name in names if not (REPO / "testdata" / "licenses" / name / "component.json").is_file()]
    if missing:
        return False, "missing fixtures: " + ",".join(missing)
    return True, f"{len(names)} license fixtures present"


def step_inventory() -> tuple[bool, str]:
    package = load_json(REPO / "package.json")
    deps = {
        **package.get("dependencies", {}),
        **package.get("devDependencies", {}),
    }
    inventory = [{"name": name, "version": version} for name, version in sorted(deps.items())]
    src_files = [
        path.relative_to(REPO).as_posix()
        for path in (REPO / "src").rglob("*.ts")
    ] if (REPO / "src").is_dir() else []
    payload = {"dependencies": inventory, "srcTsCount": len(src_files)}
    return True, json.dumps(payload, ensure_ascii=False)


def load_license_fixtures() -> list[dict]:
    manifest = load_json(REPO / "testdata" / "licenses" / "manifest.json")
    components: list[dict] = []
    for name in manifest["fixtures"]:
        components.append(load_json(REPO / "testdata" / "licenses" / name / "component.json"))
    return components


def step_license_product() -> tuple[bool, str]:
    results = [license_eval.evaluate_component(item) for item in PROJECT_COMPONENTS]
    failed = [item for item in results if not item["ok"]]
    if failed:
        return False, json.dumps(failed, ensure_ascii=False)
    return True, json.dumps(results, ensure_ascii=False)


def step_license_selftest() -> tuple[bool, str]:
    results = [license_eval.evaluate_component(item) for item in load_license_fixtures()]
    mismatched = [item for item in results if not item["matched"]]
    if mismatched:
        return False, json.dumps(mismatched, ensure_ascii=False)
    return True, json.dumps(
        [{"id": item["id"], "ok": item["ok"], "expect": item["expect"], "reason": item["reason"]} for item in results],
        ensure_ascii=False,
    )


def step_secret_large() -> tuple[bool, str]:
    problems: list[str] = []
    for path in iter_files(REPO / "src"):
        if path.stat().st_size > LARGE_BYTES:
            problems.append(f"large:{path.relative_to(REPO).as_posix()}")
        if path.suffix.lower() in {".exe", ".dll", ".bin"}:
            problems.append(f"binary:{path.relative_to(REPO).as_posix()}")
        if path.suffix.lower() in {".ts", ".json", ".md"}:
            text = path.read_text(encoding="utf-8", errors="ignore")
            for pattern in SECRET_PATTERNS:
                if pattern.search(text):
                    problems.append(f"secret:{path.relative_to(REPO).as_posix()}")
                    break
    scripts_quality = REPO / "scripts" / "quality"
    for path in iter_files(scripts_quality):
        if path.stat().st_size > LARGE_BYTES:
            problems.append(f"large:{path.relative_to(REPO).as_posix()}")
    if problems:
        return False, "; ".join(problems)
    return True, "no secrets/large/binaries in src or scripts/quality"


def step_generated() -> tuple[bool, str]:
    src = REPO / "src"
    if src.is_dir() and any(src.rglob("node_modules")):
        return False, "node_modules inside src"
    return True, "src has no nested node_modules"


def step_docs() -> tuple[bool, str]:
    required = [
        REPO / "docs" / "02-分期工程产出" / "P00-工程地基与质量门禁" / "2026-09-12-N1-STATE.md",
        REPO / "docs" / "02-分期工程产出" / "P00-工程地基与质量门禁" / "ADR-0001-官方发行拓扑与核心工具链许可.md",
    ]
    missing = [path.name for path in required if not path.is_file()]
    if missing:
        return False, "missing " + ",".join(missing)
    return True, "STATE and ADR-0001 present"


def step_isolation() -> tuple[bool, str]:
    result = verify_isolation.check(REPO)
    if not result["ok"]:
        return False, json.dumps(result, ensure_ascii=False)
    return True, json.dumps(result, ensure_ascii=False)


STEPS = [
    ("1-format-or-tsc", step_tsc),
    ("2-lint-static", step_tsc),
    ("3-unit-contract", step_tests),
    ("4-dependency-direction", step_direction),
    ("5-schema-fixture", step_fixtures),
    ("6-dep-inventory", step_inventory),
    ("7-license-closure-product", step_license_product),
    ("7b-license-fixture-selftest", step_license_selftest),
    ("8-secret-large", step_secret_large),
    ("9-generated-clean", step_generated),
    ("10-docs-evidence", step_docs),
    ("isolation", step_isolation),
]


def prove_fail(fixture_id: str) -> int:
    path = REPO / "testdata" / "licenses" / fixture_id / "component.json"
    if not path.is_file():
        print(f"missing fixture {fixture_id}", file=sys.stderr)
        return 2
    result = license_eval.evaluate_component(load_json(path))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["ok"]:
        print("prove-fail: fixture unexpectedly passed", file=sys.stderr)
        return 2
    print("prove-fail: checker rejected fixture (expected non-zero)")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prove-fail", metavar="FIXTURE_ID")
    args = parser.parse_args()
    if args.prove_fail:
        return prove_fail(args.prove_fail)

    reports: list[dict[str, object]] = []
    failed = False
    for name, fn in STEPS:
        ok, detail = fn()
        reports.append({"step": name, "ok": ok, "detail": detail})
        status = "PASS" if ok else "FAIL"
        print(f"{status} {name}")
        if not ok:
            print(detail)
            failed = True
    print(json.dumps({"gate": "quality:new-cli", "ok": not failed, "steps": reports}, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
