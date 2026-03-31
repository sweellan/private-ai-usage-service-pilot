# Prompt Pack

## 目的
- 把当前已验收的自动上传方案改写成 prompt 驱动用法。
- 默认假设服务端与成员端都具备 coding agent，可直接执行 prompt 中的本地命令与文件操作。

## Prompt 列表
- `server_operator_prompt.md`
  - 让服务端 agent 启动本地服务、签发 key、记录访问地址与 key 清单。
- `member_upload_prompt.md`
  - 让成员端 agent 初始化 client 并上传本机 usage。
- `dashboard_check_prompt.md`
  - 让验收 agent 检查 setup 页、dashboard 页和聚合结果。

## 推荐顺序
1. 服务端 agent 执行 `server_operator_prompt.md`
2. 把分发后的 API key 分别带入成员端 prompt
3. 各成员 agent 执行 `member_upload_prompt.md`
4. 验收 agent 执行 `dashboard_check_prompt.md`

## 当前边界
- 这组 prompt 基于当前已验收的“管理员签发 key”模式。
- 还不是“用户在网站上自助注册并领取 key”的模式。
