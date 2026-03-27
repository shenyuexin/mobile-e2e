#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import platform
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REPORT_DIR = ROOT / "reports"
PHASE_REPORT = REPORT_DIR / "phase-sample-report.json"
RUN_METADATA = Path(
    os.environ.get("ACCEPTANCE_RUN_METADATA_PATH", str(REPORT_DIR / "self-hosted-run-metadata.json"))
)
OUT_JSON = REPORT_DIR / "acceptance-evidence.json"
OUT_MD = REPORT_DIR / "acceptance-evidence.md"


def read_phase_report() -> dict:
    if not PHASE_REPORT.exists():
        return {"platforms": [], "generated_at": None}
    return json.loads(PHASE_REPORT.read_text())


def read_run_metadata() -> dict:
    if not RUN_METADATA.exists():
        return {}
    return json.loads(RUN_METADATA.read_text())


def collect_audit_files() -> list[str]:
    audit_root = ROOT / "artifacts" / "audit"
    if not audit_root.exists():
        return []
    metadata = read_run_metadata()
    generated_at = metadata.get("generated_at")
    if generated_at:
        threshold = datetime.fromisoformat(generated_at.replace("Z", "+00:00")).timestamp()
        return sorted(
            str(path.relative_to(ROOT))
            for path in audit_root.glob("*.json")
            if path.stat().st_mtime >= threshold
        )
    return sorted(str(path.relative_to(ROOT)) for path in audit_root.glob("*.json"))


def collect_visual_evidence() -> list[str]:
    visual_paths: list[str] = []
    for pattern in [
        "artifacts/phase1-ios/**/final.jpg",
        "artifacts/phase1-android/**/final.jpg",
        "artifacts/phase2-rn-android/**/final.jpg",
        "artifacts/phase3-flutter-android/**/final.jpg",
        "artifacts/phase3-native-android/**/final.jpg",
        "artifacts/phase3-native-ios/**/final.jpg",
    ]:
        visual_paths.extend(sorted(str(path.relative_to(ROOT)) for path in ROOT.glob(pattern)))
    return visual_paths


def build_payload() -> dict:
    phase_report = read_phase_report()
    metadata = read_run_metadata()
    platforms = phase_report.get("platforms", [])
    total_runs = sum(platform.get("total_runs", 0) for platform in platforms)
    passed_runs = sum(platform.get("passed_runs", 0) for platform in platforms)
    failures = [
        {
            "platform": platform.get("platform"),
            "run": run.get("run"),
            "flow": run.get("flow"),
            "result": run.get("result"),
            "maestro_out": run.get("maestro_out"),
        }
        for platform in platforms
        for run in platform.get("runs", [])
        if run.get("result") != "PASS"
    ]
    scheduler_metrics = {
        "queue_wait_p50_ms": 0,
        "queue_wait_p95_ms": 0,
        "queue_wait_max_ms": 0,
        "lease_conflict_count": 0,
        "stale_lease_recovered_count": 0,
    }
    queue_p50_values: list[int] = []
    queue_p95_values: list[int] = []
    queue_max_values: list[int] = []
    for platform_entry in platforms:
        platform_metrics = platform_entry.get("scheduler_metrics")
        if not isinstance(platform_metrics, dict):
            continue
        queue_p50_values.append(int(platform_metrics.get("queue_wait_p50_ms", 0) or 0))
        queue_p95_values.append(int(platform_metrics.get("queue_wait_p95_ms", 0) or 0))
        queue_max_values.append(int(platform_metrics.get("queue_wait_max_ms", 0) or 0))
        scheduler_metrics["lease_conflict_count"] += int(platform_metrics.get("lease_conflict_count", 0) or 0)
        scheduler_metrics["stale_lease_recovered_count"] += int(platform_metrics.get("stale_lease_recovered_count", 0) or 0)

    if queue_p50_values:
        scheduler_metrics["queue_wait_p50_ms"] = sorted(queue_p50_values)[len(queue_p50_values) // 2]
    if queue_p95_values:
        scheduler_metrics["queue_wait_p95_ms"] = sorted(queue_p95_values)[max(0, len(queue_p95_values) - 1)]
    if queue_max_values:
        scheduler_metrics["queue_wait_max_ms"] = max(queue_max_values)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scope": {
            "phase": metadata.get("phase", os.environ.get("ACCEPTANCE_PHASE", "Phase 3 real-run")),
            "workstream": metadata.get("workstream", os.environ.get("ACCEPTANCE_WORKSTREAM", "sample-validation")),
            "feature": metadata.get("feature", os.environ.get("ACCEPTANCE_FEATURE", "self-hosted real-run acceptance")),
        },
        "context": {
            "environment": metadata.get("environment", os.environ.get("ACCEPTANCE_ENVIRONMENT", "local-self-hosted")),
            "host": platform.node(),
            "platform": platform.platform(),
            "github_run_id": os.environ.get("GITHUB_RUN_ID"),
            "github_actor": os.environ.get("GITHUB_ACTOR"),
            "git_sha": os.environ.get("GITHUB_SHA"),
            "run_metadata": str(RUN_METADATA.relative_to(ROOT)) if RUN_METADATA.exists() else None,
        },
        "results": {
            "total_runs": total_runs,
            "passed_runs": passed_runs,
            "pass_rate": 0 if total_runs == 0 else round(passed_runs / total_runs, 4),
            "failures": failures,
            "scheduler_metrics": scheduler_metrics,
        },
        "artifacts": {
            "phase_report_json": str(PHASE_REPORT.relative_to(ROOT)) if PHASE_REPORT.exists() else None,
            "audit_files": collect_audit_files(),
            "visual_evidence": collect_visual_evidence(),
        },
    }


def write_markdown(payload: dict) -> None:
    lines = [
        "# Acceptance Evidence",
        "",
        f"Generated at: {payload['generated_at']}",
        "",
        "## Scope Under Verification",
        "",
        f"- Phase: {payload['scope']['phase']}",
        f"- Workstream: {payload['scope']['workstream']}",
        f"- Feature/capability: {payload['scope']['feature']}",
        "",
        "## Test Context",
        "",
        f"- Environment: {payload['context']['environment']}",
        f"- Host: {payload['context']['host']}",
        f"- Platform: {payload['context']['platform']}",
        f"- GitHub run ID: {payload['context']['github_run_id'] or 'local'}",
        f"- Actor: {payload['context']['github_actor'] or 'local-user'}",
        "",
        "## Results",
        "",
        f"- Total runs: {payload['results']['total_runs']}",
        f"- Passed runs: {payload['results']['passed_runs']}",
        f"- Pass rate: {payload['results']['pass_rate']:.0%}",
        f"- Failure count: {len(payload['results']['failures'])}",
        f"- Queue wait p50/p95/max (ms): {payload['results']['scheduler_metrics']['queue_wait_p50_ms']}/{payload['results']['scheduler_metrics']['queue_wait_p95_ms']}/{payload['results']['scheduler_metrics']['queue_wait_max_ms']}",
        f"- Lease conflicts: {payload['results']['scheduler_metrics']['lease_conflict_count']}",
        f"- Stale lease recoveries: {payload['results']['scheduler_metrics']['stale_lease_recovered_count']}",
        "",
        "## Attached Evidence",
        "",
        f"- Phase report: {payload['artifacts']['phase_report_json'] or 'n/a'}",
        f"- Audit files: {len(payload['artifacts']['audit_files'])}",
        f"- Visual artifacts: {len(payload['artifacts']['visual_evidence'])}",
        "",
    ]
    if payload["results"]["failures"]:
        lines.extend(["## Failures", ""])
        for failure in payload["results"]["failures"]:
            lines.append(
                f"- {failure['platform']} / {failure['run']} / {failure['flow'] or 'n/a'}: {failure['result']} ({failure['maestro_out'] or 'no log'})"
            )
        lines.append("")
    OUT_MD.write_text("\n".join(lines) + "\n")


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    payload = build_payload()
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    write_markdown(payload)


if __name__ == "__main__":
    main()
