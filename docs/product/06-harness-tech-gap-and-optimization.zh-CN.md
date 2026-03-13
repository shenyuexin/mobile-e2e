# Harness 技术现状分析与优化建议（2026-03）

## 1. 目标与范围

本文用于回答三个问题：

1. 作为一个 **harness 形态的移动端 E2E 开源工具**，当前技术上已经具备了什么；
2. 当前最可能被高频使用的工具/能力有哪些；
3. 还需要补哪些关键能力，优先级如何。

本结论基于三类证据：

- 仓库代码与配置（`packages/*`, `configs/*`, `scripts/*`, `.github/workflows/*`）
- 运行产物统计（`artifacts/actions/*.json`）
- 外部生态趋势调研（Appium / Maestro / Detox / Patrol / 原生栈）

---

## 2. 当前技术基线（已具备能力）

### 2.1 架构与执行链路

- Monorepo 分层清晰：
  - `packages/contracts`：统一类型边界
  - `packages/core`：session / policy / governance / artifact 索引
  - `packages/mcp-server`：40+ MCP tool 网关
  - `packages/adapter-maestro`：核心执行与状态推断
  - `packages/adapter-vision`：OCR fallback
- 执行主链已打通：`start_session -> run_flow/perform_action_with_evidence -> end_session`

### 2.2 稳定性与恢复能力

- 已有 failure taxonomy、retry recommendation tier、bounded auto-remediation。
- `perform_action_with_evidence` 已融合：
  - 失败解释（`explain_last_failure`）
  - 候选排序（`rank_failure_candidates`）
  - 已知修复建议（`suggest_known_remediation`）
  - 有边界恢复（`recover_to_known_state` / `replay_last_stable_path`）

### 2.3 观测与治理

- 证据能力已覆盖：screenshot / ui dump / logs / crash / diagnostics / performance。
- `configs/policies/access-profiles.yaml` 已具备分级权限（read-only / interactive / full-control）。
- `configs/policies/artifact-retention.yaml` 已有 retention + redaction 基线。
- Session audit 产物链路已接入（`artifacts/audit/*.json`）。

### 2.4 CI 与验证

- `ci.yml`：Ubuntu 上跑 build/typecheck/unit/smoke。
- `ocr-smoke.yml`：macOS OCR lane。
- `phase3-real-run.yml` 已存在，且仓库已有多平台 acceptance evidence。

---

## 3. 当前高频工具与使用路径

## 3.1 仓库内动作记录（`artifacts/actions`）

统计样本：2679 条 action 记录（其中 1 条 JSON 损坏）。

- 高频 actionType：
  - `tap_element`: 1504
  - `launch_app`: 849
  - `wait_for_ui`: 325
- 高频 outcome：
  - `partial`: 1505
  - `success`: 985
  - `failed`: 188
- 高频 lowLevelReasonCode：
  - `UNSUPPORTED_OPERATION`: 1503
  - `OK`: 985
  - OCR 相关（`OCR_AMBIGUOUS_TARGET`/`OCR_LOW_CONFIDENCE`）占明显尾部

结论：**“启动 app + 元素点击 + 等待 UI”是当前最核心高频链路**，并且“partial/unsupported”占比偏高，说明跨平台动作语义与后端能力映射仍有提升空间。

### 3.2 从工具定义看高频入口（`stdio-server.ts`）

以 agent/脚本最常见路径看，优先级最高的一组工具是：

- 会话与流程：`start_session`, `run_flow`, `end_session`
- 页面与定位：`inspect_ui`, `query_ui`, `resolve_ui_target`, `wait_for_ui`
- 交互动作：`tap_element`, `type_into_element`, `scroll_and_tap_element`
- 调试恢复：`perform_action_with_evidence`, `explain_last_failure`, `recover_to_known_state`

---

## 4. 与外部生态对比后的关键差距

结合 2025-2026 生态趋势（Appium 3、Maestro、Detox、Patrol、原生 XCUITest/Espresso），当前值得优先补齐的技术缺口如下。

### P0（应优先处理）

1. **并行执行与资源调度能力不足**
   - 现状：执行链路以单 session、串行为主。
   - 风险：难以扩展到多设备矩阵与大规模回归。
   - 建议：引入 worker 池 + session 调度器（按设备类型/runner profile 分片）。

2. **云真机/远端设备农场接入仍弱**
   - 现状：主链路仍偏本地 adb/simctl/idb。
   - 风险：开源用户在 CI 场景下落地成本高，规模受限。
   - 建议：先做统一 Device Provider 接口，落一个云端 provider（Mobitru/BrowserStack 二选一先打通）。

3. **能力-动作映射存在“unsupported”高占比**
   - 现状：历史 action 里 `UNSUPPORTED_OPERATION` 占比非常高。
   - 风险：Agent 决策质量受损，重试成本高。
   - 建议：
     - 对 `tap_element / type_into_element / wait_for_ui` 做 profile-aware capability gating；
     - tool 调用前先返回“可执行性预判 + 替代建议”。

### P1（近期应推进）

4. **设备/应用重置能力不完整**
   - 建议补齐标准动作：clear app data / keychain reset / uninstall-reinstall 组合策略。

5. **录屏与可视化回放证据不足**
   - 目前以截图为主，建议加 screen recording（失败自动截取窗口）。

6. **网络/地理/系统态模拟能力不足**
   - 建议新增 network profile（offline/slow/packet-loss）、location mock、时区/语言切换标准接口。

7. **报告维度偏“单次结果”，缺少趋势分析**
   - 建议补齐 flakiness trend、failure signature heatmap、MTTR 指标。

### P2（中期可形成差异化）

8. **多后端编排（Maestro + Appium + 原生）策略层**
   - 目标：同一 flow 按场景自动路由到更合适后端（deterministic-first + bounded fallback）。

9. **Agent 友好的“执行前风险评估”能力**
   - 在执行前输出：当前 UI 可操作性、冲突风险、建议 action plan。

---

## 5. 需要补充与优化的实施清单（建议版本）

### 5.1 30 天（稳定主链）

- [ ] 新增 `capability preflight`（调用前可执行性检查）
- [ ] 降低 `UNSUPPORTED_OPERATION`：优先改 `tap_element` / `type_into_element` / `wait_for_ui`
- [ ] 修复 artifact 完整性：写后 JSON 校验 + 损坏隔离（已发现 `action-1773194147154.json` 尾损坏）
- [ ] 补一条 macOS + iOS simulator 的定期 real-run lane

### 5.2 60 天（扩展规模）

- [ ] 引入并行 session 调度（最小版：同机多设备并发）
- [ ] 增加 screen recording 证据能力
- [ ] 增加 app reset/clear-data 策略矩阵
- [ ] phase3-real-run 在 self-hosted runner 留痕常态化

### 5.3 90 天（形成开源竞争力）

- [ ] 抽象 Device Provider 并接入一个云真机提供方
- [ ] 完成趋势化报告（flake/failure/latency）
- [ ] 提供“跨框架路由策略”实验能力（Maestro + Appium）

---

## 6. 对“开源 harness”定位的结论

这个项目已经不是“只有蓝图”，而是一个**可执行、可观测、可治理**的移动端 E2E MCP harness 基线。

当前最关键的不是再扩工具数量，而是提升三件事：

1. **执行可扩展性**（并发与设备提供方）
2. **动作成功率与语义稳定性**（降低 unsupported/partial）
3. **工程化可运维性**（真实 CI lane + 趋势化报告 + artifact 可靠性）

若以上 P0/P1 项按节奏推进，项目可以从“样例验证可用”进入“开源团队可持续使用”的阶段。
