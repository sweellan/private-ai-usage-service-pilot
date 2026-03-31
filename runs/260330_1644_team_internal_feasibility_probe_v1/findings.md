# Findings

## 结论
- `@vibe-cafe/vibe-usage` 目前不是“完整开源的团队 token 平台”，而是“公开 CLI / parser / skill / daemon 客户端，服务端与 dashboard 大概率未公开”的半开源形态。
- 它可以作为团队内部项目的参考样板，但最适合参考的是：
  - 本地日志 parser 组织方式
  - 30 分钟 bucket 聚合思路
  - session 元数据抽取思路
  - CLI / daemon / status 的产品形态
- 不建议直接把官方 `vibecafe.ai` 同步链路当作团队内部方案底座，因为：
  - 官方命令主路径仍是同步到官方服务端
  - 服务端实现和数据存储层没有看到公开代码
  - 私有 API 契约与上游产品节奏绑定，内部长期可控性不足

## 这次更新后，开源边界比上次更清楚了什么

### 1. CLI 仓库是公开的，而且现在还在积极演进
- npm 最新版本是 `0.7.1`，`license` 为 `MIT`。
- npm 发布时间显示该包从 2026-02-24 持续发布到 2026-03-26。
- GitHub 组织公开可见的 repo 目前只有：
  - `vibe-usage`
  - `vibe-usage-app`
  - `vibe-places-data`
- 这说明至少客户端层是明确公开的，而且最近还在持续迭代。

### 2. 公开仓库包含完整客户端实现，但不包含服务端实现
- `package.json` 只发布 `bin/` 与 `src/`，没有 web app / backend 目录。
- `README.md` 明确把产品目标写成 `sync to vibecafe.ai`，默认入口会拿 API key 并执行初次 sync。
- `src/api.js` 只实现了对以下接口的 HTTP 客户端调用：
  - `POST /api/usage/ingest`
  - `DELETE /api/usage/ingest`
  - `GET /api/usage/settings`
- `repo/AGENTS.md` 在“新增 parser”说明里明确提到 backend 侧要改 `vibe-cafe/apps/web/src/app/api/usage/ingest/route.ts`，但这个 `vibe-cafe` web/backend 仓库并不在当前公开组织仓库列表里。

结论：
- 这是强信号，说明公开仓库只覆盖客户端层；服务端实现至少不是在当前公开 repo 中随手可得。
- “服务端未公开”是基于当前公开 repo 列表和仓库内容做的推断，不是上游显式声明。

### 3. 隐私开关仍然只到“项目名脱敏”，不是“usage 不上传”
- `src/sync.js` 会先抓取服务端 settings，再根据 `uploadProject` 决定是否把 `project` 改成 `unknown`。
- 即使项目名隐藏，代码后面仍会继续上传 buckets 和 sessions。
- 因此官方产品定位依旧是“上传 usage 到服务端后展示”，而不是“纯本地报表工具”。

### 4. 自托管入口是存在的，但只是 API URL 可替换
- README 仍保留 `VIBE_USAGE_API_URL=http://localhost:3000` 的开发用法。
- `config` 里也保留了 `apiUrl` 字段。
- 这意味着它天然支持“换服务端地址”。

但边界也很明确：
- 它没有公开提供一个现成的服务端实现给你直接部署。
- 它也没有一个公开的“local-only report”官方命令。
- 所以这更像“你可以自己兼容它的 API”，而不是“它已经是一套完整可自托管产品”。

## 与 0.6.6 相比，这次最新版本有哪些变化
- 新增了后台 daemon service 管理能力：
  - `daemon install`
  - `daemon uninstall`
  - `daemon status`
  - `daemon stop`
  - `daemon restart`
- 新增了 `skill` 安装/移除命令。
- 支持工具范围继续扩大，新增了 `pi`、`Amp`、`Droid` 等。

这说明：
- 客户端产品化程度在增强。
- 但这些增强仍然围绕“更顺滑地把本地 usage 同步到 vibecafe.ai”展开，不是朝“完整开源自托管平台”方向收敛。

## 能不能参考它做团队内部项目

### 可以，但建议按“参考实现”而不是“直接依赖上游产品”来做
- 推荐结论：`可以参考，且值得参考，但不要把官方 SaaS 当内核依赖。`

### 最值得借的层
- parser 层：
  - 每个工具一个 parser 文件，职责清楚，易扩展
  - 先统一抽出 event，再做聚合，结构干净
- 归一化数据层：
  - bucket 记录适合做时间序列报表
  - session 记录适合做效率、活跃度、项目维度分析
- 运行形态层：
  - `status / sync / daemon / reset` 这套 CLI 形态适合内部工具落地
- 本地优先层：
  - 直接从本地日志算全量 totals，而不是依赖本地状态机，这一点对审计和补算很友好

### 不建议直接照搬的层
- 官方 API 契约本身
- 官方 dashboard / 账号体系
- 官方隐私模型
- 官方默认同步目的地

原因：
- 这些层要么没有公开实现，要么设计目标是服务 `vibecafe.ai` 产品，不是服务内部治理需求。

## 团队内部项目建议路线

### 路线 A：最稳的内部版
- 复用现有本地 parser 思路，先做内部 `collector`
- collector 输出标准化 JSON/CSV 或直接写内部 ingest API
- 后端自己做：
  - 团队/成员/机器映射
  - 数据去重与重算
  - 权限模型
  - dashboard
- 前端/报表按内部关注点做：
  - 按人
  - 按项目
  - 按工具
  - 按模型
  - 按天/周/月
  - 按成本估算

适用：
- 你们希望数据完全留在内网或自有云
- 你们未来会加团队、部门、成本中心等内部维度

### 路线 B：兼容它的 ingest API，先快速起步
- 保留现有 parser 和 CLI 触发方式
- 自己实现一个兼容：
  - `GET /api/usage/settings`
  - `POST /api/usage/ingest`
  - `DELETE /api/usage/ingest`
  的最小后端
- 让 `apiUrl` 指到你们自己的地址

优点：
- 起步快
- 可以较少改动现有客户端逻辑

缺点：
- 你是在跟随一个未正式文档化、且由上游产品驱动的私有契约
- 上游字段和语义若变化，你们需要自己跟进

我的判断：
- 这条路适合做 1 个短周期内部 pilot
- 不适合直接当长期正式架构

### 路线 C：直接继续维护我们现在的本地 wrapper
- 继续用当前对象里的 `run_local_usage_report.mjs`
- 增加：
  - 时间范围筛选
  - 人员/项目维度聚合
  - Markdown/HTML dashboard 产出
  - 团队汇总入口

优点：
- 最安全
- 最快见到结果
- 完全不依赖外部服务端

缺点：
- 从个人版走向团队版时，还需要再补统一采集和中心化汇总

## 适合我们现在的建议
- 如果目标是“先把团队内部 token 看板跑起来”，优先级建议是：
  1. 用现有本地 wrapper 或参考上游 parser，先做本机/单人稳定报表
  2. 再做团队级汇总 ingest
  3. 最后再做权限、组织映射、仪表盘精修

- 如果目标是“快速验证团队版是否值得做”，建议先做一个内部 pilot，范围收窄为：
  - 只支持 `Codex CLI`、`Claude Code`、`Gemini CLI`
  - 只做 daily summary + team summary
  - 只做内部静态 HTML 或简单 web dashboard

## 风险与提醒
- README 的支持工具说明与实际代码/状态输出已有轻微漂移，说明上游正高速迭代，文档不一定始终同步。
- 服务端未公开意味着：
  - 数据模型含义可能有隐式约束
  - API 没有稳定公开契约保证
  - 如果长期依赖兼容层，后续维护成本在你们自己
- 官方隐私开关不是“完全不上传”，这点不应被误判成内部合规方案。

## 最终判断
- `开源程度判断`：可视为 `客户端开源，完整产品未完全开源`。
- `是否可参考做内部项目`：`可以，而且值得参考。`
- `推荐参考方式`：`参考 parser / bucket / session / CLI 结构，自建内部 ingest 与 dashboard。`
- `不推荐方式`：`直接依赖官方 vibecafe.ai 作为团队正式统计底座。`
