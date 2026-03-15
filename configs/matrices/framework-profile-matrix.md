# Framework Profile Matrix

| Profile | Status | Sample Validated | iOS | Android | Determinism Tier | Allowed Fallback | Key Caveat | Notes |
|---|---|---|---|---|---|---|---|---|
| React Native | validated-sample-baseline | rn-login-demo | yes | yes | D0 (exec) + D0 (debug snapshot) | D1 (OCR, bounded) | Debug lane is observability-only, not full debugger | Expo RN sample with login smoke flow |
| Native | validated-sample-baseline | mobitru-native | yes | yes | D0 | D1 (OCR/CV, bounded) | System UI interruptions require policy rules | Harness flows passed and are now wired into the shared matrix runner/report path |
| Flutter | validated-sample-baseline | mobitru-flutter | no | yes | Android: D0/D1, iOS: Partial | D1 (OCR/CV, bounded) | iOS Flutter not fully folded into unified runner/report path yet | Android harness flows passed; shared runner/report path now includes Android Flutter validation |
