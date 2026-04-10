# UI 稳定时序指南

## 核心原则

**每个影响 UI 的动作之后，都必须等待动画完成，才能执行下一个动作或捕获 UI 状态。**

Android/iOS 的 UI 是事件驱动的：tap、scroll、back 等操作会触发异步动画。如果在动画完成前调用 `uiautomator dump`、`get_screen_summary` 或执行下一个工具，捕获到的将是**旧屏幕的状态**。

## 为什么这是最常见失败根因

真实设备上的两个典型案例：

### 案例 1：scroll_and_resolve_ui_target 找不到元素

- 用户肉眼看到 "About phone" 已经在屏幕上
- 但 `uiautomator dump` 捕获的 View 层级里没有 "About phone"
- **根因**：滑动触摸动作结束后，RecyclerView 的惯性滚动（fling）还在进行中，View 层级尚未更新

### 案例 2：replay_last_stable_path 报 OCR_POST_VERIFY_FAILED

- 设备屏幕确实进入了 Bluetooth 页面
- 但 `get_screen_summary` 捕获到的还是 Settings 首页
- **根因**：tap 后 Activity 转场动画（300-500ms）还没完成就捕获了屏幕，`state_changed` 检查失败

## 推荐等待时间

| 动作类型 | 最小等待时间 | 原因 |
|---------|------------|------|
| `scroll_only` / swipe | 每次滑动后 2000ms | Android RecyclerView fling 在触摸结束后继续 |
| `tap_element`（触发页面跳转） | tap 后 1500ms 再捕获 UI | Activity 转场动画（300-500ms）+ 渲染管线 |
| `navigate_back` | 2000ms | 系统返回动画 + 页面重建 |
| `launch_app` / `terminate_app` | 3000ms | 冷启动或 force-stop + ActivityManager 稳定 |
| `type_into_element` | 2000ms | 软键盘动画 + 搜索结果渲染 |

## Flow 编写最佳实践

### ❌ 错误写法

```yaml
- tap_element: { text: "Bluetooth" }
- resolve_ui_target: { text: "Device name" }  # 页面还没转场就解析
```

### ✅ 正确写法

```yaml
- tap_element: { text: "Bluetooth" }
- wait_for_ui: { text: "Device name", timeoutMs: 5000 }  # 等待页面稳定
- resolve_ui_target: { text: "Device name" }  # 现在解析
```

### 在脚本中的写法

```typescript
// 滑动 — gesture 必填
await invoke("scroll_only", { gesture: { direction: "up" }, count: 5, settleDelayMs: 2000 });
await stabilize(2000);  // 额外等待 View 层级更新

// 精确手势
await invoke("scroll_only", { gesture: { direction: "up", startRatio: 0.82, endRatio: 0.34 }, settleDelayMs: 2000 });

// 验证目标可见
await invoke("wait_for_ui", { text: "About phone", timeoutMs: 3000 });

// 解析目标
await invoke("resolve_ui_target", { text: "About phone" });
```

## 常见失败模式

| 错误码 | 表象 | 实际根因 |
|--------|------|----------|
| `OCR_POST_VERIFY_FAILED` | OCR 验证失败 | tap 后捕获太快，`state_changed=false` |
| `NO_MATCH` | 找不到目标元素 | 滑动后 View 层级未更新 |
| `stateChanged=false` | 屏幕状态未变化 | 动画未完成就捕获了 post-state |
| `partial (TIMEOUT)` | wait_for_ui 超时 | 页面还在加载中，元素尚未渲染 |

## 工具设计原则

`scroll_and_resolve_ui_target` 将"滑动"和"解析"耦合，导致无法独立控制等待时间。新的 `scroll_only` 工具解耦了这两个关注点：

```
scroll_only({ gesture: { direction } }, count, settleDelayMs) → wait_for_ui(target) → resolve_ui_target(target)
```

这给了显式的时序控制权。

## 验证方法

运行探针脚本验证当前时序是否足够：

```bash
npx tsx scripts/dev/android-tool-probe.ts
```

检查报告中 `scroll_only`、`wait_for_ui`、`resolve_ui_target` 是否都返回 `success`。
