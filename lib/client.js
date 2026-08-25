window.__ModuleLoader__.load({
	id: "@nanmicoder/dsh-agent-teams",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		//#region lib/client/activity-monitor.js
		/** Shared, demand-driven state for the AgentTeams browser monitor. */
		const targets = /* @__PURE__ */ new Map();
		const targetListeners = /* @__PURE__ */ new Set();
		const snapshotListeners = /* @__PURE__ */ new Set();
		let targetSnapshot = [];
		let activitySnapshots = {
			teams: [],
			archivedTeams: []
		};
		function targetKey(sessionId, teamId) {
			return `${sessionId}\u0000${teamId}`;
		}
		function publishTargets() {
			targetSnapshot = [...targets.values()].filter((target) => target.active).map(({ key, sessionId, teamId }) => ({
				key,
				sessionId,
				teamId
			}));
			for (const listener of targetListeners) listener();
		}
		/** Subscribe to the active monitor-target list (React external-store shape). */
		function subscribeActivityMonitorTargets(listener) {
			targetListeners.add(listener);
			return () => {
				targetListeners.delete(listener);
			};
		}
		/** Read the stable active-target snapshot. */
		function getActivityMonitorTargetsSnapshot() {
			return targetSnapshot;
		}
		/**
		* Register one successful AgentTeams card as a monitoring demand.
		*
		* The returned cleanup is reference-counted so multiple cards and React
		* StrictMode remounts cannot stop another card's monitor.
		*/
		function monitorAgentTeam(sessionId, teamId) {
			const owner = sessionId.trim();
			const id = teamId.trim();
			if (owner === "" || id === "") return () => {};
			const key = targetKey(owner, id);
			const existing = targets.get(key);
			if (existing === void 0) {
				targets.set(key, {
					key,
					sessionId: owner,
					teamId: id,
					refs: 1,
					active: true
				});
				publishTargets();
			} else {
				existing.refs += 1;
				if (!existing.active) {
					existing.active = true;
					publishTargets();
				}
			}
			let released = false;
			return () => {
				if (released) return;
				released = true;
				const current = targets.get(key);
				if (current === void 0) return;
				current.refs -= 1;
				if (current.refs <= 0) {
					targets.delete(key);
					if (current.active) publishTargets();
				}
			};
		}
		/** Stop polling targets whose final archived snapshot has been captured. */
		function settleActivityMonitorTargets(keys) {
			let changed = false;
			for (const key of keys) {
				const target = targets.get(key);
				if (target?.active !== true) continue;
				target.active = false;
				changed = true;
			}
			if (changed) publishTargets();
		}
		/** Subscribe to the shared live/archive snapshot. */
		function subscribeActivitySnapshots(listener) {
			snapshotListeners.add(listener);
			return () => {
				snapshotListeners.delete(listener);
			};
		}
		/** Read the stable shared live/archive snapshot. */
		function getActivitySnapshotsSnapshot() {
			return activitySnapshots;
		}
		/** Publish one or both successful state-route responses. */
		function updateActivitySnapshots(update) {
			const next = {
				teams: update.teams ?? activitySnapshots.teams,
				archivedTeams: update.archivedTeams ?? activitySnapshots.archivedTeams
			};
			if (next.teams === activitySnapshots.teams && next.archivedTeams === activitySnapshots.archivedTeams) return;
			activitySnapshots = next;
			for (const listener of snapshotListeners) listener();
		}
		/** Poll cadence for the live host snapshot route. */
		const ACTIVITY_POLL_MS = 1e3;
		/**
		* Low-frequency probe cadence while a cardless discovery session still owns
		* no team. The probe keeps the panel able to pick up a team created later in
		* that session (e.g. a run_code-wrapped agent_teams_create) without turning
		* every ordinary session into a one-second filesystem scan.
		*/
		const ACTIVITY_PROBE_MS = 5e3;
		/** Host route serving live and archived team snapshots. */
		const ACTIVITY_STATE_URL = "/plugins/dsh-agent-teams/state";
		/**
		* Start the single polling loop for the current session's requested targets.
		*
		* With neither targets nor a discovery session this is deliberately inert.
		* Explicit card targets poll at the live cadence from the start. A discovery
		* session performs an immediate live+archive restore pass, then — while it
		* still owns no team — probes on a low-frequency cadence, so a team created
		* later in that session (e.g. a run_code-wrapped agent_teams_create) is
		* discovered without a manual reload, without turning every ordinary session
		* into a one-second filesystem scan. The moment a team for the discovery
		* session appears, the controller upgrades to the live one-second cadence for
		* the rest of its lifetime. The caller — the session view, which stops the
		* controller when the session is no longer current — bounds the lifetime, and
		* archive state is refreshed when a target or a previously discovered live
		* team disappears.
		*/
		function startActivityPolling(monitorTargets, runtime = {}) {
			const discoverySessionId = runtime.discoverySessionId?.trim();
			if (monitorTargets.length === 0 && (discoverySessionId === void 0 || discoverySessionId === "")) return {
				firstTick: Promise.resolve(),
				stop: () => {}
			};
			const fetchState = runtime.fetchState ?? ((url, init) => fetch(url, init));
			const schedule = runtime.schedule ?? ((callback, intervalMs) => setInterval(callback, intervalMs));
			const cancel = runtime.cancel ?? ((timer) => {
				clearInterval(timer);
			});
			const publishSnapshots = runtime.publishSnapshots ?? updateActivitySnapshots;
			const settleTargets = runtime.settleTargets ?? settleActivityMonitorTargets;
			let cancelled = false;
			let inFlight = false;
			let hot = monitorTargets.length > 0;
			let discoveryComplete = false;
			let discoveredLiveKeys = /* @__PURE__ */ new Set();
			let controller;
			let timer;
			const intervalMs = () => hot ? ACTIVITY_POLL_MS : ACTIVITY_PROBE_MS;
			const reschedule = () => {
				cancel(timer);
				timer = schedule(() => {
					tick();
				}, intervalMs());
			};
			const tick = async () => {
				if (inFlight || cancelled) return;
				inFlight = true;
				controller = new AbortController();
				try {
					const liveResponse = await fetchState(ACTIVITY_STATE_URL, {
						cache: "no-store",
						signal: controller.signal
					});
					if (!liveResponse.ok) return;
					const body = await liveResponse.json();
					if (cancelled || !Array.isArray(body.teams)) return;
					const liveTeams = body.teams;
					publishSnapshots({ teams: liveTeams });
					const previousDiscoveredKeys = discoveredLiveKeys;
					discoveredLiveKeys = new Set(discoverySessionId === void 0 || discoverySessionId === "" ? [] : liveTeams.filter((team) => team.captainSessionId === discoverySessionId).map((team) => team.teamId));
					if (!hot && discoveredLiveKeys.size > 0) {
						hot = true;
						reschedule();
					}
					const discoveredTeamArchived = [...previousDiscoveredKeys].some((teamId) => !discoveredLiveKeys.has(teamId));
					const missing = monitorTargets.filter((target) => !liveTeams.some((team) => team.captainSessionId === target.sessionId && team.teamId === target.teamId));
					const needsDiscoveryArchive = discoverySessionId !== void 0 && discoverySessionId !== "" && !discoveryComplete;
					if (missing.length === 0 && !needsDiscoveryArchive && !discoveredTeamArchived) return;
					const archivedResponse = await fetchState(`${ACTIVITY_STATE_URL}?archived=1`, {
						cache: "no-store",
						signal: controller.signal
					});
					if (!archivedResponse.ok) return;
					const archivedBody = await archivedResponse.json();
					if (cancelled || !Array.isArray(archivedBody.teams)) return;
					publishSnapshots({ archivedTeams: archivedBody.teams });
					discoveryComplete = true;
					settleTargets(new Set(missing.map((target) => target.key)));
				} catch (error) {
					if (error?.name === "AbortError") return;
				} finally {
					inFlight = false;
				}
			};
			const firstTick = tick();
			if (timer === void 0) timer = schedule(() => {
				tick();
			}, intervalMs());
			return {
				firstTick,
				stop: () => {
					if (cancelled) return;
					cancelled = true;
					controller?.abort();
					cancel(timer);
				}
			};
		}
		//#endregion
		//#region lib/client/artwork.js
		/**
		* Shared whale artwork lookup for the activity panel and the conversation
		* card: role keywords map to the packaged role images; the captain always
		* uses the lead whale.
		* @module dsh-agent-teams/client/artwork
		*/
		/** Artwork route prefix served by the plugin host half. */
		const ART_BASE = "/plugins/dsh-agent-teams/assets/";
		/** V2 whale role artwork per role keyword. */
		const ROLE_ART = [
			[/data|analys|metric|performance|数据|分析|指标|性能/, "member-data-v2.png"],
			[/resear|investig|explor|study|研究|调查|探索|调研/, "member-researcher-v2.png"],
			[/\bqa\b|test|verif|quality|测试|质量|验证/, "member-qa-v2.png"],
			[/engineer|dev\b|server|backend|\bapi\b|runtime|watcher|contract|工程|后端|服务|接口|开发|代码|编程/, "member-engineer-v2.png"],
			[/design|\bui\b|\bux\b|front|theme|accessib|设计|前端|主题|无障碍/, "member-designer-v2.png"],
			[/secur|audit|risk|threat|review|安全|审计|审查|风险/, "member-security-v2.png"],
			[/docs|writer|product|spec|撰写|文案|写作|文档|规范/, "member-docs-v2.png"],
			[/release|\bbuild\b|deploy|\bops\b|\bci\b|ship|coordin|发布|构建|部署|运维|协调/, "member-operator-v2.png"]
		];
		/** Captain artwork (always the lead whale). */
		const LEAD_ART = `${ART_BASE}team-lead-v2.png`;
		/** Status action artwork per member activity. */
		const ACTION_ART = {
			working: `${ART_BASE}action-working-v2.png`,
			idle: `${ART_BASE}action-sleeping-v2.png`,
			unknown: `${ART_BASE}action-thinking-v2.png`
		};
		/**
		* Member artwork URL, or null when no role matches (initial-letter fallback).
		* @param name - the member's display name.
		* @param role - the member's role text.
		* @returns the artwork URL, or null when unmatched.
		*/
		function memberArtUrl(name, role) {
			const identity = `${name} ${role}`.toLowerCase();
			for (const [pattern, art] of ROLE_ART) if (pattern.test(identity)) return `${ART_BASE}${art}`;
			return null;
		}
		//#endregion
		//#region \0dsh-css:@nanmicoder/dsh-agent-teams/src/client/AgentTeamsCard.module.css.mjs
		const css$1 = ".bPiEvW_root{box-sizing:border-box;border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-module-platform);border-radius:10px;flex-direction:column;gap:8px;width:100%;min-width:0;padding:10px 12px;display:flex}.bPiEvW_head{align-items:center;gap:8px;min-width:0;display:flex}.bPiEvW_leadAvatar{object-fit:contain;filter:drop-shadow(0 1px 1px #122d4833);background:0 0;border:0;border-radius:0;flex:none;width:30px;height:30px}.bPiEvW_teamName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:0 auto;font-size:13px;font-weight:600;line-height:20px;overflow:hidden}.bPiEvW_memberCount{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;margin-left:auto;font-size:11px;line-height:16px}.bPiEvW_panelButton{border:1px solid var(--dsw-alias-line-strong);background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:999px;flex:none;padding:2px 8px;font-size:10.5px;font-weight:600;line-height:16px;transition:border-color .12s,color .12s}.bPiEvW_panelButton:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}.bPiEvW_panelButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.bPiEvW_members{flex-wrap:wrap;gap:6px;min-width:0;display:flex}.bPiEvW_member{border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-module);max-width:160px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:999px;align-items:center;gap:5px;padding:3px 8px 3px 3px;font-size:11px;font-weight:500;line-height:16px;transition:border-color .12s,background-color .12s;display:inline-flex}.bPiEvW_member:hover{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-fill-neutral)}.bPiEvW_member:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.bPiEvW_memberArt{object-fit:contain;filter:drop-shadow(0 1px 1px #122d482e);background:0 0;border:0;border-radius:0;width:24px;height:24px}.bPiEvW_memberInitial{background:var(--dsw-alias-bg-fill-business);width:20px;height:20px;color:var(--dsw-alias-label-on-fill);border-radius:50%;justify-content:center;align-items:center;font-size:10px;font-weight:600;line-height:20px;display:inline-flex}.bPiEvW_memberName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}";
		const tagId$1 = "@nanmicoder/dsh-agent-teams/AgentTeamsCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@nanmicoder/dsh-agent-teams";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var AgentTeamsCard_module_css_default = {
			"head": "bPiEvW_head",
			"leadAvatar": "bPiEvW_leadAvatar",
			"member": "bPiEvW_member",
			"memberArt": "bPiEvW_memberArt",
			"memberCount": "bPiEvW_memberCount",
			"memberInitial": "bPiEvW_memberInitial",
			"memberName": "bPiEvW_memberName",
			"members": "bPiEvW_members",
			"panelButton": "bPiEvW_panelButton",
			"root": "bPiEvW_root",
			"teamName": "bPiEvW_teamName"
		};
		//#endregion
		//#region lib/client/AgentTeamsCard.js
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
		/** Render one durable team as a compact conversation card. */
		function AgentTeamsCard({ node, openMember, sessionId, t, openAgentTeamsTab }) {
			const data = node.data;
			const owner = data.captainSessionId || sessionId;
			const { teams, archivedTeams } = (0, react.useSyncExternalStore)(subscribeActivitySnapshots, getActivitySnapshotsSnapshot);
			(0, react.useEffect)(() => {
				return monitorAgentTeam(owner, data.teamId);
			}, [data.teamId, owner]);
			const snapshot = teams.find((team) => team.teamId === data.teamId && (owner === "" || team.captainSessionId === owner)) ?? archivedTeams.find((team) => team.teamId === data.teamId && (owner === "" || team.captainSessionId === owner));
			const resolved = (0, react.useMemo)(() => ({
				...data,
				captainSessionId: snapshot?.captainSessionId ?? owner,
				teamName: snapshot?.name ?? data.teamName,
				members: snapshot?.members.map((member) => ({
					id: member.id,
					name: member.name,
					role: member.role
				})) ?? data.members
			}), [
				data,
				owner,
				snapshot
			]);
			return (0, react_jsx_runtime.jsxs)("section", {
				className: AgentTeamsCard_module_css_default.root,
				"data-agent-teams-card": true,
				"data-team-id": resolved.teamId,
				children: [(0, react_jsx_runtime.jsxs)("header", {
					className: AgentTeamsCard_module_css_default.head,
					children: [
						(0, react_jsx_runtime.jsx)("img", {
							className: AgentTeamsCard_module_css_default.leadAvatar,
							src: LEAD_ART,
							alt: "",
							"aria-hidden": true
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: AgentTeamsCard_module_css_default.teamName,
							title: resolved.teamName,
							children: resolved.teamName
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: AgentTeamsCard_module_css_default.memberCount,
							children: t("card.memberCount", { count: resolved.members.length })
						}),
						openAgentTeamsTab !== void 0 && (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: AgentTeamsCard_module_css_default.panelButton,
							onClick: () => {
								openAgentTeamsTab(resolved);
							},
							"aria-label": t("action.openActivityPanel"),
							title: t("action.openActivityPanel"),
							children: t("activity.panelButton")
						})
					]
				}), resolved.members.length > 0 && (0, react_jsx_runtime.jsx)("div", {
					className: AgentTeamsCard_module_css_default.members,
					children: resolved.members.map((member) => (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: AgentTeamsCard_module_css_default.member,
						onClick: () => {
							if (member.id !== "") openMember(owner, member.id);
						},
						title: member.role === "" ? member.name : `${member.name} · ${member.role}`,
						children: [memberArtUrl(member.name, member.role) !== null ? (0, react_jsx_runtime.jsx)("img", {
							className: AgentTeamsCard_module_css_default.memberArt,
							src: memberArtUrl(member.name, member.role) ?? "",
							alt: "",
							"aria-hidden": true
						}) : (0, react_jsx_runtime.jsx)("span", {
							className: AgentTeamsCard_module_css_default.memberInitial,
							children: member.name.trim().slice(0, 1).toUpperCase() || "?"
						}), (0, react_jsx_runtime.jsx)("span", {
							className: AgentTeamsCard_module_css_default.memberName,
							children: member.name
						})]
					}, member.id))
				})]
			});
		}
		//#endregion
		//#region lib/client/agent-teams-card-definition.js
		/**
		* AgentTeams conversation card: a lightweight in-conversation summary shown
		* when a team is created — the captain's name, the member roster with whale
		* avatars, and an entry point that opens the AgentTeams tab in
		* dsh-better-sidebar (useful while reviewing an old session).
		*
		* The fold anchors to the Harness's durable `tool/call` + `tool/result`
		* records for `agent_teams_create`. Those are first-party session events, so
		* the card survives restarts without writing an out-of-repo event type.
		* @module dsh-agent-teams/client/card
		*/
		/** Parse the only create-call fields the historic card owns. */
		function parseAgentTeamsCreateArgs(value) {
			try {
				const parsed = JSON.parse(value);
				if (typeof parsed !== "object" || parsed === null || !("name" in parsed) || typeof parsed.name !== "string") return;
				const name = parsed.name.trim();
				if (name === "") return void 0;
				const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
				return {
					teamId: cleaned === "" ? "team" : cleaned,
					name
				};
			} catch {
				return;
			}
		}
		/** Durable first-party tool events folded into one keyed Chat node. */
		const agentTeamsCardDefinition = {
			kind: "agent-teams",
			target: "chat",
			match: (event) => {
				if (event.type === "tool/call" && event.data.name === "agent_teams_create") return parseAgentTeamsCreateArgs(event.data.arguments) === void 0 ? null : {
					id: String(event.data.callId),
					role: "start"
				};
				if (event.type === "tool/result" && event.data.message.source.kind === "tool") return {
					id: String(event.data.message.source.callId),
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "tool/call") throw new Error("agent-teams card start requires agent_teams_create tool/call");
				const parsed = parseAgentTeamsCreateArgs(match.event.data.arguments);
				if (parsed === void 0) throw new Error("agent-teams card start requires valid create arguments");
				return {
					...parsed,
					accepted: false
				};
			},
			update: (context, match) => {
				if (match.event.type !== "tool/result") return context.state;
				if (match.event.data.error !== void 0 || match.event.data.message.content.some((block) => block.type === "tool-result" && block.isError === true)) return context.state;
				return {
					...context.state,
					accepted: true
				};
			},
			buildViewNode: (context) => {
				if (context.start === void 0) return null;
				const state = context.state;
				if (!state.accepted) return null;
				return {
					key: context.key,
					kind: "agent-teams",
					id: context.id,
					target: "chat",
					anchorSeq: context.start.event.seq,
					location: context.start.location,
					visibility: "visible",
					data: {
						teamId: state.teamId,
						captainSessionId: "",
						teamName: state.name,
						members: []
					}
				};
			}
		};
		/** Use a fill-width grid when the task graph has no real dependency edges. */
		function usesParallelTaskGrid(tasks) {
			if (tasks.length === 0) return false;
			const taskIds = new Set(tasks.map((task) => task.id));
			return tasks.every((task) => task.dependencies.every((dependency) => !taskIds.has(dependency)));
		}
		/**
/**
		* Resolve the task whose dependency chain should be highlighted.
		*
		* A pinned task is an explicit user choice. Keyboard focus takes precedence
		* over delayed pointer intent so an older hover timer cannot steal the active
		* chain from someone navigating the task map with the keyboard.
		*/
		function dependencyFocusTaskId(pinnedTaskId, keyboardTaskId, hoverTaskId) {
			return pinnedTaskId ?? keyboardTaskId ?? hoverTaskId;
		}
		/** Group tasks by their precomputed dependency depth. */
		function taskStages(tasks) {
			const byDepth = /* @__PURE__ */ new Map();
			for (const task of tasks) {
				const depth = Number.isFinite(task.depth) ? Math.max(0, Math.floor(task.depth)) : 0;
				const stage = byDepth.get(depth) ?? [];
				stage.push(task);
				byDepth.set(depth, stage);
			}
			return [...byDepth.entries()].sort(([left], [right]) => left - right).map(([depth, stageTasks]) => ({
				depth,
				tasks: stageTasks.slice().sort((left, right) => left.id.localeCompare(right.id, "en", { numeric: true }))
			}));
		}
		/**
		* Lay tasks out as the reference panel's compact left-to-right DAG.
		*
		* Columns are dependency-depth stages. Rows are stable task-id order within
		* each stage. Edges use cubic curves so fan-in remains readable without
		* turning every task into a large card.
		*/
		function compactDagLayout(tasks) {
			const stages = taskStages(tasks);
			const positions = /* @__PURE__ */ new Map();
			const nodes = [];
			for (const [column, stage] of stages.entries()) for (const [row, task] of stage.tasks.entries()) {
				const x = column * 118;
				const y = row * 38;
				positions.set(task.id, {
					x,
					y
				});
				nodes.push({
					task,
					x,
					y
				});
			}
			const edges = [];
			for (const task of tasks) {
				const target = positions.get(task.id);
				if (target === void 0) continue;
				for (const dependency of task.dependencies) {
					const source = positions.get(dependency);
					if (source === void 0) continue;
					const x1 = source.x + 92;
					const y1 = source.y + 30 / 2;
					const x2 = target.x;
					const y2 = target.y + 30 / 2;
					edges.push({
						from: dependency,
						to: task.id,
						path: `M${x1} ${y1}C${x1 + 14} ${y1},${x2 - 14} ${y2},${x2} ${y2}`
					});
				}
			}
			const rows = Math.max(1, ...stages.map((stage) => stage.tasks.length));
			return {
				width: stages.length === 0 ? 0 : stages.length * 92 + (stages.length - 1) * 26,
				height: stages.length === 0 ? 0 : rows * 30 + (rows - 1) * 8,
				nodes,
				edges
			};
		}
		/**
		* Return the complete upstream/downstream chain around one task.
		*
		* Traversal uses both dependency directions and remains cycle-safe, so the UI
		* can highlight every handoff related to the focused task even if malformed
		* durable data contains a cycle.
		*/
		function relatedTaskIds(taskId, tasks) {
			const byId = new Map(tasks.map((task) => [task.id, task]));
			if (!byId.has(taskId)) return /* @__PURE__ */ new Set();
			const dependents = /* @__PURE__ */ new Map();
			for (const task of tasks) for (const dependency of task.dependencies) {
				const targets = dependents.get(dependency) ?? [];
				targets.push(task.id);
				dependents.set(dependency, targets);
			}
			const related = /* @__PURE__ */ new Set();
			const upstreamSeen = /* @__PURE__ */ new Set();
			const downstreamSeen = /* @__PURE__ */ new Set();
			const visitUpstream = (id) => {
				if (upstreamSeen.has(id)) return;
				upstreamSeen.add(id);
				related.add(id);
				for (const dependency of byId.get(id)?.dependencies ?? []) visitUpstream(dependency);
			};
			const visitDownstream = (id) => {
				if (downstreamSeen.has(id)) return;
				downstreamSeen.add(id);
				related.add(id);
				for (const dependent of dependents.get(id) ?? []) visitDownstream(dependent);
			};
			visitUpstream(taskId);
			visitDownstream(taskId);
			return related;
		}
		//#endregion
		//#region \0dsh-css:@nanmicoder/dsh-agent-teams/src/client/ActivityView.module.css.mjs
		const css = "._2iARYa_root{--dsw-alias-line-normal:var(--dsw-static-neutral-bluish-150,#e7e9ee);--dsw-alias-line-strong:color-mix(in srgb, var(--dsw-static-neutral-bluish-200,#e1e5ee) 50%, var(--dsw-static-neutral-bluish-300,#cfd3d6));--dsw-alias-bg-module:var(--dsw-alias-bg-layer-1,#fff);--dsw-alias-bg-fill-neutral:var(--dsw-static-neutral-bluish-100,#eef0f4);--dsw-alias-bg-fill-business:var(--dsw-alias-state-business-primary,#4d6bfe);--dsw-alias-bg-fill-success:var(--dsw-alias-state-success-primary,#12a150);--dsw-alias-bg-fill-warning:var(--dsw-alias-state-warn-primary,#e08700);--dsw-alias-bg-fill-danger:var(--dsw-alias-state-error-primary,#e5484d);--dsw-alias-state-success:var(--dsw-alias-state-success-primary,#12a150);--dsw-alias-state-warning:var(--dsw-alias-state-warn-primary,#e08700);--dsw-alias-state-danger:var(--dsw-alias-state-error-primary,#e5484d);--dsw-alias-label-on-fill:var(--dsw-alias-label-primary-inverted,#fff);flex-direction:column;gap:10px;min-width:0;display:flex}._2iARYa_team{border-bottom:1px solid var(--dsw-alias-line-normal);flex-direction:column;gap:12px;padding:12px 14px 16px;display:flex}._2iARYa_team:last-child{border-bottom:0}._2iARYa_teamHead{align-items:center;gap:10px;min-width:0;display:flex}._2iARYa_teamName{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:14px;font-weight:600;line-height:18px;overflow:hidden}._2iARYa_teamStats{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;gap:8px;font-size:11.5px;line-height:16px;display:inline-flex}._2iARYa_sectionHead{justify-content:space-between;align-items:center;gap:8px;min-width:0;display:flex}._2iARYa_sectionTitle{color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;font-size:12px;font-weight:600;line-height:16px;display:inline-flex}._2iARYa_sectionHint{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:14px;overflow:hidden}._2iARYa_delegationSection{min-width:0}._2iARYa_captainNode{box-sizing:border-box;border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 32%, var(--dsw-alias-line-normal));background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-module));border-radius:10px;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:48px;padding:8px 10px;display:grid}._2iARYa_captainAvatar,._2iARYa_memberAvatar{flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative}._2iARYa_captainAvatar{width:36px;height:36px}._2iARYa_leadAvatar,._2iARYa_memberArt,._2iARYa_memberInitial{box-sizing:border-box;border:1px solid var(--dsw-alias-line-strong);object-fit:contain;border-radius:50%;width:34px;height:34px}._2iARYa_captainInfo,._2iARYa_memberInfo{flex-direction:column;min-width:0;display:flex}._2iARYa_captainInfo{gap:2px}._2iARYa_captainLine,._2iARYa_memberLine{align-items:center;gap:6px;min-width:0;display:flex}._2iARYa_captainName,._2iARYa_memberName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:600;line-height:18px;overflow:hidden}._2iARYa_captainRole,._2iARYa_memberRole{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:14px;overflow:hidden}._2iARYa_captainSummary,._2iARYa_memberStatusLine{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;line-height:15px;overflow:hidden}._2iARYa_captainState,._2iARYa_memberState{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;align-items:center;gap:5px;font-size:11px;font-weight:500;line-height:15px;display:inline-flex}._2iARYa_captainState[data-busy=true],._2iARYa_memberState[data-activity=working]{color:var(--dsw-alias-state-business-primary)}._2iARYa_workGlyph rect{opacity:.5}._2iARYa_workGlyph[data-active=true] rect{animation:1.1s ease-in-out infinite _2iARYa_agentTeamsDot}@keyframes _2iARYa_agentTeamsDot{0%,to{opacity:.25}50%{opacity:1}}._2iARYa_progressOverview{flex-direction:column;gap:7px;display:flex}._2iARYa_progressTitle{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600;line-height:16px}._2iARYa_progressSegments{gap:3px;display:flex}._2iARYa_progressSegments>span,._2iARYa_progressEmpty{background:var(--dsw-alias-line-strong);border-radius:2px;flex:1;height:5px}._2iARYa_progressEmpty{width:100%;display:block}._2iARYa_progressSegments>span[data-state=running]{background:var(--dsw-alias-state-business-primary)}._2iARYa_progressSegments>span[data-state=blocked]{background:var(--dsw-alias-state-warning)}._2iARYa_progressSegments>span[data-state=completed]{background:var(--dsw-alias-state-success)}._2iARYa_progressSegments>span[data-state=failed]{background:var(--dsw-alias-state-danger)}._2iARYa_progressSegments>span[data-state=cancelled]{opacity:.55}._2iARYa_progressLegend{color:var(--dsw-alias-label-tertiary);gap:10px;font-size:10.5px;line-height:14px;display:flex}._2iARYa_progressLegend>span[data-state=running]{color:var(--dsw-alias-state-business-primary)}._2iARYa_progressLegend>span[data-state=blocked]{color:var(--dsw-alias-state-warning)}._2iARYa_progressLegend>span[data-state=completed]{color:var(--dsw-alias-state-success)}._2iARYa_progressSummary{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-module));min-width:0;color:var(--dsw-alias-label-secondary);border-radius:8px;align-items:center;gap:6px;padding:5px 8px;font-size:11px;font-weight:600;line-height:15px;display:flex}._2iARYa_progressSummary[data-state=warning]{background:color-mix(in srgb, var(--dsw-alias-state-warning) 8%, var(--dsw-alias-bg-module))}._2iARYa_progressSummary[data-state=completed]{background:color-mix(in srgb, var(--dsw-alias-state-success) 8%, var(--dsw-alias-bg-module))}._2iARYa_progressSummary>span:last-child{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._2iARYa_progressSummaryDot{background:var(--dsw-alias-state-business-primary);border-radius:50%;flex:none;width:5px;height:5px}._2iARYa_progressSummary[data-state=warning] ._2iARYa_progressSummaryDot{background:var(--dsw-alias-state-warning)}._2iARYa_progressSummary[data-state=completed] ._2iARYa_progressSummaryDot{background:var(--dsw-alias-state-success)}._2iARYa_membersToggle{background:var(--dsw-alias-bg-module-platform);width:100%;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border:0;border-radius:8px;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;font-size:11.5px;font-weight:600;line-height:15px;display:flex}._2iARYa_membersToggle:hover{background:var(--dsw-alias-bg-fill-neutral)}._2iARYa_membersToggle>span{align-items:center;gap:5px;display:inline-flex}._2iARYa_membersToggle>span:last-child{color:var(--dsw-alias-state-business-primary)}._2iARYa_chevron{flex:none;transition:transform .14s}._2iARYa_chevron[data-open=true]{transform:rotate(90deg)}._2iARYa_delegationTree{flex-direction:column;gap:2px;margin-left:18px;padding:9px 0 0 20px;display:flex;position:relative}._2iARYa_delegationTree:before{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 48%, var(--dsw-alias-line-normal));content:\"\";width:1px;position:absolute;top:0;bottom:22px;left:0}._2iARYa_memberBlock{flex-direction:column;min-width:0;padding:3px 0 7px;display:flex;position:relative}._2iARYa_memberBranch{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 48%, var(--dsw-alias-line-normal));width:20px;height:1px;display:block;position:absolute;top:23px;right:100%}._2iARYa_memberBranch:before{background:var(--dsw-alias-state-business-primary);content:\"\";border-radius:50%;width:5px;height:5px;position:absolute;top:-2px;right:-1px}._2iARYa_memberRow{box-sizing:border-box;width:100%;min-width:0;min-height:44px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:8px;padding:4px 6px;transition:background-color .12s,transform .12s;display:grid}._2iARYa_memberRow:hover,._2iARYa_memberRow[data-activity=working]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-module))}._2iARYa_memberRow:active{transform:scale(.995)}._2iARYa_memberAvatar{width:34px;height:34px}._2iARYa_memberAvatar[data-unread=true]:after{border:1px solid var(--dsw-alias-state-business-primary);content:\"\";border-radius:50%;animation:1.5s ease-out infinite _2iARYa_agentTeamsUnreadPulse;position:absolute;inset:-3px}@keyframes _2iARYa_agentTeamsUnreadPulse{0%{opacity:.82;transform:scale(.94)}75%,to{opacity:0;transform:scale(1.18)}}._2iARYa_memberInitial{color:var(--dsw-alias-label-on-fill);justify-content:center;align-items:center;font-size:15px;font-weight:600;line-height:20px;display:inline-flex}._2iARYa_stateArt{box-sizing:border-box;border:2px solid var(--dsw-alias-bg-module);object-fit:contain;border-radius:50%;width:19px;height:19px;position:absolute;bottom:-4px;right:-4px}._2iARYa_stateArt[data-activity=working]{animation:2.4s ease-in-out infinite _2iARYa_agentTeamsFloat}._2iARYa_stateArt[data-activity=idle]{animation:4.2s ease-in-out infinite _2iARYa_agentTeamsBreathe}._2iARYa_stateArt[data-activity=unknown]{animation:2.8s ease-in-out infinite _2iARYa_agentTeamsThink}@keyframes _2iARYa_agentTeamsFloat{0%,to{transform:translateY(0)rotate(-4deg)}50%{transform:translateY(-2px)rotate(4deg)}}@keyframes _2iARYa_agentTeamsBreathe{0%,to{opacity:.82;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}@keyframes _2iARYa_agentTeamsThink{0%,to{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}._2iARYa_memberState{margin-left:auto}._2iARYa_memberCount{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px}._2iARYa_assignmentLine{align-items:center;gap:7px;min-width:0;padding:0 6px 0 52px;display:flex}._2iARYa_assignmentLabel{color:var(--dsw-alias-label-tertiary);flex:none;font-size:10.5px;line-height:14px}._2iARYa_assignmentTasks{flex-wrap:wrap;flex:1;gap:4px;min-width:0;display:flex}._2iARYa_assignmentChip{background:var(--dsw-alias-bg-fill-neutral);min-height:16px;color:var(--dsw-alias-label-secondary);border-radius:4px;align-items:center;padding:0 5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:600;line-height:14px;display:inline-flex}._2iARYa_assignmentChip[data-state=running]{background:var(--dsw-alias-bg-fill-business);color:var(--dsw-alias-label-on-fill)}._2iARYa_assignmentChip[data-state=completed]{background:var(--dsw-alias-bg-fill-success);color:var(--dsw-alias-label-on-fill)}._2iARYa_assignmentChip[data-state=blocked]{background:var(--dsw-alias-bg-fill-warning);color:var(--dsw-alias-label-on-fill)}._2iARYa_assignmentChip[data-state=failed]{background:var(--dsw-alias-bg-fill-danger);color:var(--dsw-alias-label-on-fill)}._2iARYa_assignmentChip[data-state=cancelled]{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}._2iARYa_unreadPill{color:var(--dsw-alias-state-business-primary);white-space:nowrap;flex:none;font-size:10.5px;font-weight:600;line-height:14px}._2iARYa_taskEmpty{color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:14px}._2iARYa_dependencySection{border-top:1px solid var(--dsw-alias-line-normal);flex-direction:column;gap:7px;min-width:0;padding-top:10px;display:flex}._2iARYa_sectionToggleTitle{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0;font-size:12px;font-weight:600;line-height:16px;display:inline-flex}._2iARYa_dagViewport{scrollbar-width:thin;min-width:0;padding:2px 0 4px;overflow-x:auto}._2iARYa_dagCanvas{min-width:100%;position:relative}._2iARYa_dagCanvas[data-layout=parallel]{flex-wrap:wrap;gap:8px;display:flex}._2iARYa_dagCanvas[data-layout=parallel] ._2iARYa_dagNode{flex:92px;min-width:92px;position:relative}._2iARYa_dagEdges{pointer-events:none;position:absolute;inset:0;overflow:visible}._2iARYa_dagEdges path{fill:none;stroke:var(--dsw-alias-line-strong);stroke-width:1px;transition:opacity .14s,stroke .14s,stroke-width .14s}._2iARYa_dagEdges path[data-active=true]{stroke:var(--dsw-alias-state-business-primary);stroke-width:1.6px}._2iARYa_dagEdges path[data-dimmed=true]{opacity:.24}._2iARYa_dagNode{box-sizing:border-box;border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;border-radius:6px;flex-direction:column;justify-content:center;gap:1px;padding:0 6px;transition:border-color .14s,background-color .14s,opacity .14s;display:flex;position:absolute}._2iARYa_dagNode:hover,._2iARYa_dagNode[data-focused=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-module))}._2iARYa_dagNode[data-dimmed=true]{opacity:.3}._2iARYa_dagNode[data-state=running][data-dimmed=true]{opacity:.58}._2iARYa_dagNode[data-state=completed]{border-color:color-mix(in srgb, var(--dsw-alias-state-success) 48%, var(--dsw-alias-line-normal))}._2iARYa_dagNode[data-state=blocked]{border-color:color-mix(in srgb, var(--dsw-alias-state-warning) 52%, var(--dsw-alias-line-normal))}._2iARYa_dagNode[data-state=failed]{border-color:color-mix(in srgb, var(--dsw-alias-state-danger) 56%, var(--dsw-alias-line-normal))}._2iARYa_dagNodeHead{color:var(--dsw-alias-label-primary);align-items:center;gap:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;font-weight:700;display:flex}._2iARYa_dagNodeDot{background:var(--dsw-alias-line-strong);border-radius:1.5px;flex:none;width:5px;height:5px}._2iARYa_dagNode[data-state=running] ._2iARYa_dagNodeDot{background:var(--dsw-alias-state-business-primary)}._2iARYa_dagNode[data-state=running] ._2iARYa_dagNodeHead{padding-right:12px}._2iARYa_dagRunningState{width:9px;height:9px;color:var(--dsw-alias-state-business-primary);pointer-events:none;justify-content:center;align-items:center;display:inline-flex;position:absolute;top:4px;right:5px}._2iARYa_dagRunningState ._2iARYa_workGlyph{width:9px;height:9px}._2iARYa_dagNode[data-state=blocked] ._2iARYa_dagNodeDot{background:var(--dsw-alias-state-warning)}._2iARYa_dagNode[data-state=completed] ._2iARYa_dagNodeDot{background:var(--dsw-alias-state-success)}._2iARYa_dagNode[data-state=failed] ._2iARYa_dagNodeDot{background:var(--dsw-alias-state-danger)}._2iARYa_dagNodeLabel{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:9.5px;line-height:11px;overflow:hidden}._2iARYa_taskDetail{border:1px solid var(--dsw-alias-line-normal);background:var(--dsw-alias-bg-module-platform);border-radius:9px;flex-direction:column;gap:3px;min-width:0;padding:7px 9px;display:flex}._2iARYa_taskDetailHead{align-items:center;gap:6px;min-width:0;display:flex}._2iARYa_taskDetailId{color:var(--dsw-alias-state-business-primary);flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700}._2iARYa_taskDetailSubject{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;line-height:16px;overflow:hidden}._2iARYa_taskDetailBadge{background:var(--dsw-alias-bg-fill-neutral);color:var(--dsw-alias-label-secondary);border-radius:4px;flex:none;padding:0 5px;font-size:9.5px;font-weight:600;line-height:14px}._2iARYa_taskDetailBadge[data-state=running]{background:var(--dsw-alias-bg-fill-business);color:var(--dsw-alias-label-on-fill)}._2iARYa_taskDetailBadge[data-state=blocked]{background:var(--dsw-alias-bg-fill-warning);color:var(--dsw-alias-label-on-fill)}._2iARYa_taskDetailBadge[data-state=completed]{background:var(--dsw-alias-bg-fill-success);color:var(--dsw-alias-label-on-fill)}._2iARYa_taskDetailBadge[data-state=failed]{background:var(--dsw-alias-bg-fill-danger);color:var(--dsw-alias-label-on-fill)}._2iARYa_taskDetailLine,._2iARYa_taskDetailMeta{color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:14px}._2iARYa_taskDetailMeta{color:var(--dsw-alias-label-tertiary)}._2iARYa_emptyHint{color:var(--dsw-alias-label-tertiary);padding:10px 12px;font-size:12px;line-height:16px}._2iARYa_historicPill{background:var(--dsw-alias-bg-fill-neutral);color:var(--dsw-alias-label-tertiary);border-radius:4px;flex:none;margin-left:auto;padding:1px 7px;font-size:10.5px;font-weight:600;line-height:15px}._2iARYa_members{flex-direction:column;gap:3px;display:flex}._2iARYa_archivedWrap{min-width:0}._2iARYa_archiveLabel{color:var(--dsw-alias-label-tertiary);padding:5px 14px 0;font-size:9.5px;font-weight:600;line-height:14px;display:block}@media (prefers-reduced-motion:reduce){._2iARYa_workGlyph rect,._2iARYa_stateArt,._2iARYa_memberAvatar[data-unread=true]:after{transition:none;animation:none}}@media (width<=640px){._2iARYa_teamStats span[data-stat=messages]{display:none}._2iARYa_captainNode{grid-template-columns:38px minmax(0,1fr)}._2iARYa_captainState{display:none}._2iARYa_delegationTree{margin-left:12px;padding-left:15px}._2iARYa_memberBranch{width:15px}._2iARYa_assignmentLine{padding-left:45px}}";
		const tagId = "@nanmicoder/dsh-agent-teams/ActivityView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@nanmicoder/dsh-agent-teams";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ActivityView_module_css_default = {
			"agentTeamsBreathe": "_2iARYa_agentTeamsBreathe",
			"agentTeamsDot": "_2iARYa_agentTeamsDot",
			"agentTeamsFloat": "_2iARYa_agentTeamsFloat",
			"agentTeamsThink": "_2iARYa_agentTeamsThink",
			"agentTeamsUnreadPulse": "_2iARYa_agentTeamsUnreadPulse",
			"archiveLabel": "_2iARYa_archiveLabel",
			"archivedWrap": "_2iARYa_archivedWrap",
			"assignmentChip": "_2iARYa_assignmentChip",
			"assignmentLabel": "_2iARYa_assignmentLabel",
			"assignmentLine": "_2iARYa_assignmentLine",
			"assignmentTasks": "_2iARYa_assignmentTasks",
			"captainAvatar": "_2iARYa_captainAvatar",
			"captainInfo": "_2iARYa_captainInfo",
			"captainLine": "_2iARYa_captainLine",
			"captainName": "_2iARYa_captainName",
			"captainNode": "_2iARYa_captainNode",
			"captainRole": "_2iARYa_captainRole",
			"captainState": "_2iARYa_captainState",
			"captainSummary": "_2iARYa_captainSummary",
			"chevron": "_2iARYa_chevron",
			"dagCanvas": "_2iARYa_dagCanvas",
			"dagEdges": "_2iARYa_dagEdges",
			"dagNode": "_2iARYa_dagNode",
			"dagNodeDot": "_2iARYa_dagNodeDot",
			"dagNodeHead": "_2iARYa_dagNodeHead",
			"dagNodeLabel": "_2iARYa_dagNodeLabel",
			"dagRunningState": "_2iARYa_dagRunningState",
			"dagViewport": "_2iARYa_dagViewport",
			"delegationSection": "_2iARYa_delegationSection",
			"delegationTree": "_2iARYa_delegationTree",
			"dependencySection": "_2iARYa_dependencySection",
			"emptyHint": "_2iARYa_emptyHint",
			"historicPill": "_2iARYa_historicPill",
			"leadAvatar": "_2iARYa_leadAvatar",
			"memberArt": "_2iARYa_memberArt",
			"memberAvatar": "_2iARYa_memberAvatar",
			"memberBlock": "_2iARYa_memberBlock",
			"memberBranch": "_2iARYa_memberBranch",
			"memberCount": "_2iARYa_memberCount",
			"memberInfo": "_2iARYa_memberInfo",
			"memberInitial": "_2iARYa_memberInitial",
			"memberLine": "_2iARYa_memberLine",
			"memberName": "_2iARYa_memberName",
			"memberRole": "_2iARYa_memberRole",
			"memberRow": "_2iARYa_memberRow",
			"memberState": "_2iARYa_memberState",
			"memberStatusLine": "_2iARYa_memberStatusLine",
			"members": "_2iARYa_members",
			"membersToggle": "_2iARYa_membersToggle",
			"progressEmpty": "_2iARYa_progressEmpty",
			"progressLegend": "_2iARYa_progressLegend",
			"progressOverview": "_2iARYa_progressOverview",
			"progressSegments": "_2iARYa_progressSegments",
			"progressSummary": "_2iARYa_progressSummary",
			"progressSummaryDot": "_2iARYa_progressSummaryDot",
			"progressTitle": "_2iARYa_progressTitle",
			"root": "_2iARYa_root",
			"sectionHead": "_2iARYa_sectionHead",
			"sectionHint": "_2iARYa_sectionHint",
			"sectionTitle": "_2iARYa_sectionTitle",
			"sectionToggleTitle": "_2iARYa_sectionToggleTitle",
			"stateArt": "_2iARYa_stateArt",
			"taskDetail": "_2iARYa_taskDetail",
			"taskDetailBadge": "_2iARYa_taskDetailBadge",
			"taskDetailHead": "_2iARYa_taskDetailHead",
			"taskDetailId": "_2iARYa_taskDetailId",
			"taskDetailLine": "_2iARYa_taskDetailLine",
			"taskDetailMeta": "_2iARYa_taskDetailMeta",
			"taskDetailSubject": "_2iARYa_taskDetailSubject",
			"taskEmpty": "_2iARYa_taskEmpty",
			"team": "_2iARYa_team",
			"teamHead": "_2iARYa_teamHead",
			"teamName": "_2iARYa_teamName",
			"teamStats": "_2iARYa_teamStats",
			"unreadPill": "_2iARYa_unreadPill",
			"workGlyph": "_2iARYa_workGlyph"
		};
		//#endregion
		//#region lib/client/ActivityView.js
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
		/** Initial-letter fallback for unmatched roles. */
		function memberInitial(name) {
			return name.trim().slice(0, 1).toUpperCase() || "?";
		}
		function stableHash(value) {
			let hash = 0;
			for (let index = 0; index < value.length; index += 1) hash = (hash << 5) - hash + value.charCodeAt(index) | 0;
			return Math.abs(hash);
		}
		const ACCENTS = [
			"var(--dsw-alias-state-business-primary)",
			"var(--dsw-alias-state-success)",
			"var(--dsw-alias-state-danger)",
			"var(--dsw-alias-state-warning)",
			"var(--dsw-alias-label-tertiary)"
		];
		function accentOf(id) {
			return ACCENTS[stableHash(id) % ACCENTS.length] ?? ACCENTS[0];
		}
		/** Badge text follows the raw task status (finer than the 4 visual states):
		* claimed/pending/failed/cancelled keep their own labels and colors. */
		const TASK_STATUS_LABEL = {
			pending: "task.status.pending",
			claimed: "task.status.claimed",
			in_progress: "task.status.inProgress",
			completed: "task.status.completed",
			failed: "task.status.failed",
			cancelled: "task.status.cancelled"
		};
		function taskStatusLabel(status, t) {
			const key = TASK_STATUS_LABEL[status];
			return key === void 0 ? status : t(key);
		}
		function formatTaskIds(ids, t) {
			return ids.join(t("format.listSeparator"));
		}
		/** Badge/bar coloring key: visual state, widened for terminal statuses. */
		function taskTone(state, status) {
			if (status === "failed") return "failed";
			if (status === "cancelled") return "cancelled";
			return state;
		}
		function Chevron({ open }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				className: ActivityView_module_css_default.chevron,
				"data-open": open,
				width: "9",
				height: "9",
				viewBox: "0 0 10 10",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round",
				"aria-hidden": true,
				children: (0, react_jsx_runtime.jsx)("path", { d: "M3.5 2l3 3-3 3" })
			});
		}
		function WorkGlyph({ active }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				className: ActivityView_module_css_default.workGlyph,
				"data-active": active,
				width: "11",
				height: "11",
				viewBox: "0 0 11 11",
				fill: "currentColor",
				"aria-hidden": true,
				children: [
					[0, 0],
					[4.2, 0],
					[8.4, 0],
					[0, 4.2],
					[4.2, 4.2],
					[8.4, 4.2]
				].map(([x, y], index) => (0, react_jsx_runtime.jsx)("rect", {
					x,
					y,
					width: "2.6",
					height: "2.6",
					rx: ".6",
					style: { animationDelay: `${index * .15}s` }
				}, `${x}:${y}`))
			});
		}
		function memberStateLabel(member, tasks, historic, t) {
			const owned = tasks.filter((task) => task.assignee === member.name);
			if (member.activity === "working") return t("member.state.working");
			if (owned.some((task) => task.status === "failed")) return t("member.state.failed");
			if (owned.some((task) => task.state === "blocked")) return t("member.state.waiting");
			if (owned.length > 0 && owned.every((task) => task.status === "completed")) return t("member.state.delivered");
			if (member.status === "removed") return t(historic ? "member.state.left" : "member.state.removed");
			if (owned.length > 0) return t("member.state.pending");
			return t("member.state.unassigned");
		}
		function memberStatusText(member, tasks, t) {
			const owned = tasks.filter((task) => task.assignee === member.name);
			const current = owned.find((task) => task.id === member.currentTask);
			const blocked = owned.find((task) => task.state === "blocked");
			if (member.activity === "working" && current !== void 0) return t("member.status.executing", { taskId: current.id });
			if (member.activity === "working") return t("member.status.working");
			if (blocked !== void 0) {
				const dependency = tasks.find((task) => blocked.dependencies.includes(task.id) && task.state !== "completed");
				if (dependency !== void 0) return t("member.status.waitingOn", {
					taskId: dependency.id,
					assignee: dependency.assignee || t("task.assignee.unclaimed")
				});
				return t("member.status.waitingPrerequisite");
			}
			if (member.total === 0) return t("member.status.waitingAssignment");
			if (member.done === member.total) return t("member.status.delivered");
			return t(member.activity === "idle" ? "member.status.idle" : "member.status.unknown");
		}
		function compactTaskLabel(subject) {
			const withoutVerb = subject.replace(/^开发\s*/u, "").replace(/^\d+[-_.、\s]*/u, "");
			const head = withoutVerb.split(/[（(·：:]/u)[0]?.trim() ?? withoutVerb;
			return head.length > 18 ? `${head.slice(0, 17)}…` : head;
		}
		function taskSummary(team, t) {
			const completed = team.tasks.filter((task) => task.status === "completed");
			const running = team.tasks.filter((task) => task.state === "running");
			const blocked = team.tasks.filter((task) => task.state === "blocked");
			const ready = team.tasks.filter((task) => task.state === "open" && task.status !== "completed");
			if (team.tasks.length === 0) return t("task.summary.waitingBreakdown");
			if (completed.length === team.tasks.length) return t("task.summary.allDelivered", { count: completed.length });
			if (blocked.length > 0 && running.length > 0) return t("task.summary.blockedAndRunning", {
				tasks: formatTaskIds(blocked.slice(0, 3).map((task) => task.id), t),
				more: blocked.length > 3 ? t("task.summary.more", { count: blocked.length - 3 }) : ""
			});
			if (running.length > 0) return t("task.summary.running", { tasks: formatTaskIds(running.map((task) => task.id), t) });
			if (ready.length > 0) return t("task.summary.ready", { tasks: formatTaskIds(ready.map((task) => task.id), t) });
			if (blocked.length > 0) return t("task.summary.blocked", { tasks: formatTaskIds(blocked.map((task) => task.id), t) });
			return t("task.summary.waitingSchedule");
		}
		function ProgressOverview({ team, t }) {
			const running = team.tasks.filter((task) => task.state === "running").length;
			const blocked = team.tasks.filter((task) => task.state === "blocked").length;
			const completed = team.tasks.filter((task) => task.status === "completed").length;
			const summaryTone = blocked > 0 ? "warning" : completed === team.tasks.length && team.tasks.length > 0 ? "completed" : "running";
			return (0, react_jsx_runtime.jsxs)("section", {
				className: ActivityView_module_css_default.progressOverview,
				"aria-label": t("progress.aria"),
				"data-progress-summary": true,
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: ActivityView_module_css_default.progressTitle,
						children: t("progress.title")
					}),
					team.tasks.length > 0 ? (0, react_jsx_runtime.jsx)("span", {
						className: ActivityView_module_css_default.progressSegments,
						"aria-hidden": true,
						children: team.tasks.map((task) => (0, react_jsx_runtime.jsx)("span", { "data-state": taskTone(task.state, task.status) }, task.id))
					}) : (0, react_jsx_runtime.jsx)("span", { className: ActivityView_module_css_default.progressEmpty }),
					(0, react_jsx_runtime.jsxs)("span", {
						className: ActivityView_module_css_default.progressLegend,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								"data-state": "running",
								children: t("progress.running", { count: running })
							}),
							(0, react_jsx_runtime.jsx)("span", {
								"data-state": "blocked",
								children: t("progress.blocked", { count: blocked })
							}),
							(0, react_jsx_runtime.jsx)("span", {
								"data-state": "completed",
								children: t("progress.delivered", { count: completed })
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("span", {
						className: ActivityView_module_css_default.progressSummary,
						"data-state": summaryTone,
						children: [(0, react_jsx_runtime.jsx)("span", { className: ActivityView_module_css_default.progressSummaryDot }), (0, react_jsx_runtime.jsx)("span", { children: taskSummary(team, t) })]
					})
				]
			});
		}
		function DependencyMap({ tasks, t }) {
			const [open, setOpen] = (0, react.useState)(true);
			const [hoverTaskId, setHoverTaskId] = (0, react.useState)(null);
			const [keyboardTaskId, setKeyboardTaskId] = (0, react.useState)(null);
			const [pinnedTaskId, setPinnedTaskId] = (0, react.useState)(null);
			const hoverTimer = (0, react.useRef)(null);
			const focusedTaskId = dependencyFocusTaskId(pinnedTaskId, keyboardTaskId, hoverTaskId);
			const layout = (0, react.useMemo)(() => compactDagLayout(tasks), [tasks]);
			const parallel = (0, react.useMemo)(() => usesParallelTaskGrid(tasks), [tasks]);
			const related = (0, react.useMemo)(() => focusedTaskId === null ? null : relatedTaskIds(focusedTaskId, tasks), [focusedTaskId, tasks]);
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
			(0, react.useEffect)(() => () => {
				if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
			}, []);
			(0, react.useEffect)(() => {
				const onKeyDown = (event) => {
					if (event.key === "Escape") setPinnedTaskId(null);
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, []);
			if (tasks.length === 0) return null;
			const fallbackTask = tasks.find((task) => task.state === "blocked") ?? tasks.find((task) => task.state === "running") ?? tasks[0];
			const detailTask = tasks.find((task) => task.id === focusedTaskId) ?? fallbackTask;
			const waitingOn = detailTask.dependencies.filter((dependency) => tasks.find((task) => task.id === dependency)?.status !== "completed");
			const dependents = tasks.filter((task) => task.dependencies.includes(detailTask.id));
			return (0, react_jsx_runtime.jsxs)("section", {
				className: ActivityView_module_css_default.dependencySection,
				"aria-label": t("dependency.aria"),
				"data-dependency-map": true,
				children: [(0, react_jsx_runtime.jsxs)("header", {
					className: ActivityView_module_css_default.sectionHead,
					children: [(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: ActivityView_module_css_default.sectionToggleTitle,
						onClick: () => {
							setOpen((current) => !current);
						},
						"aria-expanded": open,
						children: [
							(0, react_jsx_runtime.jsx)(Chevron, { open }),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {}),
							" ",
							t(parallel ? "dependency.parallel" : "dependency.title")
						]
					}), (0, react_jsx_runtime.jsx)("span", {
						className: ActivityView_module_css_default.sectionHint,
						children: pinnedTaskId === null ? t(parallel ? "dependency.hint.parallel" : "dependency.hint.chain") : t("dependency.hint.pinned", { taskId: pinnedTaskId })
					})]
				}), open && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
					className: ActivityView_module_css_default.dagViewport,
					children: (0, react_jsx_runtime.jsxs)("div", {
						className: ActivityView_module_css_default.dagCanvas,
						"data-layout": parallel ? "parallel" : "dependency",
						style: parallel ? void 0 : {
							width: layout.width,
							height: layout.height
						},
						children: [!parallel && (0, react_jsx_runtime.jsx)("svg", {
							className: ActivityView_module_css_default.dagEdges,
							width: layout.width,
							height: layout.height,
							"aria-hidden": true,
							children: layout.edges.map((edge) => {
								const active = related !== null && related.has(edge.from) && related.has(edge.to);
								return (0, react_jsx_runtime.jsx)("path", {
									d: edge.path,
									"data-active": active,
									"data-dimmed": related !== null && !active
								}, `${edge.from}:${edge.to}`);
							})
						}), layout.nodes.map(({ task, x, y }) => (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: ActivityView_module_css_default.dagNode,
							style: parallel ? { height: 30 } : {
								left: x,
								top: y,
								width: 92,
								height: 30
							},
							"data-task-id": task.id,
							"data-state": taskTone(task.state, task.status),
							"data-focused": related?.has(task.id) ?? false,
							"data-dimmed": related !== null && !related.has(task.id),
							"aria-pressed": pinnedTaskId === task.id,
							title: `${task.id} · ${task.subject}`,
							onClick: () => {
								setPinnedTaskId((current) => current === task.id ? null : task.id);
							},
							onMouseEnter: () => {
								scheduleHover(task.id);
							},
							onMouseLeave: () => {
								scheduleHover(null);
							},
							onFocus: () => {
								setKeyboardTaskId(task.id);
							},
							onBlur: () => {
								setKeyboardTaskId(null);
							},
							children: [
								(0, react_jsx_runtime.jsxs)("span", {
									className: ActivityView_module_css_default.dagNodeHead,
									children: [(0, react_jsx_runtime.jsx)("span", { className: ActivityView_module_css_default.dagNodeDot }), task.id]
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: ActivityView_module_css_default.dagNodeLabel,
									children: compactTaskLabel(task.subject)
								}),
								task.state === "running" && (0, react_jsx_runtime.jsx)("span", {
									className: ActivityView_module_css_default.dagRunningState,
									"aria-label": t("task.runningAria"),
									children: (0, react_jsx_runtime.jsx)(WorkGlyph, { active: true })
								})
							]
						}, task.id))]
					})
				}), (0, react_jsx_runtime.jsxs)("section", {
					className: ActivityView_module_css_default.taskDetail,
					"data-task-detail": detailTask.id,
					children: [
						(0, react_jsx_runtime.jsxs)("span", {
							className: ActivityView_module_css_default.taskDetailHead,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: ActivityView_module_css_default.taskDetailId,
									children: detailTask.id
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: ActivityView_module_css_default.taskDetailSubject,
									title: detailTask.subject,
									children: detailTask.subject.replace(/^开发\s*/u, "")
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: ActivityView_module_css_default.taskDetailBadge,
									"data-state": taskTone(detailTask.state, detailTask.status),
									children: taskStatusLabel(detailTask.status, t)
								})
							]
						}),
						(0, react_jsx_runtime.jsxs)("span", {
							className: ActivityView_module_css_default.taskDetailLine,
							children: [
								detailTask.assignee || t("task.assignee.unclaimed"),
								" · ",
								detailTask.status === "completed" ? t("task.detail.completed") : detailTask.dependencies.length === 0 ? t("task.detail.noPrerequisite") : waitingOn.length === 0 ? t("task.detail.ready") : t("task.detail.waitingOn", { tasks: formatTaskIds(waitingOn, t) })
							]
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: ActivityView_module_css_default.taskDetailMeta,
							children: dependents.length === 0 ? t("task.detail.noDownstream") : t("task.detail.unlocks", { tasks: formatTaskIds(dependents.map((task) => task.id), t) })
						})
					]
				})] })]
			});
		}
		function TeamSection({ team, onNavigate, t, historic = false }) {
			const [membersOpen, setMembersOpen] = (0, react.useState)(true);
			const busyCount = team.members.filter((member) => member.activity === "working").length;
			const assignedCount = team.tasks.filter((task) => task.assignee !== "").length;
			const completedCount = team.tasks.filter((task) => task.status === "completed").length;
			const allCompleted = team.tasks.length > 0 && completedCount === team.tasks.length;
			return (0, react_jsx_runtime.jsxs)("section", {
				className: ActivityView_module_css_default.team,
				"data-team-id": team.teamId,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: ActivityView_module_css_default.teamHead,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: ActivityView_module_css_default.teamName,
								title: team.name,
								children: team.name
							}),
							historic && (0, react_jsx_runtime.jsx)("span", {
								className: ActivityView_module_css_default.historicPill,
								children: t("team.ended")
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								className: ActivityView_module_css_default.teamStats,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										"data-stat": "members",
										children: t("team.stats.members", { count: team.members.length })
									}),
									(0, react_jsx_runtime.jsx)("span", {
										"data-stat": "tasks",
										children: t("team.stats.completed", {
											completed: completedCount,
											total: team.tasks.length
										})
									}),
									(0, react_jsx_runtime.jsx)("span", {
										"data-stat": "messages",
										children: t("team.stats.messages", { count: team.messageCount })
									})
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: ActivityView_module_css_default.delegationSection,
						"aria-label": t("delegation.aria"),
						"data-delegation-map": true,
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: ActivityView_module_css_default.captainNode,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: ActivityView_module_css_default.captainAvatar,
										children: (0, react_jsx_runtime.jsx)("img", {
											className: ActivityView_module_css_default.leadAvatar,
											src: LEAD_ART,
											alt: "",
											"aria-hidden": true
										})
									}),
									(0, react_jsx_runtime.jsxs)("span", {
										className: ActivityView_module_css_default.captainInfo,
										children: [(0, react_jsx_runtime.jsxs)("span", {
											className: ActivityView_module_css_default.captainLine,
											children: [(0, react_jsx_runtime.jsx)("span", {
												className: ActivityView_module_css_default.captainName,
												children: t("captain.name")
											}), (0, react_jsx_runtime.jsx)("span", {
												className: ActivityView_module_css_default.captainRole,
												children: t("captain.role")
											})]
										}), (0, react_jsx_runtime.jsx)("span", {
											className: ActivityView_module_css_default.captainSummary,
											children: t("captain.summary", {
												tasks: assignedCount,
												members: team.members.length
											})
										})]
									}),
									(0, react_jsx_runtime.jsxs)("span", {
										className: ActivityView_module_css_default.captainState,
										"data-busy": busyCount > 0,
										children: [(0, react_jsx_runtime.jsx)(WorkGlyph, { active: busyCount > 0 }), busyCount > 0 ? t("captain.state.working", { count: busyCount }) : t(allCompleted ? "captain.state.collected" : "captain.state.waiting")]
									})
								]
							}),
							(0, react_jsx_runtime.jsx)(ProgressOverview, {
								team,
								t
							}),
							(0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: ActivityView_module_css_default.membersToggle,
								onClick: () => {
									setMembersOpen((current) => !current);
								},
								"aria-expanded": membersOpen,
								"data-members-toggle": true,
								children: [(0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)(Chevron, { open: membersOpen }), t("members.toggle", { count: team.members.length })] }), (0, react_jsx_runtime.jsx)("span", { children: t(membersOpen ? "members.collapse" : "members.expand") })]
							}),
							membersOpen && (0, react_jsx_runtime.jsxs)("div", {
								className: ActivityView_module_css_default.delegationTree,
								children: [team.members.length === 0 && (0, react_jsx_runtime.jsx)("span", {
									className: ActivityView_module_css_default.emptyHint,
									children: t("members.empty")
								}), team.members.map((member) => {
									const owned = team.tasks.filter((task) => task.assignee === member.name);
									return (0, react_jsx_runtime.jsxs)("div", {
										className: ActivityView_module_css_default.memberBlock,
										"data-activity": member.activity,
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: ActivityView_module_css_default.memberBranch,
												"aria-hidden": true,
												children: (0, react_jsx_runtime.jsx)("span", {})
											}),
											(0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: ActivityView_module_css_default.memberRow,
												"data-activity": member.activity,
												onClick: () => {
													if (member.id !== "") onNavigate(team.captainSessionId, member.id);
												},
												children: [
													(0, react_jsx_runtime.jsxs)("span", {
														className: ActivityView_module_css_default.memberAvatar,
														"data-unread": member.unread > 0,
														children: [memberArtUrl(member.name, member.role) !== null ? (0, react_jsx_runtime.jsx)("img", {
															className: ActivityView_module_css_default.memberArt,
															src: memberArtUrl(member.name, member.role) ?? "",
															alt: "",
															"aria-hidden": true
														}) : (0, react_jsx_runtime.jsx)("span", {
															className: ActivityView_module_css_default.memberInitial,
															style: { background: accentOf(member.id) },
															children: memberInitial(member.name)
														}), (0, react_jsx_runtime.jsx)("img", {
															className: ActivityView_module_css_default.stateArt,
															"data-activity": member.activity,
															src: ACTION_ART[member.activity],
															alt: "",
															"aria-hidden": true
														})]
													}),
													(0, react_jsx_runtime.jsxs)("span", {
														className: ActivityView_module_css_default.memberInfo,
														children: [(0, react_jsx_runtime.jsxs)("span", {
															className: ActivityView_module_css_default.memberLine,
															children: [
																(0, react_jsx_runtime.jsx)("span", {
																	className: ActivityView_module_css_default.memberName,
																	children: member.name
																}),
																member.role !== "" && (0, react_jsx_runtime.jsx)("span", {
																	className: ActivityView_module_css_default.memberRole,
																	children: member.role
																}),
																(0, react_jsx_runtime.jsxs)("span", {
																	className: ActivityView_module_css_default.memberState,
																	"data-activity": member.activity,
																	children: [(0, react_jsx_runtime.jsx)(WorkGlyph, { active: member.activity === "working" }), memberStateLabel(member, team.tasks, historic, t)]
																})
															]
														}), (0, react_jsx_runtime.jsx)("span", {
															className: ActivityView_module_css_default.memberStatusLine,
															children: memberStatusText(member, team.tasks, t)
														})]
													}),
													(0, react_jsx_runtime.jsxs)("span", {
														className: ActivityView_module_css_default.memberCount,
														children: [
															member.done,
															"/",
															member.total
														]
													})
												]
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: ActivityView_module_css_default.assignmentLine,
												children: [(0, react_jsx_runtime.jsx)("span", {
													className: ActivityView_module_css_default.assignmentLabel,
													children: t("assignment.label")
												}), (0, react_jsx_runtime.jsx)("span", {
													className: ActivityView_module_css_default.assignmentTasks,
													children: owned.length === 0 ? (0, react_jsx_runtime.jsx)("span", {
														className: ActivityView_module_css_default.taskEmpty,
														children: t("assignment.empty")
													}) : owned.map((task) => (0, react_jsx_runtime.jsx)("span", {
														className: ActivityView_module_css_default.assignmentChip,
														"data-state": taskTone(task.state, task.status),
														title: task.subject,
														children: task.id
													}, task.id))
												})]
											})
										]
									}, member.id);
								})]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)(DependencyMap, {
						tasks: team.tasks,
						t
					})
				]
			});
		}
		/** Legacy conversation cards may outlive their host archive. Project their
		* durable roster through the same rebuilt content instead of a second UI. */
		function historicCardTeam(data, owner) {
			return {
				workspace: "",
				teamId: data.teamId,
				name: data.teamName,
				captainSessionId: data.captainSessionId || owner,
				members: data.members.map((member) => ({
					...member,
					status: "removed",
					activity: "idle",
					progress: 0,
					done: 0,
					total: 0,
					currentTask: "",
					unread: 0
				})),
				tasks: [],
				messageCount: 0,
				captainInbox: []
			};
		}
		/** Render team contents for the current session's host tab. */
		function ActivityView({ teams, archivedTeams, historic, currentSessionId, onNavigate, t }) {
			const visibleTeams = currentSessionId === void 0 ? [] : teams.filter((team) => team.captainSessionId === currentSessionId);
			const visibleArchived = currentSessionId === void 0 ? [] : archivedTeams.filter((team) => team.captainSessionId === currentSessionId && !teams.some((live) => live.captainSessionId === currentSessionId && live.teamId === team.teamId));
			const visibleHistoric = currentSessionId === void 0 ? [] : [...historic.values()].filter(({ data, owner }) => owner === currentSessionId && !visibleTeams.some((live) => live.teamId === data.teamId) && !visibleArchived.some((archived) => archived.teamId === data.teamId));
			const count = visibleTeams.length + visibleArchived.length + visibleHistoric.length;
			return (0, react_jsx_runtime.jsx)("div", {
				className: ActivityView_module_css_default.root,
				"data-agent-teams-activity": true,
				children: count === 0 ? (0, react_jsx_runtime.jsx)("span", {
					className: ActivityView_module_css_default.emptyHint,
					children: t("activity.empty")
				}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					visibleTeams.map((team) => (0, react_jsx_runtime.jsx)(TeamSection, {
						team,
						onNavigate,
						t
					}, team.teamId)),
					visibleArchived.map((team) => (0, react_jsx_runtime.jsxs)("div", {
						"data-team-id": team.teamId,
						"data-historic": true,
						className: ActivityView_module_css_default.archivedWrap,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: ActivityView_module_css_default.archiveLabel,
							children: t("archive.label")
						}), (0, react_jsx_runtime.jsx)(TeamSection, {
							team,
							onNavigate,
							t,
							historic: true
						})]
					}, `${team.captainSessionId}:${team.teamId}`)),
					visibleHistoric.map(({ data: team, owner }) => {
						const teamKey = `${owner}:${team.teamId}`;
						return (0, react_jsx_runtime.jsx)(TeamSection, {
							team: historicCardTeam(team, owner),
							onNavigate,
							t,
							historic: true
						}, teamKey);
					})
				] })
			});
		}
		//#endregion
		//#region lib/client/session-navigation.js
		/** Version-tolerant navigation into durable AgentTeams member transcripts. */
		/**
		* Open one member's persisted transcript.
		*
		* Harness rc.8 intentionally removed cold subagents from the ordinary session
		* list. They must first be rediscovered in their parent's catalog, then opened
		* with the exact parent/child/mode address. Older runtimes have only `open()`;
		* the fallback preserves the plugin's rc.6 peer range.
		*/
		async function openAgentTeamMember(sessions, parentSessionId, childSessionId) {
			if (sessions.openSubagent === void 0 || sessions.refreshSubagents === void 0) {
				sessions.open(childSessionId);
				return "session";
			}
			await sessions.refreshSubagents(parentSessionId);
			const retained = sessions.subagentAddress?.(childSessionId);
			sessions.openSubagent(retained?.parentSessionId === parentSessionId ? retained : {
				parentSessionId,
				childSessionId,
				mode: "continuable"
			});
			return "subagent";
		}
		//#endregion
		//#region lib/client/AgentTeamsTab.js
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
		/** Tiny module-level count store for the sidebar tab badge. The badge
		* callback is synchronous and runs during tab-bar renders; polling results
		* flow in asynchronously from AgentTeamsTab, so the latest value is stored
		* here. The sidebar tab is single-instance per session, and DSH uses one
		* client bundle per activated plugin — module state is safe.
		*
		* The count is reset to 0 whenever the tab is hidden or the active session
		* changes, so a stale count from a previous session can never leak onto the
		* badge. */
		let agentTeamsTabCount = 0;
		function setAgentTeamsTabCount(count) {
			agentTeamsTabCount = count;
		}
		function agentTeamsTabBadge() {
			return agentTeamsTabCount;
		}
		function AgentTeamsTab(props) {
			const { ctx, scope, tab, visible } = props;
			const runtime = ctx;
			const sessions = runtime.sessions;
			const t = runtime.locale.bind("agentTeams");
			const { teams, archivedTeams } = (0, react.useSyncExternalStore)(subscribeActivitySnapshots, getActivitySnapshotsSnapshot);
			const monitorTargets = (0, react.useSyncExternalStore)(subscribeActivityMonitorTargets, getActivityMonitorTargetsSnapshot);
			const globalCurrent = (0, react.useSyncExternalStore)((0, react.useMemo)(() => (callback) => sessions.list.subscribe(callback), [sessions]), (0, react.useCallback)(() => sessions.list.getSnapshot().current, [sessions]));
			const activeSession = scope?.sessionId === void 0 ? globalCurrent : scope.sessionId;
			const currentTargets = (0, react.useMemo)(() => activeSession === void 0 ? [] : monitorTargets.filter((target) => target.sessionId === activeSession), [activeSession, monitorTargets]);
			(0, react.useEffect)(() => {
				const meta = tab.meta;
				if (meta?.data?.teamId === void 0 || meta?.owner === void 0) return;
				setHistoric((previous) => {
					const key = `${meta.owner}:${meta.data.teamId}`;
					const next = new Map(previous);
					next.set(key, {
						data: meta.data,
						owner: meta.owner
					});
					return next;
				});
			}, [tab.meta]);
			const [historic, setHistoric] = (0, react.useState)(/* @__PURE__ */ new Map());
			(0, react.useEffect)(() => {
				if (!visible || activeSession === void 0) return;
				const controller = startActivityPolling(currentTargets, { discoverySessionId: activeSession });
				return () => {
					controller.stop();
				};
			}, [
				visible,
				activeSession,
				currentTargets
			]);
			(0, react.useEffect)(() => {
				if (!visible || activeSession === void 0) setAgentTeamsTabCount(0);
			}, [activeSession, visible]);
			(0, react.useEffect)(() => {
				if (!visible || activeSession === void 0) return;
				setAgentTeamsTabCount(teams.filter((team) => team.captainSessionId === activeSession).length + archivedTeams.filter((team) => team.captainSessionId === activeSession).length);
			}, [
				teams,
				archivedTeams,
				activeSession,
				visible
			]);
			return (0, react_jsx_runtime.jsx)(ActivityView, {
				teams,
				archivedTeams,
				historic,
				currentSessionId: activeSession,
				onNavigate: (0, react.useCallback)((parentId, childId) => {
					openAgentTeamMember(sessions, parentId, childId).catch((error) => {
						console.warn(`agent-teams: failed to open member transcript ${childId}: ${String(error)}`);
					});
				}, [sessions]),
				t
			});
		}
		//#endregion
		//#region lib/client/agent-teams-tab-constants.js
		/** Shared AgentTeams sidebar tab identity. */
		const AGENT_TEAMS_TAB_ID = "agent-teams";
		//#endregion
		//#region lib/client/locales.js
		/** `agentTeams` namespace dictionaries for every plugin-owned Web surface. */
		/** Dictionary namespace owned by the AgentTeams client plugin. */
		const AGENT_TEAMS_LOCALE_NAMESPACE = "agentTeams";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"card.memberCount": "{count} 名成员",
			"action.openActivityPanel": "打开活动面板",
			"activity.panelButton": "活动面板",
			"activity.badgeAria": "AgentTeams 活动，{count} 个团队",
			"activity.panelAria": "AgentTeams 活动面板",
			"activity.title": "AgentTeams 活动",
			"activity.float": "切换为浮动面板",
			"activity.dockRight": "停靠到右侧",
			"activity.collapse": "收起活动面板",
			"activity.empty": "暂无团队活动",
			"format.listSeparator": "、",
			"task.status.pending": "待领取",
			"task.status.claimed": "已认领",
			"task.status.inProgress": "进行中",
			"task.status.completed": "已完成",
			"task.status.failed": "失败",
			"task.status.cancelled": "已取消",
			"member.state.working": "工作中",
			"member.state.failed": "有失败",
			"member.state.waiting": "等待",
			"member.state.delivered": "已交付",
			"member.state.left": "已离队",
			"member.state.removed": "已移除",
			"member.state.pending": "待执行",
			"member.state.unassigned": "待派工",
			"member.status.executing": "正在执行 {taskId}",
			"member.status.working": "正在处理已派任务",
			"member.status.waitingOn": "等待 {taskId} · {assignee}",
			"member.status.waitingPrerequisite": "等待前置任务",
			"member.status.waitingAssignment": "等待队长派工",
			"member.status.delivered": "任务已交付",
			"member.status.idle": "待继续执行",
			"member.status.unknown": "状态未知",
			"task.assignee.unclaimed": "待认领",
			"task.summary.waitingBreakdown": "等待队长拆解任务",
			"task.summary.allDelivered": "全部 {count} 项任务已交付",
			"task.summary.blockedAndRunning": "{tasks}{more} 等待前置，其余已开工",
			"task.summary.more": " 等 {count} 项",
			"task.summary.running": "{tasks} 正在执行",
			"task.summary.ready": "{tasks} 已就绪待开工",
			"task.summary.blocked": "{tasks} 等待前置",
			"task.summary.waitingSchedule": "等待下一轮调度",
			"progress.aria": "团队总进度",
			"progress.title": "总进度",
			"progress.running": "■ 进行中 {count}",
			"progress.blocked": "■ 等待依赖 {count}",
			"progress.delivered": "■ 已交付 {count}",
			"dependency.aria": "任务依赖链",
			"dependency.parallel": "并行任务",
			"dependency.title": "任务依赖",
			"dependency.hint.parallel": "无前后依赖 · 点击查看详情",
			"dependency.hint.chain": "悬停高亮依赖链 · 点击固定",
			"dependency.hint.pinned": "{taskId} 已固定 · Esc 取消",
			"task.runningAria": "运行中",
			"task.detail.completed": "已完成并交付",
			"task.detail.noPrerequisite": "无前置，可立即开工",
			"task.detail.ready": "前置已就绪，可开工",
			"task.detail.waitingOn": "等待 {tasks}",
			"task.detail.noDownstream": "无下游任务",
			"task.detail.unlocks": "完成后解锁 {tasks}",
			"team.ended": "已结束",
			"team.stats.members": "{count} 名成员",
			"team.stats.completed": "{completed}/{total} 完成",
			"team.stats.messages": "{count} 条消息",
			"delegation.aria": "队长派工关系",
			"captain.name": "队长",
			"captain.role": "拆解 · 派发 · 汇总",
			"captain.summary": "已派发 {tasks} 项任务给 {members} 名成员",
			"captain.state.working": "{count} 人执行中",
			"captain.state.collected": "已收齐",
			"captain.state.waiting": "等待回报",
			"members.toggle": "{count} 名成员",
			"members.collapse": "收起",
			"members.expand": "展开",
			"members.empty": "暂无成员，等待队长组建团队",
			"assignment.label": "队长派发",
			"assignment.empty": "暂无任务",
			"archive.label": "已结束 · 历史归档"
		};
		/** English dictionary, checked complete against the Chinese source key set. */
		const en = {
			"card.memberCount": "{count} members",
			"action.openActivityPanel": "Open activity panel",
			"activity.panelButton": "Activity panel",
			"activity.badgeAria": "AgentTeams activity, {count} teams",
			"activity.panelAria": "AgentTeams activity panel",
			"activity.title": "AgentTeams activity",
			"activity.float": "Switch to floating panel",
			"activity.dockRight": "Dock to the right",
			"activity.collapse": "Collapse activity panel",
			"activity.empty": "No team activity",
			"format.listSeparator": ", ",
			"task.status.pending": "Unclaimed",
			"task.status.claimed": "Claimed",
			"task.status.inProgress": "In progress",
			"task.status.completed": "Completed",
			"task.status.failed": "Failed",
			"task.status.cancelled": "Cancelled",
			"member.state.working": "Working",
			"member.state.failed": "Has failures",
			"member.state.waiting": "Waiting",
			"member.state.delivered": "Delivered",
			"member.state.left": "Left team",
			"member.state.removed": "Removed",
			"member.state.pending": "Pending",
			"member.state.unassigned": "Awaiting assignment",
			"member.status.executing": "Working on {taskId}",
			"member.status.working": "Working on assigned tasks",
			"member.status.waitingOn": "Waiting for {taskId} · {assignee}",
			"member.status.waitingPrerequisite": "Waiting for prerequisites",
			"member.status.waitingAssignment": "Waiting for the captain to assign work",
			"member.status.delivered": "Tasks delivered",
			"member.status.idle": "Ready to continue",
			"member.status.unknown": "Status unknown",
			"task.assignee.unclaimed": "Unclaimed",
			"task.summary.waitingBreakdown": "Waiting for the captain to break down the work",
			"task.summary.allDelivered": "All {count} tasks delivered",
			"task.summary.blockedAndRunning": "{tasks}{more} waiting on prerequisites; other work has started",
			"task.summary.more": " and {count} more",
			"task.summary.running": "{tasks} in progress",
			"task.summary.ready": "{tasks} ready to start",
			"task.summary.blocked": "{tasks} waiting on prerequisites",
			"task.summary.waitingSchedule": "Waiting for the next scheduling round",
			"progress.aria": "Overall team progress",
			"progress.title": "Overall progress",
			"progress.running": "■ In progress {count}",
			"progress.blocked": "■ Waiting {count}",
			"progress.delivered": "■ Delivered {count}",
			"dependency.aria": "Task dependency chain",
			"dependency.parallel": "Parallel tasks",
			"dependency.title": "Task dependencies",
			"dependency.hint.parallel": "No dependencies · Click for details",
			"dependency.hint.chain": "Hover to highlight dependencies · Click to pin",
			"dependency.hint.pinned": "{taskId} pinned · Esc to clear",
			"task.runningAria": "Running",
			"task.detail.completed": "Completed and delivered",
			"task.detail.noPrerequisite": "No prerequisites; ready to start",
			"task.detail.ready": "Prerequisites ready; can start",
			"task.detail.waitingOn": "Waiting for {tasks}",
			"task.detail.noDownstream": "No downstream tasks",
			"task.detail.unlocks": "Unlocks {tasks} when complete",
			"team.ended": "Ended",
			"team.stats.members": "{count} members",
			"team.stats.completed": "{completed}/{total} completed",
			"team.stats.messages": "{count} messages",
			"delegation.aria": "Captain delegation map",
			"captain.name": "Captain",
			"captain.role": "Break down · Delegate · Synthesize",
			"captain.summary": "Assigned {tasks} tasks to {members} members",
			"captain.state.working": "{count} active",
			"captain.state.collected": "All reports received",
			"captain.state.waiting": "Waiting for reports",
			"members.toggle": "Members {count}",
			"members.collapse": "Collapse",
			"members.expand": "Expand",
			"members.empty": "No members yet; waiting for the captain to assemble the team",
			"assignment.label": "Captain assigned",
			"assignment.empty": "No tasks",
			"archive.label": "Ended · Archived history"
		};
		//#endregion
		//#region lib/client/index.js
		/** Required services: conversation nodes, slots, sessions navigation, and locale. */
		const inject = [
			"conversationEvents",
			"slots",
			"sessions",
			"locale"
		];
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
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(AGENT_TEAMS_LOCALE_NAMESPACE, {
				zh,
				en
			}), "agent-teams: dictionaries");
			const openMember = (parentId, childId) => {
				openAgentTeamMember(ctx.sessions, parentId, childId).catch((error) => {
					console.warn(`agent-teams: failed to open member transcript ${childId}: ${String(error)}`);
				});
			};
			const betterSidebar = ctx.get?.("betterSidebar");
			const sidebarUsable = betterSidebar !== void 0 && typeof betterSidebar.registerTab === "function" && typeof betterSidebar.openTab === "function";
			if (sidebarUsable) {
				const disposer = betterSidebar.registerTab({
					id: AGENT_TEAMS_TAB_ID,
					title: "AgentTeams",
					icon: (size) => (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutline16, { size }),
					order: 35,
					single: true,
					badge: () => agentTeamsTabBadge(),
					component: (props) => (0, react_jsx_runtime.jsx)(AgentTeamsTab, { ...props })
				});
				ctx.effect(() => disposer, "agent-teams: better-sidebar tab");
			}
			ctx.slots.inject("conversation.chat.commandview", () => ctx.slots.register({
				name: "conversation.chat.commandview",
				key: "agent-teams"
			}, HiddenAgentTeamsCommand));
			ctx.conversationEvents.register(agentTeamsCardDefinition);
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "agent-teams",
				locale: AGENT_TEAMS_LOCALE_NAMESPACE,
				inject: () => ({
					openMember,
					openAgentTeamsTab: sidebarUsable ? (data) => {
						const owner = data.captainSessionId !== "" ? data.captainSessionId : ctx.sessions.list.getSnapshot().current ?? "";
						betterSidebar?.openTab({
							type: AGENT_TEAMS_TAB_ID,
							meta: {
								data,
								owner
							}
						});
					} : void 0
				})
			}, AgentTeamsCard));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map