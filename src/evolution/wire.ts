import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import {
  evolutionBackupSchema,
  evolutionConfigSchema,
  evolutionLearningRunSchema,
  evolutionProposalSchema,
  evolutionSettingSchema,
} from './schema.ts'

export const evolutionDashboardRequestSchema = z.object({
}).strict()

export const evolutionConfigRequestSchema = z.object({
  config: evolutionConfigSchema,
}).strict()

export const evolutionProposalRequestSchema = evolutionDashboardRequestSchema.extend({
  id: z.string().min(1),
  action: z.enum(['apply', 'dismiss']),
}).strict()

const evolutionSettingMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    category: z.enum(['identity', 'preference', 'work_rule']),
    content: z.string().min(1).max(2000),
  }).strict(),
  z.object({
    action: z.literal('update'),
    id: z.string().min(1),
    category: z.enum(['identity', 'preference', 'work_rule']),
    content: z.string().min(1).max(2000),
  }).strict(),
  z.object({ action: z.literal('delete'), id: z.string().min(1) }).strict(),
])

export const evolutionSettingRequestSchema = evolutionDashboardRequestSchema.extend({
  mutation: evolutionSettingMutationSchema,
}).strict()

export const evolutionRestoreRequestSchema = evolutionDashboardRequestSchema.extend({
  id: z.string().min(1),
}).strict()

const publicEvolutionSettingSchema = evolutionSettingSchema.omit({ scope: true, projectRoot: true })
const publicEvolutionProposalSchema = evolutionProposalSchema.omit({ scope: true, projectRoot: true })
const publicEvolutionBackupSchema = evolutionBackupSchema.omit({ scope: true, projectRoot: true }).extend({
  settings: z.array(publicEvolutionSettingSchema),
})

export const evolutionDashboardSchema = z.object({
  revision: z.number().int().nonnegative(),
  config: evolutionConfigSchema,
  settings: z.array(publicEvolutionSettingSchema),
  proposals: z.array(publicEvolutionProposalSchema),
  backups: z.array(publicEvolutionBackupSchema),
  runs: z.array(evolutionLearningRunSchema),
}).strict()

const SERVICE = 'taskModesEvolution'
const PACKAGE = '@graysilver/dsh-task-modes'

function descriptor(
  method: string,
  requestType: string,
  requestSchema: z.ZodType,
): InvocationDescriptor {
  return {
    id: `${PACKAGE}#${SERVICE}/${method}`,
    service: SERVICE,
    namespace: SERVICE,
    method,
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'request',
      wire: 'request',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: `${PACKAGE}#${requestType}`, schema: requestSchema },
    }],
    result: {
      mode: 'strict',
      typeSymbol: `${PACKAGE}#EvolutionDashboard`,
      schema: evolutionDashboardSchema,
    },
  }
}

/** Strict Host and Client descriptors for the plugin-owned Settings API. */
export const EVOLUTION_REMOTE_DESCRIPTORS: readonly InvocationDescriptor[] = [
  descriptor('dashboard', 'EvolutionDashboardRequest', evolutionDashboardRequestSchema),
  descriptor('config', 'EvolutionConfigRequest', evolutionConfigRequestSchema),
  descriptor('proposal', 'EvolutionProposalRequest', evolutionProposalRequestSchema),
  descriptor('setting', 'EvolutionSettingRequest', evolutionSettingRequestSchema),
  descriptor('restore', 'EvolutionRestoreRequest', evolutionRestoreRequestSchema),
]
