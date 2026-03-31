# Dashboard Check Prompt

你现在是验收代理。  
工作目录固定为：

`/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp`

你会收到一个变量：
- `{{SERVER_URL}}`

目标：
- 验证服务端 setup 页、dashboard 页和 report API 是否正常
- 给出一份可回看的验收结果

执行要求：
- 直接执行，不要先讨论
- 检查以下 3 个地址：
  - `{{SERVER_URL}}/usage`
  - `{{SERVER_URL}}/usage/setup`
  - `{{SERVER_URL}}/api/internal-usage/report`
- 把结果写到：
  - `dashboard_check_result.md`

验收项：
1. `/usage` 可访问
2. `/usage/setup` 可访问
3. `/api/internal-usage/report` 返回合法 JSON
4. report JSON 里至少检查：
   - `teamName`
   - `summary.totalMembers`
   - `summary.totalTokens`
   - `byMember`
5. 如果 `summary.totalMembers >= 1`，把成员名列表也写入结果

`dashboard_check_result.md` 必须包含：
- server_url
- usage_page: pass/fail
- setup_page: pass/fail
- report_api: pass/fail
- total_members
- total_tokens
- by_member_names
- 最终结论：pass / fail
- 若 fail，写明失败项

完成后只汇报：
- 最终结论
- `dashboard_check_result.md` 的路径
