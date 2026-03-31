# Team View Scalability Test Plan v1

## 目标
- 在本地先验证“成员增多后的 team 视图”是否仍可读、可操作、可排序。
- 在任何远端部署前，先通过自动化检查 + 本地截图自验。
- 通过同一套验收口径，避免再次把用户当视觉和交互测试员。

## 本轮必须覆盖的改动范围
- member 切换从并排按钮改成可扩展方案
- team 主图从“多人并列周期柱图”改成可扩展排序视图
- 排序规则明确为“按当前结束周期从高到低”
- 人数过多时的显示退化策略明确且可验

## 测试原则
- 先本地 no-auth preview，再远端
- 先 dense fixture，再真实数据
- 先自动化逻辑断言，再截图
- 任何一轮截图未过，不部署远端

## 测试分层

### 1. 逻辑层自动化测试
- 文件：
  - `tests/private_usage_service.test.mjs`
- 新增断言目标：
  - admin team 视图默认包含 `Team` 主入口 + member selector 容器
  - member selector 不再依赖成员按钮平铺
  - team ranking 数据按“当前结束周期 tokens”降序排列
  - 12+ 人场景下所有成员都仍然存在于排序结果中，不裁掉、不聚合
  - 排序切换窗口后，排名会跟随当前结束周期变化

### 2. 本地 preview 场景测试
- 入口：
  - `run_local_private_usage_preview.mjs`
- 需要支持的场景：
  - `small-team`
    - 3-4 人，验证基础布局不回退
  - `dense-team`
    - 12+ 人，验证 member selector / team chart / table 排序
  - `dense-team-long-window`
    - 12+ 人 + 40~60 个周期，验证拖动滑块后主框宽度不变化

### 3. 截图层验收
- 浏览器：
  - `google-chrome --headless --screenshot`
- 本地必须生成并人工自看：
  - `small_team_default.png`
  - `dense_team_default.png`
  - `dense_team_window_dragged.png`
  - `dense_team_member_selected.png`
- 远端必须生成并人工自看：
  - `remote_dense_team_default.png`
  - `remote_dense_team_window_dragged.png`

## 具体验收标准

### A. 成员切换
- 通过标准：
  - 头部只保留 `Team` 主入口 + 一个成员切换器
  - 12+ 人时不出现一整排成员按钮撑爆布局
  - 切换器内成员按当前结束周期从高到低排序
  - 已选成员在切换器标题中可见
- 不通过标准：
  - 成员仍以按钮平铺为主
  - 10+ 人时头部换行混乱
  - 排序与当前结束周期不一致

### B. 团队主图
- 通过标准：
  - team 主图为“当前结束周期全员排序图”
  - 每个条形都有数据标签
  - 排名顺序与当前结束周期一致
  - 12+ 人时仍显示所有成员，只是使用从高到低排序与更适合的图形密度
  - 滑块变动只影响排名基准周期与条形长度，不影响主框宽度
- 不通过标准：
  - 仍是每周期 * 每成员的并列柱图
  - 无数据标签
  - 人多时顺序混乱或成员被截断
  - 拖动滑块导致整个图横向扩展

### C. 表格联动
- 通过标准：
  - team 表格默认使用与主图一致的排序
  - 结束周期变化后 team 表格排序同步更新

## 建议实现辅助
- 新增 dense fixture 生成函数，避免手写 12+ 份 JSON
- 将 team 排名计算抽成纯函数，便于单测：
  - 输入：member reports + grain + end period
  - 输出：full sorted rows

## 远端部署前闸门
- `node --test tests/private_usage_service.test.mjs` 全绿
- 本地 dense-team 四张截图已人工自看通过
- 本地确认“拖动滑块时主框宽度不变”
- 变更已写入 run summary 后，才允许：
  - SSH 同步远端
  - 重启 `ai-usage-private.service`
  - 远端截图复验
  - GitHub push

## GitHub push 前闸门
- 远端 HTML 验证通过
- 远端截图通过
- 本轮 run 目录包含：
  - 测试方案
  - 本地截图
  - 远端截图
  - 部署摘要

## 本轮执行结果
- 逻辑测试：
  - `node --test tests/private_usage_service.test.mjs`
  - 结果：`pass 3 / fail 0`
- 本地 dense preview 已自验通过：
  - `screenshots/dense_team_default_v1.png`
  - `screenshots/dense_team_member_selected_v2.png`
  - `screenshots/dense_team_member_view_v1.png`
  - `screenshots/dense_team_window_dragged_v2.png`
- 远端已部署并复验：
  - 网页返回已包含 `memberSelect`
  - 网页返回已包含 `团队当前周期排名`
  - 网页返回已包含 `All members sorted by current period`
  - 远端截图：
    - `remote_screenshots/remote_team_default_v2.png`
- GitHub：
  - private repo: `https://github.com/sweellan/private-ai-usage-service-pilot`
