import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getActivitySnapshotsSnapshot, monitorAgentTeam, subscribeActivitySnapshots, } from "./activity-monitor.js";
import { LEAD_ART, memberArtUrl } from "./artwork.js";
import css from './AgentTeamsCard.module.css';
/** Render one durable team as a compact conversation card. */
export function AgentTeamsCard({ node, openMember, sessionId, t, openAgentTeamsTab }) {
    const data = node.data;
    // `conversation.chat.node` is session-scoped, so its framework-owned id is
    // a stable owner even while another conversation becomes current.
    const owner = data.captainSessionId || sessionId;
    const { teams, archivedTeams } = useSyncExternalStore(subscribeActivitySnapshots, getActivitySnapshotsSnapshot);
    useEffect(() => {
        return monitorAgentTeam(owner, data.teamId);
    }, [data.teamId, owner]);
    const snapshot = teams.find((team) => team.teamId === data.teamId && (owner === '' || team.captainSessionId === owner))
        ?? archivedTeams.find((team) => team.teamId === data.teamId && (owner === '' || team.captainSessionId === owner));
    const resolved = useMemo(() => ({
        ...data,
        captainSessionId: snapshot?.captainSessionId ?? owner,
        teamName: snapshot?.name ?? data.teamName,
        members: snapshot?.members.map((member) => ({ id: member.id, name: member.name, role: member.role })) ?? data.members,
    }), [data, owner, snapshot]);
    return (_jsxs("section", { className: css.root, "data-agent-teams-card": true, "data-team-id": resolved.teamId, children: [_jsxs("header", { className: css.head, children: [_jsx("img", { className: css.leadAvatar, src: LEAD_ART, alt: "", "aria-hidden": true }), _jsx("span", { className: css.teamName, title: resolved.teamName, children: resolved.teamName }), _jsx("span", { className: css.memberCount, children: t('card.memberCount', { count: resolved.members.length }) }), openAgentTeamsTab !== undefined && (_jsx("button", { type: "button", className: css.panelButton, onClick: () => { openAgentTeamsTab(resolved); }, "aria-label": t('action.openActivityPanel'), title: t('action.openActivityPanel'), children: t('activity.panelButton') }))] }), resolved.members.length > 0 && (_jsx("div", { className: css.members, children: resolved.members.map((member) => (_jsxs("button", { type: "button", className: css.member, onClick: () => {
                        if (member.id !== '')
                            openMember(owner, member.id);
                    }, title: member.role === '' ? member.name : `${member.name} · ${member.role}`, children: [memberArtUrl(member.name, member.role) !== null ? (_jsx("img", { className: css.memberArt, src: memberArtUrl(member.name, member.role) ?? '', alt: "", "aria-hidden": true })) : (_jsx("span", { className: css.memberInitial, children: member.name.trim().slice(0, 1).toUpperCase() || '?' })), _jsx("span", { className: css.memberName, children: member.name })] }, member.id))) }))] }));
}
