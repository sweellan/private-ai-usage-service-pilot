# Team Internal Feasibility Probe v1

## 目标
- 刷新 `@vibe-cafe/vibe-usage` 的最新公开状态与版本信息。
- 判断它到底开源到哪一层，以及是否适合拿来参考一个团队内部 token 统计项目。
- 给出“直接复用 / 有条件参考 / 不建议依赖”的边界结论。

## 本轮结论
- 上游当前可见形态更像“开源 CLI + parser，配私有 SaaS 后端”的半开源方案。
- 可以参考它做团队内部项目，但更适合借 parser / CLI / 数据模型思路，不适合把官方同步链路和官方服务端当成可依赖底座。
- 若目标是团队内部可控、可审计、可扩展，下一步应优先做内部 collector + 内部 ingest/dashboard，而不是接官方 `vibecafe.ai`。

## 产物
- `repo/`：2026-03-30 拉取的上游最新仓库快照。
- `npm_view_full.json`：npm 完整元信息快照。
- `npm_view_summary.json`：版本、仓库、license、发布时间摘要。
- `org_public_repos.txt`：`vibe-cafe` GitHub 组织当前公开仓库列表。
- `status_fakehome.txt`：空 `HOME` 下的安全状态探针。
- `code_search.txt`：同步、配置、隐私与 API 路径代码检索。
- `diff_vs_0.6.6.txt`：与 2026-03-21 探查快照的差异。
- `findings.md`：本轮结构化判断与建议。

## 建议阅读顺序
- 先看 `findings.md`
- 再看 `org_public_repos.txt`、`npm_view_summary.json`
- 如需核证实现边界，再看 `repo/src/sync.js`、`repo/src/api.js`、`repo/AGENTS.md`
