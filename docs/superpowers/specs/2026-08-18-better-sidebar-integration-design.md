# 2026-08-18 dsh-agent-teams UI 集成进 better-sidebar 设计

## 背景与目标

dsh-agent-teams 目前有一个独立的右上角活动面板（body portal 浮层 + 收起小浮标），随插件自带 Web UI。用户明确要求：**不再独立 UI**，将活动面板集成进 dsh-better-sidebar（VSCode 风格右侧 sidebar），由 better-sidebar 的 tab 承载。

目标：

- 删除独立浮层/浮标/让位逻辑。
- 在 better-sidebar 注册一个 AgentTeams tab，完整承载活动面板内容（成员树、任务进度、交互 DAG、历史归档、点击成员跳转）。
- 保留对话流卡片，但把“活动面板”按钮改为打开 better-sidebar 的 AgentTeams tab。
- 尽量最小改动，功能不降级；无 better-sidebar 时静默降级。

## 决策记录

1. **宿主策略**：只支持 better-sidebar，不保留浮窗兜底。
2. **依赖声明**：`dsh-better-sidebar` 作为 optional peerDependency（`^0.13.0`），不加入 dependencies；客户端结构类型引用 + 运行时探测。
3. **卡片**：保留对话流卡片，按钮改为打开 sidebar tab；无宿主时按钮隐藏，不报错。
4. **打开 tab 行为**：只调用 `betterSidebar.openTab({ type: 'agent-teams' })`，不强开侧栏/不强展开面板。
5. **组件边界**：抽取共享 `ActivityView` 内容组件 + `AgentTeamsTab` 外壳；删除 `ActivityPanel` 浮层外壳和状态机。
6. **样式**：裁剪复用现有 `ActivityPanel.module.css`，重命名为 `ActivityView.module.css`，保留内容区类名，只删浮层外壳/全局让位/媒体查询浮层专属部分。
7. **tab 常驻与 badge**：tab 始终在 sidebar 入口可见；badge 显示当前会话的团队数；无团队显示空态。
8. **轮询**：保留 1s 快照轮询，仅在 tab `visible` 时拉取，切走即停。

## 架构与改动

### 组件结构

```
src/client/
  ActivityView.tsx        # 原先 ActivityPanel 内容抽成共享组件，入参 teams/onNavigate
  AgentTeamsTab.tsx       # better-sidebar tab component，负责取会话、轮询、把数据交给 ActivityView
  ActivityView.module.css # 由 ActivityPanel.module.css 裁剪改名，保留内容区样式
  AgentTeamsCard.tsx      # 保留；按钮改为 openTab
  index.tsx               # 不再挂浮层；探测 betterSidebar 注册 tab；把 openTab 注入卡片
```

### 关键接口

- `ActivityView` props：
  - `teams: readonly ActivityTeam[]`
  - `archivedTeams: readonly ActivityTeam[]`
  - `historic`（旧卡片数据映射）
  - `onNavigate: (sessionId: SessionId) => void`
  - `currentSessionId?: SessionId`
- `AgentTeamsTab` 使用 `TabComponentProps`：
  - `scope.sessionId` 作为当前会话（captain 判定）
  - `ctx.sessions.list` 用于 `openSession`
  - `ctx.get('betterSidebar')` 已由宿主提供（注册方判定）

### 无宿主降级

- `apply()` 中 `const service = ctx.get('betterSidebar')`；不存在则 `curately skip`——不注册 tab、不报错。
- 对话流卡片注入函数在无宿主时传 `openAgentTeamsTab: undefined`，按钮隐藏。
- 所有 `service?.openTab(...)` / `service?.registerTab(...)` 都有显式守卫。

## 数据流

- 快照轮询 `/plugins/dsh-agent-teams/state` 与 `?archived=1`（原逻辑不变）。
- 会话跟随：用 `scope.sessionId`（sidebar 当前会话）过滤 `captainSessionId === sessionId`，与当前浮层逻辑一致。
- 成员跳转：`sessions.open?.(memberSessionId)` / `sessions.openSubagent?.(address)`（沿用较好 sidebar 的导航能力）。

## 删除项

- `ActivityPanel.tsx` 的浮层外壳、`CollapsedBadge`、展开/收起状态机、`PANEL_OPEN_ATTRIBUTE`、`useLayoutEffect` 让位逻辑、body portal 挂载。
- `ActivityPanel.module.css` 中 `.badge`/`.panel`/`.panelHead`/全局 `html[data-agent-teams-panel-open]`/媒体查询浮层专属部分。
- `OPEN_PANEL_EVENT` 窗口事件（如卡片不再需要）。

## 兼容与风险

- `AgentTeamsCard` 保留在对话流，但按钮依赖 better-sidebar；无宿主时按钮不显示。
- `dsh-better-sidebar` 为可选宿主；未安装时插件其余能力（工具、成员、任务）完全不受影响。
- better-sidebar 服务类型通过结构类型访问（不直接 import 其源码），避免强依赖。

## 验证计划

- `pnpm build && pnpm typecheck && pnpm verify`（现有验证全部通过）。
- 组合配置：装 better-sidebar 后 `dsh --profile web --dump-config` 确认无冲突。
- GUI 手动验证：
  1. 安装 better-sidebar 时：侧栏出现 AgentTeams tab；创建团队/任务/依赖，tab 实时刷新；badge 显示团队数。
  2. 禁用/卸载 better-sidebar：页面无报错；卡片按钮隐藏。
  3. 历史会话打开卡片，“AgentTeams”按钮能打开 sidebar tab 并显示归档。