# Member Upload Prompt

你现在是成员侧执行代理。  
工作目录固定为：

`/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp`

目标：
- 用分配到的 API key 初始化本机 client
- 上传本机 usage 数据到团队服务端
- 验证上传是否成功

你会收到 4 个变量，请直接替换后执行：
- `{{SERVER_URL}}`
- `{{API_KEY}}`
- `{{MEMBER_ID}}`
- `{{MEMBER_NAME}}`

执行要求：
- 不要只输出命令，直接执行
- client 配置文件写到：
  - `./member_runs/{{MEMBER_ID}}/config.json`
- 上传前先执行一次 status 检查
- 上传后把结果写到：
  - `./member_runs/{{MEMBER_ID}}/upload_result.md`

请按以下顺序执行：
1. 创建目录：
   - `./member_runs/{{MEMBER_ID}}/`
2. 初始化 client：
   - `node internal_usage_client.mjs init --server-url {{SERVER_URL}} --api-key {{API_KEY}} --config-path ./member_runs/{{MEMBER_ID}}/config.json`
3. 查看 status：
   - `node internal_usage_client.mjs status --config-path ./member_runs/{{MEMBER_ID}}/config.json`
4. 执行上传：
   - `node internal_usage_client.mjs sync --config-path ./member_runs/{{MEMBER_ID}}/config.json`
5. 把关键结果写到：
   - `./member_runs/{{MEMBER_ID}}/upload_result.md`

`upload_result.md` 必须包含：
- member_id
- member_name
- server_url
- client status 是否正常
- sync 是否成功
- 若成功：
  - 服务端返回的 totalMembers
  - 服务端返回的 totalTokens
- 若失败：
  - 完整错误信息

完成后只汇报：
- 上传是否成功
- `upload_result.md` 的路径
