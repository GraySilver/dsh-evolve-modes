import { a as evolutionSettingSchema, i as evolutionProposalSchema, n as evolutionConfigSchema, r as evolutionLearningRunSchema, t as evolutionBackupSchema } from "./schema-CUUh_BIC.js";
import { z } from "zod";
//#region src/evolution/wire.ts
const evolutionDashboardRequestSchema = z.object({}).strict();
const evolutionConfigRequestSchema = z.object({ config: evolutionConfigSchema }).strict();
const evolutionProposalRequestSchema = evolutionDashboardRequestSchema.extend({
	id: z.string().min(1),
	action: z.enum(["apply", "dismiss"])
}).strict();
const evolutionSettingMutationSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("add"),
		category: z.enum([
			"identity",
			"preference",
			"work_rule"
		]),
		content: z.string().min(1).max(2e3)
	}).strict(),
	z.object({
		action: z.literal("update"),
		id: z.string().min(1),
		category: z.enum([
			"identity",
			"preference",
			"work_rule"
		]),
		content: z.string().min(1).max(2e3)
	}).strict(),
	z.object({
		action: z.literal("delete"),
		id: z.string().min(1)
	}).strict()
]);
const evolutionSettingRequestSchema = evolutionDashboardRequestSchema.extend({ mutation: evolutionSettingMutationSchema }).strict();
const evolutionRestoreRequestSchema = evolutionDashboardRequestSchema.extend({ id: z.string().min(1) }).strict();
const publicEvolutionSettingSchema = evolutionSettingSchema.omit({
	scope: true,
	projectRoot: true
});
const publicEvolutionProposalSchema = evolutionProposalSchema.omit({
	scope: true,
	projectRoot: true
});
const publicEvolutionBackupSchema = evolutionBackupSchema.omit({
	scope: true,
	projectRoot: true
}).extend({ settings: z.array(publicEvolutionSettingSchema) });
const evolutionDashboardSchema = z.object({
	revision: z.number().int().nonnegative(),
	config: evolutionConfigSchema,
	settings: z.array(publicEvolutionSettingSchema),
	proposals: z.array(publicEvolutionProposalSchema),
	backups: z.array(publicEvolutionBackupSchema),
	runs: z.array(evolutionLearningRunSchema)
}).strict();
const SERVICE = "evolveModes";
const PACKAGE = "@graysilver/dsh-evolve-modes";
function descriptor(method, requestType, requestSchema) {
	return {
		id: `${PACKAGE}#${SERVICE}/${method}`,
		service: SERVICE,
		namespace: SERVICE,
		method,
		invocation: { kind: "direct" },
		parameters: [{
			name: "request",
			wire: "request",
			source: "json",
			codec: {
				mode: "strict",
				typeSymbol: `${PACKAGE}#${requestType}`,
				schema: requestSchema
			}
		}],
		result: {
			mode: "strict",
			typeSymbol: `${PACKAGE}#EvolutionDashboard`,
			schema: evolutionDashboardSchema
		}
	};
}
/** Strict Host and Client descriptors for the plugin-owned Settings API. */
const EVOLUTION_REMOTE_DESCRIPTORS = [
	descriptor("dashboard", "EvolutionDashboardRequest", evolutionDashboardRequestSchema),
	descriptor("config", "EvolutionConfigRequest", evolutionConfigRequestSchema),
	descriptor("proposal", "EvolutionProposalRequest", evolutionProposalRequestSchema),
	descriptor("setting", "EvolutionSettingRequest", evolutionSettingRequestSchema),
	descriptor("restore", "EvolutionRestoreRequest", evolutionRestoreRequestSchema)
];
//#endregion
export { EVOLUTION_REMOTE_DESCRIPTORS as t };
