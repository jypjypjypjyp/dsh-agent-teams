/**
 * AgentTeams activity view: session-scoped team contents rendered inside a
 * host tab (the better-sidebar AgentTeams tab). Pure presentation — polling
 * and session ownership live in the host tab wrapper.
 * @module dsh-agent-teams/client/activity-view
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { IconBranchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  compactDagLayout,
  COMPACT_DAG_NODE_HEIGHT,
  COMPACT_DAG_NODE_WIDTH,
  dependencyFocusTaskId,
  relatedTaskIds,
  usesParallelTaskGrid,
} from './activity-model.ts'
import { ACTION_ART, LEAD_ART, memberArtUrl } from './artwork.ts'
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts'
import css from './ActivityView.module.css'

/** One member row of a host snapshot. */
export interface ActivityMember {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly status?: 'idle' | 'working' | 'removed'
  readonly activity: 'working' | 'idle' | 'unknown'
  readonly progress: number
  readonly done: number
  readonly total: number
  readonly currentTask: string
  readonly unread: number
}

/** One task row of a host snapshot. */
export interface ActivityTask {
  readonly id: string
  readonly subject: string
  readonly status: string
  readonly state: 'blocked' | 'open' | 'running' | 'completed'
  readonly assignee: string
  readonly dependencies: readonly string[]
  readonly depth: number
}

/** One captain-inbox preview row. */
export interface ActivityMessage {
  readonly from: string
  readonly content: string
}

/** One team snapshot (mirrors the host TeamActivitySnapshot). */
export interface ActivityTeam {
  readonly workspace: string
  readonly teamId: string
  readonly name: string
  readonly description?: string
  readonly captainSessionId: string
  readonly members: readonly ActivityMember[]
  readonly tasks: readonly ActivityTask[]
  readonly messageCount: number
  readonly captainInbox: readonly ActivityMessage[]
}

/** Initial-letter fallback for unmatched roles. */
function memberInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?'
}

function stableHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

const ACCENTS = [
  'var(--dsw-alias-state-business-primary)',
  'var(--dsw-alias-state-success)',
  'var(--dsw-alias-state-danger)',
  'var(--dsw-alias-state-warning)',
  'var(--dsw-alias-label-tertiary)',
] as const

function accentOf(id: string): string {
  return ACCENTS[stableHash(id) % ACCENTS.length] ?? ACCENTS[0]
}

/** Badge text follows the raw task status (finer than the 4 visual states):
 * claimed/pending/failed/cancelled keep their own labels and colors. */
const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '待领取',
  claimed: '已认领',
  in_progress: '进行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABEL[status] ?? status
}

/** Badge/bar coloring key: visual state, widened for terminal statuses. */
function taskTone(state: ActivityTask['state'], status: string): string {
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return state
}

function Chevron({ open }: { readonly open: boolean }) {
  return (
    <svg className={css.chevron} data-open={open} width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M3.5 2l3 3-3 3" />
    </svg>
  )
}

function WorkGlyph({ active }: { readonly active: boolean }) {
  return (
    <svg className={css.workGlyph} data-active={active} width="11" height="11" viewBox="0 0 11 11" fill="currentColor" aria-hidden>
      {[[0, 0], [4.2, 0], [8.4, 0], [0, 4.2], [4.2, 4.2], [8.4, 4.2]].map(([x, y], index) => (
        <rect key={`${x}:${y}`} x={x} y={y} width="2.6" height="2.6" rx=".6" style={{ animationDelay: `${index * 0.15}s` }} />
      ))}
    </svg>
  )
}


function memberStateLabel(member: ActivityMember, tasks: readonly ActivityTask[], historic: boolean): string {
  const owned = tasks.filter((task) => task.assignee === member.name)
  if (member.activity === 'working') return '工作中'
  if (owned.some((task) => task.status === 'failed')) return '有失败'
  if (owned.some((task) => task.state === 'blocked')) return '等待'
  if (owned.length > 0 && owned.every((task) => task.status === 'completed')) return '已交付'
  if (member.status === 'removed') return historic ? '已离队' : '已移除'
  if (owned.length > 0) return '待执行'
  return '待派工'
}

function memberStatusText(member: ActivityMember, tasks: readonly ActivityTask[]): string {
  const owned = tasks.filter((task) => task.assignee === member.name)
  const current = owned.find((task) => task.id === member.currentTask)
  const blocked = owned.find((task) => task.state === 'blocked')
  if (member.activity === 'working' && current !== undefined) return `正在执行 ${current.id}`
  if (member.activity === 'working') return '正在处理已派任务'
  if (blocked !== undefined) {
    const dependency = tasks.find((task) => blocked.dependencies.includes(task.id) && task.state !== 'completed')
    if (dependency !== undefined) return `等待 ${dependency.id} · ${dependency.assignee || '待认领'}`
    return '等待前置任务'
  }
  if (member.total === 0) return '等待队长派工'
  if (member.done === member.total) return '任务已交付'
  return member.activity === 'idle' ? '待继续执行' : '状态未知'
}

function compactTaskLabel(subject: string): string {
  const withoutVerb = subject.replace(/^开发\s*/u, '').replace(/^\d+[-_.、\s]*/u, '')
  const head = withoutVerb.split(/[（(·：:]/u)[0]?.trim() ?? withoutVerb
  return head.length > 18 ? `${head.slice(0, 17)}…` : head
}

function taskSummary(team: ActivityTeam): string {
  const completed = team.tasks.filter((task) => task.status === 'completed')
  const running = team.tasks.filter((task) => task.state === 'running')
  const blocked = team.tasks.filter((task) => task.state === 'blocked')
  const ready = team.tasks.filter((task) => task.state === 'open' && task.status !== 'completed')
  if (team.tasks.length === 0) return '等待队长拆解任务'
  if (completed.length === team.tasks.length) return `全部 ${completed.length} 项任务已交付`
  if (blocked.length > 0 && running.length > 0) {
    return `${blocked.slice(0, 3).map((task) => task.id).join('、')}${blocked.length > 3 ? ` 等 ${blocked.length} 项` : ''} 等待前置，其余已开工`
  }
  if (running.length > 0) return `${running.map((task) => task.id).join('、')} 正在执行`
  if (ready.length > 0) return `${ready.map((task) => task.id).join('、')} 已就绪待开工`
  if (blocked.length > 0) return `${blocked.map((task) => task.id).join('、')} 等待前置`
  return '等待下一轮调度'
}

function ProgressOverview({ team }: { readonly team: ActivityTeam }) {
  const running = team.tasks.filter((task) => task.state === 'running').length
  const blocked = team.tasks.filter((task) => task.state === 'blocked').length
  const completed = team.tasks.filter((task) => task.status === 'completed').length
  const summaryTone = blocked > 0 ? 'warning' : completed === team.tasks.length && team.tasks.length > 0 ? 'completed' : 'running'
  return (
    <section className={css.progressOverview} aria-label="团队总进度" data-progress-summary>
      <span className={css.progressTitle}>总进度</span>
      {team.tasks.length > 0 ? (
        <span className={css.progressSegments} aria-hidden>
          {team.tasks.map((task) => <span key={task.id} data-state={taskTone(task.state, task.status)} />)}
        </span>
      ) : <span className={css.progressEmpty} />}
      <span className={css.progressLegend}>
        <span data-state="running">■ 进行中 {running}</span>
        <span data-state="blocked">■ 等待依赖 {blocked}</span>
        <span data-state="completed">■ 已交付 {completed}</span>
      </span>
      <span className={css.progressSummary} data-state={summaryTone}>
        <span className={css.progressSummaryDot} />
        <span>{taskSummary(team)}</span>
      </span>
    </section>
  )
}

function DependencyMap({ tasks }: { readonly tasks: readonly ActivityTask[] }) {
  const [open, setOpen] = useState(true)
  const [hoverTaskId, setHoverTaskId] = useState<string | null>(null)
  const [keyboardTaskId, setKeyboardTaskId] = useState<string | null>(null)
  const [pinnedTaskId, setPinnedTaskId] = useState<string | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusedTaskId = dependencyFocusTaskId(pinnedTaskId, keyboardTaskId, hoverTaskId)
  const layout = useMemo(() => compactDagLayout(tasks), [tasks])
  const parallel = useMemo(() => usesParallelTaskGrid(tasks), [tasks])
  const related = useMemo(
    () => focusedTaskId === null ? null : relatedTaskIds(focusedTaskId, tasks),
    [focusedTaskId, tasks],
  )
  const scheduleHover = (id: string | null): void => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    if (id === null) {
      setHoverTaskId(null)
      return
    }
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null
      setHoverTaskId(id)
    }, 180)
  }
  useEffect(() => () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
  }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPinnedTaskId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [])
  if (tasks.length === 0) return null
  const fallbackTask = tasks.find((task) => task.state === 'blocked')
    ?? tasks.find((task) => task.state === 'running')
    ?? tasks[0]!
  const detailTask = tasks.find((task) => task.id === focusedTaskId) ?? fallbackTask
  const waitingOn = detailTask.dependencies.filter((dependency) => (
    tasks.find((task) => task.id === dependency)?.status !== 'completed'
  ))
  const dependents = tasks.filter((task) => task.dependencies.includes(detailTask.id))
  return (
    <section className={css.dependencySection} aria-label="任务依赖链" data-dependency-map>
      <header className={css.sectionHead}>
        <button type="button" className={css.sectionToggleTitle} onClick={() => { setOpen((current) => !current) }} aria-expanded={open}>
          <Chevron open={open} /><IconBranchOutline16 /> {parallel ? '并行任务' : '任务依赖'}
        </button>
        <span className={css.sectionHint}>{pinnedTaskId === null
          ? parallel ? '无前后依赖 · 点击查看详情' : '悬停高亮依赖链 · 点击固定'
          : `${pinnedTaskId} 已固定 · Esc 取消`}</span>
      </header>
      {open && (
        <>
          <div className={css.dagViewport}>
            <div
              className={css.dagCanvas}
              data-layout={parallel ? 'parallel' : 'dependency'}
              style={parallel ? undefined : { width: layout.width, height: layout.height }}
            >
              {!parallel && <svg className={css.dagEdges} width={layout.width} height={layout.height} aria-hidden>
                {layout.edges.map((edge) => {
                  const active = related !== null && related.has(edge.from) && related.has(edge.to)
                  return <path key={`${edge.from}:${edge.to}`} d={edge.path} data-active={active} data-dimmed={related !== null && !active} />
                })}
              </svg>}
              {layout.nodes.map(({ task, x, y }) => (
                <button
                  key={task.id}
                  type="button"
                  className={css.dagNode}
                  style={parallel
                    ? { height: COMPACT_DAG_NODE_HEIGHT }
                    : { left: x, top: y, width: COMPACT_DAG_NODE_WIDTH, height: COMPACT_DAG_NODE_HEIGHT }}
                  data-task-id={task.id}
                  data-state={taskTone(task.state, task.status)}
                  data-focused={related?.has(task.id) ?? false}
                  data-dimmed={related !== null && !related.has(task.id)}
                  aria-pressed={pinnedTaskId === task.id}
                  title={`${task.id} · ${task.subject}`}
                  onClick={() => { setPinnedTaskId((current) => current === task.id ? null : task.id) }}
                  onMouseEnter={() => { scheduleHover(task.id) }}
                  onMouseLeave={() => { scheduleHover(null) }}
                  onFocus={() => { setKeyboardTaskId(task.id) }}
                  onBlur={() => { setKeyboardTaskId(null) }}
                >
                  <span className={css.dagNodeHead}><span className={css.dagNodeDot} />{task.id}</span>
                  <span className={css.dagNodeLabel}>{compactTaskLabel(task.subject)}</span>
                  {task.state === 'running' && (
                    <span className={css.dagRunningState} aria-label="运行中">
                      <WorkGlyph active />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <section className={css.taskDetail} data-task-detail={detailTask.id}>
            <span className={css.taskDetailHead}>
              <span className={css.taskDetailId}>{detailTask.id}</span>
              <span className={css.taskDetailSubject} title={detailTask.subject}>{detailTask.subject.replace(/^开发\s*/u, '')}</span>
              <span className={css.taskDetailBadge} data-state={taskTone(detailTask.state, detailTask.status)}>{taskStatusLabel(detailTask.status)}</span>
            </span>
            <span className={css.taskDetailLine}>
              {detailTask.assignee || '待认领'} · {detailTask.status === 'completed'
                ? '已完成并交付'
                : detailTask.dependencies.length === 0
                ? '无前置，可立即开工'
                : waitingOn.length === 0
                  ? '前置已就绪，可开工'
                  : `等待 ${waitingOn.join('、')}`}
            </span>
            <span className={css.taskDetailMeta}>{dependents.length === 0 ? '无下游任务' : `完成后解锁 ${dependents.map((task) => task.id).join('、')}`}</span>
          </section>
        </>
      )}
    </section>
  )
}

function TeamSection({ team, onNavigate, historic = false }: {
  readonly team: ActivityTeam
  /** Navigate to a member transcript (floater hides immediately). */
  readonly onNavigate: (id: SessionId) => void
  readonly historic?: boolean
}) {
  const [membersOpen, setMembersOpen] = useState(true)
  const busyCount = team.members.filter((member) => member.activity === 'working').length
  const assignedCount = team.tasks.filter((task) => task.assignee !== '').length
  const completedCount = team.tasks.filter((task) => task.status === 'completed').length
  const allCompleted = team.tasks.length > 0 && completedCount === team.tasks.length
  return (
    <section className={css.team} data-team-id={team.teamId}>
      <header className={css.teamHead}>
        <span className={css.teamName} title={team.name}>{team.name}</span>
        {historic && <span className={css.historicPill}>已结束</span>}
        <span className={css.teamStats}>
          <span data-stat="members">{team.members.length} 成员</span>
          <span data-stat="tasks">{completedCount}/{team.tasks.length} 完成</span>
          <span data-stat="messages">{team.messageCount} 消息</span>
        </span>
      </header>

      <section className={css.delegationSection} aria-label="队长派工关系" data-delegation-map>
        <div className={css.captainNode}>
          <span className={css.captainAvatar}>
            <img className={css.leadAvatar} src={LEAD_ART} alt="" aria-hidden />
          </span>
          <span className={css.captainInfo}>
            <span className={css.captainLine}>
              <span className={css.captainName}>队长</span>
              <span className={css.captainRole}>拆解 · 派发 · 汇总</span>
            </span>
            <span className={css.captainSummary}>已派发 {assignedCount} 项任务给 {team.members.length} 名成员</span>
          </span>
          <span className={css.captainState} data-busy={busyCount > 0}>
            <WorkGlyph active={busyCount > 0} />
            {busyCount > 0 ? `${busyCount} 人执行中` : allCompleted ? '已收齐' : '等待回报'}
          </span>
        </div>

        <ProgressOverview team={team} />

        <button type="button" className={css.membersToggle} onClick={() => { setMembersOpen((current) => !current) }} aria-expanded={membersOpen} data-members-toggle>
          <span><Chevron open={membersOpen} />成员 {team.members.length}</span>
          <span>{membersOpen ? '收起' : '展开'}</span>
        </button>

        {membersOpen && <div className={css.delegationTree}>
          {team.members.length === 0 && <span className={css.emptyHint}>暂无成员，等待队长组建团队</span>}
          {team.members.map((member) => {
            const owned = team.tasks.filter((task) => task.assignee === member.name)
            return (
              <div key={member.id} className={css.memberBlock} data-activity={member.activity}>
                <span className={css.memberBranch} aria-hidden><span /></span>
                <button
                  type="button"
                  className={css.memberRow}
                  data-activity={member.activity}
                  onClick={() => { if (member.id !== '') onNavigate(member.id as SessionId) }}
                >
                  <span className={css.memberAvatar} data-unread={member.unread > 0}>
                    {memberArtUrl(member.name, member.role) !== null ? (
                      <img className={css.memberArt} src={memberArtUrl(member.name, member.role) ?? ''} alt="" aria-hidden />
                    ) : (
                      <span className={css.memberInitial} style={{ background: accentOf(member.id) }}>{memberInitial(member.name)}</span>
                    )}
                    <img className={css.stateArt} data-activity={member.activity} src={ACTION_ART[member.activity]} alt="" aria-hidden />
                  </span>
                  <span className={css.memberInfo}>
                    <span className={css.memberLine}>
                      <span className={css.memberName}>{member.name}</span>
                      {member.role !== '' && <span className={css.memberRole}>{member.role}</span>}
                      <span className={css.memberState} data-activity={member.activity}>
                        <WorkGlyph active={member.activity === 'working'} />
                        {memberStateLabel(member, team.tasks, historic)}
                      </span>
                    </span>
                    <span className={css.memberStatusLine}>{memberStatusText(member, team.tasks)}</span>
                  </span>
                  <span className={css.memberCount}>{member.done}/{member.total}</span>
                </button>
                <div className={css.assignmentLine}>
                  <span className={css.assignmentLabel}>队长派发</span>
                  <span className={css.assignmentTasks}>
                    {owned.length === 0
                      ? <span className={css.taskEmpty}>暂无任务</span>
                      : owned.map((task) => (
                        <span key={task.id} className={css.assignmentChip} data-state={taskTone(task.state, task.status)} title={task.subject}>
                          {task.id}
                        </span>
                      ))}
                  </span>
                </div>
              </div>
            )
          })}
        </div>}
      </section>

      <DependencyMap tasks={team.tasks} />
    </section>
  )
}

/** Legacy conversation cards may outlive their host archive. Project their
 * durable roster through the same rebuilt panel instead of a second UI. */
function historicCardTeam(data: AgentTeamsCardData, owner: string): ActivityTeam {
  return {
    workspace: '',
    teamId: data.teamId,
    name: data.teamName,
    captainSessionId: data.captainSessionId || owner,
    members: data.members.map((member) => ({
      ...member,
      status: 'removed',
      activity: 'idle',
      progress: 0,
      done: 0,
      total: 0,
      currentTask: '',
      unread: 0,
    })),
    tasks: [],
    messageCount: 0,
    captainInbox: [],
  }
}

/** Render team contents for the current session's host tab. */
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
    <div className={css.root}>
      {count === 0
        ? <span className={css.emptyHint}>暂无团队活动</span>
        : (
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
}

