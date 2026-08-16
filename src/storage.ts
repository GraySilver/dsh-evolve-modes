import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { AdversarialReview, TaskMode, TaskModeRecord } from './types.ts'

const reviewSchema = z.object({ turn: z.number().int().nonnegative(), status: z.enum(['completed', 'unavailable']), text: z.string(), createdAt: z.number().int().nonnegative() })
const recordSchema = z.object({ mode: z.enum(['normal', 'first-principles', 'adversarial-review']), updatedAt: z.number().int().nonnegative(), reviews: z.array(reviewSchema) })

/** Plugin-owned storage. It avoids custom DSH session events so old harnesses can reopen a session safely. */
export const taskModesDomain = defineDomain({
  name: 'graysilver_task_modes', version: 1,
  tables: { sessions: domainTable<string, TaskModeRecord>(recordSchema) },
})

export function recordFor(table: KvTable<string, TaskModeRecord>, sessionId: string): TaskModeRecord {
  return table.get(sessionId) ?? { mode: 'normal', updatedAt: 0, reviews: [] }
}

export async function setMode(table: KvTable<string, TaskModeRecord>, sessionId: string, mode: TaskMode): Promise<TaskModeRecord> {
  const next = { ...recordFor(table, sessionId), mode, updatedAt: Date.now() }
  await table.put(sessionId, next)
  return next
}

export async function addReview(table: KvTable<string, TaskModeRecord>, sessionId: string, review: AdversarialReview): Promise<TaskModeRecord> {
  const current = recordFor(table, sessionId)
  const next = { ...current, reviews: [...current.reviews.filter(item => item.turn !== review.turn), review] }
  await table.put(sessionId, next)
  return next
}
