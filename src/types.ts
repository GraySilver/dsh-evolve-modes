/** Reasoning guidance selected for one persisted session. */
export type ReasoningMode = 'standard' | 'first-principles'

/** Independent post-turn quality gate selected for one persisted session. */
export type QualityGate = 'off' | 'general-review' | 'acceptance-review'

/** A quality gate that produces a review report. */
export type ReviewProfile = Exclude<QualityGate, 'off'>

/** Session-level policy for learning durable instructions from completed turns. */
export type EvolutionMode = 'off' | 'propose'

/** Global self-evolution scheduling and review limits. */
export interface EvolutionConfig {
  readonly learningBatchSize: number
  readonly maxPendingProposals: number
}

/**
 * Legacy storage scope; new learned instructions are always global.
 * @deprecated Project scope is no longer exposed.
 */
export type EvolutionScope = 'global' | 'project'

/** Stable category used to compile approved learned instructions. */
export type EvolutionCategory = 'identity' | 'preference' | 'work_rule'

/** Mutation proposed by the learning reviewer. */
export type EvolutionAction = 'add' | 'update' | 'delete'

/** Evidence copied from one durable user message. */
export interface EvolutionEvidence {
  readonly sessionId: string
  readonly turn: number
  readonly eventSeq: number
  readonly excerpt: string
}

/** Human-reviewed candidate change to learned instructions. */
export interface EvolutionProposal {
  readonly id: string
  readonly scope: EvolutionScope
  readonly projectRoot: string | null
  readonly action: EvolutionAction
  readonly category: EvolutionCategory | null
  readonly content: string | null
  readonly targetId: string | null
  readonly inference: 'explicit' | 'implicit'
  readonly deleteReason: 'explicit_denial' | 'expired' | 'replaced' | null
  readonly evidence: readonly EvolutionEvidence[]
  readonly status: 'pending' | 'applied' | 'dismissed' | 'expired'
  readonly createdAt: number
  readonly updatedAt: number
}

/** One approved instruction compiled into later model requests. */
export interface EvolutionSetting {
  readonly id: string
  readonly scope: EvolutionScope
  readonly projectRoot: string | null
  readonly category: EvolutionCategory
  readonly content: string
  readonly evidence: readonly EvolutionEvidence[]
  readonly createdAt: number
  readonly updatedAt: number
}

/** Restorable snapshot created before one approved-instruction mutation. */
export interface EvolutionBackup {
  readonly id: string
  readonly scope: EvolutionScope
  readonly projectRoot: string | null
  readonly source: 'proposal' | 'manual' | 'restore'
  readonly summary: string
  readonly settings: readonly EvolutionSetting[]
  readonly createdAt: number
}

/** Auditable result of one automatic learning batch. */
export interface EvolutionLearningRun {
  readonly id: string
  readonly sessionId: string
  /** @deprecated Learning runs are global; retained only for old stored records. */
  readonly projectRoot?: string | null
  readonly turns: readonly number[]
  readonly status: 'completed' | 'failed'
  readonly proposalCount: number
  readonly error: string | null
  readonly createdAt: number
}

/** Complete durable self-evolution state owned by the plugin. */
export interface EvolutionState {
  readonly revision: number
  readonly config: EvolutionConfig
  readonly settings: readonly EvolutionSetting[]
  readonly proposals: readonly EvolutionProposal[]
  readonly backups: readonly EvolutionBackup[]
  readonly runs: readonly EvolutionLearningRun[]
  readonly updatedAt: number
}

/** Settings-page projection for global self-evolution state. */
export interface EvolutionDashboard {
  readonly revision: number
  readonly config: EvolutionConfig
  readonly settings: readonly Omit<EvolutionSetting, 'scope' | 'projectRoot'>[]
  readonly proposals: readonly Omit<EvolutionProposal, 'scope' | 'projectRoot'>[]
  readonly backups: readonly (Omit<EvolutionBackup, 'scope' | 'projectRoot' | 'settings'> & {
    readonly settings: readonly Omit<EvolutionSetting, 'scope' | 'projectRoot'>[]
  })[]
  readonly runs: readonly EvolutionLearningRun[]
}

/** Request for the global evolution dashboard. */
export interface EvolutionDashboardRequest {}

export interface EvolutionConfigRequest {
  readonly config: EvolutionConfig
}

/** Human decision for one pending evolution proposal. */
export interface EvolutionProposalRequest extends EvolutionDashboardRequest {
  readonly id: string
  readonly action: 'apply' | 'dismiss'
}

/** Manual mutation of one approved learned instruction. */
export type EvolutionSettingMutation =
  | {
    readonly action: 'add'
    readonly category: EvolutionCategory
    readonly content: string
  }
  | {
    readonly action: 'update'
    readonly id: string
    readonly category: EvolutionCategory
    readonly content: string
  }
  | { readonly action: 'delete'; readonly id: string }

/** Manual global learned-instruction mutation. */
export interface EvolutionSettingRequest extends EvolutionDashboardRequest {
  readonly mutation: EvolutionSettingMutation
}

/** Request to restore one plugin-owned global learned-instruction backup. */
export interface EvolutionRestoreRequest extends EvolutionDashboardRequest {
  readonly id: string
}

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
  readonly evolution: EvolutionMode
  readonly pendingEvolutionTurns: readonly number[]
  readonly updatedAt: number
  readonly reviews: readonly TaskModeReview[]
}
