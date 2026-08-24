/**
 * AgentTeams better-sidebar tab: hosts the shared ActivityView inside the
 * better-sidebar AgentTeams tab. It drives the shared, demand-driven
 * activity monitor for the active session (snapshot subscription + polling
 * only while the tab is actually visible), resolves the active session from
 * the sidebar scope (falling back to the runtime sessions list), and passes
 * the locale-bound translate function and the address-aware member navigator
 * to ActivityView for session-scoped rendering.
 * @module dsh-agent-teams/client/tab
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the browser locale service into ClientContext (`ctx.locale`).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ActivityView } from './ActivityView.tsx'
import {
  getActivityMonitorTargetsSnapshot,
  getActivitySnapshotsSnapshot,
  startActivityPolling,
  subscribeActivityMonitorTargets,
  subscribeActivitySnapshots,
  type ActivityTeam,
} from './activity-monitor.ts'
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts'
import type { AgentTeamsTranslate } from './locales.ts'
import { openAgentTeamMember, type AgentTeamsSessionNavigator } from './session-navigation.ts'

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
  store?: unknown
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
  const sessions = runtime.sessions
  const t = runtime.locale.bind('agentTeams') as AgentTeamsTranslate

  // Shared live/archive snapshots published by the demand-driven poller.
  const { teams, archivedTeams } = useSyncExternalStore(
    subscribeActivitySnapshots,
    getActivitySnapshotsSnapshot,
  )
  const monitorTargets = useSyncExternalStore(
    subscribeActivityMonitorTargets,
    getActivityMonitorTargetsSnapshot,
  )

  const globalCurrent = useSyncExternalStore(
    useMemo(() => (callback: () => void) => sessions.list.subscribe(callback), [sessions]),
    useCallback(() => sessions.list.getSnapshot().current, [sessions]),
  )
  // The sidebar's per-tab scope is the authoritative active session whenever
  // it supplies one; fall back to the shell's global current session.
  const activeSession: SessionId | undefined = scope?.sessionId === undefined
    ? globalCurrent
    : scope.sessionId as SessionId

  // Explicit card targets plus the current session's cold-start discovery.
  const currentTargets = useMemo(
    () => activeSession === undefined
      ? []
      : monitorTargets.filter((target) => target.sessionId === activeSession),
    [activeSession, monitorTargets],
  )

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

  const [historic, setHistoric] = useState<ReadonlyMap<string, { data: AgentTeamsCardData; owner: string }>>(new Map())

  // Drive the shared monitor only while this tab is actually visible (active
  // tab + open panel). Hidden tabs and cross-session scopes stop polling so a
  // buried AgentTeams view never becomes a one-second filesystem scan.
  useEffect(() => {
    if (!visible || activeSession === undefined) return
    const controller = startActivityPolling(currentTargets, { discoverySessionId: activeSession })
    return () => { controller.stop() }
  }, [visible, activeSession, currentTargets])

  // Reset the badge whenever the tab is hidden, no session is active, or the
  // active session changes. A stale earlier count must never survive these
  // transitions.
  useEffect(() => {
    if (!visible || activeSession === undefined) setAgentTeamsTabCount(0)
  }, [activeSession, visible])

  // Publish the current session's team count to the tab badge as snapshots
  // arrive (only while visible, so the badge never leaks another session's
  // count).
  useEffect(() => {
    if (!visible || activeSession === undefined) return
    const count =
      teams.filter((team) => team.captainSessionId === activeSession).length
      + archivedTeams.filter((team) => team.captainSessionId === activeSession).length
    setAgentTeamsTabCount(count)
  }, [teams, archivedTeams, activeSession, visible])

  const onNavigate = useCallback((parentId: SessionId, childId: SessionId): void => {
    void openAgentTeamMember(sessions as unknown as AgentTeamsSessionNavigator, parentId, childId)
      .catch((error: unknown) => {
        console.warn(`agent-teams: failed to open member transcript ${childId}: ${String(error)}`)
      })
  }, [sessions])

  return (
    <ActivityView
      teams={teams}
      archivedTeams={archivedTeams}
      historic={historic}
      currentSessionId={activeSession}
      onNavigate={onNavigate}
      t={t}
    />
  )
}
