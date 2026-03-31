# Public Repo Boundary And RBAC Plan v1

## 目的
- 把当前 `ai-usage` 原型从“临时脚本 + 远端部署试跑”推进到“可公开维护的代码仓库 + 私有部署配置 + 清晰权限模型”。
- 明确哪些内容可以进 public repo，哪些内容必须留在 private ops / prompt 层。
- 由本地主 Agent 负责权限模型设计，不再把这部分设计交给 OpenClaw 端临时发挥。

## 已锁定决策
- public repo 里不暴露：
  - 当前公网域名
  - 当前部署端口
  - API key
  - 任何私有 prompt
  - OpenClaw 网关 / SSH / tunnel / token 细节
- prompt pack 不进入 public repo。
- OpenClaw 端后续只负责：
  - `git pull`
  - 部署同步
  - 环境配置
  - 健康检查
- 公开仓库由本地维护，OpenClaw 不作为主编辑面。

## Public Repo 应包含什么
- 通用 server 代码
- 通用 client 代码
- 数据 schema
- 数据校验逻辑
- RBAC 实现
- 示例 `.env.example`
- 通用 deployment docs
- 测试用 fixture
- 不带任何真实私有地址的 prompt 模板说明

## Public Repo 不应包含什么
- 当前真实服务地址
- 当前 nginx / ngrok / OpenClaw 专属配置
- 真实成员 key
- 真实数据快照
- 私有运维 prompt
- OpenClaw DM 协作内容
- 任何能直接访问你当前服务端的配置文件

## Repo 分层建议

### 1. Public repo
- 目标：任何成员或外部协作者都可以 clone
- 内容：
  - `server/`
  - `client/`
  - `shared/`
  - `tests/`
  - `docs/`
  - `.env.example`
- 要求：
  - 无 secrets
  - 无私有 URL
  - 无 prompt pack

### 2. Private ops layer
- 目标：只给管理员 / 部署端使用
- 内容：
  - 真实域名
  - nginx 配置
  - systemd 配置
  - key 管理规则
  - prompt pack
  - OpenClaw 同步说明

### 3. Member prompt layer
- 目标：发给成员自己的 coding agent
- 内容：
  - clone public repo
  - 填入 server URL 与个人 key
  - init / sync / self-check
- 注意：
  - prompt 内容本身不放进 public repo
  - prompt 可以引用 public repo 的 README / docs，但不能反过来把私有 prompt 暴露出去

## RBAC 设计

## 角色
- `admin`
  - 可看全局 dashboard
  - 可看所有成员
  - 可签发 / 撤销 key
  - 可看审计日志
- `member`
  - 只能看自己的 profile / usage / upload history
  - 不能看其他成员
  - 不能看全局汇总
- `service`
  - 只负责 ingest / audit / validation
  - 不对应人类 UI 角色

## 资源
- `member_profile`
- `member_usage_summary`
- `member_upload_history`
- `global_dashboard`
- `member_directory`
- `api_key_management`
- `audit_log`

## 权限矩阵
- `admin`
  - `member_profile`: all
  - `member_usage_summary`: all
  - `member_upload_history`: all
  - `global_dashboard`: allow
  - `member_directory`: allow
  - `api_key_management`: allow
  - `audit_log`: allow
- `member`
  - `member_profile`: self only
  - `member_usage_summary`: self only
  - `member_upload_history`: self only
  - `global_dashboard`: deny
  - `member_directory`: deny
  - `api_key_management`: deny
  - `audit_log`: deny

## 认证模型建议
- 不走“一个公开 setup 页列出所有 key”
- 改成双层 key：
  - `admin key`
    - 仅管理员持有
    - 可签发 / 撤销 member key
  - `member key`
    - 仅成员自己的 client 持有
    - 只能上传和查看自己的数据

## 建议的页面拆分
- `/ai-usage/login` 或最小 key-entry gate
- `/ai-usage/me`
  - 成员自己的 dashboard
- `/ai-usage/me/uploads`
  - 成员自己的上传历史
- `/ai-usage/admin`
  - 管理员全局 dashboard
- `/ai-usage/admin/members`
  - 管理员成员管理页
- `/ai-usage/admin/keys`
  - 管理员 key 管理页

## API 权限建议
- `POST /api/upload`
  - `member key`
  - 只允许写入该 key 对应成员
- `GET /api/me`
  - `member key`
  - 返回该成员 summary
- `GET /api/me/uploads`
  - `member key`
  - 返回该成员 history
- `GET /api/admin/dashboard`
  - `admin key`
- `GET /api/admin/members`
  - `admin key`
- `POST /api/admin/issue-key`
  - `admin key`
- `POST /api/admin/revoke-key`
  - `admin key`

## 为什么不把 setup 页做成公开发 key 页面
- 公开 setup 页最大的风险不是“别人看到功能说明”，而是：
  - 误暴露所有成员 key
  - 误暴露可写接口
  - 让 setup 页兼任 onboarding 与管理控制面，边界会越来越糊
- 更稳的做法：
  - setup 页只保留通用安装说明
  - key 分发和成员绑定走 admin 面

## 防篡改边界

## 必须先说清楚的现实边界
- 如果成员完全控制自己的本地机器、本地代码和本地数据，那么**不可能做到绝对防篡改**。
- 能做到的是：
  - 让伪造更难
  - 让异常更容易被发现
  - 让每次上传可追踪、可审计

## 最低防护
- append-only 上传日志
- 服务端保留原始 payload
- 每次上传记录：
  - member id
  - client version
  - uploaded_at
  - source hostname
  - raw summary hash
- 不允许覆盖历史，只允许新增记录

## 建议防护
- client version allowlist
- payload schema validation
- session id 去重 / 幂等检查
- 原始 report hash 与 summary 一致性检查
- 异常跳变检测
- 重新上传保留版本链

## 更强但更重的防护
- 签名构建的 client
- 受管机器/MDM
- 服务端下发 challenge nonce
- 直接采原始日志片段或 manifest hash
- 中央托管执行环境

## 我对这条线的建议
- 不要把“防造假”当成一期必须完全解决的问题
- 一期先做：
  - RBAC
  - token schema
  - append-only 审计
  - admin/member 分页
- 二期再做：
  - anomaly detection
  - client release allowlist
  - upload integrity hints

## 当前推进建议
1. 先把 public repo seed 做出来，确保没有 secrets / prompts。
2. 先在本地实现 RBAC 版本的 server contract。
3. 再让 OpenClaw 只做“从 repo 同步 + 部署”。
4. 最后再补成员 prompt 分发方案。

## 需要用户后续拍板但不急
- public repo 是否真正公开到 GitHub
- 默认 license 是否采用 `MIT`
- 管理员是否允许看到成员级原始上传 history
- member key 是否长期有效还是定期轮换
