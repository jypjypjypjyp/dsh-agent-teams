/**
 * AgentTeams conversation card: the lightweight in-conversation summary for
 * one team — the captain's whale avatar and name, the member roster as
 * clickable whale avatars (opening the member's subagent transcript), and
 * an AgentTeams button that opens the better-sidebar AgentTeams tab when
 * dsh-better-sidebar is loaded.
 *
 * The card shares the demand-driven activity monitor with the sidebar tab
 * (registering its team as a monitored target), so the same live/archive
 * snapshot keeps the card's roster current while the tab runs.
 * @module dsh-agent-teams/client/card
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts';
/** Navigation action injected from the plugin's own SessionsService access. */
export interface AgentTeamsCardInjected {
    readonly openMember: (parentId: SessionId, childId: SessionId) => void;
    /** Present only when dsh-better-sidebar is loaded; opens the AgentTeams tab
     *  and feeds this card's team summary so historic review can show it. */
    readonly openAgentTeamsTab?: (data: AgentTeamsCardData) => void;
}
/** Complete keyed Chat renderer props. */
export type AgentTeamsCardProps = PropsRuntime<'conversation.chat.node', 'agent-teams'> & PropsLocale<'agentTeams'> & AgentTeamsCardInjected;
/** Render one durable team as a compact conversation card. */
export declare function AgentTeamsCard({ node, openMember, sessionId, t, openAgentTeamsTab }: AgentTeamsCardProps): import("react").JSX.Element;
