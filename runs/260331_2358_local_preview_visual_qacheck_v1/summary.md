# Local Preview Visual QA Check v1

## 目标
- 在不走远端鉴权链路的前提下，先做本地 no-auth 预览。
- 对 team 初始态和 member 初始态都执行真实浏览器截图自验。
- 先修明显视觉问题，再考虑继续对外交付。

## 本轮入口
- 本地 preview 脚本：`/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp/run_local_private_usage_preview.mjs`
- 本地预览地址：
  - `http://127.0.0.1:8787/preview/team`
  - `http://127.0.0.1:8787/preview/member/alice`

## 本轮改动
- 将 dashboard 顶部信息改成更明确的 header card，强化角色/团队识别。
- 将“视角切换 + 时间控制”整理成双列控制区，避免初始态过挤。
- 将 summary cards 提前到 chart 下方，降低“打开后看不到重点”的问题。
- 提升 card padding、按钮尺寸、chart shell 留白和整体可读性。
- 导出 `buildAdminHtml` / `buildMemberHtml`，让本地预览复用真实渲染路径而不是另写一套 mock 页面。

## 截图证据
- 首轮截图：
  - `screenshots/team_initial_v1.png`
  - `screenshots/member_initial_v1.png`
- 二轮复验：
  - `screenshots/team_initial_v2.png`
  - `screenshots/member_initial_v2.png`
- 最终留档：
  - `screenshots/team_initial_v3.png`
  - `screenshots/member_initial_v3.png`

## 自验结论
- team 初始态：
  - 页面已居中，主信息和控制区不再显得松散或怪异。
  - summary 被提前，打开后更容易先看到团队总量结论。
- member 初始态：
  - 打开后能直接读到个人 chart + summary，不需要先翻到很后面。
  - 控件密度和留白已达到可继续对外展示的水平。
- 当前判断：
  - 这轮“先截图自验再交付”的闭环已建立。
  - 仍可继续做更细的 polish，但不再属于那种一眼可见、应由开发者先挡住的问题。

## 验证
- 测试命令：
  - `node --test tests/private_usage_service.test.mjs`
- 结果：
  - pass 2 / fail 0
