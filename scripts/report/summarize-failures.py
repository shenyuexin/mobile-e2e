#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path


REPORT = Path(__file__).resolve().parents[2] / "reports/phase-sample-report.json"

def main() -> None:
    data = json.loads(REPORT.read_text())
    failures = []
    for platform in data.get('platforms', []):
        for run in platform.get('runs', []):
            if run.get('result') != 'PASS':
                failures.append((platform['platform'], run['run'], run.get('maestro_out')))
    if not failures:
        print('No failures recorded in current report.')
        return
    print('Failures:')
    for platform, run, out in failures:
        print(f'- {platform}/{run}: {out}')

if __name__ == '__main__':
    main()
