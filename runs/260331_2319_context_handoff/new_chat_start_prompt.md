你现在接手的对象是：

`/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp`

先读这些文件，不要先扫描整个仓库：
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/README.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/deliverables/260331_2213_PrivateUsageSystemOverview_v1.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/lib/private_usage_service.mjs`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/prepare_member_private_usage_setup.mjs`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/private_ops_seed/bootstrap_output/members/ben/ben_setup_prompt.md`
- `/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/runs/260331_2319_context_handoff/handoff_summary.md`

当前最重要的上下文：
- 后端/部署方向已经基本走通：
  - Supabase 做 source of truth
  - 远端私有服务在跑
  - 成员/管理员 token 与 prompt 生成已经可用
- 现在最主要的问题不是后端功能缺失，而是**页面视觉验收没有闭环**。
- 用户已经明确不接受继续让她充当视觉 QA。
- 你必须先做本地无鉴权预览 + 浏览器截图自验，再继续对外交付。

不要重复踩这些坑：
- 不要继续在没截图自验前就把页面变化交给用户。
- 不要把“代码没报错”“HTML 结构对了”当成页面已经合格。
- 不要再让用户一轮轮指出“太宽、太怪、没居中”这种一眼能看出来的问题。
- 不要先扩更多功能，再拿视觉欠账留到后面补。

本轮用户新增的强反馈：
- “你自己能不能先去截图检查一下？”
- “这个问题每次都要我说吗？”
- “先在本地用一个没有权限设置的版本去验证”
- 如果改完页面还没自己看过截图，就不要交付。

当前已知运行入口：
- 登录页：
  - `https://versicolor-charla-nonmutinously.ngrok-free.dev/private-ai-usage/login`
- client 下载：
  - `https://versicolor-charla-nonmutinously.ngrok-free.dev/private-ai-usage-client/internal_usage_client.mjs`
  - `https://versicolor-charla-nonmutinously.ngrok-free.dev/private-ai-usage-client/lib/internal_usage_client.mjs`

默认第一动作：
1. 基于当前 `lib/private_usage_service.mjs`，先做一个本地无鉴权预览 HTML 或等价预览路径。
2. 用远端 `google-chrome --headless --screenshot` 对 team 初始态和 member 初始态各截一张图。
3. 先自己看截图，把明显视觉问题修掉。
4. 截图二次验收通过后，再给用户看。
