# Findings

## 结论
- 上游 `@vibe-cafe/vibe-usage` 0.6.6 的官方 CLI 目标是把本地 usage 同步到 `vibecafe.ai`，不提供一个现成的“只在本地统计并输出汇总”的命令。
- 它有一个隐私相关开关，但范围只是“是否上传项目名”；token bucket 和 session 数据本身仍会上传。
- 如果目标是“不把数据公布给 vibe-cafe 官方”，目前有两条路：
  - 走兼容 API 的自托管 / 本地服务端路径，把 `apiUrl` 指向你自己的端点。
  - 直接复用它的 parser，在本地生成汇总，不调用任何上传逻辑。

## 关键证据

### 1. 官方 README 与 CLI 命令都围绕 sync
- `README.md` 明确写了 `Track your AI coding tool token usage and sync to vibecafe.ai`。
- 首次运行说明包含：
  - 获取 API key
  - 检测工具
  - `Run an initial sync of your usage data`
- `help.txt` 中公开命令只有 `init / sync / daemon / reset / status / config / help`，没有 `report`、`export` 或 `local-summary` 一类命令。

### 2. `sync` 命令要求配置 API key，并且会访问服务端
- `src/sync.js` 在没有 `apiKey` 时直接退出，不存在“无 key 的本地统计模式”。
- 同一文件会先调用 `fetchSettings(apiUrl, config.apiKey)`，再调用 `ingest(...)` 上传 buckets 和 sessions。
- `src/api.js` 中：
  - `fetchSettings()` 请求 `GET /api/usage/settings`
  - `ingest()` 请求 `POST /api/usage/ingest`
  - `deleteAllData()` 请求 `DELETE /api/usage/ingest`

### 3. 目前只看到“隐藏项目名”，没看到“隐藏 usage 数据”
- `src/sync.js` 的隐私逻辑是读取 `settings?.uploadProject`。
- 当 `uploadProject=false` 时，只是把 bucket / session 里的 `project` 改成 `unknown`。
- 同一个 `sync` 流程随后仍会继续上传所有 buckets 和 sessions。

### 4. 官方保留了 dev / 自定义 API URL，但不是纯本地汇总命令
- README 提供：
  - `VIBE_USAGE_DEV=1`
  - `VIBE_USAGE_API_URL=http://localhost:3000`
- `src/config.js` 也确认 dev 模式只是切换到 `~/.vibe-usage/config.dev.json`。
- 这说明它支持“换一个服务端”，但仍然是 `fetchSettings + ingest` 的上传模型。

## 本地验证

### 安全探针
- `help.txt`：公开命令里没有本地汇总命令。
- `status_fakehome.txt`：在空 `HOME` 下执行 `status` 只做本地配置 / 目录检测，不要求 API key，也不会触发 sync。

### 纯本地 wrapper
- 新增 `local_usage_report.mjs`，只 import `repo/src/parsers/index.js`，不 import `src/api.js`、`src/init.js`、`src/sync.js`。
- 运行结果见 `local_usage_report.json`。
- 本次本地运行已经成功输出汇总，说明源码层 parser 可以独立复用，不必走官方上传链路。

## 本次本地汇总结果
- 总 buckets：1570
- 总 sessions：6000
- 总 tokens：669,452,199
- 主要来源：
  - codex：630,811,429 tokens / 1669 sessions
  - gemini-cli：38,382,859 tokens / 4296 sessions
  - claude-code：150,892 tokens / 34 sessions
  - opencode：107,019 tokens / 1 session

## 建议
- 如果你的要求是“不要发到 vibe-cafe 官方，但接受发到自己服务端”，可以继续研究它的服务端接口，自托管一个兼容 endpoint。
- 如果你的要求是“完全不出本机，只要一个统计结果”，当前最直接可用的是继续沿用 `local_usage_report.mjs` 这条本地 wrapper 路线。
- 如果你愿意，我下一步可以把这个本地 wrapper 收成一个更像正式工具的版本，例如：
  - 输出 Markdown + JSON 双份报告
  - 增加时间范围筛选
  - 增加按项目 / 按工具 / 按日期聚合
