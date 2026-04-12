# Probe 脚本作为 CI 质量门禁提案

## 背景

`ios-simulator-tool-probe.ts` 和 `android-tool-probe.ts` 是最直接的端到端验证工具，覆盖了 MCP 工具链的完整调用路径：

- UI 层级解析 → 元素定位 → 点击/输入 → 状态验证 → 错误恢复

当前这些脚本**仅在本地手动运行**，不在 CI 门禁中。这导致 iOS `verifyResolvedPoint` bug 直到用户手动 probe 才被发现。

## 提案

### Phase 1：Dry-run 门禁（立即启用）

在 PR gate CI 中添加 probe dry-run 检查，验证：
- 脚本可执行、无编译错误
- 工具调用链结构正确
- 不需要真实设备/模拟器

```yaml
# .github/workflows/ci.yml (新增 job)
probe-dry-run:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v5
    - run: pnpm install --frozen-lockfile
    - run: pnpm build
    # Validate probe scripts compile and can be invoked
    - name: Validate iOS probe structure
      run: pnpm tsx scripts/dev/ios-simulator-tool-probe.ts --dry-run 2>&1 || true
    - name: Validate Android probe structure
      run: pnpm tsx scripts/dev/android-tool-probe.ts --dry-run 2>&1 || true
```

**成本**：< 1 分钟，无设备依赖
**收益**：捕获编译错误、导入错误、工具签名变更

### Phase 2：Unit test 回归（立即启用）

在 `packages/adapter-maestro/test/` 中为 probe 覆盖的关键路径添加单元测试：

- ✅ **已完成**：`verifyTypedIosPostconditionWithHooks` 根节点 bug 回归测试
- ✅ **已完成**：`parseUiBounds` 负数/浮点数支持测试
- 📋 **待添加**：`findNodeAtPoint` 多节点层级测试
- 📋 **待添加**：Android 对应的坐标验证修复（如果有）

```bash
# 当前测试状态
pnpm --filter @mobile-e2e-mcp/adapter-maestro test
# → 499 tests, 0 failures ✅
```

### Phase 3：模拟器 Smoke 测试（可选，按需启用）

在 nightly 或 release 前运行，需要 macOS runner + iOS Simulator：

```yaml
# .github/workflows/nightly.yml
ios-simulator-smoke:
  runs-on: macos-latest
  steps:
    - uses: actions/checkout@v5
    # ... setup ...
    - name: Boot iOS Simulator
      run: |
        xcrun simctl boot "iPhone 16" || true
        xcrun simctl launch booted com.apple.Preferences || true
    - name: Run iOS simulator probe
      run: pnpm tsx scripts/dev/ios-simulator-tool-probe.ts
      env:
        M2E_DEVICE_ID: "$(xcrun simctl list devices json | jq -r '.devices[\"com.apple.CoreSimulator.SimRuntime.iOS-18-0\"][] | select(.name==\"iPhone 16\") | .udid')"
      timeout-minutes: 15
```

**成本**：~10-15 分钟，需要 macOS runner
**收益**：真实设备上的端到端验证

## 当前测试覆盖状态

| 组件 | 测试数 | 覆盖率 | Probe 脚本 |
|------|--------|--------|-----------|
| adapter-maestro | 499 | ✅ | ❌ 未集成 |
| mcp-server | 261 | ✅ | ❌ 未集成 |
| core | - | ✅ | ❌ 未集成 |

## 实施检查清单

- [ ] Phase 1: 添加 dry-run CI job（PR gate）
- [ ] Phase 2: 完成 `findNodeAtPoint` 单元测试
- [ ] Phase 2: 审查其他平台的类似 bug（Android 是否有 `nodes[0]` 问题？）
- [ ] Phase 3: 配置 nightly workflow（可选）
- [ ] 文档：更新 CONTRIBUTING.md 说明 probe 脚本用途

## 故障排查指南

当 probe 脚本在 CI 中失败时：

1. **区分 dry-run vs real-run 失败**
   - dry-run 失败：代码结构问题（编译、导入、工具签名）
   - real-run 失败：设备/模拟器问题

2. **本地复现**
   ```bash
   # iOS
   pnpm tsx scripts/dev/ios-simulator-tool-probe.ts
   
   # Android
   pnpm tsx scripts/dev/android-tool-probe.ts
   ```

3. **常见失败原因**
   - 模拟器未启动 → `xcrun simctl boot "iPhone 16"`
   - App 未安装 → `adb install` / `xcrun simctl install booted`
   - UI 层级变化 → 更新 probe 脚本中的 selector
   - 工具签名变更 → 更新 contracts 和实现

## 相关文档

- [iOS Simulator Tool Probe 故障排查](./real-device-acceptance-troubleshooting.md)
- [NPM 发版与 Git Tag 关联规范](./npm-release-and-git-tagging.zh-CN.md)
- [AI-First 能力扩展指南](./ai-first-capability-expansion-guideline.md)
