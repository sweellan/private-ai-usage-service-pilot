# Team Usage MVP Acceptance Run

## 目标
- 用 fixture member manifest 真实跑通团队版 CLI。
- 验证输出 artifact 是否完整。
- 把自动化测试输出与本次验收结论一起归档。

## 输入
- manifest: `../../tests/fixtures/team_usage/members.csv`
- CLI: `../../run_team_usage_report.mjs`

## 产物
- `test_output.txt`：本次自动化测试输出。
- `validation_summary.md`：本次验收结论。
- `output/team_usage_report.json`
- `output/member_summary.csv`
- `output/source_usage.csv`
- `output/team_daily_usage.csv`
- `output/summary.md`
- `output/dashboard.html`
