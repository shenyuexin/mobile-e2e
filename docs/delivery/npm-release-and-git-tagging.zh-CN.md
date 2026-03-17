# NPM 发版与 Git Tag 关联规范（@shenyuexin/mobile-e2e-mcp）

## 目标

确保每一次 NPM 发版都具备可追溯的 GitHub Tag 与 Release，实现：

1. NPM 版本 ↔ Git Tag 一一对应
2. 发版过程可审计、可回放
3. 降低人工漏打 tag/错打 tag 风险

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
3. 构建打包
4. 发布到 npm（使用 `NPM_TOKEN`）
5. 创建 GitHub Release

## 标准操作流程（推荐）

### 一条命令完成准备 + 推送 tag

```bash
pnpm release:mcp:prepare-tag patch
# 可选: patch | minor | major
```

该脚本会自动执行：

1. 检查工作区必须干净
2. 更新 `@shenyuexin/mobile-e2e-mcp` 版本（不自动打默认 v tag）
3. 运行 `pnpm build`、`pnpm typecheck`、`pnpm test:mcp-server`
4. 提交版本变更
5. 创建并推送规范 tag：`mcp-server-v<version>`
6. 推送分支与 tag，触发 GitHub Actions 自动发包

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
