import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconBranchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import { compactDagLayout, COMPACT_DAG_NODE_HEIGHT, COMPACT_DAG_NODE_WIDTH, dependencyFocusTaskId, relatedTaskIds, usesParallelTaskGrid, } from "./activity-model.js";
import { ACTION_ART, LEAD_ART, memberArtUrl } from "./artwork.js";
import css from './ActivityView.module.css';
/** Initial-letter fallback for unmatched roles. */
function memberInitial(name) {
    return name.trim().slice(0, 1).toUpperCase() || '?';
}
function stableHash(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}
const ACCENTS = [
    'var(--dsw-alias-state-business-primary)',
    'var(--dsw-alias-state-success)',
    'var(--dsw-alias-state-danger)',
    'var(--dsw-alias-state-warning)',
    'var(--dsw-alias-label-tertiary)',
];
function accentOf(id) {
    return ACCENTS[stableHash(id) % ACCENTS.length] ?? ACCENTS[0];
}
/** Badge text follows the raw task status (finer than the 4 visual states):
 * claimed/pending/failed/cancelled keep their own labels and colors. */
const TASK_STATUS_LABEL = {
    pending: 'task.status.pending',
    claimed: 'task.status.claimed',
    in_progress: 'task.status.inProgress',
    completed: 'task.status.completed',
    failed: 'task.status.failed',
    cancelled: 'task.status.cancelled',
};
function taskStatusLabel(status, t) {
    const key = TASK_STATUS_LABEL[status];
    return key === undefined ? status : t(key);
}
function formatTaskIds(ids, t) {
    return ids.join(t('format.listSeparator'));
}
/** Badge/bar coloring key: visual state, widened for terminal statuses. */
function taskTone(state, status) {
    if (status === 'failed')
        return 'failed';
    if (status === 'cancelled')
        return 'cancelled';
    return state;
}
function Chevron({ open }) {
    return (_jsx("svg", { className: css.chevron, "data-open": open, width: "9", height: "9", viewBox: "0 0 10 10", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": true, children: _jsx("path", { d: "M3.5 2l3 3-3 3" }) }));
}
function WorkGlyph({ active }) {
    return (_jsx("svg", { className: css.workGlyph, "data-active": active, width: "11", height: "11", viewBox: "0 0 11 11", fill: "currentColor", "aria-hidden": true, children: [[0, 0], [4.2, 0], [8.4, 0], [0, 4.2], [4.2, 4.2], [8.4, 4.2]].map(([x, y], index) => (_jsx("rect", { x: x, y: y, width: "2.6", height: "2.6", rx: ".6", style: { animationDelay: `${index * 0.15}s` } }, `${x}:${y}`))) }));
}
function memberStateLabel(member, tasks, historic, t) {
    const owned = tasks.filter((task) => task.assignee === member.name);
    if (member.activity === 'working')
        return t('member.state.working');
    if (owned.some((task) => task.status === 'failed'))
        return t('member.state.failed');
    if (owned.some((task) => task.state === 'blocked'))
        return t('member.state.waiting');
    if (owned.length > 0 && owned.every((task) => task.status === 'completed'))
        return t('member.state.delivered');
    if (member.status === 'removed')
        return t(historic ? 'member.state.left' : 'member.state.removed');
    if (owned.length > 0)
        return t('member.state.pending');
    return t('member.state.unassigned');
}
function memberStatusText(member, tasks, t) {
    const owned = tasks.filter((task) => task.assignee === member.name);
    const current = owned.find((task) => task.id === member.currentTask);
    const blocked = owned.find((task) => task.state === 'blocked');
    if (member.activity === 'working' && current !== undefined)
        return t('member.status.executing', { taskId: current.id });
    if (member.activity === 'working')
        return t('member.status.working');
    if (blocked !== undefined) {
        const dependency = tasks.find((task) => blocked.dependencies.includes(task.id) && task.state !== 'completed');
        if (dependency !== undefined) {
            return t('member.status.waitingOn', {
                taskId: dependency.id,
                assignee: dependency.assignee || t('task.assignee.unclaimed'),
            });
        }
        return t('member.status.waitingPrerequisite');
    }
    if (member.total === 0)
        return t('member.status.waitingAssignment');
    if (member.done === member.total)
        return t('member.status.delivered');
    return t(member.activity === 'idle' ? 'member.status.idle' : 'member.status.unknown');
}
function compactTaskLabel(subject) {
    const withoutVerb = subject.replace(/^开发\s*/u, '').replace(/^\d+[-_.、\s]*/u, '');
    const head = withoutVerb.split(/[（(·：:]/u)[0]?.trim() ?? withoutVerb;
    return head.length > 18 ? `${head.slice(0, 17)}…` : head;
}
function taskSummary(team, t) {
    const completed = team.tasks.filter((task) => task.status === 'completed');
    const running = team.tasks.filter((task) => task.state === 'running');
    const blocked = team.tasks.filter((task) => task.state === 'blocked');
    const ready = team.tasks.filter((task) => task.state === 'open' && task.status !== 'completed');
    if (team.tasks.length === 0)
        return t('task.summary.waitingBreakdown');
    if (completed.length === team.tasks.length)
        return t('task.summary.allDelivered', { count: completed.length });
    if (blocked.length > 0 && running.length > 0) {
        return t('task.summary.blockedAndRunning', {
            tasks: formatTaskIds(blocked.slice(0, 3).map((task) => task.id), t),
            more: blocked.length > 3 ? t('task.summary.more', { count: blocked.length - 3 }) : '',
        });
    }
    if (running.length > 0)
        return t('task.summary.running', { tasks: formatTaskIds(running.map((task) => task.id), t) });
    if (ready.length > 0)
        return t('task.summary.ready', { tasks: formatTaskIds(ready.map((task) => task.id), t) });
    if (blocked.length > 0)
        return t('task.summary.blocked', { tasks: formatTaskIds(blocked.map((task) => task.id), t) });
    return t('task.summary.waitingSchedule');
}
function ProgressOverview({ team, t }) {
    const running = team.tasks.filter((task) => task.state === 'running').length;
    const blocked = team.tasks.filter((task) => task.state === 'blocked').length;
    const completed = team.tasks.filter((task) => task.status === 'completed').length;
    const summaryTone = blocked > 0 ? 'warning' : completed === team.tasks.length && team.tasks.length > 0 ? 'completed' : 'running';
    return (_jsxs("section", { className: css.progressOverview, "aria-label": t('progress.aria'), "data-progress-summary": true, children: [_jsx("span", { className: css.progressTitle, children: t('progress.title') }), team.tasks.length > 0 ? (_jsx("span", { className: css.progressSegments, "aria-hidden": true, children: team.tasks.map((task) => _jsx("span", { "data-state": taskTone(task.state, task.status) }, task.id)) })) : _jsx("span", { className: css.progressEmpty }), _jsxs("span", { className: css.progressLegend, children: [_jsx("span", { "data-state": "running", children: t('progress.running', { count: running }) }), _jsx("span", { "data-state": "blocked", children: t('progress.blocked', { count: blocked }) }), _jsx("span", { "data-state": "completed", children: t('progress.delivered', { count: completed }) })] }), _jsxs("span", { className: css.progressSummary, "data-state": summaryTone, children: [_jsx("span", { className: css.progressSummaryDot }), _jsx("span", { children: taskSummary(team, t) })] })] }));
}
function DependencyMap({ tasks, t }) {
    const [open, setOpen] = useState(true);
    const [hoverTaskId, setHoverTaskId] = useState(null);
    const [keyboardTaskId, setKeyboardTaskId] = useState(null);
    const [pinnedTaskId, setPinnedTaskId] = useState(null);
    const hoverTimer = useRef(null);
    const focusedTaskId = dependencyFocusTaskId(pinnedTaskId, keyboardTaskId, hoverTaskId);
    const layout = useMemo(() => compactDagLayout(tasks), [tasks]);
    const parallel = useMemo(() => usesParallelTaskGrid(tasks), [tasks]);
    const related = useMemo(() => focusedTaskId === null ? null : relatedTaskIds(focusedTaskId, tasks), [focusedTaskId, tasks]);
    const scheduleHover = (id) => {
        if (hoverTimer.current !== null) {
            clearTimeout(hoverTimer.current);
            hoverTimer.current = null;
        }
        if (id === null) {
            setHoverTaskId(null);
            return;
        }
        hoverTimer.current = setTimeout(() => {
            hoverTimer.current = null;
            setHoverTaskId(id);
        }, 180);
    };
    useEffect(() => () => {
        if (hoverTimer.current !== null)
            clearTimeout(hoverTimer.current);
    }, []);
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                setPinnedTaskId(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => { window.removeEventListener('keydown', onKeyDown); };
    }, []);
    if (tasks.length === 0)
        return null;
    const fallbackTask = tasks.find((task) => task.state === 'blocked')
        ?? tasks.find((task) => task.state === 'running')
        ?? tasks[0];
    const detailTask = tasks.find((task) => task.id === focusedTaskId) ?? fallbackTask;
    const waitingOn = detailTask.dependencies.filter((dependency) => (tasks.find((task) => task.id === dependency)?.status !== 'completed'));
    const dependents = tasks.filter((task) => task.dependencies.includes(detailTask.id));
    return (_jsxs("section", { className: css.dependencySection, "aria-label": t('dependency.aria'), "data-dependency-map": true, children: [_jsxs("header", { className: css.sectionHead, children: [_jsxs("button", { type: "button", className: css.sectionToggleTitle, onClick: () => { setOpen((current) => !current); }, "aria-expanded": open, children: [_jsx(Chevron, { open: open }), _jsx(IconBranchOutline16, {}), " ", t(parallel ? 'dependency.parallel' : 'dependency.title')] }), _jsx("span", { className: css.sectionHint, children: pinnedTaskId === null
                            ? t(parallel ? 'dependency.hint.parallel' : 'dependency.hint.chain')
                            : t('dependency.hint.pinned', { taskId: pinnedTaskId }) })] }), open && (_jsxs(_Fragment, { children: [_jsx("div", { className: css.dagViewport, children: _jsxs("div", { className: css.dagCanvas, "data-layout": parallel ? 'parallel' : 'dependency', style: parallel ? undefined : { width: layout.width, height: layout.height }, children: [!parallel && _jsx("svg", { className: css.dagEdges, width: layout.width, height: layout.height, "aria-hidden": true, children: layout.edges.map((edge) => {
                                        const active = related !== null && related.has(edge.from) && related.has(edge.to);
                                        return _jsx("path", { d: edge.path, "data-active": active, "data-dimmed": related !== null && !active }, `${edge.from}:${edge.to}`);
                                    }) }), layout.nodes.map(({ task, x, y }) => (_jsxs("button", { type: "button", className: css.dagNode, style: parallel
                                        ? { height: COMPACT_DAG_NODE_HEIGHT }
                                        : { left: x, top: y, width: COMPACT_DAG_NODE_WIDTH, height: COMPACT_DAG_NODE_HEIGHT }, "data-task-id": task.id, "data-state": taskTone(task.state, task.status), "data-focused": related?.has(task.id) ?? false, "data-dimmed": related !== null && !related.has(task.id), "aria-pressed": pinnedTaskId === task.id, title: `${task.id} · ${task.subject}`, onClick: () => { setPinnedTaskId((current) => current === task.id ? null : task.id); }, onMouseEnter: () => { scheduleHover(task.id); }, onMouseLeave: () => { scheduleHover(null); }, onFocus: () => { setKeyboardTaskId(task.id); }, onBlur: () => { setKeyboardTaskId(null); }, children: [_jsxs("span", { className: css.dagNodeHead, children: [_jsx("span", { className: css.dagNodeDot }), task.id] }), _jsx("span", { className: css.dagNodeLabel, children: compactTaskLabel(task.subject) }), task.state === 'running' && (_jsx("span", { className: css.dagRunningState, "aria-label": t('task.runningAria'), children: _jsx(WorkGlyph, { active: true }) }))] }, task.id)))] }) }), _jsxs("section", { className: css.taskDetail, "data-task-detail": detailTask.id, children: [_jsxs("span", { className: css.taskDetailHead, children: [_jsx("span", { className: css.taskDetailId, children: detailTask.id }), _jsx("span", { className: css.taskDetailSubject, title: detailTask.subject, children: detailTask.subject.replace(/^开发\s*/u, '') }), _jsx("span", { className: css.taskDetailBadge, "data-state": taskTone(detailTask.state, detailTask.status), children: taskStatusLabel(detailTask.status, t) })] }), _jsxs("span", { className: css.taskDetailLine, children: [detailTask.assignee || t('task.assignee.unclaimed'), " \u00B7 ", detailTask.status === 'completed'
                                        ? t('task.detail.completed')
                                        : detailTask.dependencies.length === 0
                                            ? t('task.detail.noPrerequisite')
                                            : waitingOn.length === 0
                                                ? t('task.detail.ready')
                                                : t('task.detail.waitingOn', { tasks: formatTaskIds(waitingOn, t) })] }), _jsx("span", { className: css.taskDetailMeta, children: dependents.length === 0
                                    ? t('task.detail.noDownstream')
                                    : t('task.detail.unlocks', { tasks: formatTaskIds(dependents.map((task) => task.id), t) }) })] })] }))] }));
}
function TeamSection({ team, onNavigate, t, historic = false }) {
    const [membersOpen, setMembersOpen] = useState(true);
    const busyCount = team.members.filter((member) => member.activity === 'working').length;
    const assignedCount = team.tasks.filter((task) => task.assignee !== '').length;
    const completedCount = team.tasks.filter((task) => task.status === 'completed').length;
    const allCompleted = team.tasks.length > 0 && completedCount === team.tasks.length;
    return (_jsxs("section", { className: css.team, "data-team-id": team.teamId, children: [_jsxs("header", { className: css.teamHead, children: [_jsx("span", { className: css.teamName, title: team.name, children: team.name }), historic && _jsx("span", { className: css.historicPill, children: t('team.ended') }), _jsxs("span", { className: css.teamStats, children: [_jsx("span", { "data-stat": "members", children: t('team.stats.members', { count: team.members.length }) }), _jsx("span", { "data-stat": "tasks", children: t('team.stats.completed', { completed: completedCount, total: team.tasks.length }) }), _jsx("span", { "data-stat": "messages", children: t('team.stats.messages', { count: team.messageCount }) })] })] }), _jsxs("section", { className: css.delegationSection, "aria-label": t('delegation.aria'), "data-delegation-map": true, children: [_jsxs("div", { className: css.captainNode, children: [_jsx("span", { className: css.captainAvatar, children: _jsx("img", { className: css.leadAvatar, src: LEAD_ART, alt: "", "aria-hidden": true }) }), _jsxs("span", { className: css.captainInfo, children: [_jsxs("span", { className: css.captainLine, children: [_jsx("span", { className: css.captainName, children: t('captain.name') }), _jsx("span", { className: css.captainRole, children: t('captain.role') })] }), _jsx("span", { className: css.captainSummary, children: t('captain.summary', {
                                            tasks: assignedCount,
                                            members: team.members.length,
                                        }) })] }), _jsxs("span", { className: css.captainState, "data-busy": busyCount > 0, children: [_jsx(WorkGlyph, { active: busyCount > 0 }), busyCount > 0
                                        ? t('captain.state.working', { count: busyCount })
                                        : t(allCompleted ? 'captain.state.collected' : 'captain.state.waiting')] })] }), _jsx(ProgressOverview, { team: team, t: t }), _jsxs("button", { type: "button", className: css.membersToggle, onClick: () => { setMembersOpen((current) => !current); }, "aria-expanded": membersOpen, "data-members-toggle": true, children: [_jsxs("span", { children: [_jsx(Chevron, { open: membersOpen }), t('members.toggle', { count: team.members.length })] }), _jsx("span", { children: t(membersOpen ? 'members.collapse' : 'members.expand') })] }), membersOpen && _jsxs("div", { className: css.delegationTree, children: [team.members.length === 0 && _jsx("span", { className: css.emptyHint, children: t('members.empty') }), team.members.map((member) => {
                                const owned = team.tasks.filter((task) => task.assignee === member.name);
                                return (_jsxs("div", { className: css.memberBlock, "data-activity": member.activity, children: [_jsx("span", { className: css.memberBranch, "aria-hidden": true, children: _jsx("span", {}) }), _jsxs("button", { type: "button", className: css.memberRow, "data-activity": member.activity, onClick: () => {
                                                if (member.id !== '') {
                                                    onNavigate(team.captainSessionId, member.id);
                                                }
                                            }, children: [_jsxs("span", { className: css.memberAvatar, "data-unread": member.unread > 0, children: [memberArtUrl(member.name, member.role) !== null ? (_jsx("img", { className: css.memberArt, src: memberArtUrl(member.name, member.role) ?? '', alt: "", "aria-hidden": true })) : (_jsx("span", { className: css.memberInitial, style: { background: accentOf(member.id) }, children: memberInitial(member.name) })), _jsx("img", { className: css.stateArt, "data-activity": member.activity, src: ACTION_ART[member.activity], alt: "", "aria-hidden": true })] }), _jsxs("span", { className: css.memberInfo, children: [_jsxs("span", { className: css.memberLine, children: [_jsx("span", { className: css.memberName, children: member.name }), member.role !== '' && _jsx("span", { className: css.memberRole, children: member.role }), _jsxs("span", { className: css.memberState, "data-activity": member.activity, children: [_jsx(WorkGlyph, { active: member.activity === 'working' }), memberStateLabel(member, team.tasks, historic, t)] })] }), _jsx("span", { className: css.memberStatusLine, children: memberStatusText(member, team.tasks, t) })] }), _jsxs("span", { className: css.memberCount, children: [member.done, "/", member.total] })] }), _jsxs("div", { className: css.assignmentLine, children: [_jsx("span", { className: css.assignmentLabel, children: t('assignment.label') }), _jsx("span", { className: css.assignmentTasks, children: owned.length === 0
                                                        ? _jsx("span", { className: css.taskEmpty, children: t('assignment.empty') })
                                                        : owned.map((task) => (_jsx("span", { className: css.assignmentChip, "data-state": taskTone(task.state, task.status), title: task.subject, children: task.id }, task.id))) })] })] }, member.id));
                            })] })] }), _jsx(DependencyMap, { tasks: team.tasks, t: t })] }));
}
/** Legacy conversation cards may outlive their host archive. Project their
 * durable roster through the same rebuilt content instead of a second UI. */
function historicCardTeam(data, owner) {
    return {
        workspace: '',
        teamId: data.teamId,
        name: data.teamName,
        captainSessionId: data.captainSessionId || owner,
        members: data.members.map((member) => ({
            ...member,
            status: 'removed',
            activity: 'idle',
            progress: 0,
            done: 0,
            total: 0,
            currentTask: '',
            unread: 0,
        })),
        tasks: [],
        messageCount: 0,
        captainInbox: [],
    };
}
/** Render team contents for the current session's host tab. */
export function ActivityView({ teams, archivedTeams, historic, currentSessionId, onNavigate, t }) {
    const visibleTeams = currentSessionId === undefined
        ? []
        : teams.filter((team) => team.captainSessionId === currentSessionId);
    const visibleArchived = currentSessionId === undefined
        ? []
        : archivedTeams.filter((team) => team.captainSessionId === currentSessionId && !teams.some((live) => live.captainSessionId === currentSessionId && live.teamId === team.teamId));
    const visibleHistoric = currentSessionId === undefined
        ? []
        : [...historic.values()].filter(({ data, owner }) => owner === currentSessionId
            && !visibleTeams.some((live) => live.teamId === data.teamId)
            && !visibleArchived.some((archived) => archived.teamId === data.teamId));
    const count = visibleTeams.length + visibleArchived.length + visibleHistoric.length;
    return (_jsx("div", { className: css.root, "data-agent-teams-activity": true, children: count === 0
            ? _jsx("span", { className: css.emptyHint, children: t('activity.empty') })
            : (_jsxs(_Fragment, { children: [visibleTeams.map((team) => (_jsx(TeamSection, { team: team, onNavigate: onNavigate, t: t }, team.teamId))), visibleArchived.map((team) => (_jsxs("div", { "data-team-id": team.teamId, "data-historic": true, className: css.archivedWrap, children: [_jsx("span", { className: css.archiveLabel, children: t('archive.label') }), _jsx(TeamSection, { team: team, onNavigate: onNavigate, t: t, historic: true })] }, `${team.captainSessionId}:${team.teamId}`))), visibleHistoric.map(({ data: team, owner }) => {
                        const teamKey = `${owner}:${team.teamId}`;
                        return (_jsx(TeamSection, { team: historicCardTeam(team, owner), onNavigate: onNavigate, t: t, historic: true }, teamKey));
                    })] })) }));
}
