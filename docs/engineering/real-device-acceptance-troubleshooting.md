# Real Device Acceptance Workflow 故障排查与修复

## 问题现象

GitHub Actions 页面显示多个 `real-device-acceptance.yml` 运行失败或运行时间异常：

- Run #19-21: 运行时间超过 **1 天**（正常应该在 2-4 小时内）
- Run #20: 仅 12 分钟（可能是快速失败或根本没有运行）
- 定时任务每天 02:00 UTC 触发，但经常无法完成

## 根本原因分析

### 1️⃣ **Self-hosted Runner 依赖**

```yaml
real-run-matrix:
  runs-on: [self-hosted, macOS]
```

**问题**：
- 这个 workflow 需要在你的 Mac 上运行 self-hosted runner
- 如果 runner 不在线、崩溃或失去响应，作业会无限期等待
- 没有 runner 健康检查，无法提前发现问题

**影响**：
- Runner 离线时，scheduled runs 会排队等待
- `cancel-in-progress: false` 导致旧的卡住，新的也排队
- 最终积累成你看到的"运行 1 天+"的异常情况

### 2️⃣ **缺少超时限制**

```yaml
# 修复前：没有 timeout-minutes
real-run-matrix:
  needs: dry-run-baseline
  runs-on: [self-hosted, macOS]
```

**问题**：
- 默认的 GitHub Actions 超时是 6 小时
- 但 self-hosted runner 可能永远不会响应（runner 进程卡死）
- 没有超时保护会导致作业永远挂起

### 3️⃣ **并发控制策略不当**

```yaml
# 修复前
concurrency:
  group: real-device-acceptance-${{ github.ref }}
  cancel-in-progress: false  # ← 这是问题！
```

**问题**：
- `cancel-in-progress: false` 意味着如果一个运行卡住，后续的都会排队
- 每天的 scheduled run 会累积，永远不会清理旧的

## 修复方案

### ✅ 已应用的修复

#### 1. 添加 Runner 健康检查

```yaml
check-runner-health:
  runs-on: [self-hosted, macOS]
  timeout-minutes: 5
  outputs:
    runner-ready: ${{ steps.health.outputs.ready }}
  steps:
    - name: Runner health check
      id: health
      run: |
        echo "Checking runner health..."
        echo "macOS version: $(sw_vers -productVersion)"
        echo "Node: $(node --version 2>/dev/null || echo 'not found')"
        echo "pnpm: $(pnpm --version 2>/dev/null || echo 'not found')"
        echo "Xcode: $(xcode-select -p 2>/dev/null || echo 'not found')"
        echo "✓ Runner is online"
        echo "ready=true" >> "$GITHUB_OUTPUT"
```

**作用**：
- 在运行实际测试前，先检查 runner 是否在线
- 5 分钟超时，快速失败而不是无限等待
- 输出 runner 状态供后续 job 使用

#### 2. 添加超时限制

```yaml
dry-run-baseline:
  needs: check-runner-health
  runs-on: ubuntu-latest
  timeout-minutes: 30  # ← 新增

real-run-matrix:
  needs: dry-run-baseline
  runs-on: [self-hosted, macOS]
  timeout-minutes: 180  # ← 新增：3 小时超时
```

**作用**：
- `dry-run-baseline`（Ubuntu）：30 分钟足够
- `real-run-matrix`（macOS + 真实设备）：3 小时应该足够
- 超时后自动失败，不会永远挂起

#### 3. 优化并发策略

```yaml
concurrency:
  group: real-device-acceptance-${{ github.ref }}
  cancel-in-progress: true  # ← 改为 true
```

**作用**：
- 新的运行会取消旧的运行
- 防止队列堆积
- 保证始终运行最新的代码

## 如何验证修复

### 1. 检查 Runner 状态

在你的 Mac 上运行：

```bash
# 检查 runner 进程是否在运行
ps aux | grep actions-runner

# 如果没在运行，启动它
cd ~/actions-runner  # 或你的 runner 安装路径
./run.sh
```

### 2. 手动触发测试

在 GitHub Actions 页面：
1. 点击 "Run workflow"
2. 选择 `main` 分支
3. 只启用一个平台（例如只开 `run_native_ios: true`）
4. 运行其他设为 `false` 以加快测试
5. 观察是否在合理时间内完成

### 3. 查看 Runner 日志

```bash
# 查看 runner 输出
cd ~/actions-runner/_diag
tail -f Runner_*.log
```

## Self-hosted Runner 设置指南

如果你还没有设置 self-hosted runner：

### 安装步骤

```bash
# 1. 在你的 Mac 上创建目录
mkdir actions-runner && cd actions-runner

# 2. 下载 runner（从 GitHub repo Settings > Actions > Runners）
curl -o actions-runner-osx-arm64-VERSION.tar.gz -L https://github.com/actions/runner/releases/download/vVERSION/actions-runner-osx-arm64-VERSION.tar.gz

# 3. 解压
tar xzf ./actions-runner-osx-arm64-VERSION.tar.gz

# 4. 配置（从 GitHub 获取 URL 和 token）
./config.sh --url https://github.com/shenyuexin/mobile-e2e-mcp --token YOUR_TOKEN

# 5. 启动
./run.sh
```

### 设置为系统服务（推荐）

```bash
# 安装为 launchd 服务
sudo ./svc.sh install

# 启动服务
sudo ./svc.sh start

# 检查状态
sudo ./svc.sh status
```

## 常见问题

### Q: 为什么需要 self-hosted runner？

**A**: 因为需要访问真实的设备：
- Android 模拟器/设备
- iOS Simulator
- iOS 真机（通过 USB）

GitHub-hosted runners 无法提供这些硬件访问。

### Q: 如果我不想维护 self-hosted runner 怎么办？

**A**: 有几个选择：

1. **只在本地运行**：
   ```bash
   pnpm run validate:phase3-real-run
   ```

2. **使用 cloud device farm**：
   - Firebase Test Lab
   - AWS Device Farm
   - BrowserStack

3. **简化 CI 只运行 dry-run**：
   修改 workflow，只运行 `dry-run-baseline` job（不需要 self-hosted runner）

### Q: 运行时间过长怎么排查？

**A**: 检查以下几点：

1. **设备状态**：
   ```bash
   # Android
   adb devices
   emulator -list-avds
   
   # iOS
   xcrun simctl list devices
   ```

2. **清理并重启**：
   ```bash
   # 清理所有模拟器
   xcrun simctl shutdown all
   xcrun simctl erase all
   
   # 重启 ADB
   adb kill-server
   adb start-server
   ```

3. **检查磁盘空间**：
   ```bash
   df -h
   ```

## 后续改进建议

1. **添加设备健康检查**：在测试前检查模拟器/设备是否可用
2. **添加早期失败机制**：某个平台失败时快速失败，不等待超时
3. **添加重试逻辑**：对于偶发性失败（如设备未响应），自动重试 1-2 次
4. **拆分 workflow**：把每个平台拆成独立的 job，可以并行运行
5. **添加通知**：失败时发送 Slack/Discord 通知

## 相关文档

- [GitHub Actions Self-hosted Runners](https://docs.github.com/en/actions/hosting-your-own-runners)
- [Workflow Syntax - timeout-minutes](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idtimeout-minutes)
- [Workflow Syntax - concurrency](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#concurrency)
