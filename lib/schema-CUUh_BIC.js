import { z } from "zod";
//#region src/evolution/schema.ts
const evolutionConfigSchema = z.object({
	learningBatchSize: z.number().int().min(1).max(100),
	maxPendingProposals: z.number().int().min(1).max(1e3)
});
const evolutionEvidenceSchema = z.object({
	sessionId: z.string().min(1),
	turn: z.number().int().nonnegative(),
	eventSeq: z.number().int().nonnegative(),
	excerpt: z.string().min(1).max(500)
});
const evolutionSettingSchema = z.object({
	id: z.string().min(1),
	scope: z.enum(["global", "project"]),
	projectRoot: z.string().min(1).nullable(),
	category: z.enum([
		"identity",
		"preference",
		"work_rule"
	]),
	content: z.string().min(1).max(2e3),
	evidence: z.array(evolutionEvidenceSchema),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative()
});
const evolutionProposalSchema = z.object({
	id: z.string().min(1),
	scope: z.enum(["global", "project"]),
	projectRoot: z.string().min(1).nullable(),
	action: z.enum([
		"add",
		"update",
		"delete"
	]),
	category: z.enum([
		"identity",
		"preference",
		"work_rule"
	]).nullable(),
	content: z.string().min(1).max(2e3).nullable(),
	targetId: z.string().min(1).nullable(),
	inference: z.enum(["explicit", "implicit"]),
	deleteReason: z.enum([
		"explicit_denial",
		"expired",
		"replaced"
	]).nullable(),
	evidence: z.array(evolutionEvidenceSchema).min(1),
	status: z.enum([
		"pending",
		"applied",
		"dismissed",
		"expired"
	]),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative()
});
const evolutionBackupSchema = z.object({
	id: z.string().min(1),
	scope: z.enum(["global", "project"]),
	projectRoot: z.string().min(1).nullable(),
	source: z.enum([
		"proposal",
		"manual",
		"restore"
	]),
	summary: z.string().min(1),
	settings: z.array(evolutionSettingSchema),
	createdAt: z.number().int().nonnegative()
});
const evolutionLearningRunSchema = z.object({
	id: z.string().min(1),
	sessionId: z.string().min(1),
	projectRoot: z.string().min(1).nullable().optional(),
	turns: z.array(z.number().int().nonnegative()).min(1),
	status: z.enum(["completed", "failed"]),
	proposalCount: z.number().int().nonnegative(),
	error: z.string().nullable(),
	createdAt: z.number().int().nonnegative()
});
const evolutionStateSchema = z.object({
	revision: z.number().int().nonnegative(),
	config: evolutionConfigSchema.optional(),
	settings: z.array(evolutionSettingSchema),
	proposals: z.array(evolutionProposalSchema),
	backups: z.array(evolutionBackupSchema),
	runs: z.array(evolutionLearningRunSchema),
	updatedAt: z.number().int().nonnegative()
});
//#endregion
export { evolutionSettingSchema as a, evolutionProposalSchema as i, evolutionConfigSchema as n, evolutionStateSchema as o, evolutionLearningRunSchema as r, evolutionBackupSchema as t };
