# Failure-Intelligence Demo（可复现链路）

本页用于展示固定失败智能链路：

`perform_action_with_evidence -> explain_last_failure -> rank_failure_candidates -> suggest_known_remediation`

## 1) 场景与证据来源

- 场景来源：`docs/showcase/android-real-device-demo-run-2026-03-18.md`
- 相关录屏：`artifacts/screen-recordings/m2e-demo-failure-intelligence.mp4`
- 相关结论：同次 run 中，正常页面曾出现中断误报，后续已修复。

## 2) 四步链路（输入示例）

### Step A: perform_action_with_evidence

```json
{
  "name": "perform_action_with_evidence",
  "arguments": {
    "sessionId": "demo-record-android-01",
    "action": {
      "actionType": "wait_for_ui",
      "resourceId": "login_email",
      "timeoutMs": 5000
    }
  }
}
```

### Step B: explain_last_failure

```json
{
  "name": "explain_last_failure",
  "arguments": {
    "sessionId": "demo-record-android-01"
  }
}
```

### Step C: rank_failure_candidates

```json
{
  "name": "rank_failure_candidates",
  "arguments": {
    "sessionId": "demo-record-android-01"
  }
}
```

### Step D: suggest_known_remediation

```json
{
  "name": "suggest_known_remediation",
  "arguments": {
    "sessionId": "demo-record-android-01"
  }
}
```

## 3) 失败样本（结构化摘要）

> 基于 2026-03-18 实机 run 的缩减示例，重点展示可解释链路字段。

### 失败时（perform_action_with_evidence）

```json
{
  "status": "failed",
  "reasonCode": "INTERRUPTION_RESOLUTION_FAILED",
  "sessionId": "demo-record-android-01",
  "artifacts": [
    "artifacts/screen-recordings/m2e-demo-failure-intelligence.mp4",
    "artifacts/sessions/demo-record-android-01.json",
    "artifacts/state-summaries/demo-record-android-01/android-native_android.logs.txt"
  ]
}
```

### 候选归因排序（rank_failure_candidates）

```json
{
  "found": true,
  "candidates": [
    {
      "layer": "interruption",
      "summary": "owner-package-only signal treated normal app screen as interruption",
      "confidence": "high"
    },
    {
      "layer": "ui",
      "summary": "target state not stable yet during interruption check window",
      "confidence": "medium"
    }
  ]
}
```

### 修复建议（suggest_known_remediation）

```json
{
  "found": true,
  "remediation": [
    "Refine interruption signal handling to avoid owner-package-only false positives.",
    "Re-run detect_interruption and confirm detected=false on normal app screens.",
    "Re-execute perform_action_with_evidence on the same session to validate recovery."
  ]
}
```

## 4) 修复后验证

- `perform_action_with_evidence` 在正常页面不再因中断误报失败。
- `detect_interruption` 在正常页面返回 `detected: false`，`reasonCode: INTERRUPTION_UNCLASSIFIED`。

对应记录见：`docs/showcase/android-real-device-demo-run-2026-03-18.md`。
