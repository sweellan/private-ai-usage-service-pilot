# Submission Flow Acceptance Run

## 目标
- 验证“成员提交单文件 -> 收集端批量聚合”的完整链路。

## 本次流程
- 先用 `run_team_usage_submission.mjs` 为 Alice / Bob 生成 `team_usage_submission.json`
- 再用 `collect_team_usage_submissions.mjs` 从 `submissions/` 批量收集
- 最终输出团队聚合产物到 `output/`

## 产物
- `alice_submit.log`
- `bob_submit.log`
- `collector.log`
- `submission_files.txt`
- `submissions/`
- `output/team_usage_report.json`
- `output/member_summary.csv`
- `output/source_usage.csv`
- `output/team_daily_usage.csv`
- `output/summary.md`
- `output/dashboard.html`
