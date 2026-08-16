export type TaskMode = 'normal' | 'first-principles' | 'adversarial-review'
export interface AdversarialReview { readonly turn: number; readonly status: 'completed' | 'unavailable'; readonly text: string; readonly createdAt: number }
export interface TaskModeRecord { readonly mode: TaskMode; readonly updatedAt: number; readonly reviews: readonly AdversarialReview[] }
export interface Config { shellTool: 'bash' | 'pwsh' }
export declare const Config: unknown
export declare function apply(ctx: unknown, config: Config): Promise<void>
