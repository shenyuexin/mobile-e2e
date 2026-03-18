# Demo Playbook（Happy Path + 可见中断恢复）

> 面向真机演示，目标是减少走弯路：先跑稳定 Happy Path，再跑可见中断与恢复。

## 1) 当前 Happy Path（已验证）

推荐采用“稳定登录 + 明显滚动 + 加购 + 订单 + 购物车”链路：

1. 启动 App
2. 点击 `Sign in with correct user`（`type_and_login`）
3. 进入首页后**上滑两次并停留**
4. 点击 `Add to cart`
5. 点击底部 `Orders`
6. 点击右上角 `Cart`
7. 验证购物车页出现对应商品

### 一键执行脚本

```bash
pnpm tsx scripts/dev/demo-happy-path-android.ts
```

### 一键录屏脚本（推荐）

```bash
bash scripts/dev/record-demo-happy-path-android.sh
```

### 一键发布脚本（录制 + 归档 + 刷新素材）

```bash
bash scripts/dev/publish-showcase-assets-android.sh
```

该脚本会自动：

1. 录制 Happy Path 与中断恢复视频
2. 生成 `docs/showcase/videos/*.mp4` 的可提交版本
3. 刷新 `docs/showcase/assets/*.png` 关键帧
4. 刷新 README 使用的 GIF 预览图

常用参数（可选）：

- `DEVICE_ID=...`
- `APP_ID=...`
- `DURATION_SECONDS=45`
- `OUT_DIR=artifacts/screen-recordings`
- `PREFIX=m2e-happy-path-record`
- `SESSION_ID=happy-path-record-xxx`

可选环境变量：

- `DEVICE_ID`（默认 `10AEA40Z3Y000R5`）
- `APP_ID`（默认 `com.epam.mobitru`）
- `SESSION_ID`（默认自动生成）

### 对应录屏（更清晰版本）

- `docs/showcase/videos/m2e-happy-path-scroll-pause-40s.mp4`

---

## 2) 你提到的两个现象说明

### A. `Product details screen not implemented` 是什么？

不是权限问题，是 Demo App 业务占位提示。

代码位置：

- `examples/demo-android-app/app/src/main/java/com/epam/mobitru/screens/home/HomeViewModel.kt`

文案由 `sendToast("Product details screen not implemented")` 触发。

### B. 录屏第 6 秒黑屏是什么？

这是设备的 **vivo secure keyboard** 切换瞬间导致的录制黑帧（系统层/输入法层渲染），不是 App 崩溃。

证据：

- 在 `m2e-interaction-demo-slow-30s-v3.mp4` 的约 `5.5s~6.25s` 可抽出连续黑帧；
- 黑帧后紧接着出现 `vivo secure keyboard`；
- 改用 `type_and_login` 路径的完整 Happy Path 录屏没有该黑屏问题。

---

## 3) 真实可见中断 + 恢复（已验证）

采用可控、稳定的中断：**HOME 键把 App 打到后台**。

流程：

1. 启动并进入首页
2. 触发中断：`HOME`
3. 采集中断时屏幕摘要（可看到 launcher）
4. 调 `recover_to_known_state` 回到 App
5. 恢复后继续执行加购动作

### 一键执行脚本

```bash
pnpm tsx scripts/dev/demo-interruption-home-recovery-android.ts
```

### 一键录屏脚本（推荐）

```bash
bash scripts/dev/record-demo-interruption-home-recovery-android.sh
```

常用参数同上（`DEVICE_ID / APP_ID / DURATION_SECONDS / OUT_DIR / PREFIX / SESSION_ID`）。

可选环境变量同上：`DEVICE_ID` / `APP_ID` / `SESSION_ID`。

---

## 4) 录屏建议（减少视觉噪音）

1. 优先录 `type_and_login` 路径（避免输入法黑帧）
2. 录制前清理 App 数据（保证起点一致）
3. 关键动作间加 1~3 秒停留（便于观众看清）
4. Happy Path 与 Interruption 分两个视频，不混在一个片段

---

## 5) README 素材最小清单（当前建议）

1. Happy Path 主视频：`m2e-happy-path-scroll-pause-40s.mp4`（或新脚本生成同类视频）
2. Interruption & Recovery 主视频：`docs/showcase/videos/m2e-interruption-home-recovery-35s.mp4`
3. Interruption & Recovery 复现视频：由 `record-demo-interruption-home-recovery-android.sh` 生成
4. 关键帧 4-6 张（登录页、首页滚动后、加购后、Orders、Cart、中断恢复前后）
5. 一段结构化输出 JSON（脚本 stdout，可直接贴到文档）
6. 两个 GIF 预览：`docs/showcase/assets/happy-preview.gif`、`docs/showcase/assets/interruption-preview.gif`
