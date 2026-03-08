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

## 当前最小验证入口

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm validate:dry-run
pnpm mcp:dev -- --platform android --run-count 1
```

## 扩展后的 profile 示例

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --platform android --runner-profile phase1 --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --platform ios --runner-profile native_ios --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --platform android --runner-profile flutter_android --dry-run
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --list-devices --include-unavailable
pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --doctor --include-unavailable
printf '%s\n%s\n' '{"id":1,"method":"initialize"}' '{"id":2,"method":"list_tools"}' | pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/stdio-server.ts
```

## 已验证结果

- `phase1` dry-run：成功解析到 RN sample runner
- `native_ios` dry-run：成功解析到 phase3 native iOS runner，并识别 bundled flows
- `flutter_android` dry-run：成功解析到 phase3 flutter Android runner，并识别 bundled flows
- `native_android` 真实执行：成功触发脚本，但因 `INSTALL_FAILED_VERSION_DOWNGRADE` 返回 `CONFIGURATION_ERROR`
- `native_ios` 指定单个 `flowPath` dry-run：返回 `UNSUPPORTED_OPERATION`，明确提示底层脚本是 bundled flow runner
- `doctor` 实机验证：成功检查 `adb`、`xcrun simctl`、`maestro` 与设备可用性
- `list_devices` 实机验证：成功返回 Android emulator 与 iOS simulators 的结构化清单
- `stdio` 实机验证：成功完成 initialize / list_tools / invoke(doctor) 的 stdin/stdout 往返

## 已知限制

- 当前 adapter 的真实执行仍优先复用现有 shell runner，不是直接重写底层执行逻辑
- `native_ios` 与 `flutter_android` 的底层脚本会执行一组预定义 flows，因此不能假装支持精确单 flow 选择
- 真实执行是否通过仍取决于本机 `maestro`、模拟器、设备、安装包版本和 Expo dev server 等运行环境

## 下一轮建议

- 把 phase3 runner 的环境准备逻辑逐步下沉到 TS，而不是长期留在 shell 里
- 增加 `doctor` / `list_devices`，在执行前提前暴露设备与安装问题
- 再继续补 MCP transport（如 stdio）与更细粒度工具
