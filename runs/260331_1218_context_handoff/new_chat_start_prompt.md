你现在接手的对象是：

`/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp`

先读这些文件，不要先扫描整个仓库：
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/README.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/deliverables/260331_1147_PublicRepoBoundaryAndRbacPlan_v1.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/README.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/public_repo_seed/server/token_usage_service.mjs`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/tests/public_repo_token_rbac.test.mjs`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/tests/public_repo_seed_cli.test.mjs`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/runs/260331_1201_PublicRepoRbacAcceptance_v1/validation_summary.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/runs/260331_1120_RealUserUsageSnapshot_v1/openclaw_seed_summary.json`

当前最重要的上下文：
- 本地主 Agent 负责 public repo 边界、主代码编辑和 RBAC 设计。
- OpenClaw 只负责后续 pull/sync/deploy，不负责主设计。
- public repo 不能暴露真实 URL / 端口 / API key / prompt。
- prompt 不进入 public repo。
- 当前线上 ngrok 子路径服务还是 mock/self-test 版本，不是最终真实 token schema。
- 新的 public-repo-ready token+RBAC 代码已经在 `public_repo_seed/`，并通过测试：
  - public repo RBAC tests `5/5`
  - public repo CLI tests `2/2`
  - full related matrix `17/17`
- 用户不是专业开发者，涉及开源/授权/public repo 的决定需要你主动做风险判断，不要把流程细节甩回给用户。

不要重复踩这些坑：
- 不要再让 OpenClaw 主导权限模型或主代码编辑。
- 不要把 prompt、真实域名、真实 key 带进 public repo。
- 不要把线上现有 mock 服务误当成“真实 token 版已经完成”。
- 不要默认用户懂 license/开源细节。

下一轮默认第一动作：
1. 在本地把 `public_repo_seed` 收成一个真正独立的 repo 目录。
2. 补齐最小仓库 README / publish notes / root hygiene。
3. 准备创建 public GitHub repo，但默认先不放 LICENSE 文件。
4. 完成后再把 OpenClaw 作为部署同步端接进来。
