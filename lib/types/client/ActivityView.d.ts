/**
 * AgentTeams activity view: session-scoped team contents rendered inside a
 * host tab (the better-sidebar AgentTeams tab). Pure presentation — polling,
 * snapshot subscription, and session ownership live in the host tab wrapper
 * ({@link AgentTeamsTab}). The content is aligned with the latest upstream
 * activity surface: every label is sourced through the `agentTeams` locale
 * namespace, navigation reaches members through the address-aware
 * openAgentTeamMember path, and team/task shapes are the shared
 * activity-monitor types.
 * @module dsh-agent-teams/client/activity-view
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ActivityTeam } from './activity-monitor.ts';
import type { AgentTeamsCardData } from './agent-teams-card-definition.ts';
import type { AgentTeamsTranslate } from './locales.ts';
/** Render team contents for the current session's host tab. */
export declare function ActivityView({ teams, archivedTeams, historic, currentSessionId, onNavigate, t }: {
    readonly teams: readonly ActivityTeam[];
    readonly archivedTeams: readonly ActivityTeam[];
    readonly historic: ReadonlyMap<string, {
        data: AgentTeamsCardData;
        owner: string;
    }>;
    readonly currentSessionId: SessionId | undefined;
    readonly onNavigate: (parentId: SessionId, childId: SessionId) => void;
    readonly t: AgentTeamsTranslate;
}): import("react").JSX.Element;
