# Handoff Summary

## 对象
- 对象路径：`/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp`
- 当前主题：从 `@vibe-cafe/vibe-usage` 的参考研究，推进到一个团队内部 token 统计系统的真实落地方案。

## 长期背景应优先引用什么
- 对象入口与现状总览：
  - `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/README.md`
- public repo 边界与 RBAC 主方案：
  - `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/deliverables/260331_1147_PublicRepoBoundaryAndRbacPlan_v1.md`
- 最新真实本机 usage 摘要：
  - `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/runs/260331_1120_RealUserUsageSnapshot_v1/openclaw_seed_summary.json`
- public-repo-ready 骨架入口：
  - `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/README.md`

## 当前最强判断
- `vibe-usage` 客户端路线可参考，但其服务端不是我们能直接依赖的公开完整产品。
- 当前正确主线不是继续在 OpenClaw 远端手搓服务，而是：
  - 本地主 Agent 主导 public repo 代码、公开边界和 RBAC 设计
  - OpenClaw 后续只负责 pull/sync/deploy
- public repo 不能暴露：
  - 真实域名
  - 端口
  - API key
  - 私有 prompt
  - OpenClaw bridge / 运维细节

## 本轮新增推进了什么
- 补齐了 `public_repo_seed/`：
  - `package.json`
  - `server/run_token_usage_server.mjs`
  - `server/admin_cli.mjs`
  - `client/cli.mjs`
  - `client/token_usage_client.mjs`
  - `server/token_usage_service.mjs`
  - `shared/report_aggregation.mjs`
  - `docs/RBAC.md`
  - `docs/SECURITY_BOUNDARY.md`
  - `docs/DEPLOY_SYNC.md`
- 做了 token schema + RBAC 版本的可运行实现：
  - member 只能看自己
  - admin 才能看全局 dashboard
  - setup 页 secretless，不暴露真实 key
- 测试已通过：
  - `tests/public_repo_token_rbac.test.mjs`：`5/5`
  - `tests/public_repo_seed_cli.test.mjs`：`2/2`
  - 全相关矩阵：`17/17`
- 最新验收：
  - `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/runs/260331_1201_PublicRepoRbacAcceptance_v1/validation_summary.md`
  - `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/runs/260331_1201_PublicRepoRbacAcceptance_v1/validation_addendum_package_cli.md`

## 当前线上状态
- OpenClaw 远端已经把一个最小服务挂到了：
  - `https://versicolor-charla-nonmutinously.ngrok-free.dev/ai-usage/setup`
  - `https://versicolor-charla-nonmutinously.ngrok-free.dev/ai-usage/dashboard`
- 但当前线上这版仍然是 mock/self-test 数据，不是最终真实 token schema。
- 当前公网页面还有历史包袱：
  - 早期是 `linesAdded/linesDeleted` mock 口径
  - 后续虽然挂进了稳定 ngrok 子路径，但服务设计并非由本地主 Agent 主导，仍需替换成新的 public-repo-ready 版本

## 用户本轮新增反馈与决策信号
- 用户不是专业开发者。
  - 涉及开源、授权、public repo、服务可见性时，需要 agent 主动做更多风险判断，不要把流程细节甩给用户。
- 代码里不要暴露真实端口 / 链接 / API key。
  - 这些信息应留在私有 prompt 或私有 ops 层。
- prompt 不能进入 public repo。
- 权限模型必须由本地主 Agent 负责设计，不再交给 OpenClaw。
- 协作方式固定为：
  - 本地主 Agent 负责主代码与设计
  - OpenClaw 只负责同步部署

## 还没解决的关键问题
- 还没有真正创建 public GitHub repo。
- 还没有把 `public_repo_seed` 从对象目录拆成真正独立可发布仓库。
- 还没有把线上服务替换成新的 token+RBAC 版本。
- 还没有把你的真实数据挂到线上，并验证：
  - 本机作为 member 只能看自己的数据
  - admin 能看全局
- 还没有最终决定开源 license。
  - 当前更稳的默认建议是：先 public repo 但暂不放 LICENSE 文件，避免误授予开放复用权。

## 踩过的坑 / 不要重复
- 不要继续让 OpenClaw 主导权限模型或主代码编辑。
- 不要把 prompt、真实 URL、真实端口、真实 key 放进 public repo。
- 不要把当前公网 mock 服务误当成“已经完成真实 token 版”。
- 不要默认用户懂开源/授权细节。
- 不要直接把 `run_local_usage_report.mjs` 那些本地绝对路径耦合带进 public repo；这一轮已经把 public seed 中这类耦合清掉了。

## 下一批建议
1. 在本地把 `public_repo_seed` 复制/整理成独立仓库目录。
2. 补最小仓库级 README / publish notes / repo root hygiene。
3. 创建 public GitHub repo，但默认先不放 LICENSE 文件。
4. 把独立 repo push 上去。
5. 再让 OpenClaw 从该 repo pull，并替换线上 mock 服务为 token+RBAC 版本。
6. 用你的真实 usage 快照作为首个 `chao` seed，完成线上验证。

## 新对话应先读哪些文件
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/README.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/deliverables/260331_1147_PublicRepoBoundaryAndRbacPlan_v1.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/README.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/server/token_usage_service.mjs`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/tests/public_repo_token_rbac.test.mjs`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/tests/public_repo_seed_cli.test.mjs`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/runs/260331_1201_PublicRepoRbacAcceptance_v1/validation_summary.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/runs/260331_1120_RealUserUsageSnapshot_v1/openclaw_seed_summary.json`
