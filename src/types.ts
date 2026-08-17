/** Reasoning guidance selected for one persisted session. */
export type ReasoningMode = 'standard' | 'first-principles'

/** Independent post-turn quality gate selected for one persisted session. */
export type QualityGate = 'off' | 'general-review' | 'acceptance-review'

/** A quality gate that produces a review report. */
export type ReviewProfile = Exclude<QualityGate, 'off'>

/** One advisory review of a completed parent turn. */
export interface TaskModeReview {
  readonly turn: number
  readonly profile: ReviewProfile
  readonly status: 'completed' | 'unavailable'
  readonly text: string
  readonly createdAt: number
}

/**
 * Legacy mutually-exclusive selector retained for source compatibility through
 * the 0.2.x release line. New callers should use {@link ReasoningMode} and
 * {@link QualityGate} independently.
 * @deprecated Use `ReasoningMode` and `QualityGate`.
 */
export type TaskMode = 'normal' | 'first-principles' | 'adversarial-review'

/** @deprecated Use {@link TaskModeReview}. */
export type AdversarialReview = TaskModeReview

/** Full plugin-owned durable state for one session. */
export interface TaskModeRecord {
  readonly reasoning: ReasoningMode
  readonly quality: QualityGate
  readonly updatedAt: number
  readonly reviews: readonly TaskModeReview[]
}
