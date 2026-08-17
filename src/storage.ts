import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type {
  EvolutionMode,
  QualityGate,
  ReasoningMode,
  EvolveModeLegacyAlias,
  EvolveModeRecord,
  EvolveModeReview,
} from './types.ts'

const legacyModeSchema = z.enum(['normal', 'first-principles', 'adversarial-review'])
const reviewSchema = z.object({
  turn: z.number().int().nonnegative(),
  profile: z.enum(['general-review', 'acceptance-review']),
  status: z.enum(['completed', 'unavailable']),
  text: z.string(),
  createdAt: z.number().int().nonnegative(),
}).strict()
const legacyReviewSchema = reviewSchema.omit({ profile: true })
const legacyEvolutionRecordSchema = z.object({
  reasoning: z.enum(['standard', 'first-principles']),
  quality: z.enum(['off', 'general-review', 'acceptance-review']),
  evolution: z.enum(['off', 'propose']),
  learningBatchSize: z.number().int().min(1).max(100),
  pendingEvolutionTurns: z.array(z.number().int().nonnegative()),
  updatedAt: z.number().int().nonnegative(),
  reviews: z.array(reviewSchema),
}).strict()
const recordSchema = z.object({
  reasoning: z.enum(['standard', 'first-principles']),
  quality: z.enum(['off', 'general-review', 'acceptance-review']),
  evolution: z.enum(['off', 'propose']),
  pendingEvolutionTurns: z.array(z.number().int().nonnegative()),
  updatedAt: z.number().int().nonnegative(),
  reviews: z.array(reviewSchema),
}).strict()
const axesRecordSchema = z.object({
  reasoning: z.enum(['standard', 'first-principles']),
  quality: z.enum(['off', 'general-review', 'acceptance-review']),
  updatedAt: z.number().int().nonnegative(),
  reviews: z.array(reviewSchema),
}).strict()
const legacyRecordSchema = z.object({
  mode: legacyModeSchema,
  updatedAt: z.number().int().nonnegative(),
  reviews: z.array(legacyReviewSchema),
}).strict()
const storedRecordSchema = z.union([recordSchema, legacyEvolutionRecordSchema, axesRecordSchema, legacyRecordSchema])

export type StoredEvolveModeRecord = z.infer<typeof storedRecordSchema>
type CurrentStoredEvolveModeRecord = z.infer<typeof recordSchema>

const DEFAULT_RECORD: EvolveModeRecord = {
  reasoning: 'standard',
  quality: 'off',
  evolution: 'propose',
  pendingEvolutionTurns: [],
  updatedAt: 0,
  reviews: [],
}

/** Plugin-owned storage. It avoids custom DSH session events so old harnesses can reopen a session safely. */
export const evolveModesDomain = defineDomain({
  name: 'graysilver_dsh_evolve_modes', version: 1,
  tables: { sessions: domainTable<string, StoredEvolveModeRecord>(storedRecordSchema) },
})

/** Read-only migration source for installations using the former package identity. */
export const legacyEvolveModesDomain = defineDomain({
  name: 'graysilver_task_modes', version: 1,
  tables: { sessions: domainTable<string, StoredEvolveModeRecord>(storedRecordSchema) },
})

/** Map one legacy selector value to its independent reasoning and quality choices. */
export function legacyModeState(mode: EvolveModeLegacyAlias): Pick<EvolveModeRecord, 'reasoning' | 'quality'> {
  switch (mode) {
    case 'normal': return { reasoning: 'standard', quality: 'off' }
    case 'first-principles': return { reasoning: 'first-principles', quality: 'off' }
    case 'adversarial-review': return { reasoning: 'standard', quality: 'general-review' }
  }
}

/** Return the current-format view of either a persisted legacy or current record. */
export function normalizeRecord(record: StoredEvolveModeRecord): EvolveModeRecord {
  if ('mode' in record) {
    const state = legacyModeState(record.mode)
    return {
      ...state,
      evolution: 'propose',
      pendingEvolutionTurns: [],
      updatedAt: record.updatedAt,
      reviews: record.reviews.map((review: { turn: number; status: 'completed' | 'unavailable'; text: string; createdAt: number }) => ({ ...review, profile: 'general-review' })),
    }
  }
  if (!('evolution' in record)) {
    return {
      ...record,
      evolution: 'propose',
      pendingEvolutionTurns: [],
    }
  }
  if ('learningBatchSize' in record) {
    const { learningBatchSize: _learningBatchSize, ...current } = record
    return current
  }
  return record
}

/** Rewrite legacy records in place without changing the storage-domain descriptor version. */
export async function migrateLegacyRecords(table: KvTable<string, StoredEvolveModeRecord>): Promise<void> {
  for (const [sessionId, record] of table.entries()) {
    if ('mode' in record || !('evolution' in record) || 'learningBatchSize' in record) {
      await table.put(sessionId, storedRecord(normalizeRecord(record)))
    }
  }
}

/** Copy records from the renamed storage domain without overwriting new-domain state. */
export async function migrateRenamedModeRecords(
  target: KvTable<string, StoredEvolveModeRecord>,
  legacy: KvTable<string, StoredEvolveModeRecord>,
): Promise<void> {
  for (const [sessionId, record] of legacy.entries()) {
    if (target.get(sessionId) === undefined) {
      await target.put(sessionId, storedRecord(normalizeRecord(record)))
    }
  }
}

export function recordFor(table: KvTable<string, StoredEvolveModeRecord>, sessionId: string): EvolveModeRecord {
  const record = table.get(sessionId)
  return record === undefined ? DEFAULT_RECORD : normalizeRecord(record)
}

async function putRecord(table: KvTable<string, StoredEvolveModeRecord>, sessionId: string, record: EvolveModeRecord): Promise<EvolveModeRecord> {
  await table.put(sessionId, storedRecord(record))
  return record
}

function storedRecord(record: EvolveModeRecord): CurrentStoredEvolveModeRecord {
  return {
    ...record,
    pendingEvolutionTurns: [...record.pendingEvolutionTurns],
    reviews: record.reviews.map(review => ({ ...review })),
  }
}

export async function setReasoning(
  table: KvTable<string, StoredEvolveModeRecord>,
  sessionId: string,
  reasoning: ReasoningMode,
): Promise<EvolveModeRecord> {
  const next = { ...recordFor(table, sessionId), reasoning, updatedAt: Date.now() }
  return putRecord(table, sessionId, next)
}

export async function setQuality(
  table: KvTable<string, StoredEvolveModeRecord>,
  sessionId: string,
  quality: QualityGate,
): Promise<EvolveModeRecord> {
  const next = { ...recordFor(table, sessionId), quality, updatedAt: Date.now() }
  return putRecord(table, sessionId, next)
}

export async function setEvolution(
  table: KvTable<string, StoredEvolveModeRecord>,
  sessionId: string,
  evolution: EvolutionMode,
): Promise<EvolveModeRecord> {
  const next = { ...recordFor(table, sessionId), evolution, updatedAt: Date.now() }
  return putRecord(table, sessionId, next)
}

/** Add one eligible parent turn and return the accumulated batch when it reaches its threshold. */
export async function queueEvolutionTurn(
  table: KvTable<string, StoredEvolveModeRecord>,
  sessionId: string,
  turn: number,
  learningBatchSize = 3,
): Promise<readonly number[]> {
  const current = recordFor(table, sessionId)
  if (current.evolution === 'off') return []
  const pendingEvolutionTurns = current.pendingEvolutionTurns.includes(turn)
    ? current.pendingEvolutionTurns
    : [...current.pendingEvolutionTurns, turn]
  await putRecord(table, sessionId, { ...current, pendingEvolutionTurns, updatedAt: Date.now() })
  return pendingEvolutionTurns.length >= learningBatchSize ? pendingEvolutionTurns : []
}

/** Remove turns from the pending learning batch after a successful analysis. */
export async function completeEvolutionBatch(
  table: KvTable<string, StoredEvolveModeRecord>,
  sessionId: string,
  turns: readonly number[],
): Promise<EvolveModeRecord> {
  const completed = new Set(turns)
  const current = recordFor(table, sessionId)
  return putRecord(table, sessionId, {
    ...current,
    pendingEvolutionTurns: current.pendingEvolutionTurns.filter(turn => !completed.has(turn)),
    updatedAt: Date.now(),
  })
}

export async function setLegacyMode(
  table: KvTable<string, StoredEvolveModeRecord>,
  sessionId: string,
  mode: EvolveModeLegacyAlias,
): Promise<EvolveModeRecord> {
  const next = { ...recordFor(table, sessionId), ...legacyModeState(mode), updatedAt: Date.now() }
  return putRecord(table, sessionId, next)
}

export async function addReview(
  table: KvTable<string, StoredEvolveModeRecord>,
  sessionId: string,
  review: EvolveModeReview,
): Promise<EvolveModeRecord> {
  const current = recordFor(table, sessionId)
  const next = { ...current, reviews: [...current.reviews.filter(item => item.turn !== review.turn), review] }
  return putRecord(table, sessionId, next)
}
