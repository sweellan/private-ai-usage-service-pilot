# Validation Summary

## Result
- status: pass
- validation_mode: fixture_based_end_to_end
- test_command: `node --test tests/team_usage_report.test.mjs`
- cli_command: `node run_team_usage_report.mjs --manifest tests/fixtures/team_usage/members.csv --output-dir runs/260330_1939_TeamUsageMvpAcceptance_v1/output --team-name "Fixture Team MVP"`

## Assertions
- 自动化测试共 5 项，全部通过。
- CLI 成功生成 6 个输出 artifact：
  - `team_usage_report.json`
  - `member_summary.csv`
  - `source_usage.csv`
  - `team_daily_usage.csv`
  - `summary.md`
  - `dashboard.html`
- fixture 聚合结果与测试预期一致：
  - total_tokens = `3000`
  - total_members = `2`
  - codex total_tokens = `1900`
  - 2026-03-30 accounted_total_tokens = `1300`

## Current Boundary
- 当前团队版 MVP 只聚合成员级、来源级、按天级数据。
- 当前故意不聚合项目 totals，因为个人版 `local_usage_report.json` 只暴露截断后的 `topProjects`，直接汇总会形成不完整总和。
