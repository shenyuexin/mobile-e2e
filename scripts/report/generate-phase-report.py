#!/usr/bin/env python3

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import TypedDict


class RunResult(TypedDict):
    run: str
    flow: str | None
    result: str
    maestro_out: str | None
    final_image: str | None


class PlatformReport(TypedDict):
    platform: str
    total_runs: int
    passed_runs: int
    pass_rate: float
    status: str
    runs: list[RunResult]
    scheduler_metrics: dict[str, float | int]


class PhaseReport(TypedDict):
    generated_at: str
    phase: str
    samples: list[str]
    platforms: list[PlatformReport]


ROOT = Path(__file__).resolve().parents[2]
PHASE2_RN_ANDROID_ROOT = Path(
    os.environ.get("PHASE2_RN_ANDROID_ARTIFACT_ROOT", str(ROOT / "artifacts/phase2-rn-android"))
)
ARTIFACT_ROOTS = {
    "react-native-ios": ROOT / "artifacts/phase1-ios",
    "react-native-android": PHASE2_RN_ANDROID_ROOT if PHASE2_RN_ANDROID_ROOT.exists() else ROOT / "artifacts/phase1-android",
    "flutter-android": ROOT / "artifacts/phase3-flutter-android",
    "native-android": ROOT / "artifacts/phase3-native-android",
    "native-ios": ROOT / "artifacts/phase3-native-ios",
}
PLATFORM_SAMPLES = {
    "react-native-ios": "rn-login-demo",
    "react-native-android": "rn-login-demo",
    "flutter-android": "mobitru-flutter",
    "native-android": "mobitru-native",
    "native-ios": "mobitru-native",
}
REPORT_DIR = ROOT / "reports"
JSON_OUT = REPORT_DIR / "phase-sample-report.json"
MD_OUT = REPORT_DIR / "phase-sample-report.md"


def selected_artifact_roots() -> dict[str, Path]:
    requested = os.environ.get("PHASE_REPORT_PLATFORMS")
    if not requested:
        return ARTIFACT_ROOTS

    selected: dict[str, Path] = {}
    for platform in [item.strip() for item in requested.split(",") if item.strip()]:
        root = ARTIFACT_ROOTS.get(platform)
        if root is not None:
            selected[platform] = root
    return selected if selected else ARTIFACT_ROOTS


def collect_platform(platform: str, root: Path) -> PlatformReport:
    runs: list[RunResult] = []
    if not root.exists():
        return {
            "platform": platform,
            "total_runs": 0,
            "passed_runs": 0,
            "pass_rate": 0.0,
            "status": "NO_DATA",
            "runs": [],
            "scheduler_metrics": {
                "queue_wait_p50_ms": 0,
                "queue_wait_p95_ms": 0,
                "queue_wait_max_ms": 0,
                "lease_conflict_count": 0,
                "stale_lease_recovered_count": 0,
            },
        }

    for run_dir in sorted(p for p in root.glob("run-*") if p.is_dir()):
        result_file = run_dir / "result.txt"
        maestro_out = run_dir / "maestro.out"
        result = result_file.read_text().strip() if result_file.exists() else "MISSING"
        runs.append(
            {
                "run": run_dir.name,
                "flow": (run_dir / "flow.txt").read_text().strip() if (run_dir / "flow.txt").exists() else None,
                "result": result,
                "maestro_out": str(maestro_out.relative_to(ROOT)) if maestro_out.exists() else None,
                "final_image": str((run_dir / "final.jpg").relative_to(ROOT)) if (run_dir / "final.jpg").exists() else None,
            }
        )

    total = len(runs)
    passed = sum(1 for run in runs if run["result"] == "PASS")
    pass_rate = 0.0 if total == 0 else passed / total
    status = "NO_DATA" if total == 0 else ("GO" if pass_rate >= 0.95 else "NO_GO")
    scheduler_metrics = collect_scheduler_metrics(platform)
    return {
        "platform": platform,
        "total_runs": total,
        "passed_runs": passed,
        "pass_rate": round(pass_rate, 4),
        "status": status,
        "runs": runs,
        "scheduler_metrics": scheduler_metrics,
    }


def collect_scheduler_metrics(platform: str) -> dict[str, float | int]:
    audit_root = ROOT / "artifacts" / "audit"
    if not audit_root.exists():
        return {
            "queue_wait_p50_ms": 0,
            "queue_wait_p95_ms": 0,
            "queue_wait_max_ms": 0,
            "lease_conflict_count": 0,
            "stale_lease_recovered_count": 0,
        }

    queue_wait_values: list[int] = []
    lease_conflicts = 0
    stale_recoveries = 0
    for audit_file in audit_root.glob("*.json"):
        try:
            payload = json.loads(audit_file.read_text())
        except json.JSONDecodeError:
            continue
        if payload.get("platform") != platform:
            continue
        scheduler = payload.get("scheduler_metrics")
        if not isinstance(scheduler, dict):
            continue
        queue_wait = scheduler.get("queue_wait_ms")
        if isinstance(queue_wait, dict):
            max_wait = queue_wait.get("max")
            if isinstance(max_wait, (int, float)):
                queue_wait_values.append(int(max_wait))
        lease_conflicts += int(scheduler.get("lease_conflicts", 0) or 0)
        stale_recoveries += int(scheduler.get("stale_recoveries", 0) or 0)

    queue_wait_values.sort()
    if queue_wait_values:
        p50_index = max(0, min(len(queue_wait_values) - 1, (len(queue_wait_values) * 50 + 99) // 100 - 1))
        p95_index = max(0, min(len(queue_wait_values) - 1, (len(queue_wait_values) * 95 + 99) // 100 - 1))
        p50_value = queue_wait_values[p50_index]
        p95_value = queue_wait_values[p95_index]
        max_value = queue_wait_values[-1]
    else:
        p50_value = 0
        p95_value = 0
        max_value = 0

    return {
        "queue_wait_p50_ms": p50_value,
        "queue_wait_p95_ms": p95_value,
        "queue_wait_max_ms": max_value,
        "lease_conflict_count": lease_conflicts,
        "stale_lease_recovered_count": stale_recoveries,
    }


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    artifact_roots = selected_artifact_roots()
    report: PhaseReport = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "phase": os.environ.get("PHASE_REPORT_PHASE", "Phase 2/3 sample validation report"),
        "samples": sorted({PLATFORM_SAMPLES[platform] for platform in artifact_roots if platform in PLATFORM_SAMPLES}),
        "platforms": [collect_platform(platform, root) for platform, root in artifact_roots.items()],
    }

    _ = JSON_OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    lines = [
        "# Sample Phase Report",
        "",
        f"Generated at: {report['generated_at']}",
        "",
        "| Platform | Passed | Total | Pass Rate | Status |",
        "|---|---:|---:|---:|---|",
    ]
    for platform in report["platforms"]:
        lines.append(
            f"| {platform['platform']} | {platform['passed_runs']} | {platform['total_runs']} | {platform['pass_rate']:.0%} | {platform['status']} |"
        )
    lines.extend(["", "## Scheduler Metrics", ""])
    lines.append("| Platform | Queue p50 ms | Queue p95 ms | Queue max ms | Lease conflicts | Stale recoveries |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for platform in report["platforms"]:
        metrics = platform["scheduler_metrics"]
        lines.append(
            f"| {platform['platform']} | {metrics['queue_wait_p50_ms']} | {metrics['queue_wait_p95_ms']} | {metrics['queue_wait_max_ms']} | {metrics['lease_conflict_count']} | {metrics['stale_lease_recovered_count']} |"
        )
    lines.extend(["", "## Run Details", ""])
    for platform in report["platforms"]:
        lines.append(f"### {platform['platform']}")
        lines.append("")
        for run in platform["runs"]:
            run_label = run["run"]
            if run["flow"]:
                run_label = f"{run_label} [{run['flow']}]"
            lines.append(
                f"- {run_label}: {run['result']} (out: {run['maestro_out'] or 'n/a'}, image: {run['final_image'] or 'n/a'})"
            )
        lines.append("")
    _ = MD_OUT.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
