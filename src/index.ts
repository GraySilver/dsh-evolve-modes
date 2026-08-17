import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-plan-mode'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { learnFromTurns } from './evolution/learning.ts'
import { compileLearnedInstructions } from './evolution/prompt.ts'
import { TaskModesEvolutionService } from './evolution/service.ts'
import { evolutionDomain, EvolutionStore } from './evolution/store.ts'
import { FIRST_PRINCIPLES } from './prompt.ts'
import {
  addReview,
  migrateLegacyRecords,
  queueEvolutionTurn,
  recordFor,
  setEvolution,
  setLegacyMode,
  setQuality,
  setReasoning,
  taskModesDomain,
} from './storage.ts'
import type {
  EvolutionMode,
  QualityGate,
  ReasoningMode,
  ReviewProfile,
  TaskMode,
  TaskModeRecord,
  TaskModeReview,
} from './types.ts'

const READ_ONLY_REVIEW_TOOLS = ['read', 'glob', 'grep', 'read_image'] as const
const PLAN_EXIT_TOOL = 'exit_plan_mode'

export interface Config { shellTool: 'bash' | 'pwsh' }
export const Config: z<Config> = z.object({ shellTool: z.union(['bash', 'pwsh'] as const).required() })

interface ReviewInput {
  readonly task: string
  readonly candidate: string
  readonly candidateKind: 'answer' | 'approved-plan'
}

/** Return the complete Plan-mode allow-list for a configured platform shell. */
export function planAllowedTools(shellTool: Config['shellTool']): readonly string[] {
  return [...READ_ONLY_REVIEW_TOOLS, shellTool, PLAN_EXIT_TOOL]
}

/** Test whether a requested tool may execute while official Plan mode is active. */
export function isPlanToolAllowed(name: string, shellTool: Config['shellTool']): boolean {
  return planAllowedTools(shellTool).includes(name)
}

function textContent(content: readonly { type: string; text?: string }[]): string {
  return content.flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n')
}

function exitPlanText(argumentsText: string): string | undefined {
  try {
    const value: unknown = JSON.parse(argumentsText)
    if (typeof value !== 'object' || value === null || !('plan' in value) || typeof value.plan !== 'string') return undefined
    const plan = value.plan.trim()
    return plan === '' ? undefined : plan
  } catch {
    return undefined
  }
}

function currentTurnInput(agent: Agent, turn: number): ReviewInput | undefined {
  const start = agent.session.events.findLastIndex(event => event.type === 'turn/start' && event.data.turn === turn)
  if (start === -1) return undefined
  const tasks: string[] = []
  const planCalls = new Map<string, string>()
  let answer = ''
  let approvedPlan = ''
  for (const event of agent.session.events.slice(start + 1)) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const text = textContent(event.data.content)
      if (text !== '') tasks.push(text)
      continue
    }
    if (event.type === 'assistant/message') {
      answer = textContent(event.data.message.content)
      continue
    }
    if (event.type === 'tool/call' && event.data.name === PLAN_EXIT_TOOL) {
      const plan = exitPlanText(event.data.arguments)
      if (plan !== undefined) planCalls.set(String(event.data.callId), plan)
      continue
    }
    if (event.type === 'tool/result' && event.data.message.content[0].isError !== true) {
      const plan = planCalls.get(String(event.data.message.source.callId))
      if (plan !== undefined) approvedPlan = plan
    }
  }
  const task = tasks.join('\n\n')
  if (task === '') return undefined
  if (approvedPlan !== '') return { task, candidate: approvedPlan, candidateKind: 'approved-plan' }
  return answer === '' ? undefined : { task, candidate: answer, candidateKind: 'answer' }
}

/** Build a profile-specific reviewer prompt for one completed parent turn. */
export function reviewPrompt(profile: ReviewProfile, input: ReviewInput): string {
  const subject = input.candidateKind === 'approved-plan' ? 'Approved plan' : 'Candidate answer'
  if (profile === 'general-review') {
    return `Review the current task and ${subject.toLowerCase()}. Identify unmet requirements, unsupported claims, omissions, regressions, counterexamples, and security risks. Use inspection tools only when evidence is needed. The shell is for non-mutating inspection only. Do not modify files or start background processes. Return a structured Markdown verdict with evidence and concrete follow-up actions.\n\nCurrent task:\n${input.task}\n\n${subject}:\n${input.candidate}`
  }
  return `Independently assess whether the ${subject.toLowerCase()} satisfies the current task. Compare every explicit requirement with the available evidence and the approved plan when one is present. Do not modify files, retry work, or run project test, lint, or build commands. Use inspection tools only when evidence is needed. Return a concise Markdown checklist with these headings: Met, Gap, Unverified, Evidence, and Concrete follow-up. Every checklist item must name the requirement it addresses.\n\nCurrent task:\n${input.task}\n\n${subject}:\n${input.candidate}`
}

async function reviewTurn(
  scope: Context,
  agent: Agent,
  turn: number,
  signal: AbortSignal,
  shellTool: Config['shellTool'],
  profile: ReviewProfile,
): Promise<TaskModeReview | undefined> {
  const input = currentTurnInput(agent, turn)
  if (input === undefined) return undefined
  const unavailable = (text: string): TaskModeReview => ({ turn, profile, status: 'unavailable', text, createdAt: Date.now() })
  if (scope.subagents.getProvider('fork') === undefined) return unavailable('The fork subagent provider is unavailable.')
  try {
    const run = await scope.subagents.start('fork', {
      parent: agent,
      signal,
      label: profile,
      toolFilter: { allow: [...READ_ONLY_REVIEW_TOOLS, shellTool] },
      prompt: [{ type: 'text', text: reviewPrompt(profile, input) }],
    })
    try {
      const result = await run.result
      const text = result.output.map(block => block.type === 'text' ? block.text : '').join('')
      return result.stopReason === 'completed'
        ? { turn, profile, status: 'completed', text: text || 'Review completed without a text report.', createdAt: Date.now() }
        : unavailable(`The reviewer did not complete (${result.stopReason}).`)
    } finally {
      await run.dispose()
    }
  } catch (error: unknown) {
    return unavailable(error instanceof Error ? error.message : String(error))
  }
}

function isReasoningMode(value: string): value is ReasoningMode {
  return value === 'standard' || value === 'first-principles'
}

function isQualityGate(value: string): value is QualityGate {
  return value === 'off' || value === 'general-review' || value === 'acceptance-review'
}

function isEvolutionMode(value: string): value is EvolutionMode {
  return value === 'off' || value === 'propose'
}

function isLegacyMode(value: string): value is TaskMode {
  return value === 'normal' || value === 'first-principles' || value === 'adversarial-review'
}

/** Mount independent task controls, quality reviews, and human-approved self-evolution. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  await ctx.inject(['agentPresets', 'commands', 'llm', 'systemPrompt', 'subagents', 'storageDomain', 'tools'], async (scope: Context) => {
    const domain = await scope.storageDomain.open(taskModesDomain)
    const records = domain.table('sessions')
    await migrateLegacyRecords(records)
    scope.effect(() => () => domain.close(), 'dsh-task-modes: storage close')
    const evolutionStateDomain = await scope.storageDomain.open(evolutionDomain)
    const evolutionStore = new EvolutionStore(evolutionStateDomain.global)
    scope.effect(() => () => evolutionStateDomain.close(), 'dsh-task-modes: evolution storage close')
    new TaskModesEvolutionService(scope, evolutionStore)

    const stateOf = (agent: Agent): TaskModeRecord => recordFor(records, String(agent.session.id))
    const planModeFor = (agent: Agent): Context['planMode'] | undefined => {
      return scope.agentPresets.serviceFor(agent, 'planMode')
    }
    const workingOf = (agent: Agent): 'execute' | 'plan' => {
      const plan = planModeFor(agent)?.get(agent)
      if (plan === undefined) return 'execute'
      return (plan.pending ?? plan.active) ? 'plan' : 'execute'
    }
    const stateText = (agent: Agent): string => {
      const current = stateOf(agent)
      return [
        `working: ${workingOf(agent)}`,
        `reasoning: ${current.reasoning}`,
        `quality: ${current.quality}`,
        `evolution: ${current.evolution}`,
        `learning-batch-size: ${evolutionStore.config().learningBatchSize}`,
        `max-pending-proposals: ${evolutionStore.config().maxPendingProposals}`,
        `pending-evolution-turns: ${current.pendingEvolutionTurns.length}`,
      ].join('\n')
    }

    scope.effect(() => scope.systemPrompt.section({
      name: 'task-mode:first-principles',
      order: 80,
      text: ({ agent }) => agent !== undefined && stateOf(agent).reasoning === 'first-principles' ? FIRST_PRINCIPLES : '',
    }), 'dsh-task-modes: first-principles prompt')

    scope.effect(() => scope.systemPrompt.section({
      name: 'task-mode:evolution',
      order: 81,
      text: ({ agent }) => agent === undefined
        ? ''
        : compileLearnedInstructions(evolutionStore.state()),
    }), 'dsh-task-modes: learned instructions prompt')

    scope.effect(() => scope.on('tools/pre-execute', async (execution, next) => {
      if (execution.agent === undefined || !planModeFor(execution.agent)?.get(execution.agent).active) return next()
      if (isPlanToolAllowed(execution.name, config.shellTool)) return next()
      return {
        kind: 'deny',
        reason: `Plan mode allows only ${planAllowedTools(config.shellTool).join(', ')}. Switch to Execute mode before running ${execution.name}.`,
      }
    }), 'dsh-task-modes: plan tool policy')

    scope.effect(() => scope.commands.register({
      name: 'task-mode',
      description: 'Select independent working, reasoning, quality, and self-evolution task controls.',
      recordInput: false,
      handler: async ({ agent, rawInput }) => {
        const input = rawInput.trim()
        const current = stateOf(agent)
        if (input === '') return { kind: 'success', text: stateText(agent) }

        const reviewMatch = /^review\s+(\d+)$/u.exec(input)
        if (reviewMatch !== null) {
          const turn = Number(reviewMatch[1])
          if (!Number.isSafeInteger(turn) || turn < 0) return { kind: 'error', text: 'task-mode review expects a non-negative integer turn' }
          return { kind: 'success', text: current.reviews.find(review => review.turn === turn)?.text ?? '' }
        }
        if (input === 'reviews') {
          return {
            kind: 'success',
            text: current.reviews.map(review => `## Turn ${review.turn} - ${review.profile} (${review.status})\n\n${review.text}`).join('\n\n') || 'No quality reviews yet.',
          }
        }

        if (isLegacyMode(input)) {
          await setLegacyMode(records, String(agent.session.id), input)
          planModeFor(agent)?.set(agent, false)
          return { kind: 'success', text: stateText(agent) }
        }

        const batchSizeMatch = /^evolution\s+batch-size\s+(\S+)$/u.exec(input)
        if (batchSizeMatch !== null) {
          const learningBatchSize = Number(batchSizeMatch[1])
          if (!Number.isSafeInteger(learningBatchSize) || learningBatchSize < 1 || learningBatchSize > 100) {
            return { kind: 'error', text: 'task-mode evolution batch-size expects an integer from 1 to 100' }
          }
          await evolutionStore.setConfig({ ...evolutionStore.config(), learningBatchSize })
          return { kind: 'success', text: stateText(agent) }
        }

        const proposalLimitMatch = /^evolution\s+max-pending-proposals\s+(\S+)$/u.exec(input)
        if (proposalLimitMatch !== null) {
          const maxPendingProposals = Number(proposalLimitMatch[1])
          if (!Number.isSafeInteger(maxPendingProposals) || maxPendingProposals < 1 || maxPendingProposals > 1000) {
            return { kind: 'error', text: 'task-mode evolution max-pending-proposals expects an integer from 1 to 1000' }
          }
          await evolutionStore.setConfig({ ...evolutionStore.config(), maxPendingProposals })
          return { kind: 'success', text: stateText(agent) }
        }

        const [axis, value, extra] = input.split(/\s+/u)
        if (extra !== undefined) return { kind: 'error', text: 'task-mode expects one axis and one value' }
        if (axis === 'working' && (value === 'execute' || value === 'plan')) {
          const planMode = planModeFor(agent)
          if (planMode === undefined) {
            return {
              kind: 'error',
              text: 'The current agent preset does not mount @deepseek-ai/dsh-plan-mode.',
            }
          }
          planMode.set(agent, value === 'plan')
          return { kind: 'success', text: stateText(agent) }
        }
        if (axis === 'reasoning' && value !== undefined && isReasoningMode(value)) {
          await setReasoning(records, String(agent.session.id), value)
          return { kind: 'success', text: stateText(agent) }
        }
        if (axis === 'quality' && value !== undefined && isQualityGate(value)) {
          await setQuality(records, String(agent.session.id), value)
          return { kind: 'success', text: stateText(agent) }
        }
        if (axis === 'evolution' && value !== undefined && isEvolutionMode(value)) {
          await setEvolution(records, String(agent.session.id), value)
          return { kind: 'success', text: stateText(agent) }
        }
        return {
          kind: 'error',
          text: 'task-mode expects working <execute|plan>, reasoning <standard|first-principles>, quality <off|general-review|acceptance-review>, evolution <off|propose>, evolution batch-size <1..100>, evolution max-pending-proposals <1..1000>, review <turn>, reviews, or a legacy mode alias',
        }
      },
    }), 'dsh-task-modes: task-mode command')

    scope.effect(() => scope.commands.register({
      name: 'task-mode-review',
      description: 'Internal Web reader for one task-mode review record.',
      recordInput: false,
      handler: async ({ agent, rawInput }) => {
        const turn = Number(rawInput.trim())
        if (!Number.isSafeInteger(turn) || turn < 0) return { kind: 'error', text: 'task-mode-review expects a non-negative integer turn' }
        const review = stateOf(agent).reviews.find(item => item.turn === turn)
        return { kind: 'success', text: review === undefined ? '' : JSON.stringify(review) }
      },
    }), 'dsh-task-modes: task-mode-review command')

    scope.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
      const state = stateOf(agent)
      const batch = state.evolution === 'propose'
        ? await queueEvolutionTurn(records, String(agent.session.id), turn, evolutionStore.config().learningBatchSize)
        : []
      if (state.quality === 'off' && batch.length === 0) return
      const [review] = await Promise.all([
        state.quality === 'off'
          ? Promise.resolve(undefined)
          : reviewTurn(scope, agent, turn, signal, config.shellTool, state.quality),
        batch.length === 0
          ? Promise.resolve()
          : learnFromTurns(scope, agent, batch, signal, evolutionStore, records),
      ])
      if (review !== undefined) await addReview(records, String(agent.session.id), review)
    })
  })
}

export type {
  AdversarialReview,
  EvolutionAction,
  EvolutionBackup,
  EvolutionCategory,
  EvolutionConfig,
  EvolutionConfigRequest,
  EvolutionDashboard,
  EvolutionDashboardRequest,
  EvolutionEvidence,
  EvolutionLearningRun,
  EvolutionMode,
  EvolutionProposal,
  EvolutionProposalRequest,
  EvolutionRestoreRequest,
  EvolutionScope,
  EvolutionSetting,
  EvolutionSettingMutation,
  EvolutionSettingRequest,
  EvolutionState,
  QualityGate,
  ReasoningMode,
  ReviewProfile,
  TaskMode,
  TaskModeRecord,
  TaskModeReview,
} from './types.ts'
