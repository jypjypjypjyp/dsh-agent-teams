/** Browser plugin for the AgentTeams better-sidebar tab and conversation card. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Module-loading import: the card registers into the conversation chat-node
// slot, whose keyed renderer map lives in the ui-conversation contract.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { IconAgentPresetOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { AgentTeamsCard, type AgentTeamsCardInjected } from './AgentTeamsCard.tsx'
import { agentTeamsCardDefinition } from './agent-teams-card-definition.ts'
import { AgentTeamsTab, agentTeamsTabBadge } from './AgentTeamsTab.tsx'
import { AGENT_TEAMS_TAB_ID } from './agent-teams-tab-constants.ts'
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts'
import type { BetterSidebarService } from './better-sidebar.d.ts'

/** Required services: conversation nodes, slots, and sessions navigation. */
export const inject = ['conversationEvents', 'slots', 'sessions']

/**
 * Register the in-conversation team card and, when dsh-better-sidebar is
 * loaded, the AgentTeams activity tab. Without the sidebar plugin the tab is
 * silently skipped and the card button stays hidden (openAgentTeamsTab
 * undefined — Task 5 wires the button).
 */
export function apply(ctx: ClientContext): void {
  const betterSidebar = (ctx as { get?: <T>(key: string) => T | undefined }).get?.<BetterSidebarService | undefined>('betterSidebar')
  const sidebarUsable = betterSidebar !== undefined
    && typeof betterSidebar.registerTab === 'function'
    && typeof betterSidebar.openTab === 'function'

  if (sidebarUsable) {
    const disposer = betterSidebar!.registerTab({
      id: AGENT_TEAMS_TAB_ID,
      title: 'AgentTeams',
      icon: (size: number) => <IconAgentPresetOutline16 size={size} />,
      order: 35,
      single: true,
      badge: () => agentTeamsTabBadge(),
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
      openAgentTeamsTab: sidebarUsable
        ? (data: AgentTeamsCardData) => {
          const owner = data.captainSessionId !== '' ? data.captainSessionId : ctx.sessions.list.getSnapshot().current ?? ''
          betterSidebar?.openTab({
            type: AGENT_TEAMS_TAB_ID,
            meta: { data, owner },
          })
        }
        : undefined,
    }),
  }, AgentTeamsCard))
}
