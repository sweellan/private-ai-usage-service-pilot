# 团队内部 Usage 统计

- 团队名: Fixture Team MVP
- 生成时间: 2026-03-30T11:39:05.737Z
- 时区: Asia/Shanghai
- 成员数: 2
- 报告数: 2
- 是否发起网络请求: false

## 总览
- 总 tokens（MECE）: 3,000
- input_non_cached_tokens: 1,000
- cached_input_read_tokens: 1,050
- output_non_reasoning_tokens: 650
- reasoning_output_tokens: 300
- 总 buckets: 7
- 总 sessions: 12
- 总活跃时长（小时）: 2.5
- 总会话跨度（小时）: 4.5
- 来源数: 3
- 按天记录行数: 3

## 成员 Top 10
- Bob (Infra): 2,000 tokens，hostname=bob-mbp
- Alice (Search): 1,000 tokens，hostname=alice-mbp

## 来源 Top 10
- codex: 1,900 tokens，成员覆盖 2
- claude-code: 800 tokens，成员覆盖 1
- gemini-cli: 300 tokens，成员覆盖 1

## 近14天团队趋势
- 2026-03-29: 总 600 tokens，活跃成员 1，sessions_started 3
- 2026-03-30: 总 1,300 tokens，活跃成员 2，sessions_started 5
- 2026-03-31: 总 1,100 tokens，活跃成员 1，sessions_started 4

## 当前边界
- 项目聚合: not available yet
- 说明: Current local_usage_report.json only exposes truncated topProjects, so this team MVP does not aggregate project totals to avoid misleading partial sums.

## 错误
- Alice / claude-code: fixture parser error
