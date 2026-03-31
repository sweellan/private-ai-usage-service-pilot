# 每日本地 Usage 统计

- 生成时间: 2026-03-27T06:30:39.813Z
- 时区: Asia/Shanghai
- 主机名: MBP-D1HJ5HD6KV-1838.local
- 是否发起网络请求: false
- 上游源码提交: d8db89148f2954265bf3eabce4c85bde98a18a00

## 总览
- 总 buckets: 1,660
- 总 sessions: 6,037
- 总 tokens（MECE 总和）: 7,695,057,264
- 其中 input_non_cached_tokens: 726,126,389
- 其中 cached_input_read_tokens: 6,919,767,972
- 其中 output_non_reasoning_tokens: 26,596,003
- 其中 reasoning_output_tokens: 22,566,900
- 旧口径 totalTokens（不含 cached_input_read）: 775,289,292
- 总活跃时长（小时）: 3784.6
- 总会话跨度（小时）: 3957.9
- parser 成功数: 10
- parser 失败数: 0
- 按天记录行数: 72

## MECE 口径
- 拆分方法：input_non_cached_tokens + cached_input_read_tokens + output_non_reasoning_tokens + reasoning_output_tokens。
- 这个拆分在已归一化 parser 层面互斥且合并后可回到总量。
- 例外说明：Copilot 的 cache write token 没有单独字段，目前并入 input_non_cached_tokens，不额外拆第五类。
- 报表归一化：如果上游日志异常导致某一类被算成负数，本地报表会先钳制到 0 再入图和入表。

## 来源汇总
- codex: 总 7,606,806,202 tokens，其中 input 688,911,947 / cached 6,872,435,584 / output 26,334,318 / reasoning 19,124,353
- gemini-cli: 总 86,264,639 tokens，其中 input 36,974,093 / cached 45,603,876 / output 249,020 / reasoning 3,437,650
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
- codex / 10_projects: 1,746,474,015 tokens，覆盖 202 buckets
- codex / Workspace: 1,372,497,419 tokens，覆盖 180 buckets
- codex / 20260202_OpenClaw: 281,186,737 tokens，覆盖 56 buckets
- codex / 20250312_RepoCloneTests: 229,184,047 tokens，覆盖 46 buckets
- codex / 30_library: 125,086,885 tokens，覆盖 24 buckets
- gemini-cli / unknown: 86,264,639 tokens，覆盖 187 buckets
- codex / memories: 81,756,053 tokens，覆盖 66 buckets
- codex / 260311_timestamp_granularity_batch2: 25,156,914 tokens，覆盖 4 buckets

## 近14天按天数据
- 2026-03-14: 总 3,003,911 = input 447,020 + cached 2,527,744 + output 19,485 + reasoning 9,662，sessions_started 2
- 2026-03-15: 总 3,124,816 = input 460,099 + cached 2,641,024 + output 16,483 + reasoning 7,210，sessions_started 1
- 2026-03-16: 总 93,681,644 = input 11,321,396 + cached 81,963,904 + output 267,529 + reasoning 128,815，sessions_started 12
- 2026-03-17: 总 493,772,054 = input 73,279,032 + cached 417,006,615 + output 2,313,727 + reasoning 1,172,680，sessions_started 131
- 2026-03-18: 总 233,380,927 = input 53,169,050 + cached 178,895,488 + output 857,937 + reasoning 458,452，sessions_started 36
- 2026-03-19: 总 344,396,956 = input 54,108,287 + cached 288,346,161 + output 1,297,596 + reasoning 644,912，sessions_started 58
- 2026-03-20: 总 40,024,992 = input 4,621,735 + cached 35,132,928 + output 178,341 + reasoning 91,988，sessions_started 3
- 2026-03-21: 总 71,217,929 = input 4,786,666 + cached 66,104,320 + output 217,943 + reasoning 109,000，sessions_started 13
- 2026-03-22: 总 12,262,024 = input 1,560,783 + cached 10,625,920 + output 59,898 + reasoning 15,423，sessions_started 1
- 2026-03-23: 总 124,364,550 = input 20,486,631 + cached 103,292,672 + output 419,392 + reasoning 165,855，sessions_started 4
- 2026-03-24: 总 239,419,380 = input 30,059,996 + cached 208,376,219 + output 680,236 + reasoning 302,929，sessions_started 15
- 2026-03-25: 总 21,192,194 = input 4,221,311 + cached 16,944,128 + output 20,098 + reasoning 6,657，sessions_started 0
- 2026-03-26: 总 142,410,631 = input 36,867,758 + cached 104,855,936 + output 520,123 + reasoning 166,814，sessions_started 6
- 2026-03-27: 总 28,941,516 = input 4,682,941 + cached 24,105,088 + output 103,501 + reasoning 49,986，sessions_started 7

## 图表产物
- `daily_tokens_trend_14d.svg`：近14天按日总 tokens 趋势图，带点位标签。
- `daily_tokens_mece_14d.svg`：近14天按日 MECE 分类堆叠图，带总量标签。
- `daily_usage.csv`：完整按天明细，适合继续透视或导入别的工具。

## 错误
- 无
