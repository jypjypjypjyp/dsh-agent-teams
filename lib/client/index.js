import { jsx as _jsx } from "react/jsx-runtime";
import { IconAgentPresetOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import { AgentTeamsCard } from "./AgentTeamsCard.js";
import { agentTeamsCardDefinition } from "./agent-teams-card-definition.js";
import { AgentTeamsTab, agentTeamsTabBadge } from "./AgentTeamsTab.js";
import { AGENT_TEAMS_TAB_ID } from "./agent-teams-tab-constants.js";
import { AGENT_TEAMS_LOCALE_NAMESPACE, en, zh, } from "./locales.js";
import { openAgentTeamMember } from "./session-navigation.js";
/** Required services: conversation nodes, slots, sessions navigation, and locale. */
export const inject = ['conversationEvents', 'slots', 'sessions', 'locale'];
/** The replayed user message is the canonical transcript entry. */
function HiddenAgentTeamsCommand() {
    return null;
}
/**
 * Register the in-conversation team card and, when dsh-better-sidebar is
 * loaded, the AgentTeams activity tab. Without the sidebar plugin the tab is
 * silently skipped and the card button stays hidden (openAgentTeamsTab
 * undefined).
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(AGENT_TEAMS_LOCALE_NAMESPACE, { zh, en }), 'agent-teams: dictionaries');
    const openMember = (parentId, childId) => {
        void openAgentTeamMember(ctx.sessions, parentId, childId).catch((error) => {
            console.warn(`agent-teams: failed to open member transcript ${childId}: ${String(error)}`);
        });
    };
    const betterSidebar = ctx.get?.('betterSidebar');
    const sidebarUsable = betterSidebar !== undefined
        && typeof betterSidebar.registerTab === 'function'
        && typeof betterSidebar.openTab === 'function';
    if (sidebarUsable) {
        const disposer = betterSidebar.registerTab({
            id: AGENT_TEAMS_TAB_ID,
            title: 'AgentTeams',
            icon: (size) => _jsx(IconAgentPresetOutline16, { size: size }),
            order: 35,
            single: true,
            badge: () => agentTeamsTabBadge(),
            component: (props) => _jsx(AgentTeamsTab, { ...props }),
        });
        ctx.effect(() => disposer, 'agent-teams: better-sidebar tab');
    }
    // The host command is only the slash-menu/admission surface. Its input is
    // replayed as the visible user message, so the generic result row would be
    // a duplicate placed before that message by command lifecycle ordering.
    ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
        name: 'conversation.chat.commandview',
        key: 'agent-teams',
    }, HiddenAgentTeamsCommand));
    ctx.conversationEvents.register(agentTeamsCardDefinition);
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'agent-teams',
        locale: AGENT_TEAMS_LOCALE_NAMESPACE,
        inject: () => ({
            openMember,
            openAgentTeamsTab: sidebarUsable
                ? (data) => {
                    const owner = data.captainSessionId !== '' ? data.captainSessionId : ctx.sessions.list.getSnapshot().current ?? '';
                    betterSidebar?.openTab({
                        type: AGENT_TEAMS_TAB_ID,
                        meta: { data, owner },
                    });
                }
                : undefined,
        }),
    }, AgentTeamsCard));
}
