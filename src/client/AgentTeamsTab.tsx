/**
 * AgentTeams better-sidebar tab: hosts the shared ActivityView inside the
 * better-sidebar AgentTeams tab. Polls the host snapshot routes only while
 * the tab is actually visible (active tab + open panel); resolves the active
 * session from the sidebar scope (falling back to the runtime sessions list)
 * and passes it to ActivityView for session-scoped filtering.
 * @module dsh-agent-teams/client/tab
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { ActivityView, type ActivityTeam } from './ActivityView.tsx'
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts'
import { STATE_URL, ARCHIVED_URL } from './agent-teams-tab-constants.ts'

/** Poll cadence for the host snapshot route. */
const POLL_MS = 1000

/** Tiny module-level count store for the sidebar tab badge. The badge
 * callback is synchronous and runs during tab-bar renders; polling results
 * flow in asynchronously from AgentTeamsTab, so the latest value is stored
 * here. The sidebar tab is single-instance per session, and DSH uses one
 * client bundle per activated plugin — module state is safe.
 *
 * The count is reset to 0 whenever the tab is hidden or the active session
 * changes, so a stale count from a previous session can never leak onto the
 * badge. */
let agentTeamsTabCount = 0

export function setAgentTeamsTabCount(count: number): void {
  agentTeamsTabCount = count
}

export function agentTeamsTabBadge(): number {
  return agentTeamsTabCount
}

/** Props supplied by the better-sidebar tab renderer (structural subset). */
export interface AgentTeamsTabProps {
  ctx: unknown
  scope: { sessionId: string; cwd?: string }
  tab: { id: string; type: string; title: string; meta?: unknown }
  visible: boolean
}

/** The card summary carried through openTab's `meta` seed. */
export interface AgentTeamsCardMeta {
  data: AgentTeamsCardData
  owner: string
}

export function AgentTeamsTab(props: AgentTeamsTabProps) {
  const { ctx, scope, tab, visible } = props
  const runtime = ctx as ClientContext
  const [teams, setTeams] = useState<readonly ActivityTeam[]>([])
  const [archivedTeams, setArchivedTeams] = useState<readonly ActivityTeam[]>([])
  const [historic, setHistoric] = useState<ReadonlyMap<string, { data: AgentTeamsCardData; owner: string }>>(new Map())

  // Latest snapshot state mirrored into refs so the poll interval closure
  // never reads a stale render's state.
  const teamsRef = useRef(teams)
  const archivedTeamsRef = useRef(archivedTeams)
  teamsRef.current = teams
  archivedTeamsRef.current = archivedTeams

  const sessions = runtime.sessions
  const globalCurrent = useSyncExternalStore(
    useMemo(() => (callback: () => void) => sessions.list.subscribe(callback), [sessions]),
    useCallback(() => sessions.list.getSnapshot().current, [sessions]),
  )
  // The sidebar's per-tab scope is the authoritative active session whenever
  // it supplies one; fall back to the shell's global current session.
  const activeSession: SessionId | undefined = scope?.sessionId === undefined
    ? globalCurrent
    : scope.sessionId as SessionId

  // A card opened via the "AgentTeams" button carries its summary through
  // openTab's `meta`. When the tab later (re)mounts or receives a new seed,
  // add it to the historic map so the ActivityView can render the summary
  // even before the archive route has it.
  useEffect(() => {
    const meta = tab.meta as AgentTeamsCardMeta | undefined
    if (meta?.data?.teamId === undefined || meta?.owner === undefined) return
    setHistoric((previous) => {
      const key = `${meta.owner}:${meta.data.teamId}`
      const next = new Map(previous)
      next.set(key, { data: meta.data, owner: meta.owner })
      return next
    })
  }, [tab.meta])

  // Reset the badge whenever the tab is hidden, no session is active, or the
  // active session changes. A stale earlier count must never survive these
  // transitions.
  useEffect(() => {
    setAgentTeamsTabCount(0)
  }, [activeSession, visible])

  // Poll only while this tab is actually visible (active tab + open panel).
  useEffect(() => {
    if (!visible || activeSession === undefined) return
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
        let nextTeams = teamsRef.current
        let nextArchived = archivedTeamsRef.current
        if (liveResponse.ok) {
          const body = (await liveResponse.json()) as { teams?: unknown }
          if (!cancelled && Array.isArray(body.teams)) {
            nextTeams = body.teams as readonly ActivityTeam[]
            setTeams(nextTeams)
            teamsRef.current = nextTeams
          }
        }
        if (archivedResponse.ok) {
          const body = (await archivedResponse.json()) as { teams?: unknown }
          if (!cancelled && Array.isArray(body.teams)) {
            nextArchived = body.teams as readonly ActivityTeam[]
            setArchivedTeams(nextArchived)
            archivedTeamsRef.current = nextArchived
          }
        }
        if (!cancelled) {
          const visibleCount =
            nextTeams.filter((team) => team.captainSessionId === activeSession).length
            + nextArchived.filter((team) => team.captainSessionId === activeSession).length
          setAgentTeamsTabCount(visibleCount)
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
  }, [visible, activeSession])

  const onNavigate = (id: SessionId): void => {
    sessions.open?.(id)
  }

  return (
    <ActivityView
      teams={teams}
      archivedTeams={archivedTeams}
      historic={historic}
      currentSessionId={activeSession}
      onNavigate={onNavigate}
    />
  )
}
