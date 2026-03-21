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
