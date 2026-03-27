# NPM 发版与 Git Tag 关联规范（@shenyuexin/mobile-e2e-mcp）

## 目标

确保每一次 NPM 发版都具备可追溯的 GitHub Tag、Release 与 CHANGELOG，实现：

1. NPM 版本 ↔ Git Tag 一一对应
2. 发版过程可审计、可回放
3. 降低人工漏打 tag/错打 tag 风险
4. 让 CHANGELOG 按 tag diff 自动补齐，减少手工维护
5. 让 `repomix-output.xml` 随 release commit 一起刷新，保持 AI 入口快照与 tag 对齐

## 统一约定

- 包名：`@shenyuexin/mobile-e2e-mcp`
- 包路径：`packages/mcp-server`
- Tag 格式：`mcp-server-v<semver>`（示例：`mcp-server-v0.1.5`）
- 发版入口：**仅通过 tag 触发 GitHub Actions 自动发布**

> 不再建议本地直接 `pnpm publish` 作为正式发布路径。

## 机制设计

### 1) 元数据关联（npm 页面展示 GitHub）

已在 `packages/mcp-server/package.json` 中声明：

- `repository`
- `homepage`
- `bugs`

这样 npm 页面会自动关联到 GitHub 仓库与 issue 地址。

### 2) 自动化发布（Tag 驱动）

工作流文件：`.github/workflows/release-mcp.yml`

触发条件：

- `push` 到 tag：`mcp-server-v*`

执行流程：

1. 安装依赖
2. 校验 tag 与 `packages/mcp-server/package.json` 版本完全一致
3. 根据“上一个 MCP tag -> 当前 tag”的 commit diff 自动生成/更新 `CHANGELOG.md` 中该版本节
4. 再次校验 tag / package version / changelog 三者一致
5. 将同步后的 `CHANGELOG.md` 回写到默认分支
6. 同步生成最新 `repomix-output.xml` 并与 release 元数据一起回写默认分支
7. 构建打包
8. 发布到 npm（使用 `NPM_TOKEN`）
9. 创建 GitHub Release

### 3) Public Docs 漂移检查（非阻塞）

原则：**不是每个 tag 都必须更新 README，但每个对外可见能力变更都必须有公共文档落点**。

对于 AI / 用户调用方式相关变化，默认应优先检查 canonical invocation guide，而不是把相同说明复制到多篇文档中：

- `docs/guides/ai-agent-invocation.zh-CN.md`（调用真相源）
- `docs/guides/golden-path.md`（首跑前门）
- `docs/guides/flow-generation.md`（录制 / 导出 / 回放专题）

建议按三层执行：

1. **PR 阶段（主关口）**
   - 对外可见变化（能力边界、工具目录、命令入口、支持平台、发布流程）应在 PR 内同步文档。
   - 若变化影响 AI / 用户调用方式，优先更新 `docs/guides/ai-agent-invocation.zh-CN.md`；专题变化再更新对应 topic guide。
   - README / `docs/README.md` 更适合作为入口导航，不应承担完整调用流程的重复维护。
2. **`release:mcp:prepare-tag` 阶段（二次确认）**
    - 在发版前做一次“自上个 MCP tag 以来的对外变化”清单核对，确认是否存在 public docs 漂移。
    - 如果命中了 tool surface / capability boundary 变化，但 canonical invocation guide / public docs 没有同步，本地 `release:mcp:check` 与 tag workflow 应直接失败，而不是仅 warning。
3. **Tag workflow 阶段（兜底提醒）**
    - 仍可保留 notice，但对 capability-governed release range 的 doc-sync 缺失不再放行 npm publish。

建议触发条件（命中任一目录时，优先检查文档是否需要同步；这些是高概率触发器，不代表“命中就必须改文档”）：

- `packages/mcp-server/src/server.ts`（工具暴露面）
- `packages/mcp-server/src/tools/**`（工具行为与推荐调用路径）
- `packages/contracts/**`（契约/Schema 变更）
- `configs/profiles/**`、`configs/policies/**`（支持边界/治理策略）
- `docs/guides/ai-agent-invocation.zh-CN.md`、`docs/guides/golden-path.md`、`docs/guides/flow-generation.md`（调用入口与专题指南）
- `docs/architecture/**`（对外架构叙事变化）
- `.github/workflows/release-mcp.yml`、`scripts/release/**`（发版自动化流程变化）
- `packages/mcp-server/package.json` 中影响安装/发布/仓库关联的元数据字段

常见可豁免场景：

- 纯内部重构（无行为变化）
- 测试/脚手架调整且不影响外部用法
- 仅修复拼写、格式、注释

> 实践建议：将“public docs / canonical invocation guide 是否需要更新”作为 release checklist 固定项，而不是把它设计成强制失败门禁。

> Phase 03 更新：对于 capability-governed release range，这一项现在应视为强制失败门禁，而不是纯提示项。

## 标准操作流程（推荐）

### 一条命令完成准备 + 推送 tag

```bash
pnpm release:mcp:prepare-tag patch
# 可选: patch | minor | major
```

该脚本会自动执行：

1. 检查工作区必须干净
2. 更新 `@shenyuexin/mobile-e2e-mcp` 版本（不自动打默认 v tag）
3. 根据“上一个 MCP tag -> 当前待发版版本”的 commit diff 自动生成/更新 `CHANGELOG.md`
4. 生成最新 `repomix-output.xml`，让仓库级 AI 快照与本次待发布代码一致
5. 校验 changelog / package version / tag 三者一致
6. 运行 `pnpm build`、`pnpm typecheck`、`pnpm test:mcp-server`
7. 提交版本变更（含 `CHANGELOG.md` 与 `repomix-output.xml`）
8. 创建并推送规范 tag：`mcp-server-v<version>`
9. 推送分支与 tag，触发 GitHub Actions 自动发包

## 现在的推荐流程（你只需要关心 tag）

### 方案 A：本地标准发版（推荐）

```bash
pnpm release:mcp:prepare-tag patch
```

特点：

- 自动更新版本号
- 自动生成该版本 changelog
- 自动提交并推 tag

### 方案 B：你只负责发 tag（机制补 changelog）

如果你已经手动创建并推送了 `mcp-server-v<version>`：

- GitHub Actions 会自动：
  1. 按“上一个 tag -> 当前 tag”生成该版本 changelog
  2. 把 `CHANGELOG.md` 与最新 `repomix-output.xml` 一起回写到默认分支
  3. 再继续 npm publish

也就是说，**以后不要求你手工先写 `CHANGELOG.md`，也不需要手工刷新 `repomix-output.xml`**。

### 单独校验/同步发版元数据

在需要时，也可以单独执行：

```bash
pnpm release:mcp:check
pnpm release:mcp:sync-changelog -- --tag mcp-server-v0.1.5
```

它们分别会：

1. `release:mcp:check`
   - 校验 `packages/mcp-server/package.json` 版本存在
   - 校验 `CHANGELOG.md` 中存在对应版本节
   - 校验该版本节不是空的
2. `release:mcp:sync-changelog`
   - 根据 tag diff 自动生成/刷新该版本 changelog

## 仓库管理员一次性配置

在 GitHub 仓库 Secrets 中设置：

- `NPM_TOKEN`：具备 publish 权限的 npm token

## 回滚与应急

若 tag 推送后 CI 发布失败：

1. 修复代码后重新走一次版本升级（不能复用已发布版本号）
2. 生成新版本与新 tag（例如 `0.1.5` 失败后发 `0.1.6`）

若 npm 已发布但发现问题：

1. 优先发布修复版本（patch）
2. 避免依赖 `unpublish` 作为常规手段
