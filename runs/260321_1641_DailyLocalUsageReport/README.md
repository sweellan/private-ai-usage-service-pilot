# 每日本地 Usage 统计 Run

- 本次 run 只读取本地 usage 日志。
- 本次 run 不会调用 vibe-cafe 的 ingest API。
- 主要产物：
  - `local_usage_report.json`
  - `daily_usage.csv`
  - `daily_tokens_trend_14d.svg`
  - `daily_tokens_mece_14d.svg`
  - `dashboard.html`
  - `summary.md`
