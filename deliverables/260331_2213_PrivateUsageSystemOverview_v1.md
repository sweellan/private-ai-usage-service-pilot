# Private Usage System Overview v1

## 系统目标
- 让每位成员在本机自动上传 AI usage 数据
- 不要求成员手工网页登录或手配一堆参数
- 管理员可看团队视角
- 普通成员只能看自己的视角
- durable 数据层不放在 OpenClaw 本机，而放在 Supabase

## 整体架构

### 1. 成员侧
- 每位成员拿到一份私有 access token
- 成员 agent 通过一份成品 prompt 完成：
  - 下载最小 uploader
  - 初始化 config
  - 上传一次真实 usage
  - 安装每日自动同步

### 2. 私有服务层
- 私有服务运行在远端主机
- 当前公开入口：
  - `https://versicolor-charla-nonmutinously.ngrok-free.dev/private-ai-usage`
- 它负责：
  - 校验成员 token
  - 接收上传
  - 读取 Supabase
  - 给管理员/成员渲染页面

### 3. Supabase
- Supabase 是 source of truth
- 当前 schema：
  - `ai_usage.projects`
  - `ai_usage.principals`
  - `ai_usage.usage_reports`
  - `ai_usage.upload_events`
  - `ai_usage.latest_usage_reports`

## 权限模型

### member
- 只能用自己的 token 上传
- 登录后只能看到自己的页面
- 页面展示自己的：
  - 总览
  - by-day 图表
  - input / cached / output / reasoning breakdown

### admin
- 用 admin token 登录
- 先看团队视角
- 可切换到任何成员视角
- 团队视角里看：
  - 成员对比
  - 团队 daily breakdown
  - 成员列表

## 为什么普通同学拿不到管理员权限
- 权限不是前端页面参数决定的
- 权限在 Supabase 的 `ai_usage.principals.role` 中定义
- 服务端只验证 token hash，不在公开代码里放 admin 明文 token
- 普通同学 prompt 只会收到自己的 member token
- `SUPABASE_SERVICE_ROLE_KEY` 只在私有 `.env.local` 和远端服务里

## 当前管理员凭证在哪里
- 每位管理员都有自己的私有 bundle 文件
- 例如：
  - `private_ops_seed/bootstrap_output/yc_admin_bundle.json`
  - `private_ops_seed/bootstrap_output/members/ben/ben_bundle.json`
- 这些文件不能发给普通成员

## 当前已完成能力
- 成员一次配置即可上传
- 成员可每日自动同步
- 管理员可登录团队页
- 团队页与成员页共用图表位
- 团队/成员切换时，图表内容会真正切换
- 主图为单一堆积柱图，并长期显示总量标签

## 当前数据粒度
- 当前已经有：
  - total tokens
  - input
  - cached
  - output
  - reasoning
  - sessions
  - daily usage
- 对于某些成员，如果上传的原始格式是 `items` 风格，服务端也会归一化成统一的 `dailyUsage` 结构

## 当前还没做完的部分
- 时间范围筛选 UI
- `Day / Week / Month` 切换
- 更完整的 tooltip / 图表验收 polish

## 给老板/管理员的使用方式
1. 打开管理员 prompt
2. 让 agent 完成一次配置和上传
3. 登录管理员页面
4. 先看 Team，再切换成员检查个人使用情况
