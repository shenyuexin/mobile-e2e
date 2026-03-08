# 最小 TS MCP 闭环接入记录

## TS 基线识别结果

- 仓库原先没有根 `package.json`
- 原先没有 workspace 配置
- 原先没有根 `tsconfig.json`
- `packages/mcp-server` 与 `packages/contracts` 只有 TypeScript 骨架，没有可执行 toolchain
- 唯一已接入 TypeScript 的可运行子项目是 `examples/rn-login-demo`（Expo）
- 现有可运行执行链仍是 `scripts/dev/*.sh` + `flows/*` + `scripts/report/*.py`

## 本轮调整

1. 新增仓库级 `pnpm workspace`
2. 新增统一 `tsconfig.base.json`
3. 把 `packages/contracts` 固化为共享强类型边界
4. 把 `packages/adapter-maestro` 落为最小 TS adapter，并复用现有 shell runner
5. 把 `packages/mcp-server` 接到真实 adapter，并提供 `dev-cli.ts`
6. 为 `run_flow` 增加 `runnerProfile`，可选择 `phase1`、`native_android`、`native_ios`、`flutter_android`
7. 新增最小 `doctor` 与 `list_devices` 诊断入口
8. 新增最小 stdio transport 入口
9. 新增最小 install_app 工具
10. 新增最小 launch_app 工具
11. 新增最小 take_screenshot 工具
12. 新增最小 terminate_app 工具
13. 新增最小 inspect_ui 工具
14. 新增最小 tap 工具
15. 新增最小 type_text 工具

## 当前最小验证入口

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm validate:dry-run
pnpm mcp:dev -- --platform android --run-count 1
```

## inspect_ui 查询层最小边界

- `inspect_ui` 继续保留原始 hierarchy + `summary`，不改变现有调用方式
- 新增 `query_ui`，在 Android 上复用同一份 hierarchy 解析后的稳定 node list 做查询
- 当前最小查询条件：`resourceId` / `contentDesc` / `text` / `className` / `clickable`
- 查询结果会返回原始 `node`、`matchedBy`、`score`，以及 `result.totalMatches`
- Android 支持组合过滤；`query.limit` 可限制返回候选数量，但不会改变 `totalMatches`
- iOS 当前仅支持通过 `idb ui describe-all --json --nested` 捕获原始 hierarchy artifact；不伪装等价结构化查询能力

## 扩展后的 profile 示例

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --platform android --runner-profile phase1 --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --platform ios --runner-profile native_ios --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --platform android --runner-profile flutter_android --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --list-devices --include-unavailable
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --doctor --include-unavailable
printf '%s\n%s\n' '{"id":1,"method":"initialize"}' '{"id":2,"method":"list_tools"}' | pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/stdio-server.ts
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --install-app --platform android --runner-profile native_android --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --launch-app --platform android --runner-profile phase1 --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --take-screenshot --platform android --runner-profile phase1 --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --terminate-app --platform android --runner-profile phase1 --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --inspect-ui --platform android --runner-profile phase1 --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --query-ui --platform android --runner-profile phase1 --content-desc "View products" --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --query-ui --platform android --runner-profile phase1 --content-desc "Cart is empty" --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --query-ui --platform android --runner-profile phase1 --resource-id login_button --clickable true --query-limit 5 --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --tap --platform android --runner-profile phase1 --x 900 --y 140 --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --type-text --platform android --runner-profile phase1 --text hello --dry-run
```

## 已验证结果

- `phase1` dry-run：成功解析到 RN sample runner
- `native_ios` dry-run：成功解析到 phase3 native iOS runner，并识别 bundled flows
- `flutter_android` dry-run：成功解析到 phase3 flutter Android runner，并识别 bundled flows
- `native_android` 真实执行：成功触发脚本，但因 `INSTALL_FAILED_VERSION_DOWNGRADE` 返回 `CONFIGURATION_ERROR`
- `native_ios` 指定单个 `flowPath` dry-run：返回 `UNSUPPORTED_OPERATION`，明确提示底层脚本是 bundled flow runner
- `doctor` 实机验证：成功检查 Node/pnpm/Python、`adb`、`xcrun simctl`、`maestro`、flow/policy 文件、launch URL、adb reverse、artifact readiness、install state、install conflict 与设备可用性
- `list_devices` 实机验证：成功返回 Android emulator 与 iOS simulators 的结构化清单
- `stdio` 实机验证：成功完成 initialize / list_tools / invoke(doctor) 的 stdin/stdout 往返
- `install_app` 实机验证：dry-run 成功，真实 Android 安装如实返回 `CONFIGURATION_ERROR` 与人工处理建议
- `launch_app` 实机验证：phase1 Android/iOS dry-run 成功，Android 真实启动成功
- `take_screenshot` 实机验证：Android dry-run 成功，真实截图 artifact 已输出
- `terminate_app` 实机验证：Android dry-run 与真实终止均成功
- `inspect_ui` 实机验证：Android hierarchy dump 成功；iOS 在当前机器上已通过 idb companion 成功返回 raw hierarchy JSON
- `inspect_ui` 现已附带结构化摘要（节点数、可点击节点、sample nodes），便于后续 `tap` / `type_text` 消费
- `query_ui` 现已复用 Android hierarchy dump 解析，支持 `resourceId` / `contentDesc` / `text` / `className` / `clickable` 组合过滤，并返回 `result.totalMatches`、候选 `matches`、每个候选的 `matchedBy` / `score`
- `query_ui` 在 CLI 中既支持 `--query-content-desc` / `--query-text` 这类显式参数，也支持更短的 `--content-desc` / `--resource-id` / `--class-name` / `--clickable`；当入口是 `--query-ui` 时，`--text` 会作为查询文本使用
- 当前 demo Android 页面里的主要可见文案落在 `content-desc`，所以像 `Cart is empty` 这类字符串在本仓库验证时应优先用 `--content-desc`，而不是假设一定出现在 node `text`
- iOS `query_ui` 仅如实返回 partial / unsupported 风格结果：可选地捕获 raw hierarchy artifact，但不会假装已经具备 Android 等价元素查询层
- iOS inspect_ui 走 idb 分支：当前机器已补齐 `idb` CLI + `idb_companion`，并验证成功态；若缺环境时会返回明确的 `CONFIGURATION_ERROR` 与安装建议
- `tap` 实机验证：Android 坐标点击 dry-run 与真实执行均成功
- `type_text` 实机验证：Android 文本输入 dry-run 与真实执行均成功
- `tap_element` 实机验证：Android 已能基于 selector 解析 bounds 并执行真实点击
- `doctor` 现已额外检查 `idb` CLI、`idb_companion` 与 iOS target visibility

## 已知限制

- 当前 adapter 的真实执行仍优先复用现有 shell runner，不是直接重写底层执行逻辑
- `native_ios` 与 `flutter_android` 的底层脚本会执行一组预定义 flows，因此不能假装支持精确单 flow 选择
- 真实执行是否通过仍取决于本机 `maestro`、模拟器、设备、安装包版本和 Expo dev server 等运行环境
- 当前 `query_ui` 仍是“查询层”，但 `tap_element` 已经把 Android 的首个匹配节点解析为 bounds 中心点并执行点击；iOS 仍保持 partial/unsupported。

## 下一轮建议

- 把 phase3 runner 的环境准备逻辑逐步下沉到 TS，而不是长期留在 shell 里
- 增加 `doctor` / `list_devices`，在执行前提前暴露设备与安装问题
- 再继续补 MCP transport（如 stdio）与更细粒度工具

## 当前 doctor 已覆盖

- Node / pnpm / Python / adb / xcrun simctl / maestro 可用性
- sample harness、runner、policy、flow 文件存在性
- Phase1 Expo launch URL 可达性
- Android `adb reverse` 端口映射状态
- phase3 artifact readiness
- native / flutter / iOS install state
- Android 安装冲突信号（downgrade / 签名不兼容）
- Android device state 与 iOS simulator boot status
