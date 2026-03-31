# Vibe Usage Privacy Check

## 目标
- 拉取 `@vibe-cafe/vibe-usage` 的源码与包信息。
- 判断这套工具是否支持“不公布自己的数据，只在本地统计”。
- 判断它开源到哪一层，以及是否适合参考做团队内部 token 统计项目。
- 把结论、证据和后续建议沉淀到当前对象，避免重复调研。

## 当前问题
- 包描述明确写了 `sync to vibecafe.ai`，需要进一步确认：
  - 默认命令是否一定会上报。
  - 是否存在纯本地统计模式、禁用同步参数或可自托管出口。
  - 如果官方不支持，最低成本的本地替代路径是什么。
- 团队内部复用还需要进一步确认：
  - 公开仓库覆盖的是 CLI 层还是完整产品层。
  - 服务端 / dashboard 是否公开。
  - 最适合参考的是 parser、API 契约，还是完整产品形态。

## 当前入口
- [源码与数据流探查 run](runs/260321_1505_source_probe_v1/README.md)
- [本轮结论与证据摘要](runs/260321_1505_source_probe_v1/findings.md)
- [Public repo 与 RBAC 方案](deliverables/260331_1147_PublicRepoBoundaryAndRbacPlan_v1.md)
- [Supabase 单 token 架构方案](deliverables/260331_1529_SupabaseSingleTokenArchitecture_v1.md)
- [Private usage operator checklist](deliverables/260331_1750_PrivateUsageOperatorChecklist_v1.md)
- [Private usage system overview](deliverables/260331_2213_PrivateUsageSystemOverview_v1.md)
- [团队内部复用可行性 run](runs/260330_1644_team_internal_feasibility_probe_v1/README.md)
- [团队内部复用结构化结论](runs/260330_1644_team_internal_feasibility_probe_v1/findings.md)
- [稳定本地统计脚本](run_local_usage_report.mjs)
- [团队版聚合脚本](run_team_usage_report.mjs)
- [成员提交脚本](run_team_usage_submission.mjs)
- [批量收集脚本](collect_team_usage_submissions.mjs)
- [自动上传服务端](run_internal_usage_server.mjs)
- [API key 签发脚本](issue_internal_usage_api_key.mjs)
- [自动上传 client](internal_usage_client.mjs)
- [Prompt Pack 入口](prompts/README.md)
- [服务端 Prompt](prompts/server_operator_prompt.md)
- [成员端 Prompt](prompts/member_upload_prompt.md)
- [验收 Prompt](prompts/dashboard_check_prompt.md)
- [团队版 manifest 模板](team_usage_members.template.csv)
- [Public repo seed](public_repo_seed/README.md)
- [Private ops seed](private_ops_seed/README.md)
- [Private token 签发脚本](issue_private_access_token_bundle.mjs)
- [Supabase 私有服务启动脚本](run_supabase_private_usage_service.mjs)
- [每日同步脚本](run_private_usage_daily_sync.sh)
- [成员成品 prompt 生成器](prepare_member_private_usage_setup.mjs)
- [Public repo package](public_repo_seed/package.json)
- [Public repo server CLI](public_repo_seed/server/run_token_usage_server.mjs)
- [Public repo admin CLI](public_repo_seed/server/admin_cli.mjs)
- [Public repo client CLI](public_repo_seed/client/cli.mjs)
- [团队版自动化测试](tests/team_usage_report.test.mjs)
- [自动上传自动化测试](tests/internal_usage_service.test.mjs)
- [Public repo RBAC 测试](tests/public_repo_token_rbac.test.mjs)
- [Public repo CLI 测试](tests/public_repo_seed_cli.test.mjs)
- [Private token 测试](tests/private_access_token.test.mjs)
- [Supabase 私有服务测试](tests/private_usage_service.test.mjs)
- [团队版验收 run](runs/260330_1939_TeamUsageMvpAcceptance_v1/README.md)
- [提交/收集链路验收 run](runs/260330_2045_SubmissionFlowAcceptance_v1/README.md)
- [自动上传验收 run](runs/260330_2314_AutoUploadAcceptance_v1/README.md)
- [每日运行入口](run_daily_local_usage_report.sh)
- [固定网页入口](dashboard.html)
- [最新正式日报 run](runs/260321_1527_DailyLocalUsageReport/summary.md)

## 当前能力
- 个人版：`run_local_usage_report.mjs` 从本机 usage 日志生成 `local_usage_report.json`、CSV、SVG 和 HTML。
- 团队版 MVP：`run_team_usage_report.mjs` 聚合多个成员的 `local_usage_report.json`，输出：
  - `team_usage_report.json`
  - `member_summary.csv`
  - `source_usage.csv`
  - `team_daily_usage.csv`
  - `summary.md`
  - `dashboard.html`
- 成员提交版：`run_team_usage_submission.mjs` 把成员 metadata 和本地 report 封成一个 `team_usage_submission.json`。
- 收集版：`collect_team_usage_submissions.mjs` 从一个 submissions 目录批量收集 `team_usage_submission.json`，再输出团队报告。
- 自动上传版：
  - `run_internal_usage_server.mjs` 提供本地服务端、setup 页和 dashboard
  - `issue_internal_usage_api_key.mjs` 为成员签发 `vbu_` key
  - `internal_usage_client.mjs` 负责成员侧 `init / status / sync`
- Prompt 驱动版：
  - 不要求你手动敲命令
  - 你只需要把对应 prompt 发给服务端 agent、成员 agent、验收 agent
- Public repo 规划版：
  - 已明确 public/private 边界
  - prompt 不进入 public repo
  - secrets / ports / URLs 不进入 public repo
  - 已补 package / server CLI / admin CLI / client CLI
  - 已有 token schema + RBAC 的可测实现
- 当前团队版不做项目总量聚合，因为现有个人版 JSON 只暴露截断后的 `topProjects`。

## 当前方向
- 当前线上页面仍是 mock/self-test 数据，不是最终真实 token schema。
- 当前下一步主线改成：
  - 由本地主 Agent 负责 public repo 边界与 RBAC 设计
  - OpenClaw 只负责后续同步部署
  - 真实公网服务后续迁到“真实 token schema + 权限管理”版本
  - public repo seed 继续收口成真正可发布仓库
  - durable 数据层改到独立 Supabase project
  - 成员侧改成“单一 private access token”用于上传和查看
  - OpenClaw 改做 Supabase 拉取后的展示层，不再做 source of truth
  - 当前这台机器已经完成一次真实上报并可在 admin 视图查看

## 使用方式
- 先让每个成员各自运行个人版，拿到自己的 `local_usage_report.json`。
- 再按模板整理一个 manifest CSV。
- 然后执行：
  - `node run_team_usage_report.mjs --manifest /path/to/members.csv --output-dir /path/to/output --team-name "Your Team"`

## 推荐测试方式
- 你发给同学的不是“只会出一堆散文件”的包，而是这一整个对象目录，至少包含：
  - `run_local_usage_report.mjs`
  - `run_team_usage_submission.mjs`
  - `__sys/vendor/vibe-usage/`
- 每位同学执行：
  - `node run_team_usage_submission.mjs --member-id <id> --member-name <name> --team <team> --output-dir ./submission_<id>`
- 他们回传给你的只需要：
  - `submission_<id>/team_usage_submission.json`
- 你本地把所有同学回传的 JSON 放进一个目录，例如：
  - `submissions/alice/team_usage_submission.json`
  - `submissions/bob/team_usage_submission.json`
- 然后你执行：
  - `node collect_team_usage_submissions.mjs --submissions-dir ./submissions --output-dir ./team_output --team-name "Your Team"`
- 最终你会在 `team_output/` 里收到：
  - `team_usage_report.json`
  - `member_summary.csv`
  - `source_usage.csv`
  - `team_daily_usage.csv`
  - `summary.md`
  - `dashboard.html`

## 自动上传测试方式
- 1. 启动服务端：
  - `node run_internal_usage_server.mjs --state-file ./service_state.json --port 8786 --team-name "Your Team"`
- 2. 为每位同学签发 key：
  - `node issue_internal_usage_api_key.mjs --state-file ./service_state.json --member-id alice --member-name "Alice" --team "Search"`
  - `node issue_internal_usage_api_key.mjs --state-file ./service_state.json --member-id bob --member-name "Bob" --team "Infra"`
- 3. 把对应 key 发给同学后，每位同学先初始化本地 client：
  - `node internal_usage_client.mjs init --server-url http://<your-host>:8786 --api-key <vbu_xxx>`
- 4. 每位同学上传自己的本地 usage：
  - `node internal_usage_client.mjs sync`
- 5. 你在浏览器里查看：
  - `http://<your-host>:8786/usage`
  - `http://<your-host>:8786/usage/setup`

## 当前自动上传边界
- 这版已经支持 key + 自动上传 + dashboard。
- 这版还没有做“网站上自助注册并在线生成 key”；当前 key 由管理员通过 `issue_internal_usage_api_key.mjs` 签发。
- 如果要进一步对齐 vibecafe 的“网站注册后自助拿 key”体验，下一步应补：
  - 用户登录/注册
  - 自助 key 管理页
  - key 撤销与轮换

## Prompt 驱动使用方式
- 如果你不想自己敲命令，直接按这个顺序发 prompt：
  - 先发 [服务端 Prompt](prompts/server_operator_prompt.md)
  - 再把 key 带入后，分别发 [成员端 Prompt](prompts/member_upload_prompt.md)
  - 最后发 [验收 Prompt](prompts/dashboard_check_prompt.md)

## 下一步
- 若要继续使用这个方向但不上传官方服务端，可把 `local_usage_report.mjs` 收成正式本地工具，并扩成团队汇总版。
- 若要走自托管路线，可继续补兼容 API 的最小服务端验证，但应把它视为 pilot 而非长期稳定契约。
- 若要做正式团队内部项目，推荐优先复用 parser / bucket / session 结构，自建内部 ingest 与 dashboard。
- 若要把当前 MVP 往正式版推进，优先补：
  - 未截断的项目级明细导出
  - 成员/团队映射治理
  - 按周 / 按月视图
  - 成本估算与权限模型
