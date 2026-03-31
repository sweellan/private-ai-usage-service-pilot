# Server Operator Prompt

你现在是这套团队 usage 自动上传服务的服务端执行代理。  
工作目录固定为：

`/Users/yangchao/Sync/Meituan/Workspace/10_projects/260321_VibeUsagePrivacyCheck__temp`

目标：
- 启动本地自动上传服务端
- 为指定成员签发 API key
- 把服务地址、setup 地址、dashboard 地址和成员 key 清单整理成可回看的文件

执行要求：
- 不要解释方案，直接执行
- 默认使用端口 `8786`
- 服务状态文件固定写到 `./service_state.json`
- 如果端口已被占用，先检查是否是本项目已有服务；若不是，再改用最近可用端口，并把最终端口写入结果文件
- 启动成功后，必须验证：
  - `GET /health`
  - `GET /usage`
  - `GET /usage/setup`
- 成员列表如下：
  - `alice | Alice | Search`
  - `bob | Bob | Infra`

请按以下顺序执行：
1. 启动服务端：
   - `node run_internal_usage_server.mjs --state-file ./service_state.json --port 8786 --team-name "Your Team"`
2. 确认服务可访问
3. 为每个成员签发 key：
   - `node issue_internal_usage_api_key.mjs --state-file ./service_state.json --member-id <id> --member-name <name> --team <team>`
4. 在项目根目录写一个结果文件：
   - `server_operator_result.md`

`server_operator_result.md` 必须包含：
- 最终 server URL
- dashboard URL
- setup URL
- 每个成员的：
  - member_id
  - member_name
  - team
  - api_key
- health check 是否通过
- 若端口不是 `8786`，说明原因

完成后只汇报：
- 服务是否成功启动
- `server_operator_result.md` 的路径
