/** Browser plugin for the AgentTeams better-sidebar tab and conversation card. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the official browser locale service into ClientContext.
import type {} from '@deepseek-ai/dsh-client-locale/client'
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
import {
  AGENT_TEAMS_LOCALE_NAMESPACE, en, zh, type AgentTeamsLocaleKey,
} from './locales.ts'
import { openAgentTeamMember } from './session-navigation.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** AgentTeams conversation card and activity monitor copy. */
    agentTeams: AgentTeamsLocaleKey
  }
}

/** Required services: conversation nodes, slots, sessions navigation, and locale. */
export const inject = ['conversationEvents', 'slots', 'sessions', 'locale']

/** The replayed user message is the canonical transcript entry. */
function HiddenAgentTeamsCommand(): null {
  return null
}

/**
 * Register the in-conversation team card and, when dsh-better-sidebar is
 * loaded, the AgentTeams activity tab. Without the sidebar plugin the tab is
 * silently skipped and the card button stays hidden (openAgentTeamsTab
 * undefined).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(AGENT_TEAMS_LOCALE_NAMESPACE, { zh, en }),
    'agent-teams: dictionaries',
  )
  const openMember = (parentId: SessionId, childId: SessionId): void => {
    void openAgentTeamMember(ctx.sessions, parentId, childId).catch((error: unknown) => {
      console.warn(`agent-teams: failed to open member transcript ${childId}: ${String(error)}`)
    })
  }
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

  // The host command is only the slash-menu/admission surface. Its input is
  // replayed as the visible user message, so the generic result row would be
  // a duplicate placed before that message by command lifecycle ordering.
  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
    name: 'conversation.chat.commandview',
    key: 'agent-teams',
  }, HiddenAgentTeamsCommand))

  ctx.conversationEvents.register(agentTeamsCardDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'agent-teams',
    locale: AGENT_TEAMS_LOCALE_NAMESPACE,
    inject: (): AgentTeamsCardInjected => ({
      openMember,
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
