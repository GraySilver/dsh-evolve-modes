import z from "@deepseek-ai/schemastery";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z as z$1 } from "zod";
//#region src/prompt.ts
/** System-prompt guidance enabled by first-principles task mode. */
const FIRST_PRINCIPLES = "For this task, reason from first principles. State the objective and success criteria, separate verified facts from assumptions, identify hard constraints, derive the solution from those facts, and describe how you will verify the result. Do not treat conventions or guesses as requirements.";
//#endregion
//#region src/storage.ts
const legacyModeSchema = z$1.enum([
	"normal",
	"first-principles",
	"adversarial-review"
]);
const reviewSchema = z$1.object({
	turn: z$1.number().int().nonnegative(),
	profile: z$1.enum(["general-review", "acceptance-review"]),
	status: z$1.enum(["completed", "unavailable"]),
	text: z$1.string(),
	createdAt: z$1.number().int().nonnegative()
});
const legacyReviewSchema = reviewSchema.omit({ profile: true });
const recordSchema = z$1.object({
	reasoning: z$1.enum(["standard", "first-principles"]),
	quality: z$1.enum([
		"off",
		"general-review",
		"acceptance-review"
	]),
	updatedAt: z$1.number().int().nonnegative(),
	reviews: z$1.array(reviewSchema)
});
const legacyRecordSchema = z$1.object({
	mode: legacyModeSchema,
	updatedAt: z$1.number().int().nonnegative(),
	reviews: z$1.array(legacyReviewSchema)
});
const storedRecordSchema = z$1.union([recordSchema, legacyRecordSchema]);
const DEFAULT_RECORD = {
	reasoning: "standard",
	quality: "off",
	updatedAt: 0,
	reviews: []
};
/** Plugin-owned storage. It avoids custom DSH session events so old harnesses can reopen a session safely. */
const taskModesDomain = defineDomain({
	name: "graysilver_task_modes",
	version: 1,
	tables: { sessions: domainTable(storedRecordSchema) }
});
/** Map one legacy selector value to its independent reasoning and quality choices. */
function legacyModeState(mode) {
	switch (mode) {
		case "normal": return {
			reasoning: "standard",
			quality: "off"
		};
		case "first-principles": return {
			reasoning: "first-principles",
			quality: "off"
		};
		case "adversarial-review": return {
			reasoning: "standard",
			quality: "general-review"
		};
	}
}
/** Return the current-format view of either a persisted legacy or current record. */
function normalizeRecord(record) {
	if ("mode" in record) return {
		...legacyModeState(record.mode),
		updatedAt: record.updatedAt,
		reviews: record.reviews.map((review) => ({
			...review,
			profile: "general-review"
		}))
	};
	return record;
}
/** Rewrite legacy records in place without changing the storage-domain descriptor version. */
async function migrateLegacyRecords(table) {
	for (const [sessionId, record] of table.entries()) if ("mode" in record) await table.put(sessionId, normalizeRecord(record));
}
function recordFor(table, sessionId) {
	const record = table.get(sessionId);
	return record === void 0 ? DEFAULT_RECORD : normalizeRecord(record);
}
async function putRecord(table, sessionId, record) {
	await table.put(sessionId, record);
	return record;
}
async function setReasoning(table, sessionId, reasoning) {
	return putRecord(table, sessionId, {
		...recordFor(table, sessionId),
		reasoning,
		updatedAt: Date.now()
	});
}
async function setQuality(table, sessionId, quality) {
	return putRecord(table, sessionId, {
		...recordFor(table, sessionId),
		quality,
		updatedAt: Date.now()
	});
}
async function setLegacyMode(table, sessionId, mode) {
	return putRecord(table, sessionId, {
		...recordFor(table, sessionId),
		...legacyModeState(mode),
		updatedAt: Date.now()
	});
}
async function addReview(table, sessionId, review) {
	const current = recordFor(table, sessionId);
	return putRecord(table, sessionId, {
		...current,
		reviews: [...current.reviews.filter((item) => item.turn !== review.turn), review]
	});
}
//#endregion
//#region src/index.ts
const READ_ONLY_REVIEW_TOOLS = [
	"read",
	"glob",
	"grep",
	"read_image"
];
const PLAN_EXIT_TOOL = "exit_plan_mode";
const Config = z.object({ shellTool: z.union(["bash", "pwsh"]).required() });
/** Return the complete Plan-mode allow-list for a configured platform shell. */
function planAllowedTools(shellTool) {
	return [
		...READ_ONLY_REVIEW_TOOLS,
		shellTool,
		PLAN_EXIT_TOOL
	];
}
/** Test whether a requested tool may execute while official Plan mode is active. */
function isPlanToolAllowed(name, shellTool) {
	return planAllowedTools(shellTool).includes(name);
}
function textContent(content) {
	return content.flatMap((block) => block.type === "text" && typeof block.text === "string" ? [block.text] : []).join("\n");
}
function exitPlanText(argumentsText) {
	try {
		const value = JSON.parse(argumentsText);
		if (typeof value !== "object" || value === null || !("plan" in value) || typeof value.plan !== "string") return void 0;
		const plan = value.plan.trim();
		return plan === "" ? void 0 : plan;
	} catch {
		return;
	}
}
function currentTurnInput(agent, turn) {
	const start = agent.session.events.findLastIndex((event) => event.type === "turn/start" && event.data.turn === turn);
	if (start === -1) return void 0;
	const tasks = [];
	const planCalls = /* @__PURE__ */ new Map();
	let answer = "";
	let approvedPlan = "";
	for (const event of agent.session.events.slice(start + 1)) {
		if (event.type === "user/message" && event.data.source.kind === "user") {
			const text = textContent(event.data.content);
			if (text !== "") tasks.push(text);
			continue;
		}
		if (event.type === "assistant/message") {
			answer = textContent(event.data.message.content);
			continue;
		}
		if (event.type === "tool/call" && event.data.name === PLAN_EXIT_TOOL) {
			const plan = exitPlanText(event.data.arguments);
			if (plan !== void 0) planCalls.set(String(event.data.callId), plan);
			continue;
		}
		if (event.type === "tool/result" && event.data.message.content[0].isError !== true) {
			const plan = planCalls.get(String(event.data.message.source.callId));
			if (plan !== void 0) approvedPlan = plan;
		}
	}
	const task = tasks.join("\n\n");
	if (task === "") return void 0;
	if (approvedPlan !== "") return {
		task,
		candidate: approvedPlan,
		candidateKind: "approved-plan"
	};
	return answer === "" ? void 0 : {
		task,
		candidate: answer,
		candidateKind: "answer"
	};
}
/** Build a profile-specific reviewer prompt for one completed parent turn. */
function reviewPrompt(profile, input) {
	const subject = input.candidateKind === "approved-plan" ? "Approved plan" : "Candidate answer";
	if (profile === "general-review") return `Review the current task and ${subject.toLowerCase()}. Identify unmet requirements, unsupported claims, omissions, regressions, counterexamples, and security risks. Use inspection tools only when evidence is needed. The shell is for non-mutating inspection only. Do not modify files or start background processes. Return a structured Markdown verdict with evidence and concrete follow-up actions.\n\nCurrent task:\n${input.task}\n\n${subject}:\n${input.candidate}`;
	return `Independently assess whether the ${subject.toLowerCase()} satisfies the current task. Compare every explicit requirement with the available evidence and the approved plan when one is present. Do not modify files, retry work, or run project test, lint, or build commands. Use inspection tools only when evidence is needed. Return a concise Markdown checklist with these headings: Met, Gap, Unverified, Evidence, and Concrete follow-up. Every checklist item must name the requirement it addresses.\n\nCurrent task:\n${input.task}\n\n${subject}:\n${input.candidate}`;
}
async function reviewTurn(scope, agent, turn, signal, shellTool, profile) {
	const input = currentTurnInput(agent, turn);
	if (input === void 0) return void 0;
	const unavailable = (text) => ({
		turn,
		profile,
		status: "unavailable",
		text,
		createdAt: Date.now()
	});
	if (scope.subagents.getProvider("fork") === void 0) return unavailable("The fork subagent provider is unavailable.");
	try {
		const run = await scope.subagents.start("fork", {
			parent: agent,
			signal,
			label: profile,
			toolFilter: { allow: [...READ_ONLY_REVIEW_TOOLS, shellTool] },
			prompt: [{
				type: "text",
				text: reviewPrompt(profile, input)
			}]
		});
		try {
			const result = await run.result;
			const text = result.output.map((block) => block.type === "text" ? block.text : "").join("");
			return result.stopReason === "completed" ? {
				turn,
				profile,
				status: "completed",
				text: text || "Review completed without a text report.",
				createdAt: Date.now()
			} : unavailable(`The reviewer did not complete (${result.stopReason}).`);
		} finally {
			await run.dispose();
		}
	} catch (error) {
		return unavailable(error instanceof Error ? error.message : String(error));
	}
}
function isReasoningMode(value) {
	return value === "standard" || value === "first-principles";
}
function isQualityGate(value) {
	return value === "off" || value === "general-review" || value === "acceptance-review";
}
function isLegacyMode(value) {
	return value === "normal" || value === "first-principles" || value === "adversarial-review";
}
/** Mount the independent reasoning/quality controls alongside official Plan mode. */
async function apply(ctx, config) {
	await ctx.inject([
		"agentPresets",
		"commands",
		"systemPrompt",
		"subagents",
		"storageDomain",
		"tools"
	], async (scope) => {
		const domain = await scope.storageDomain.open(taskModesDomain);
		const records = domain.table("sessions");
		await migrateLegacyRecords(records);
		scope.effect(() => () => domain.close(), "dsh-task-modes: storage close");
		const stateOf = (agent) => recordFor(records, String(agent.session.id));
		const planModeFor = (agent) => {
			return scope.agentPresets.serviceFor(agent, "planMode");
		};
		const workingOf = (agent) => {
			const plan = planModeFor(agent)?.get(agent);
			if (plan === void 0) return "execute";
			return plan.pending ?? plan.active ? "plan" : "execute";
		};
		const stateText = (agent) => {
			const current = stateOf(agent);
			return `working: ${workingOf(agent)}\nreasoning: ${current.reasoning}\nquality: ${current.quality}`;
		};
		scope.effect(() => scope.systemPrompt.section({
			name: "task-mode:first-principles",
			order: 80,
			text: ({ agent }) => agent !== void 0 && stateOf(agent).reasoning === "first-principles" ? FIRST_PRINCIPLES : ""
		}), "dsh-task-modes: first-principles prompt");
		scope.effect(() => scope.on("tools/pre-execute", async (execution, next) => {
			if (execution.agent === void 0 || !planModeFor(execution.agent)?.get(execution.agent).active) return next();
			if (isPlanToolAllowed(execution.name, config.shellTool)) return next();
			return {
				kind: "deny",
				reason: `Plan mode allows only ${planAllowedTools(config.shellTool).join(", ")}. Switch to Execute mode before running ${execution.name}.`
			};
		}), "dsh-task-modes: plan tool policy");
		scope.effect(() => scope.commands.register({
			name: "task-mode",
			description: "Select independent working, reasoning, and quality task controls.",
			recordInput: false,
			handler: async ({ agent, rawInput }) => {
				const input = rawInput.trim();
				const current = stateOf(agent);
				if (input === "") return {
					kind: "success",
					text: stateText(agent)
				};
				const reviewMatch = /^review\s+(\d+)$/u.exec(input);
				if (reviewMatch !== null) {
					const turn = Number(reviewMatch[1]);
					if (!Number.isSafeInteger(turn) || turn < 0) return {
						kind: "error",
						text: "task-mode review expects a non-negative integer turn"
					};
					return {
						kind: "success",
						text: current.reviews.find((review) => review.turn === turn)?.text ?? ""
					};
				}
				if (input === "reviews") return {
					kind: "success",
					text: current.reviews.map((review) => `## Turn ${review.turn} - ${review.profile} (${review.status})\n\n${review.text}`).join("\n\n") || "No quality reviews yet."
				};
				if (isLegacyMode(input)) {
					await setLegacyMode(records, String(agent.session.id), input);
					planModeFor(agent)?.set(agent, false);
					return {
						kind: "success",
						text: stateText(agent)
					};
				}
				const [axis, value, extra] = input.split(/\s+/u);
				if (extra !== void 0) return {
					kind: "error",
					text: "task-mode expects one axis and one value"
				};
				if (axis === "working" && (value === "execute" || value === "plan")) {
					const planMode = planModeFor(agent);
					if (planMode === void 0) return {
						kind: "error",
						text: "The current agent preset does not mount @deepseek-ai/dsh-plan-mode."
					};
					planMode.set(agent, value === "plan");
					return {
						kind: "success",
						text: stateText(agent)
					};
				}
				if (axis === "reasoning" && value !== void 0 && isReasoningMode(value)) {
					await setReasoning(records, String(agent.session.id), value);
					return {
						kind: "success",
						text: stateText(agent)
					};
				}
				if (axis === "quality" && value !== void 0 && isQualityGate(value)) {
					await setQuality(records, String(agent.session.id), value);
					return {
						kind: "success",
						text: stateText(agent)
					};
				}
				return {
					kind: "error",
					text: "task-mode expects working <execute|plan>, reasoning <standard|first-principles>, quality <off|general-review|acceptance-review>, review <turn>, reviews, or a legacy mode alias"
				};
			}
		}), "dsh-task-modes: task-mode command");
		scope.effect(() => scope.commands.register({
			name: "task-mode-review",
			description: "Internal Web reader for one task-mode review record.",
			recordInput: false,
			handler: async ({ agent, rawInput }) => {
				const turn = Number(rawInput.trim());
				if (!Number.isSafeInteger(turn) || turn < 0) return {
					kind: "error",
					text: "task-mode-review expects a non-negative integer turn"
				};
				const review = stateOf(agent).reviews.find((item) => item.turn === turn);
				return {
					kind: "success",
					text: review === void 0 ? "" : JSON.stringify(review)
				};
			}
		}), "dsh-task-modes: task-mode-review command");
		scope.on("agent/turn-stopping", async ({ agent, turn, signal }) => {
			const profile = stateOf(agent).quality;
			if (profile === "off") return;
			const review = await reviewTurn(scope, agent, turn, signal, config.shellTool, profile);
			if (review !== void 0) await addReview(records, String(agent.session.id), review);
		});
	});
}
//#endregion
export { Config, apply, isPlanToolAllowed, planAllowedTools, reviewPrompt };
