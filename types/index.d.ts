export type ReasoningMode = 'standard' | 'first-principles'
export type QualityGate = 'off' | 'general-review' | 'acceptance-review'
export type ReviewProfile = Exclude<QualityGate, 'off'>
export type EvolutionMode = 'off' | 'propose'
export interface EvolutionConfig {
  readonly learningBatchSize: number
  readonly maxPendingProposals: number
}
export type EvolutionScope = 'global' | 'project'
export type EvolutionCategory = 'identity' | 'preference' | 'work_rule'
export type EvolutionAction = 'add' | 'update' | 'delete'

export interface EvolutionEvidence {
  readonly sessionId: string
  readonly turn: number
  readonly eventSeq: number
  readonly excerpt: string
}

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

export interface EvolutionBackup {
  readonly id: string
  readonly scope: EvolutionScope
  readonly projectRoot: string | null
  readonly source: 'proposal' | 'manual' | 'restore'
  readonly summary: string
  readonly settings: readonly EvolutionSetting[]
  readonly createdAt: number
}

export interface EvolutionLearningRun {
  readonly id: string
  readonly sessionId: string
  readonly projectRoot?: string | null
  readonly turns: readonly number[]
  readonly status: 'completed' | 'failed'
  readonly proposalCount: number
  readonly error: string | null
  readonly createdAt: number
}

export interface EvolutionState {
  readonly revision: number
  readonly config: EvolutionConfig
  readonly settings: readonly EvolutionSetting[]
  readonly proposals: readonly EvolutionProposal[]
  readonly backups: readonly EvolutionBackup[]
  readonly runs: readonly EvolutionLearningRun[]
  readonly updatedAt: number
}

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

export interface EvolutionDashboardRequest {}
export interface EvolutionConfigRequest { readonly config: EvolutionConfig }
export interface EvolutionProposalRequest extends EvolutionDashboardRequest { readonly id: string; readonly action: 'apply' | 'dismiss' }
export type EvolutionSettingMutation =
  | { readonly action: 'add'; readonly category: EvolutionCategory; readonly content: string }
  | { readonly action: 'update'; readonly id: string; readonly category: EvolutionCategory; readonly content: string }
  | { readonly action: 'delete'; readonly id: string }
export interface EvolutionSettingRequest extends EvolutionDashboardRequest { readonly mutation: EvolutionSettingMutation }
export interface EvolutionRestoreRequest extends EvolutionDashboardRequest { readonly id: string }

export interface TaskModeReview {
  readonly turn: number
  readonly profile: ReviewProfile
  readonly status: 'completed' | 'unavailable'
  readonly text: string
  readonly createdAt: number
}

/** @deprecated Use ReasoningMode and QualityGate. */
export type TaskMode = 'normal' | 'first-principles' | 'adversarial-review'
/** @deprecated Use TaskModeReview. */
export type AdversarialReview = TaskModeReview

export interface TaskModeRecord {
  readonly reasoning: ReasoningMode
  readonly quality: QualityGate
  readonly evolution: EvolutionMode
  readonly pendingEvolutionTurns: readonly number[]
  readonly updatedAt: number
  readonly reviews: readonly TaskModeReview[]
}

export interface Config { shellTool: 'bash' | 'pwsh' }
export declare const Config: unknown
export declare function apply(ctx: unknown, config: Config): Promise<void>
export declare function planAllowedTools(shellTool: Config['shellTool']): readonly string[]
export declare function isPlanToolAllowed(name: string, shellTool: Config['shellTool']): boolean
