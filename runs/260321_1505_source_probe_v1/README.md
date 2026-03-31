# Source Probe v1

## 目标
- 拉取 `@vibe-cafe/vibe-usage` 源码。
- 记录 npm 包元信息。
- 检查默认命令、配置项与网络请求路径。

## 当前状态
- 已确认 npm 描述包含 `sync to vibecafe.ai`。
- 已完成源码级网络出口梳理与最小运行验证。

## 预期产物
- `repo/`：上游源码副本。
- `npm_view.json`：npm 包元信息快照。
- `code_search.txt`：与网络请求、同步、上传、本地存储相关的代码检索结果。
- `findings.md`：本 run 的结论与证据摘要。
- `local_usage_report.mjs`：只复用 parser、完全不触发上传的本地汇总脚本。
- `local_usage_report.json`：本机实际运行得到的本地统计结果。
