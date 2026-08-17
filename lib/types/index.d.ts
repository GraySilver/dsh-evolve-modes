export type ReasoningMode = 'standard' | 'first-principles'
export type QualityGate = 'off' | 'general-review' | 'acceptance-review'
export type ReviewProfile = Exclude<QualityGate, 'off'>
export interface TaskModeReview { readonly turn: number; readonly profile: ReviewProfile; readonly status: 'completed' | 'unavailable'; readonly text: string; readonly createdAt: number }
/** @deprecated Use ReasoningMode and QualityGate. */
export type TaskMode = 'normal' | 'first-principles' | 'adversarial-review'
/** @deprecated Use TaskModeReview. */
export type AdversarialReview = TaskModeReview
export interface TaskModeRecord { readonly reasoning: ReasoningMode; readonly quality: QualityGate; readonly updatedAt: number; readonly reviews: readonly TaskModeReview[] }
export interface Config { shellTool: 'bash' | 'pwsh' }
export declare const Config: unknown
export declare function apply(ctx: unknown, config: Config): Promise<void>
export declare function planAllowedTools(shellTool: Config['shellTool']): readonly string[]
export declare function isPlanToolAllowed(name: string, shellTool: Config['shellTool']): boolean
