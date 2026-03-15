# 跨平台实现矩阵（Android / iOS / React Native / Flutter）

本文档用于把“能力定义”映射为“平台可执行基线”，并标注支持等级、限制、fallback 与治理要求。

---

## 1. 支持等级定义

- **Supported**：可稳定用于生产级自动化。
- **Partial**：可用但有明确限制，需要附带 caveat。
- **Unsupported**：当前不提供或仅概念设计。

---

## 2. 能力矩阵（当前仓库基线）

> 说明：本矩阵区分“当前已验证基线”和“目标态”。若与 schema/配置存在差异，以“当前基线”优先。

| 能力域 | Android | iOS | React Native | Flutter | Preconditions | Determinism Tier | Allowed Fallback | Required Scope(示例) | Emitted Telemetry/Artifacts | 关键 Caveat |
|---|---|---|---|---|---|---|---|---|---|---|
| Device/App 生命周期 | Supported | Supported | 复用平台能力（Supported） | 复用平台能力（Android Supported, iOS Partial） | device lease + valid app id | D0 | 无 | install/uninstall/clear-data | lifecycle events, install logs | 设备租约冲突需调度层兜底 |
| UI inspect/query/resolve | Supported | Partial（idb hierarchy 基线） | 复用平台 + debug 补充（Partial+） | 依赖语义质量（Partial） | app foreground + inspect permission | D0 | D1（OCR） | inspect/screenshot | ui tree snapshot, query traces | iOS 与 Flutter 语义覆盖不均 |
| tap/type/wait/flow | Supported | Partial（idb 路径） | 复用平台执行 lane（Partial） | Android Partial，iOS Partial | resolved target + write scope | D0 | D1/D2（有界） | tap/type/swipe | action outcome, attempts, timeline | post-condition 校验必须开启 |
| interruption handling | Supported（规则基线） | Supported（规则基线） | 复用平台 interruption flow | 复用平台 interruption flow | pre/post guard enabled | D0 | D1（未知中断仅证据化） | interrupt / interrupt-high-risk | interruption events, screenshot/tree bundle | 高风险自动处置默认禁用 |
| OCR fallback | 有界支持 | 有界支持 | 有界支持 | 有界支持（更常见） | deterministic fail + policy allow + confidence gate | D1 | D2（仅显式放行） | ocr-action（目标） | OCR output, confidence, fallback trace | 当前 scope 粒度仍在演进 |
| JS debug observability | N/A | N/A | Supported（snapshot 模式） | N/A | Metro inspector reachable + read scope | D0（只读观测） | 无 | js-debug-read（目标） | console/network snapshots | 非 full debugger，不替代执行面 |
| governance/policy guard | Supported | Supported | Supported | Supported | policy profile loaded | N/A | N/A | read-only/interactive/full-control | policy decision logs, audit records | 策略失败需 fail-closed |

---

## 3. 平台关键限制

### Android

- OEM 差异导致弹窗和权限行为碎片化。
- 建议使用 vendor profile 承载差异规则。

### iOS

- 当前仓库以 `idb` 为层级与动作主路径，非 full WDA parity。
- selector 能力边界需对调用方显式暴露。

### React Native

- Debug 能力是 observability lane，不等价于 full debugger。
- 自动化执行仍依赖平台 adapter。

### Flutter

- 语义标签质量决定 deterministic 成功率。
- 对 custom-painted 场景 fallback 频率较高。

---

## 4. 每行能力必须声明的字段

- preconditions
- determinism tier (D0/D1/D2)
- allowed fallback level
- required policy scope
- emitted telemetry/artifacts
- caveats/unsupported

---

## 5. 维护机制

1. 每次工具能力变化同步更新矩阵。
2. 与 `framework-coverage.md`、`capability-map.md` 保持术语一致。
3. 在 PR 中要求“能力变更 -> 文档矩阵变更”联动。
