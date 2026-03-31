# Auto Upload Acceptance Run

## 目标
- 验证“签发 API key -> 成员 client init -> 成员 sync 上传 -> 服务端 dashboard 可见”的完整链路。

## 本次覆盖
- 本地自动上传服务端
- API key 签发
- 成员 client init / status / sync
- 团队 report JSON
- setup 页与 dashboard 页

## 产物
- `test_output.txt`
- `state.json`
- `alice_key.json`
- `bob_key.json`
- `alice_init.json`
- `alice_sync.json`
- `bob_init.json`
- `bob_sync_retry.json`
- `health.json`
- `server.log`
- `output/team_usage_report.json`
- `output/dashboard.html`
- `output/setup.html`
- `validation_summary.md`
