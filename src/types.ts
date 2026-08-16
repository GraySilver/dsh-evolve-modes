/** The task-execution strategy selected for one persisted session. */
export type TaskMode = 'normal' | 'first-principles' | 'adversarial-review'

/** One read-only review of a completed parent turn. */
export interface AdversarialReview {
  readonly turn: number
  readonly status: 'completed' | 'unavailable'
  readonly text: string
  readonly createdAt: number
}

/** Full plugin-owned durable state for one session. */
export interface TaskModeRecord {
  readonly mode: TaskMode
  readonly updatedAt: number
  readonly reviews: readonly AdversarialReview[]
}
