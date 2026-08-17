import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type {
  QualityGate,
  ReasoningMode,
  TaskMode,
  TaskModeRecord,
  TaskModeReview,
} from './types.ts'

const legacyModeSchema = z.enum(['normal', 'first-principles', 'adversarial-review'])
const reviewSchema = z.object({
  turn: z.number().int().nonnegative(),
  profile: z.enum(['general-review', 'acceptance-review']),
  status: z.enum(['completed', 'unavailable']),
  text: z.string(),
  createdAt: z.number().int().nonnegative(),
})
const legacyReviewSchema = reviewSchema.omit({ profile: true })
const recordSchema = z.object({
  reasoning: z.enum(['standard', 'first-principles']),
  quality: z.enum(['off', 'general-review', 'acceptance-review']),
  updatedAt: z.number().int().nonnegative(),
  reviews: z.array(reviewSchema),
})
const legacyRecordSchema = z.object({
  mode: legacyModeSchema,
  updatedAt: z.number().int().nonnegative(),
  reviews: z.array(legacyReviewSchema),
})
const storedRecordSchema = z.union([recordSchema, legacyRecordSchema])

type StoredTaskModeRecord = z.infer<typeof storedRecordSchema>

const DEFAULT_RECORD: TaskModeRecord = {
  reasoning: 'standard',
  quality: 'off',
  updatedAt: 0,
  reviews: [],
}

/** Plugin-owned storage. It avoids custom DSH session events so old harnesses can reopen a session safely. */
export const taskModesDomain = defineDomain({
  name: 'graysilver_task_modes', version: 1,
  tables: { sessions: domainTable<string, StoredTaskModeRecord>(storedRecordSchema) },
})

/** Map one legacy selector value to its independent reasoning and quality choices. */
export function legacyModeState(mode: TaskMode): Pick<TaskModeRecord, 'reasoning' | 'quality'> {
  switch (mode) {
    case 'normal': return { reasoning: 'standard', quality: 'off' }
    case 'first-principles': return { reasoning: 'first-principles', quality: 'off' }
    case 'adversarial-review': return { reasoning: 'standard', quality: 'general-review' }
  }
}

/** Return the current-format view of either a persisted legacy or current record. */
export function normalizeRecord(record: StoredTaskModeRecord): TaskModeRecord {
  if ('mode' in record) {
    const state = legacyModeState(record.mode)
    return {
      ...state,
      updatedAt: record.updatedAt,
      reviews: record.reviews.map((review: { turn: number; status: 'completed' | 'unavailable'; text: string; createdAt: number }) => ({ ...review, profile: 'general-review' })),
    }
  }
  return record
}

/** Rewrite legacy records in place without changing the storage-domain descriptor version. */
export async function migrateLegacyRecords(table: KvTable<string, StoredTaskModeRecord>): Promise<void> {
  for (const [sessionId, record] of table.entries()) {
    if ('mode' in record) await table.put(sessionId, normalizeRecord(record))
  }
}

export function recordFor(table: KvTable<string, StoredTaskModeRecord>, sessionId: string): TaskModeRecord {
  const record = table.get(sessionId)
  return record === undefined ? DEFAULT_RECORD : normalizeRecord(record)
}

async function putRecord(table: KvTable<string, StoredTaskModeRecord>, sessionId: string, record: TaskModeRecord): Promise<TaskModeRecord> {
  await table.put(sessionId, record)
  return record
}

export async function setReasoning(
  table: KvTable<string, StoredTaskModeRecord>,
  sessionId: string,
  reasoning: ReasoningMode,
): Promise<TaskModeRecord> {
  const next = { ...recordFor(table, sessionId), reasoning, updatedAt: Date.now() }
  return putRecord(table, sessionId, next)
}

export async function setQuality(
  table: KvTable<string, StoredTaskModeRecord>,
  sessionId: string,
  quality: QualityGate,
): Promise<TaskModeRecord> {
  const next = { ...recordFor(table, sessionId), quality, updatedAt: Date.now() }
  return putRecord(table, sessionId, next)
}

export async function setLegacyMode(
  table: KvTable<string, StoredTaskModeRecord>,
  sessionId: string,
  mode: TaskMode,
): Promise<TaskModeRecord> {
  const next = { ...recordFor(table, sessionId), ...legacyModeState(mode), updatedAt: Date.now() }
  return putRecord(table, sessionId, next)
}

export async function addReview(
  table: KvTable<string, StoredTaskModeRecord>,
  sessionId: string,
  review: TaskModeReview,
): Promise<TaskModeRecord> {
  const current = recordFor(table, sessionId)
  const next = { ...current, reviews: [...current.reviews.filter(item => item.turn !== review.turn), review] }
  return putRecord(table, sessionId, next)
}

export type { StoredTaskModeRecord }
