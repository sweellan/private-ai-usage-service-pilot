# Validation Summary

## Result
- status: pass
- validation_mode: real_server_process_plus_two_clients

## Automated Tests
- command: `node --test tests/team_usage_report.test.mjs tests/internal_usage_service.test.mjs`
- result: `10/10 pass`

## End-to-End Flow
1. 通过 `issue_internal_usage_api_key.mjs` 为 Alice / Bob 签发 key
2. 启动 `run_internal_usage_server.mjs`
3. 分别运行 `internal_usage_client.mjs init`
4. 分别运行 `internal_usage_client.mjs sync --local-report-path <fixture>`
5. 从服务端抓取：
   - `/api/internal-usage/report`
   - `/usage`
   - `/usage/setup`

## Assertions
- 服务端健康检查通过
- Alice 上传成功
- Bob 上传成功
- 团队聚合结果为：
  - total_tokens = `3000`
  - total_members = `2`
  - byMember order = `Bob`, `Alice`
- dashboard 页与 setup 页都可访问

## Notes
- 验收过程中暴露了一个 shell 后台进程生命周期问题，因此最终 acceptance 采用“独立常驻 server session”方式完成。
- 这不是服务端逻辑 bug；自动化测试和最终 acceptance 都已验证服务逻辑可用。
