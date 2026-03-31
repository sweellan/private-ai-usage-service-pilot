# Remote Deploy Sync v1

## 目标
- 将本地已截图验收通过的 private usage dashboard 布局更新同步到远端 OpenClaw 承载服务。
- 保持现有 runtime / systemd / nginx 拓扑不变，只替换必要代码。
- 完成远端服务重启、HTML 校验和远端真实渲染截图校验。

## 实际部署模型
- gateway bridge:
  - 用于桥接能力确认与 health check
  - confirmed command:
    - `OPENCLAW_BRIDGE_HOST=vm-0-8-opencloudos-1.taild8d161.ts.net ~/.codex/skills/openclaw-gateway-bridge/scripts/openclaw_gateway_bridge.sh exec ssh gateway health --json`
- SSH:
  - 作为本轮真正部署入口
  - 主机：`root@vm-0-8-opencloudos-1.taild8d161.ts.net`
  - key：`~/.ssh/openclaw_bridge_ed25519`

## 远端目标
- deployed code path:
  - `/root/ai-usage-private-service`
- updated file:
  - `/root/ai-usage-private-service/lib/private_usage_service.mjs`
- unchanged but checked:
  - `/root/ai-usage-private-service/run_supabase_private_usage_service.mjs`
  - `/root/ai-usage-private-service/.env.local`
- service unit:
  - `ai-usage-private.service`
- reverse proxy:
  - `/etc/nginx/conf.d/doubao-ngrok-subpath.conf`

## 备份
- remote backup:
  - `/root/ai-usage-private-service/lib/private_usage_service.mjs.bak_20260331_2344`

## 本轮动作
1. 用 `openclaw-gateway-bridge` 确认 gateway health 正常。
2. 通过 SSH 盘点远端部署目录、`systemd` unit 和 `nginx` 子路径。
3. 发现只有 `lib/private_usage_service.mjs` 与本地版本不一致。
4. 先备份远端旧文件，再用 `scp` 覆盖远端 service file。
5. 重启 `ai-usage-private.service`。
6. 通过公网管理员登录抓取 HTML，确认新标记已上线。
7. 通过 SSH tunnel 把远端 `127.0.0.1:3027` 映到本地 `127.0.0.1:43027`，对远端真实 admin 页完成截图。
8. 发现 team 初始态默认落在全量 75 周期窗口，导致图表标签挤爆；继续修正默认窗口与 X 轴标签密度后，再次同步远端并复截图。

## 校验结果
- remote file hash:
  - local `lib/private_usage_service.mjs`: `5a99369b075b1f216c411dad6297f75b01e015c3c0d376fb41694a11b468778b`
  - remote deployed file after sync: same hash
- service status:
  - `systemctl is-active ai-usage-private.service` => `active`
- public HTML markers confirmed:
  - `Private AI Usage Dashboard`
  - `视角切换与时间控制`
  - `summaryGrid`
- public HTML fetch:
  - verified through admin token login flow
- screenshot evidence:
  - direct public browser path first hit ngrok warning page:
    - `screenshots/public_admin_v1.png`
  - remote rendered admin page via SSH tunnel:
    - `screenshots/remote_admin_via_ssh_tunnel_v1.png`
  - fixed remote rendered admin page via SSH tunnel:
    - `screenshots/remote_admin_via_ssh_tunnel_v2.png`

## 当前判断
- 远端私有服务已经换成和本地视觉验收版一致的 dashboard 渲染代码。
- team 初始态的默认窗口现已收回到最近 30 个周期，避免首次打开就出现 X 轴拥挤失控。
- `systemd` 与 `nginx` 本轮无需改动；问题核心就是远端还没同步最新 service file。
- 如果后续还要做视觉复验，优先继续沿用：
  - 本地 no-auth preview 做首轮自验
  - SSH tunnel 连远端私有端口做真实渲染截图
  - 不再依赖用户手动指出显眼布局问题
