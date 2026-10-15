"""SPDX + A–E license rules for the P00 quality gate. No third-party scanner."""

from __future__ import annotations

from typing import Any

COPYLEFT_MARKERS = (
    "GPL-1.0",
    "GPL-2.0",
    "GPL-3.0",
    "AGPL-3.0",
    "LGPL-2.0",
    "LGPL-2.1",
    "LGPL-3.0",
)
UNKNOWN_MARKERS = {
    "",
    "UNLICENSED",
    "SEE LICENSE",
    "SEE LICENSE IN README.md",
    "UNKNOWN",
    "NONE",
}
PERMISSIVE = {
    "MIT",
    "ISC",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "0BSD",
    "Unlicense",
    "CC0-1.0",
}


def parse_spdx(expr: str) -> dict[str, Any]:
    raw = (expr or "").strip()
    if not raw:
        return {"kind": "empty", "parts": []}
    if " WITH " in raw:
        base, exception = raw.split(" WITH ", 1)
        return {
            "kind": "WITH",
            "base": base.strip(),
            "exception": exception.strip(),
            "parts": [base.strip()],
        }
    if " AND " in raw:
        parts = [part.strip() for part in raw.split(" AND ")]
        return {"kind": "AND", "parts": parts}
    if " OR " in raw:
        parts = [part.strip() for part in raw.split(" OR ")]
        return {"kind": "OR", "parts": parts}
    return {"kind": "simple", "parts": [raw]}


def _is_copyleft(spdx: str) -> bool:
    token = spdx.upper()
    return any(marker.upper() in token for marker in COPYLEFT_MARKERS)


def classify(spdx: str) -> str:
    if spdx.strip() in UNKNOWN_MARKERS or spdx.strip().upper() in UNKNOWN_MARKERS:
        return "unknown"
    if _is_copyleft(spdx):
        return "copyleft"
    if spdx == "Apache-2.0":
        return "apache"
    if spdx in PERMISSIVE:
        return "permissive"
    return "review"


def evaluate_simple(
    spdx: str,
    *,
    tier: str,
    exception_adr: bool,
    notice_required: bool,
    has_notice: bool,
) -> tuple[bool, str]:
    kind = classify(spdx)
    if kind == "unknown":
        return False, "unknown-or-unlicensed"
    if kind == "copyleft":
        return False, "copyleft"
    if kind == "review":
        return False, "not-in-default-allow-list"
    if kind == "apache":
        if notice_required and not has_notice:
            return False, "missing-NOTICE"
        if tier == "A" and not exception_adr:
            return False, "apache-tier-A-without-ADR"
        return True, f"apache-allowed-at-{tier}"
    return True, "permissive"


def evaluate_component(component: dict[str, Any]) -> dict[str, Any]:
    spdx = str(component.get("spdx", ""))
    parsed = parse_spdx(spdx)
    tier = str(component.get("tier", "A"))
    exception_adr = bool(component.get("exceptionAdr", False))
    notice_required = bool(component.get("noticeRequired", False))
    has_notice = bool(component.get("hasNotice", False))
    selected = component.get("selectedBranch")

    if parsed["kind"] == "empty":
        ok, reason = False, "unknown-or-unlicensed"
    elif parsed["kind"] == "OR":
        if not selected:
            ok, reason = False, "OR-without-selected-branch"
        else:
            ok, reason = evaluate_simple(
                str(selected),
                tier=tier,
                exception_adr=exception_adr,
                notice_required=notice_required,
                has_notice=has_notice,
            )
    elif parsed["kind"] == "AND":
        ok, reason = True, "AND-all-ok"
        for part in parsed["parts"]:
            part_ok, part_reason = evaluate_simple(
                part,
                tier=tier,
                exception_adr=exception_adr,
                notice_required=notice_required,
                has_notice=has_notice,
            )
            if not part_ok:
                ok, reason = False, part_reason
                break
    elif parsed["kind"] == "WITH":
        ok, reason = evaluate_simple(
            str(parsed["base"]),
            tier=tier,
            exception_adr=exception_adr,
            notice_required=notice_required,
            has_notice=has_notice,
        )
        if ok:
            reason = f"{reason}+WITH-{parsed['exception']}"
    else:
        part = parsed["parts"][0] if parsed["parts"] else ""
        ok, reason = evaluate_simple(
            part,
            tier=tier,
            exception_adr=exception_adr,
            notice_required=notice_required,
            has_notice=has_notice,
        )

    expect = component.get("expect")
    matched = (ok and expect == "pass") or ((not ok) and expect == "fail")
    if expect is None:
        matched = ok

    parse_ok = True
    expected_parse = component.get("parse")
    if isinstance(expected_parse, dict):
        operator = expected_parse.get("operator")
        if operator and parsed.get("kind") != operator:
            parse_ok = False
        if "parts" in expected_parse and parsed.get("parts") != expected_parse["parts"]:
            parse_ok = False
        if "base" in expected_parse and parsed.get("base") != expected_parse["base"]:
            parse_ok = False
        if "exception" in expected_parse and parsed.get("exception") != expected_parse["exception"]:
            parse_ok = False

    return {
        "id": component.get("id") or component.get("name"),
        "spdx": spdx,
        "parsed": parsed,
        "ok": ok,
        "reason": reason,
        "expect": expect,
        "matched": matched and parse_ok,
        "parseOk": parse_ok,
    }
