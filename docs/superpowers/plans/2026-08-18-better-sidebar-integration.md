# dsh-agent-teams UI 集成进 better-sidebar 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 dsh-agent-teams 的活动面板 UI 从独立右上角浮层迁移为 better-sidebar 的 AgentTeams tab，并让对话卡片按钮打开该 tab。

**Architecture:** 客户端保留原有活动内容（成员树、进度、DAG、历史）为一个共享 `ActivityView` 组件；新增 `AgentTeamsTab` 作为 better-sidebar tab 外壳，通过 `ctx.get('betterSidebar')` 运行时探测与注册。无 better-sidebar 时静默跳过注册、卡片按钮隐藏。样式从 `ActivityPanel.module.css` 裁剪为 `ActivityView.module.css`。

**Tech Stack:** React 18、TypeScript 5.9、tsdown 0.22、lightningcss、@deepseek-ai/dsh-client-runtime/client、@deepseek-ai/dsh-client-ui-primitives、@deepseek-ai/dsh-client-ui-conversation（类型）、dsh-better-sidebar 服务（运行时探测）。

## Global Constraints

- better-sidebar 版本下限：`^0.13.0`（optional peerDependency）。
- 客户端不得值 import `dsh-better-sidebar`；只能通过 `ctx.get('betterSidebar')` 结构类型探测。
- 无 better-sidebar 时：不注册 tab、不报错、静默跳过；卡片按钮隐藏。
- 保留对话流卡片；按钮只调用 `betterSidebar.openTab({ type: 'agent-teams' })`，不强开侧栏。
- tab 常驻；badge 显示当前会话团队数；无团队时内容显示空态。
- 仅 tab `visible` 时轮询快照；不可见时暂停。
- 删除全部浮层外壳逻辑（`ActivityPanel`/`CollapsedBadge`/`OPEN_PANEL_EVENT`/`PANEL_OPEN_ATTRIBUTE`/body portal/全局让位 CSS）。
- `pnpm build && pnpm typecheck && pnpm verify` 必须全部通过。

---

## 文件结构

- 新建：`src/client/ActivityView.tsx`
- 新建：`src/client/AgentTeamsTab.tsx`
- 新建：`src/client/agent-teams-tab-constants.ts`（共享 tab id/事件名/URL 常量）
- 修改重命名：`src/client/ActivityPanel.module.css` → `src/client/ActivityView.module.css`（裁剪）
- 删除：`src/client/ActivityPanel.tsx`
- 修改：`src/client/AgentTeamsCard.tsx`
- 修改：`src/client/index.tsx`
- 修改：`package.json`（optional peerDependency）
- 修改：`scripts/verify.mjs`（浮层检查改为 ActivityView 检查）
- 修改：`README.md`、`README_ZH.md`、`docs/usage.md`、`docs/developing-dsh-plugins.md`、`docs/superpowers/specs/2026-08-18-better-sidebar-integration-design.md`
- 修改：`tsconfig.client.json`、`tsconfig.json`（如果类型声明路径需要）

---

### Task 1: 共享 ActivityView 内容组件

**Files:**
- Create: `src/client/ActivityView.tsx`
- Modify: （后续任务新建）
- Test: 无（客户端 React 组件无单元测试目录；由构建和 verify 覆盖）

**Interfaces:**
- Consumes: `ActivityTeam`、`ActivityMember`、`ActivityTask`、`ActivityMessage` 类型；`activity-model.ts`；`artwork.ts`；现有 `ActivityPanel.module.css` 的内容样式（后续映射到 `ActivityView.module.css`）。
- Produces: `ActivityView({ teams, archivedTeams, historic, currentSessionId, onNavigate })`，其中 `historic` 为 `ReadonlyMap<string, { data: AgentTeamsCardData; owner: string }>`；`onNavigate: (id: SessionId) => void`。

- [ ] **Step 1: Create `src/client/ActivityView.tsx`**

将原 `ActivityPanel.tsx` 中从 `ActivityTeam` 接口定义到 `ActivityPanel` 函数体之前的全部代码（`memberInitial`、`stableHash`、`Chevron`、`WorkGlyph`、`memberStateLabel`、`memberStatusText`、`compactTaskLabel`、`taskSummary`、`ProgressOverview`、`DependencyMap`、`TeamSection`、`historicCardTeam`）作为 `ActivityView` 内容组件。

`ActivityView` 函数体内部重写为接收 props 的纯内容渲染，不再管理 `teams`/`archived` 拉取、不再管理展开/收起状态：

```tsx
/** AgentTeams activity view: session-scoped team contents rendered inside a
 * host tab (the better-sidebar AgentTeams tab). Pure presentation — polling
 * and session ownership live in the host tab wrapper. */
export function ActivityView({ teams, archivedTeams, historic, currentSessionId, onNavigate }: {
  readonly teams: readonly ActivityTeam[]
  readonly archivedTeams: readonly ActivityTeam[]
  readonly historic: ReadonlyMap<string, { data: AgentTeamsCardData; owner: string }>
  readonly currentSessionId: SessionId | undefined
  readonly onNavigate: (id: SessionId) => void
}) {
  const visibleTeams = teams.filter((team) => team.captainSessionId === currentSessionId)
  const visibleArchived = archivedTeams.filter((team) => team.captainSessionId === currentSessionId)
  const visibleHistoric = [...historic.values()].filter(({ data, owner }) =>
    owner === currentSessionId
      && !visibleTeams.some((live) => live.teamId === data.teamId)
      && !visibleArchived.some((archived) => archived.teamId === data.teamId)
  )
  const count = visibleTeams.length + visibleArchived.length + visibleHistoric.length
  if (count === 0) {
    return <span className={css.emptyHint}>暂无团队活动</span>
  }
  return (
    <>
      {visibleTeams.map((team) => (
        <TeamSection key={team.teamId} team={team} onNavigate={onNavigate} />
      ))}
      {visibleArchived.map((team) => (
        <div key={`${team.captainSessionId}:${team.teamId}`} data-team-id={team.teamId} data-historic className={css.archivedWrap}>
          <TeamSection team={team} onNavigate={onNavigate} historic />
        </div>
      ))}
      {visibleHistoric.map(({ data: team, owner }) => {
        const teamKey = `${owner}:${team.teamId}`
        return (
          <TeamSection key={teamKey} team={historicCardTeam(team, owner)} onNavigate={onNavigate} historic />
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: 创建占位 CSS（用户已确认的 Task1/3 顺序修正）**

在 Task 3 之前，先复制现有内容样式，保证 Task 1 构建/提交可独立通过：

```bash
cp src/client/ActivityPanel.module.css src/client/ActivityView.module.css
```

- [ ] **Step 3: 确保 `ActivityView.tsx` import 只包含当前 `ActivityPanel.tsx` 里内容所需的模块**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { IconBranchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { compactDagLayout, COMPACT_DAG_NODE_HEIGHT, COMPACT_DAG_NODE_WIDTH, dependencyFocusTaskId, relatedTaskIds, usesParallelTaskGrid } from './activity-model.ts'
import { ACTION_ART, LEAD_ART, memberArtUrl } from './artwork.ts'
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts'
import css from './ActivityView.module.css'
```

- [ ] **Step 4: 删除 `src/client/ActivityPanel.tsx`**

`git rm src/client/ActivityPanel.tsx`

- [ ] **Step 4b: 更新 `src/client/AgentTeamsCard.tsx` 的类型导入**

原 `ActivityPanel.tsx` 删除后，`AgentTeamsCard.tsx` 的 `import type { ActivityTeam } from './ActivityPanel.tsx'` 会失效；改为从 `ActivityView.tsx` 导入（`ActivityView` 会导出/再导出 `ActivityTeam` 类型）：

```tsx
import type { ActivityTeam } from './ActivityView.tsx'
```

`ActivityView.tsx` 需在此任务中 `export type { ActivityTeam, ActivityMember, ActivityTask, ActivityMessage }`（从原 `ActivityPanel.tsx` 迁移）。

- [ ] **Step 5: 运行构建**

Run: `pnpm typecheck && pnpm build`
Expected: 通过（占位 CSS 已提供全部类名）。

- [ ] **Step 6: commit**

```bash
git add src/client/ActivityView.tsx src/client/ActivityView.module.css src/client/AgentTeamsCard.tsx && git rm src/client/ActivityPanel.tsx
git commit -m "feat(client): extract shared ActivityView from ActivityPanel"
```
（注意：Task 3 会对 `ActivityView.module.css` 做最终裁剪。）

---

### Task 2: better-sidebar 结构类型与 tab 常量

**Files:**
- Create: `src/client/agent-teams-tab-constants.ts`
- Create: `src/client/better-sidebar.d.ts`（可选，类型声明）
- Test: 无（纯常量/类型）

**Interfaces:**
- Produces: `AGENT_TEAMS_TAB_ID = 'agent-teams'`、`STATE_URL = '/plugins/dsh-agent-teams/state'`、`ARCHIVED_URL = '/plugins/dsh-agent-teams/state?archived=1'`

- [ ] **Step 1: 创建 `src/client/agent-teams-tab-constants.ts`**

```ts
/** Shared AgentTeams sidebar tab identity. */
export const AGENT_TEAMS_TAB_ID = 'agent-teams'
/** Host route serving live team snapshots. */
export const STATE_URL = '/plugins/dsh-agent-teams/state'
/** Host route serving archived (deleted) team snapshots. */
export const ARCHIVED_URL = '/plugins/dsh-agent-teams/state?archived=1'
```

- [ ] **Step 2: 创建 `src/client/better-sidebar.d.ts`（结构类型，仅供客户端类型引用，不 import host 包）**

```ts
/**
 * Structural client-side mirror of dsh-better-sidebar's service. This
 * package deliberately does NOT import the host plugin so it stays optional;
 * values are only accessed through `ctx.get('betterSidebar')` at runtime.
 */
import type { ReactNode } from 'react'

declare module 'cordis' {
  interface Context {
    /** Present only when dsh-better-sidebar is loaded. */
    betterSidebar?: BetterSidebarService
  }
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    betterSidebar?: BetterSidebarService
  }
}

/** Minimal structural mirror of the host service (v0.13.0 surface). */
export interface BetterSidebarService {
  registerTab(descriptor: BetterSidebarTabDescriptor): () => void
  openTab(seed: { type: string; title?: string; id?: string; path?: string }, scope?: { sessionId: string; cwd?: string }): void
  isTabEnabled(id: string): boolean
  getTabs(): readonly BetterSidebarTabDescriptor[]
  getTab(id: string): BetterSidebarTabDescriptor | undefined
  getSnapshot(): { sessionId: string | undefined; state: { panelOpen: boolean } | undefined }
  subscribe(listener: () => void): () => void
  subscribeState(listener: () => void): () => void
  version: string
  features: readonly string[]
}

export interface BetterSidebarTabDescriptor {
  id: string
  title: string | (() => string)
  icon?: ReactNode | ((size: number) => ReactNode)
  order?: number
  hidden?: boolean
  single?: boolean
  badge?: (ctx: unknown, scope: { sessionId: string; cwd?: string }, state: unknown) => string | number | null | undefined
  component: (props: { ctx: unknown; store: unknown; scope: { sessionId: string; cwd?: string }; tab: { id: string; type: string; title: string }; visible: boolean }) => ReactNode
}
```

注意：实际补丁中的 `declare module '@deepseek-ai/cordis'` 需与项目当前同代一致；若 TS 报重复声明，用 `type` 仅 import 方式或修改为 `interface Context`。构建时必须通过。

- [ ] **Step 3: 运行 `pnpm typecheck`**

Expected: 通过（或仅有 `ActivityView.css` 占位导致的预期失败，Task 3 解决）。

- [ ] **Step 4: commit**

```bash
git add src/client/agent-teams-tab-constants.ts src/client/better-sidebar.d.ts
git commit -m "feat(client): add better-sidebar structural types and tab constants"
```

---

### Task 3: 新建 ActivityView 样式（裁剪自 ActivityPanel.module.css）

**Files:**
- Create: `src/client/ActivityView.module.css`
- Delete: `src/client/ActivityPanel.module.css`

**Interfaces:**
- Produces: CSS Modules 类名：`emptyHint`, `archivedWrap`, `team`, `teamHead`, `teamName`, `teamStats`, `historicPill`, `delegationSection`, `captainNode`, `captainAvatar`, `leadAvatar`, `captainInfo`, `captainLine`, `captainName`, `captainRole`, `captainSummary`, `captainState`, `progressOverview`, `progressTitle`, `progressSegments`, `progressEmpty`, `progressLegend`, `progressSummary`, `progressSummaryDot`, `membersToggle`, `chevron`, `delegationTree`, `memberBlock`, `memberBranch`, `memberRow`, `memberName`, `memberRole`, `memberState`, `memberStatusLine`, `memberCount`, `assignmentLine`, `assignmentLabel`, `assignmentTasks`, `assignmentChip`, `unreadPill`, `taskEmpty`, `dependencySection`, `sectionHead`, `sectionToggleTitle`, `sectionHint`, `dagViewport`, `dagCanvas`, `dagEdges`, `dagNode`, `dagNodeHead`, `dagNodeDot`, `dagRunningState`, `dagNodeLabel`, `taskDetail`, `taskDetailHead`, `taskDetailId`, `taskDetailSubject`, `taskDetailBadge`, `taskDetailLine`, `taskDetailMeta`, `members`, `stateArt` 等原有内容样式。

- [ ] **Step 1: 复制并裁剪**

Run: `cp src/client/ActivityPanel.module.css src/client/ActivityView.module.css`
然后用编辑器删除以下内容，其余原样保留：

- 顶部 `:global(html)` 变量块（`--agent-teams-panel-*`）
- `:global(html[data-agent-teams-panel-open])` 与 `[data-phase='active']` 转场（全部）
- `.badge`、`.badge:hover`、`.badge:active`、`.badge:focus-visible` 选择器组中的 `.badge`、`.badgeDot`、`.panelDot`、`.badgeCount`、`.panel`、`.panelHead`、`.panelTitle`、`.closeButton`、`.teams`、`.teams::-webkit-scrollbar`
- `.panel` 后面的所有浮层外壳结构（`--agent-teams-panel-*`）
- 底部 `@media (prefers-reduced-motion: reduce)` 中浮层专属选择器（保留 `.workGlyph rect`、`.stateArt`、`.memberAvatar[data-unread='true']::after`）
- `@media (max-width: 960px)` 与 `@media (max-width: 640px)` 中浮层专属部分；保留窄屏对内容区的必要调整（`teamStats span[data-stat='messages']` 隐藏、`.captainNode` 网格列、`.captainState` 隐藏、`.delegationTree`/`.memberBranch`/`.assignmentLine` 边距）。
- 顶部注释改为 `/* AgentTeams activity view (hosted by the better-sidebar tab). Relationship lines ... */`
- **保留 token bridge（用户已确认）**：把原 `.badge, .panel` 上的 `--dsw-alias-*` 变量块改为挂在 `.root` 上；`ActivityView.tsx` 返回的最外层元素增加 `className={css.root}`。`ActivityView.module.css` 中新增 `.root { /* token bridge 块 */ }`。

- [ ] **Step 2: 给 `ActivityView.tsx` 最外层加 `css.root`**

`ActivityView` 的渲染改为：

```tsx
return (
  <div className={css.root}>
    {count === 0 ? <span className={css.emptyHint}>暂无团队活动</span> : (
      <>
        {visibleTeams.map((team) => (
          <TeamSection key={team.teamId} team={team} onNavigate={onNavigate} />
        ))}
        {visibleArchived.map((team) => (
          <div key={`${team.captainSessionId}:${team.teamId}`} data-team-id={team.teamId} data-historic className={css.archivedWrap}>
            <TeamSection team={team} onNavigate={onNavigate} historic />
          </div>
        ))}
        {visibleHistoric.map(({ data: team, owner }) => {
          const teamKey = `${owner}:${team.teamId}`
          return (
            <TeamSection key={teamKey} team={historicCardTeam(team, owner)} onNavigate={onNavigate} historic />
          )
        })}
      </>
    )}
  </div>
)
```

- [ ] **Step 3: 运行 `pnpm typecheck`**

Expected: 通过。若 `ActivityView.tsx` 引用了 `css.xxx` 而裁剪后缺失类名，补齐该类名。

- [ ] **Step 4: `git rm src/client/ActivityPanel.module.css`**

```bash
git rm src/client/ActivityPanel.module.css
```

- [ ] **Step 5: 运行 `pnpm build`**

Expected: 构造通过。

- [ ] **Step 6: commit**

```bash
git add src/client/ActivityView.module.css && git rm src/client/ActivityPanel.module.css
git commit -m "feat(client): slim ActivityPanel.module.css into ActivityView.module.css"
```

---

### Task 4: AgentTeamsTab 组件（轮询、badge、注册）

**Files:**
- Create: `src/client/AgentTeamsTab.tsx`
- Modify: `src/client/index.tsx`
- Test: 由 `pnpm build` / `typecheck` / 后续 verify 覆盖

**Interfaces:**
- Consumes: `ActivityView`, `ActivityTeam`, `ActivityMember`, `ActivityTask`, `ActivityMessage`, `AGENT_TEAMS_TAB_ID`, `STATE_URL`, `ARCHIVED_URL`, `BetterSidebarService`
- Produces: `AgentTeamsTab` component（props 为 `AgentTeamsTabProps`）；在 `apply()` 中注册 descriptor。

- [ ] **Step 1: 创建 `src/client/AgentTeamsTab.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { ActivityView, type ActivityTeam } from './ActivityView.tsx'
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts'
import { STATE_URL, ARCHIVED_URL } from './agent-teams-tab-constants.ts'

const POLL_MS = 1000

/** Props supplied by the better-sidebar tab renderer (structural subset). */
export interface AgentTeamsTabProps {
  ctx: ClientContext
  scope: { sessionId: string; cwd?: string }
  visible: boolean
}

export function AgentTeamsTab(props: AgentTeamsTabProps) {
  const { ctx, visible } = props
  const [teams, setTeams] = useState<readonly ActivityTeam[]>([])
  const [archivedTeams, setArchivedTeams] = useState<readonly ActivityTeam[]>([])
  // 历史卡片旧数据不再通过窗口事件注入；归档团队由 archivedTeams 快照覆盖。
  // visibleHistoric 保留原 ActivityView 的能力，但实际值为空 map。
  const [historic] = useState<ReadonlyMap<string, { data: AgentTeamsCardData; owner: string }>>(new Map())

  const sessions = ctx.sessions
  const current = useSyncExternalStore(
    useMemo(() => (callback: () => void) => sessions.list.subscribe(callback), [sessions]),
    useCallback(() => sessions.list.getSnapshot().current, [sessions]),
  )

  // Poll only while this tab is actually visible (active + panel open).
  useEffect(() => {
    if (!visible || current === undefined) return
    let cancelled = false
    let inFlight = false
    const tick = async (): Promise<void> => {
      if (inFlight || cancelled) return
      inFlight = true
      try {
        const [liveResponse, archivedResponse] = await Promise.all([
          fetch(STATE_URL, { cache: 'no-store' }),
          fetch(ARCHIVED_URL, { cache: 'no-store' }),
        ])
        if (liveResponse.ok) {
          const body = (await liveResponse.json()) as { teams?: unknown }
          if (!cancelled && Array.isArray(body.teams)) setTeams(body.teams as readonly ActivityTeam[])
        }
        if (archivedResponse.ok) {
          const body = (await archivedResponse.json()) as { teams?: unknown }
          if (!cancelled && Array.isArray(body.teams)) setArchivedTeams(body.teams as readonly ActivityTeam[])
        }
      } catch {
        // Host restarting; keep the last snapshot.
      } finally {
        inFlight = false
      }
    }
    void tick()
    const timer = setInterval(() => { void tick() }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [visible, current])

  const onNavigate = (id: SessionId): void => {
    sessions.open?.(id)
  }

  return (
    <ActivityView
      teams={teams}
      archivedTeams={archivedTeams}
      historic={historic}
      currentSessionId={current}
      onNavigate={onNavigate}
    />
  )
}
```

- [ ] **Step 2: 在 `src/client/index.tsx` 中注册 tab 并移除浮层**

`index.tsx` 完整新内容如下（保留卡片注册，去掉 portal）：

```tsx
/** Browser plugin for the AgentTeams better-sidebar tab and conversation card. */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { AgentTeamsCard, type AgentTeamsCardInjected } from './AgentTeamsCard.tsx'
import { agentTeamsCardDefinition } from './agent-teams-card-definition.ts'
import { AgentTeamsTab } from './AgentTeamsTab.tsx'
import { AGENT_TEAMS_TAB_ID } from './agent-teams-tab-constants.ts'
import type { BetterSidebarService } from './better-sidebar.d.ts'

export const inject = ['conversationEvents', 'slots', 'sessions']

export function apply(ctx: ClientContext): void {
  const betterSidebar = (ctx as { get?: <T>(key: string) => T | undefined }).get?.<BetterSidebarService | undefined>('betterSidebar')

  if (betterSidebar !== undefined) {
    const disposer = betterSidebar.registerTab({
      id: AGENT_TEAMS_TAB_ID,
      title: 'AgentTeams',
      order: 35,
      single: true,
      badge: () => 0, // 初始占位；Task 5 替换为 live count。
      component: (props) => <AgentTeamsTab {...props} />,
    })
    ctx.effect(() => disposer, 'agent-teams: better-sidebar tab')
  }

  ctx.conversationEvents.register(agentTeamsCardDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'agent-teams',
    inject: (): AgentTeamsCardInjected => ({
      openSession: (id: SessionId) => { ctx.sessions.open(id) },
      currentSessionId: () => ctx.sessions.list.getSnapshot().current,
      openAgentTeamsTab: betterSidebar !== undefined
        ? () => { betterSidebar?.openTab({ type: AGENT_TEAMS_TAB_ID }) }
        : undefined,
    }),
  }, AgentTeamsCard))
}
```

注意：`apply` 中卡片注入闭包捕获 `betterSidebar`；无宿主时 `openAgentTeamsTab` 为 `undefined`，按钮隐藏（见 Task 5）。

- [ ] **Step 3: 修复 import/type 细节使 `pnpm typecheck` 通过**

可能需要的修正：
- `ClientContext` 真实路径是 `@deepseek-ai/dsh-client-runtime/client`（原有代码），保持原样。
- `ctx.get` 若没有泛型签名，可用 `(ctx as { get?: <T>(key: string) => T | undefined }).get?.<BetterSidebarService | undefined>('betterSidebar')`。
- `Badge` 初始写 `() => 0` 仅为占位；Task 5 实现真正计数。

- [ ] **Step 4: 运行 `pnpm build`**

Expected: 构建成功。

- [ ] **Step 5: commit**

```bash
git add src/client/AgentTeamsTab.tsx src/client/index.tsx
git commit -m "feat(client): register AgentTeamsTab in better-sidebar"
```

---

### Task 5: 对话卡片按钮打开 tab + badge 实时计数

**Files:**
- Modify: `src/client/AgentTeamsCard.tsx`
- Modify: `src/client/index.tsx`
- Modify: `src/client/AgentTeamsTab.tsx`（badge 工厂）

**Interfaces:**
- Consumes: `AGENT_TEAMS_TAB_ID`、`BetterSidebarService`、`STATE_URL`、`ARCHIVED_URL`
- Produces: `AgentTeamsCardInjected.openAgentTeamsTab?: () => void`；tab badge 返回当前会话可见团队数。

- [ ] **Step 1: 修改 `src/client/AgentTeamsCard.tsx`**

将 `OPEN_PANEL_EVENT` 与 `openActivityPanel` 删除；在 `AgentTeamsCardInjected` 增加 `openAgentTeamsTab?: () => void`；按钮改为：

```tsx
{openAgentTeamsTab !== undefined && (
  <button
    type="button"
    className={css.panelButton}
    onClick={() => { openAgentTeamsTab() }}
    aria-label="打开 AgentTeams"
    title="打开 AgentTeams"
  >
    AgentTeams
  </button>
)}
```

- [ ] **Step 2: 在 `src/client/AgentTeamsTab.tsx` 加入一个小型 badge store**

`AgentTeamsTab` 在每次成功轮询后计算“当前会话可见团队数”，写入模块级 store；badge 回调同步读取 store 的当前值。没有全局 `window` 事件：

```ts
/** Tiny module-level count store for the sidebar tab badge. The badge
 * callback is synchronous and runs during tab-bar renders; polling results
 * flow in asynchronously from AgentTeamsTab, so the latest value is stored
 * here. The sidebar tab is single-instance per session, and DSS uses one
 * client bundle per activated plugin — module state is safe. */
let agentTeamsTabCount = 0

export function setAgentTeamsTabCount(count: number): void {
  agentTeamsTabCount = count
}

export function agentTeamsTabBadge(): number {
  return agentTeamsTabCount
}
```

在 `AgentTeamsTab` 的轮询 effect 内，每次成功更新 `teams`/`archivedTeams` 后计算：

```ts
const visibleCount =
  teams.filter((team) => team.captainSessionId === current).length
  + archivedTeams.filter((team) => team.captainSessionId === current).length
setAgentTeamsTabCount(visibleCount)
```

（`historic` 为空 map；如未来恢复卡片历史注入，应把其会话 owner 计数也加入 badge。）

`index.tsx` 注册 tab 时：

```ts
badge: () => agentTeamsTabBadge(),
```

- [ ] **Step 3: 移除占位 badge**

`index.tsx` 的 `badge: () => 0` 改为 `badge: () => agentTeamsTabBadge()`。

- [ ] **Step 4: 卡片无宿主隐藏按钮由 `openAgentTeamsTab` 是否为 `undefined` 控制**

在 `index.tsx` 注入中：

```ts
openAgentTeamsTab: betterSidebar !== undefined
  ? () => { betterSidebar?.openTab({ type: AGENT_TEAMS_TAB_ID }) }
  : undefined,
```

- [ ] **Step 5: 运行 `pnpm typecheck && pnpm build`**

Expected: 通过。

- [ ] **Step 6: commit**

```bash
git add src/client/AgentTeamsCard.tsx src/client/AgentTeamsTab.tsx src/client/index.tsx
git commit -m "feat(client): open AgentTeams tab from conversation card and live badge"
```

---

### Task 6: 更新 verify.mjs 浮层检查

**Files:**
- Modify: `scripts/verify.mjs:106-134`

**Interfaces:**
- Consumes: `ActivityView.tsx`、`ActivityView.module.css`
- Produces: 更新后的 verify 面板 CSS 检查。

- [ ] **Step 1: 将 `activityPanelCss`/`activityPanelSource` 改为读取新文件**

```js
const activityPanelCss = await readFile(new URL('../src/client/ActivityView.module.css', import.meta.url), 'utf8')
const activityPanelSource = await readFile(new URL('../src/client/ActivityView.tsx', import.meta.url), 'utf8')
```

- [ ] **Step 2: 更新 token bridges 检查**

保留 token bridges（同一 CSS 内容原样）。将 `requiredPanelSizing` 改为下列 ActivityView 规则（侧栏内无需 fixed min-height/max-height）：

```js
const requiredActivityViewSizing = [
  '.dagEdges path {',
  '.dagCanvas {',
  '.team {',
]
check(
  'activity view keeps the compact DAG and team layout styles',
  requiredActivityViewSizing.every(rule => activityPanelCss.includes(rule)),
  'activity view missing DAG/team layout rules',
)
```

- [ ] **Step 3: 更新 running DAG 检查**

```js
check(
  'running DAG tasks reuse the animated work glyph without losing focus context',
  activityPanelSource.includes("task.state === 'running'")
    && activityPanelSource.includes('className={css.dagRunningState}')
    && activityPanelSource.includes('<WorkGlyph active />')
    && activityPanelCss.includes(".dagNode[data-state='running'][data-dimmed='true']")
    && activityPanelCss.includes('.dagRunningState {'),
  'running work should stay visible in both normal and dependency-focus states',
)
```

原样保留（`ActivityView.tsx` 中这些代码还在，且 CSS 类名不变）。

- [ ] **Step 4: 更新 `activityPanelExpandedForSession`**

该函数在 `activity-model.ts` 中仍用于旧测试；但浮层已删除，该函数实为死代码。为了最小改动，保留该函数与对应测试；或标注 deprecated。本任务只做简化为：

```js
const expandedHelper = await import('../lib/client/activity-model.js')
check(
  'activity panel belongs only to its current session',
  expandedHelper.activityPanelExpandedForSession(true, 'session-a', 'session-a')
    && !expandedHelper.activityPanelExpandedForSession(true, 'session-a', 'session-b'),
)
```

也可不动原有 367 行检查（它引用已删除的 `ActivityPanel.tsx`？不，它引用 `activity-model.js` 的纯函数，仍会通过）。为最小改动，**建议保留 5/8 中关于 `activityPanelExpandedForSession` 的现有检查**，因为该纯函数没有依赖浮层组件。

- [ ] **Step 5: 运行 `pnpm build && pnpm typecheck && pnpm verify`**

Expected: 全部通过。

- [ ] **Step 6: commit**

```bash
git add scripts/verify.mjs
git commit -m "test(verify): update activity panel checks for ActivityView"
```

---

### Task 7: package.json optional peerDependency + 文档更新

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `README_ZH.md`
- Modify: `docs/usage.md`
- Modify: `docs/developing-dsh-plugins.md`
- Modify: `docs/superpowers/specs/2026-08-18-better-sidebar-integration-design.md`

**Interfaces:**
- Produces: optional peerDependency `"dsh-better-sidebar": "^0.13.0"` 与 meta `"peerDependenciesMeta": { "dsh-better-sidebar": { "optional": true } }`。

- [ ] **Step 1: package.json 添加 optional peer**

在 `peerDependencies` 中加入：

```json
"dsh-better-sidebar": "^0.13.0"
```

在 `peerDependenciesMeta` 中加入：

```json
"dsh-better-sidebar": { "optional": true }
```

- [ ] **Step 2: 更新 README.md**

- 将 Web UI 描述由“右上角活动面板”改为“better-sidebar 的 AgentTeams tab”。
- 增加 “Requirements” 或 “Web UI” 段：需要安装 `dsh-better-sidebar`（v0.13+）才会显示实时活动面板；未安装时插件工具/对话卡片仍可用，只是无侧栏面板/按钮隐藏。

- [ ] **Step 3: 更新 README_ZH.md 与 docs/usage.md**

同上，移除浮层、body portal 描述，加入 better-sidebar 依赖说明。

- [ ] **Step 4: 更新 docs/developing-dsh-plugins.md**

示例中的 `ActivityPanel` 改为 `AgentTeamsTab` + `betterSidebar.openTab` 或保留 Body Portal 示例，但加注明“AgentTeams 已迁移到 better-sidebar，不再用 body portal 面板”。

- [ ] **Step 5: 更新 spec（已含此设计，补充正式标题）**

在格式上已经足够；确认文档中没有残留“独立浮层”字样（除设计历史说明外）。

- [ ] **Step 6: 运行 `pnpm verify`**

Expected: 全部通过。

- [ ] **Step 7: commit**

```bash
git add package.json README.md README_ZH.md docs/usage.md docs/developing-dsh-plugins.md docs/superpowers/specs/2026-08-18-better-sidebar-integration-design.md pnpm-lock.yaml
git commit -m "docs: declare better-sidebar peer and update UI docs"
```

---

### Task 8: 最终全量验证与清理

**Files:**
- Modify: 如有残余引用
- Test: 手动 GUI 验证清单（若可行）

- [ ] **Step 1: 全量 build + typecheck + verify**

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm verify
```

Expected: 全部通过。

- [ ] **Step 2: 清理残留引用**

```bash
grep -R "ActivityPanel\|OPEN_PANEL_EVENT\|data-agent-teams-panel-open\|agent-teams-panel" src scripts docs README.md README_ZH.md
```

Expected: 除 spec 历史说明外，无引用（`activityPanelExpandedForSession` 若保留纯函数可不清理，但可标记 deprecated）。

- [ ] **Step 3: 检查无 better-sider 场景**

代码审查：`index.tsx` 中 `betterSidebar === undefined` 时不调用 registerTab、不 openTab；卡片注入 `openAgentTeamsTab` 为 undefined，按钮隐藏。未安装时不再渲染浮层。

- [ ] **Step 4: commit 最终清理**

```bash
git add -A
git commit -m "chore: final cleanup after better-sidebar activity tab"
```

---

## 自审记录

- **Spec 覆盖：**
  - 完全搬进 sidebar，无浮窗兜底：Task 1/4/6/8
  - 对话卡片保留按钮改开 tab：Task 5
  - optional peerDependency：Task 7
  - 无宿主静默跳过且按钮隐藏：Task 4/5
  - ActivityView 抽取：Task 1
  - 仅 visible 轮询：Task 4
  - badge 团队数：Task 5
  - CSS 裁剪复用：Task 3
- **简化风险：** Task 5 的“badge 实时计数”采用模块级 `lastCount` + 全局自定义事件；这是最小实现，但若宿主渲染多个 tab/session 时需注意事件唯一性。建议实现时若发现 badge 需要跟随 session，改为 `index.tsx` 中直接从 `ctx.sessions.list` 加 `fetch` 的复杂度更高；本计划已尽量压低。