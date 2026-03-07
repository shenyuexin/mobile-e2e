#!/usr/bin/env python3

from __future__ import annotations

import json
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


class PhaseReport(TypedDict):
    generated_at: str
    phase: str
    samples: list[str]
    platforms: list[PlatformReport]


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_ROOTS = {
    "react-native-ios": ROOT / "artifacts/phase1-ios",
    "react-native-android": ROOT / "artifacts/phase1-android",
    "flutter-android": ROOT / "artifacts/phase3-flutter-android",
    "native-android": ROOT / "artifacts/phase3-native-android",
    "native-ios": ROOT / "artifacts/phase3-native-ios",
}
REPORT_DIR = ROOT / "reports"
JSON_OUT = REPORT_DIR / "phase-sample-report.json"
MD_OUT = REPORT_DIR / "phase-sample-report.md"


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
    return {
        "platform": platform,
        "total_runs": total,
        "passed_runs": passed,
        "pass_rate": round(pass_rate, 4),
        "status": status,
        "runs": runs,
    }


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report: PhaseReport = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "phase": "Phase 2/3 sample validation report",
        "samples": ["rn-login-demo", "mobitru-flutter", "mobitru-native"],
        "platforms": [collect_platform(platform, root) for platform, root in ARTIFACT_ROOTS.items()],
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
