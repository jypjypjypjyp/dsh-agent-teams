/** Browser plugin for the AgentTeams better-sidebar tab and conversation card. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type AgentTeamsLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** AgentTeams conversation card and activity monitor copy. */
        agentTeams: AgentTeamsLocaleKey;
    }
}
/** Required services: conversation nodes, slots, sessions navigation, and locale. */
export declare const inject: string[];
/**
 * Register the in-conversation team card and, when dsh-better-sidebar is
 * loaded, the AgentTeams activity tab. Without the sidebar plugin the tab is
 * silently skipped and the card button stays hidden (openAgentTeamsTab
 * undefined).
 */
export declare function apply(ctx: ClientContext): void;
