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
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts';
export declare function setAgentTeamsTabCount(count: number): void;
export declare function agentTeamsTabBadge(): number;
/** Props supplied by the better-sidebar tab renderer (structural subset). */
export interface AgentTeamsTabProps {
    ctx: unknown;
    store?: unknown;
    scope: {
        sessionId: string;
        cwd?: string;
    };
    tab: {
        id: string;
        type: string;
        title: string;
        meta?: unknown;
    };
    visible: boolean;
}
/** The card summary carried through openTab's `meta` seed. */
export interface AgentTeamsCardMeta {
    data: AgentTeamsCardData;
    owner: string;
}
export declare function AgentTeamsTab(props: AgentTeamsTabProps): import("react").JSX.Element;
