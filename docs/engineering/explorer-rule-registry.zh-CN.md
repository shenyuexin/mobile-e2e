# Explorer Rule Registry 配置与报告指南

## 1. 目的

Explorer rule registry 把遍历中的“跳过、采样、门控、延后执行”决策集中成可配置、可报告的规则。目标不是改变 DFS 执行模型，而是让用户和 AI agent 能回答：

- 哪些页面不会继续展开？
- 哪些元素会被跳过或延后？
- 哪条规则触发了该决策？
- 如何在不改 TypeScript 的情况下覆盖默认行为？

## 2. 规则字段

规则放在 `.explorer-config.json` 的 `rules` 字段中，也可以通过 CLI 的 `--config <path>` 加载同样结构的 JSON 文件。Phase 28 不新增单独的 `--rules` 参数，避免引入第二套优先级。

```json
{
  "rules": {
    "version": 1,
    "defaults": {
      "includeBuiltIns": true,
      "disabledRuleIds": []
    },
    "rules": [],
    "overrides": []
  }
}
```

每条规则至少包含：

| 字段 | 说明 |
|---|---|
| `id` | 稳定 rule ID，例如 `project.skip.checkout`。报告和 overrides 都依赖它。 |
| `category` | 规则类别，例如 `page-skip`、`element-skip`、`sampling`、`stateful-form`。 |
| `action` | 决策动作，例如 `gate-page`、`skip-element`、`sample-children`。 |
| `reason` | 人类可读原因，会进入 `summary.json` / `report.md`。 |
| `match` | 匹配条件，如 `screenTitlePattern`、`elementLabelPattern`、`pathPrefix`。 |

可选字段包括 `priority`、`enabled`、`source`、`recoveryMethod`、`supportLevel`、`caveat` 和 `sampling`。

## 3. 类别与动作

### 3.1 category

- `page-skip`：页面级跳过/门控。
- `element-skip`：元素级跳过。
- `sampling`：高扇出页面采样。
- `page-context`：基于 deterministic page context 的门控。
- `risk-pattern`：破坏性或高风险动作。
- `navigation-control`：返回、标题、系统导航类控件。
- `side-effect`：下载、安装、外链等副作用动作。
- `low-value-content`：帮助、FAQ、关于、法律信息等低价值叶子内容。
- `auth-boundary`：登录、账号、受保护区域。
- `system-dialog`：系统弹窗/权限面。
- `stateful-form`：新增/选择账号、地址、支付方式等有状态表单入口。
- `external-app`：外部 app / owner package 边界。

### 3.2 action

- `skip-page`：页面不进入或不展开。
- `gate-page`：记录已到达，但不继续展开，并按 `recoveryMethod` 返回。
- `skip-element`：候选元素不点击。
- `sample-children`：只验证代表性子元素。
- `defer-action`：把动作视为导航/副作用控制，不作为普通内容遍历。
- `defer-to-heuristic`：交给兼容启发式处理。
- `allow`：显式允许，通常配合策略或后续覆盖使用。

## 4. 优先级与兼容性

有效 registry 构建顺序：

1. 默认内置规则（除非 `rules.defaults.includeBuiltIns === false`）。
2. legacy 字段适配：`samplingRules`、`skipPages`、`skipElements`、`blockedOwnerPackages`、`destructiveActionPolicy`、`statefulFormPolicy`。
3. project rules：`rules.rules`。
4. overrides：`rules.overrides`。
5. 最后移除 `rules.defaults.disabledRuleIds` 中的规则。

兼容原则：Phase 28 保留 legacy 字段；新项目建议把新规则写进 `rules.rules`，旧字段仍会被适配成 rule registry 输入。

## 5. 配置示例

### 5.1 跳过支付/结账页

```json
{
  "rules": {
    "version": 1,
    "rules": [
      {
        "id": "project.skip.checkout-pages",
        "category": "page-skip",
        "action": "gate-page",
        "reason": "结账页面超出本轮探索范围",
        "match": { "screenTitlePattern": "Checkout|Payment|Billing" },
        "recoveryMethod": "backtrack-cancel-first"
      }
    ]
  }
}
```

### 5.2 跳过退出/删除元素

```json
{
  "rules": {
    "version": 1,
    "rules": [
      {
        "id": "project.skip.logout-delete",
        "category": "element-skip",
        "action": "skip-element",
        "reason": "无人值守探索不执行退出或删除操作",
        "match": { "elementLabelPattern": "Sign Out|Log Out|Delete|Remove" }
      }
    ]
  }
}
```

### 5.3 关闭内置 Fonts smoke 采样

```json
{
  "rules": {
    "version": 1,
    "defaults": {
      "disabledRuleIds": ["default.ios.fonts.system-fonts.smoke-sampling"]
    }
  }
}
```

### 5.4 添加项目级采样规则

```json
{
  "rules": {
    "version": 1,
    "rules": [
      {
        "id": "project.sample.country-list.smoke",
        "category": "sampling",
        "action": "sample-children",
        "reason": "国家列表在 smoke 模式只验证代表项",
        "match": {
          "pathPrefix": ["Settings", "Region", "Country"],
          "mode": "smoke"
        },
        "sampling": {
          "strategy": "representative-child",
          "maxChildrenToValidate": 1,
          "excludeActions": ["Download|Install"]
        }
      }
    ]
  }
}
```

### 5.5 阻断外部 owner package

```json
{
  "blockedOwnerPackages": ["com.bbk.account"],
  "rules": {
    "version": 1,
    "rules": [
      {
        "id": "project.gate.external-account",
        "category": "external-app",
        "action": "gate-page",
        "reason": "账号中心属于外部应用边界",
        "match": { "ownerPackage": "com.example.account" },
        "recoveryMethod": "backtrack-cancel-first"
      }
    ]
  }
}
```

### 5.6 受控沙箱允许破坏性动作

```json
{
  "destructiveActionPolicy": "allow",
  "rules": {
    "version": 1,
    "defaults": {
      "disabledRuleIds": ["default.risk.destructive-actions"]
    }
  }
}
```

仅在可重置、无真实用户数据的 sandbox 环境中使用该配置。

## 6. 校验与安全边界

配置加载会校验：

- rule `id` 必须存在。
- `category` / `action` 必须是已知枚举值；错误会导致 config load 失败。
- regex 字段必须可编译；无效 regex 会产生 warning，matcher 会安全地当作不匹配处理。
- `disabledRuleIds` 指向未知规则时产生 warning，但不阻止运行。

无效 regex 不会在遍历期间抛异常；这是为了避免用户配置错误导致无人值守运行中断。

## 7. 报告解读

`summary.json` 现在包含：

- `pages[].ruleDecision`：页面级门控/采样/跳过决策。
- `ruleDecisions.total`：本轮记录到的规则决策数量。
- `ruleDecisions.byRuleId`：按 rule ID 聚合。
- `ruleDecisions.byCategory`：按类别聚合。
- `ruleDecisions.byAction`：按动作聚合。
- `ruleDecisions.examples`：最多 10 条示例，方便 AI agent 快速解释。

`report.md` 会出现 `## Rule Decisions` 表格，展示 rule ID、category、action、示例页面/元素和原因。

旧字段仍保留：

- `stoppedByPolicy`：兼容既有报告读取方式。
- `ruleFamily`：兼容既有 page-context / heuristic 分类。
- `sampling`：保留高扇出采样详情，例如 explored/skipped labels。

## 8. 默认行为与支持边界

默认规则是 deterministic-first 的配置层表达：优先使用 path、title、owner package、page context、element label 等可解释信号。它不会把 OCR/CV 或概率分类变成默认路径。

平台成熟度应按规则的 `supportLevel` 和 `caveat` 解读。iOS Fonts smoke sampling 是已有证据驱动的默认规则；Android/iOS 真机上的高扇出采样仍需要各自 acceptance 证明。

更多高扇出列表背景见：[`explorer-high-fanout-list-sampling.zh-CN.md`](./explorer-high-fanout-list-sampling.zh-CN.md)。
