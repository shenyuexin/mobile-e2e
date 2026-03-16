# OpenCode CLI MCP 验证执行记录（2026-03-16）

## 1. 执行范围

按 `docs/delivery/cli-mcp-tool-validation-plan.zh-CN.md` 执行 L0~L4 分层验证，重点覆盖：

- MCP 连通与可调用（OpenCode 用户视角）
- 工具契约稳定性（status/reasonCode/artifacts/data）
- 冒烟与并发稳定性（脚本链路）
- 真实设备样本证据（WordPress Android：crash/perf/policy）

## 2. 执行命令与结果

## L0 连通性

- `opencode mcp list` → `mobile-e2e-mcp: connected`
- `opencode run "Use mobile-e2e-mcp MCP and return first 8 tool names." --agent dev` → 成功返回工具清单

## L1 契约稳定性

- `opencode run "...call describe_capabilities and return JSON only" --agent dev` → 返回结构化 JSON（含 `status/reasonCode/data/artifacts`）
- `pnpm --filter @mobile-e2e-mcp/mcp-server test` → 156/156 通过（含 stdio alias、tool contract、policy deny、reasonCode 断言）

## L2 冒烟

- `pnpm test:smoke` → 通过（dry-run + phase3-samples + concurrent-smoke）

> 备注：首次并行执行时出现租约冲突（并发执行 `opencode run` 与 smoke），串行重跑后通过。

## L3 韧性 / 策略

- 受控失败链路（OpenCode）：
  - `start_session` 成功
  - `tap` 失败（配置错误）
  - `explain_last_failure` 返回 `CONFIGURATION_ERROR`
  - `end_session` 成功
- 策略拒绝链路（dev-cli）：
  - `run_flow` 在 `read-only` 下返回 `POLICY_DENIED`（预期）
  - 审计证据：`artifacts/audit/cli-validation-policy-deny-20260316.json`

## L4 稳定性与实机证据

- `pnpm validate:concurrent-smoke` → `status: ok`
- `RUN_NATIVE_ANDROID=0 RUN_NATIVE_IOS=0 ... pnpm validate:phase3-real-run` → RN iOS 1/1、RN Android 1/1、Flutter Android 2/2
- `APP_ID=org.wordpress.android.prealpha ... pnpm validate:bounded-auto-remediation-real-run`
  - 结果：脚本执行成功并产出 acceptance 报告
  - 当前状态：`result_status=failed`，`stopReason=missing_evidence_window`（attempted=no）

额外样本（WordPress Android）

- Crash signals：`reports/cli-validation-wordpress-crash.json`
- Performance summary：`reports/cli-validation-wordpress-performance/android-native_android.summary.json`
- Policy deny audit：`artifacts/audit/cli-validation-policy-deny-20260316.json`

## 3. 关键证据路径

- `reports/phase-sample-report.json`
- `reports/acceptance-evidence.json`
- `reports/bounded-auto-remediation-acceptance.json`
- `reports/cli-validation-wordpress-crash.json`
- `reports/cli-validation-wordpress-performance/android-native_android.summary.json`
- `artifacts/audit/cli-validation-policy-deny-20260316.json`

## 4. 判定

- L0：PASS
- L1：PASS
- L2：PASS
- L3：PASS（含预期拒绝与失败归因）
- L4：PASS（并发与 real-run 通过）
- bounded auto-remediation：**Conditional**（报告可产出，但当前 stopReason 为 `missing_evidence_window`）

综合结论：**Conditional Go**

原因：核心 MCP 可用性与脚本稳定性已达标；但 auto-remediation 在当前样本下仍存在证据窗口约束，需继续收敛。

## 5. 下一步

1. 将 L3 受控失败链路改为更贴近真实 UI 失败（避免纯配置错误）；
2. 对 WordPress 路径把 bounded auto-remediation 增加前置 evidence-window 断言，降低 `missing_evidence_window` 频率；
3. 连续两轮执行 L0~L4（含不同设备负载）并输出趋势对比。

## 6. 外部最佳实践对齐（MCP 官方/社区）

参考外部建议（MCP conformance、Inspector、负载测试实践）后，本仓库当前状态：

- 已覆盖：
  - 连通性与工具发现（L0）
  - 工具调用与结构化结果（L1）
  - 并发与租约冲突验证（L4）
- 建议补齐：
  1. 增加 JSON-RPC/协议层 conformance 自动化（`@modelcontextprotocol/conformance`）；
  2. 增加 Inspector 手工核对流程（schema 可读性与错误码一致性）；
  3. 增加 session churn/load 测试（高并发下 latency 与 timeout 曲线）。

## 7. 后续修复更新（2026-03-16）

本轮针对“未通过命令”已完成两项修复并复测通过：

1. iOS `record_screen`：修复 adapter 中 iOS 录屏 shell 片段拼接问题（避免 `&;` 语法错误），复测 `reasonCode=OK`。
2. iOS `terminate_app`：修正 Expo appId 大小写为 `host.exp.Exponent`，复测 `reasonCode=OK`。

对应证据：

- `reports/ios-record-fixed.mp4`
- `reports/ios-terminate-fixed.json`

## 8. 全量失败项修复后复测（2026-03-16, 夜间）

为清理 checklist 中剩余 ❌，本轮执行了两条“全量回归主命令”：

1. `pnpm tsx scripts/validate-dry-run.ts`
   - 结果：通过（脚本内覆盖了 query/resolve/wait/scroll/tap_element/type_into_element、failure-analysis、recovery、perf、js-debug 等调用路径与前置链路）。
2. `pnpm --filter @mobile-e2e-mcp/mcp-server test`
   - 结果：`156/156` 通过（包含 stdio alias、tool contract、policy deny、Phase-F lookup、iOS tap/type dry-run 等断言）。

更新结论：

- checklist 中原 ❌ 项已按“正确前置 + 正确参数 + 预期 reasonCode 语义”完成修复并复测；
- 最新状态已同步至 `docs/delivery/cli-mcp-tool-checklist-2026-03-16.zh-CN.md`。

## 9. doctor 可执行安装指引增强（IDB）

为了让用户在“本机未安装 IDB”时能直接修复环境，已增强 `doctor` 的 `nextSuggestions`：

- 当 `idb` / `idb companion` 检查为 `fail/warn`，自动追加安装与自检指令：
  - `pipx install fb-idb`（或 `pip3 install --user fb-idb`）
  - `brew install idb-companion`
  - `which idb && which idb_companion && idb list-targets`
  - 非标准路径下设置 `IDB_CLI_PATH` / `IDB_COMPANION_PATH`

这样用户仅通过 `doctor` 返回信息即可完成环境安装与修复闭环。
