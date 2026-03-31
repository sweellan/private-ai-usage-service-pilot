# 每日本地 Usage 统计

- 生成时间: 2026-03-23T08:38:53.669Z
- 时区: Asia/Shanghai
- 主机名: MBP-D1HJ5HD6KV-1838.local
- 是否发起网络请求: false
- 上游源码提交: d8db89148f2954265bf3eabce4c85bde98a18a00

## 总览
- 总 buckets: 1,603
- 总 sessions: 6,034
- 总 tokens（MECE 总和）: 7,294,302,659
- 其中 input_non_cached_tokens: 651,764,810
- 其中 cached_input_read_tokens: 6,595,006,089
- 其中 output_non_reasoning_tokens: 25,426,978
- 其中 reasoning_output_tokens: 22,104,782
- 旧口径 totalTokens（不含 cached_input_read）: 699,296,570
- 总活跃时长（小时）: 3568.2
- 总会话跨度（小时）: 3741.5
- parser 成功数: 10
- parser 失败数: 0
- 按天记录行数: 68

## MECE 口径
- 拆分方法：input_non_cached_tokens + cached_input_read_tokens + output_non_reasoning_tokens + reasoning_output_tokens。
- 这个拆分在已归一化 parser 层面互斥且合并后可回到总量。
- 例外说明：Copilot 的 cache write token 没有单独字段，目前并入 input_non_cached_tokens，不额外拆第五类。
- 报表归一化：如果上游日志异常导致某一类被算成负数，本地报表会先钳制到 0 再入图和入表。

## 来源汇总
- codex: 总 7,206,191,265 tokens，其中 input 614,646,304 / cached 6,547,712,384 / output 25,165,293 / reasoning 18,667,284
- gemini-cli: 总 86,124,971 tokens，其中 input 36,878,157 / cached 45,565,193 / output 249,020 / reasoning 3,432,601
- claude-code: 总 1,403,500 tokens，其中 input 145,765 / cached 1,252,608 / output 5,127 / reasoning 0
- opencode: 总 582,923 tokens，其中 input 94,584 / cached 475,904 / output 7,538 / reasoning 4,897
- copilot-cli: 总 0 tokens，其中 input 0 / cached 0 / output 0 / reasoning 0
- openclaw: 总 0 tokens，其中 input 0 / cached 0 / output 0 / reasoning 0
- qwen-code: 总 0 tokens，其中 input 0 / cached 0 / output 0 / reasoning 0
- kimi-code: 总 0 tokens，其中 input 0 / cached 0 / output 0 / reasoning 0
- amp: 总 0 tokens，其中 input 0 / cached 0 / output 0 / reasoning 0
- droid: 总 0 tokens，其中 input 0 / cached 0 / output 0 / reasoning 0

## 项目 Top 10
- codex / 20250418_Analysis_Agent_Eval: 1,879,060,751 tokens，覆盖 249 buckets
- codex / 20250923_AgentInterns: 1,805,589,057 tokens，覆盖 350 buckets
- codex / Workspace: 1,370,521,724 tokens，覆盖 175 buckets
- codex / 10_projects: 1,349,458,596 tokens，覆盖 154 buckets
- codex / 20260202_OpenClaw: 281,186,737 tokens，覆盖 56 buckets
- codex / 20250312_RepoCloneTests: 229,184,047 tokens，覆盖 46 buckets
- codex / 30_library: 125,086,885 tokens，覆盖 24 buckets
- gemini-cli / unknown: 86,124,971 tokens，覆盖 185 buckets
- codex / memories: 81,756,053 tokens，覆盖 66 buckets
- codex / 260311_timestamp_granularity_batch2: 25,156,914 tokens，覆盖 4 buckets

## 近14天按天数据
- 2026-03-10: 总 220,645,403 = input 23,182,628 + cached 195,573,227 + output 1,306,860 + reasoning 582,688，sessions_started 54
- 2026-03-11: 总 236,821,667 = input 30,764,139 + cached 204,404,024 + output 1,110,978 + reasoning 542,526，sessions_started 41
- 2026-03-12: 总 337,552,862 = input 32,251,074 + cached 303,767,442 + output 1,041,436 + reasoning 492,910，sessions_started 43
- 2026-03-13: 总 583,741,617 = input 75,966,916 + cached 503,821,598 + output 2,090,657 + reasoning 1,862,446，sessions_started 1,087
- 2026-03-14: 总 3,003,911 = input 447,020 + cached 2,527,744 + output 19,485 + reasoning 9,662，sessions_started 2
- 2026-03-15: 总 3,124,816 = input 460,099 + cached 2,641,024 + output 16,483 + reasoning 7,210，sessions_started 1
- 2026-03-16: 总 93,681,644 = input 11,321,396 + cached 81,963,904 + output 267,529 + reasoning 128,815，sessions_started 12
- 2026-03-17: 总 493,772,054 = input 73,279,032 + cached 417,006,615 + output 2,313,727 + reasoning 1,172,680，sessions_started 131
- 2026-03-18: 总 233,380,927 = input 53,169,050 + cached 178,895,488 + output 857,937 + reasoning 458,452，sessions_started 36
- 2026-03-19: 总 344,396,956 = input 54,108,287 + cached 288,346,161 + output 1,297,596 + reasoning 644,912，sessions_started 58
- 2026-03-20: 总 43,801,583 = input 5,164,474 + cached 38,335,744 + output 199,744 + reasoning 101,621，sessions_started 6
- 2026-03-21: 总 76,303,953 = input 5,412,599 + cached 70,520,448 + output 249,035 + reasoning 121,871，sessions_started 20
- 2026-03-22: 总 42,314,860 = input 4,196,931 + cached 37,884,032 + output 170,476 + reasoning 63,421，sessions_started 12
- 2026-03-23: 总 116,658,215 = input 18,152,238 + cached 97,935,104 + output 411,252 + reasoning 159,621，sessions_started 8

## 图表产物
- `daily_tokens_trend_14d.svg`：近14天按日总 tokens 趋势图，带点位标签。
- `daily_tokens_mece_14d.svg`：近14天按日 MECE 分类堆叠图，带总量标签。
- `daily_usage.csv`：完整按天明细，适合继续透视或导入别的工具。

## 错误
- 无
