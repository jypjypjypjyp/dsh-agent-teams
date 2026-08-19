/**
 * AgentTeams better-sidebar tab: hosts the shared ActivityView inside the
 * better-sidebar AgentTeams tab. Polls the host snapshot routes only while
 * the tab is actually visible (active tab + open panel); keeps the current
 * session from the runtime sessions list and passes it to ActivityView for
 * session-scoped filtering.
 * @module dsh-agent-teams/client/tab
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { ActivityView, type ActivityTeam } from './ActivityView.tsx'
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts'
import { STATE_URL, ARCHIVED_URL } from './agent-teams-tab-constants.ts'

/** Poll cadence for the host snapshot route. */
const POLL_MS = 1000

/** Props supplied by the better-sidebar tab renderer (structural subset). */
export interface AgentTeamsTabProps {
  ctx: unknown
  scope: { sessionId: string; cwd?: string }
  visible: boolean
}

export function AgentTeamsTab(props: AgentTeamsTabProps) {
  const { ctx, visible } = props
  const runtime = ctx as ClientContext
  const [teams, setTeams] = useState<readonly ActivityTeam[]>([])
  const [archivedTeams, setArchivedTeams] = useState<readonly ActivityTeam[]>([])
  // 历史卡片旧数据不再通过窗口事件注入；归档团队由 archivedTeams 快照覆盖。
  // visibleHistoric 保留原 ActivityView 的能力，但实际值为空 map。
  const [historic] = useState<ReadonlyMap<string, { data: AgentTeamsCardData; owner: string }>>(new Map())

  const sessions = runtime.sessions
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