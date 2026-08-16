import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { addReview, recordFor, setMode, taskModesDomain } from './storage.ts'
import type { AdversarialReview, TaskMode } from './types.ts'

const FIRST_PRINCIPLES = 'For this task, reason from first principles. State the objective and success criteria, separate verified facts from assumptions, identify hard constraints, derive the solution from those facts, and describe how you will verify the result. Do not treat conventions or guesses as requirements.'
const READ_ONLY_REVIEW_TOOLS = ['read', 'glob', 'grep', 'read_image'] as const

export interface Config { shellTool: 'bash' | 'pwsh' }
export const Config: z<Config> = z.object({ shellTool: z.union(['bash', 'pwsh'] as const).required() })

function textContent(content: readonly { type: string; text?: string }[]): string { return content.flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n') }
function currentTurnInput(agent: Agent, turn: number): { task: string; answer: string } | undefined {
  const start = agent.session.events.findLastIndex(event => event.type === 'turn/start' && event.data.turn === turn)
  if (start === -1) return undefined
  const tasks: string[] = []; let answer = ''
  for (const event of agent.session.events.slice(start + 1)) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') { const text = textContent(event.data.content); if (text !== '') tasks.push(text) }
    if (event.type === 'assistant/message') answer = textContent(event.data.message.content)
  }
  const task = tasks.join('\n\n'); return task === '' || answer === '' ? undefined : { task, answer }
}
async function reviewTurn(scope: Context, agent: Agent, turn: number, signal: AbortSignal, shellTool: Config['shellTool']): Promise<AdversarialReview | undefined> {
  const input = currentTurnInput(agent, turn); if (input === undefined) return undefined
  const unavailable = (text: string): AdversarialReview => ({ turn, status: 'unavailable', text, createdAt: Date.now() })
  if (scope.subagents.getProvider('fork') === undefined) return unavailable('The fork subagent provider is unavailable.')
  try {
    const run = await scope.subagents.start('fork', { parent: agent, signal, label: 'adversarial-review', toolFilter: { allow: [...READ_ONLY_REVIEW_TOOLS, shellTool] }, prompt: [{ type: 'text', text: `Review the current task and candidate answer. Identify unmet requirements, unsupported claims, omissions, regressions, counterexamples, and security risks. Use inspection tools only when evidence is needed. The shell is for non-mutating inspection only. Do not modify files or start background processes. Return a structured Markdown verdict with evidence and concrete follow-up actions.\n\nCurrent task:\n${input.task}\n\nCandidate answer:\n${input.answer}` }] })
    const result = await run.result; await run.dispose()
    const text = result.output.map(block => block.type === 'text' ? block.text : '').join('')
    return result.stopReason === 'completed' ? { turn, status: 'completed', text: text || 'Review completed without a text report.', createdAt: Date.now() } : unavailable(`The reviewer did not complete (${result.stopReason}).`)
  } catch (error: unknown) { return unavailable(error instanceof Error ? error.message : String(error)) }
}

/** Mount commands, first-principles prompting, and persisted adversarial review. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  await ctx.inject(['commands', 'systemPrompt', 'subagents', 'storageDomain'], async (scope: Context) => {
    const domain = await scope.storageDomain.open(taskModesDomain)
    const records = domain.table('sessions')
    scope.effect(() => () => domain.close(), 'dsh-task-modes: storage close')
    const modeOf = (agent: Agent): TaskMode => recordFor(records, String(agent.session.id)).mode
    scope.effect(() => scope.systemPrompt.section({ name: 'task-mode:first-principles', order: 80, text: ({ agent }) => agent !== undefined && modeOf(agent) === 'first-principles' ? FIRST_PRINCIPLES : '' }), 'dsh-task-modes: first-principles prompt')
    scope.effect(() => scope.commands.register({
      name: 'task-mode',
      description: 'Select normal, first-principles, or adversarial-review task execution.',
      recordInput: false,
      handler: async ({ agent, rawInput }) => {
        const input = rawInput.trim()
        const current = recordFor(records, String(agent.session.id))
        if (input === '') return { kind: 'success', text: `task mode: ${current.mode}` }
        const reviewTurn = /^review\s+(\d+)$/u.exec(input)
        if (reviewTurn !== null) {
          const turn = Number(reviewTurn[1])
          if (!Number.isSafeInteger(turn)) return { kind: 'error', text: 'task-mode review expects a non-negative integer turn' }
          return { kind: 'success', text: current.reviews.find(review => review.turn === turn)?.text ?? '' }
        }
        if (input === 'reviews') {
          return { kind: 'success', text: current.reviews.map(review => `## Turn ${review.turn} - ${review.status}\n\n${review.text}`).join('\n\n') || 'No adversarial reviews yet.' }
        }
        if (input !== 'normal' && input !== 'first-principles' && input !== 'adversarial-review') {
          return { kind: 'error', text: 'task-mode expects normal, first-principles, adversarial-review, review <turn>, or reviews' }
        }
        await setMode(records, String(agent.session.id), input)
        return { kind: 'success', text: `task mode: ${input}` }
      },
    }), 'dsh-task-modes: task-mode command')
    scope.on('agent/turn-stopping', async ({ agent, turn, signal }) => { if (modeOf(agent) !== 'adversarial-review') return; const review = await reviewTurn(scope, agent, turn, signal, config.shellTool); if (review !== undefined) await addReview(records, String(agent.session.id), review) })
  })
}

export type { AdversarialReview, TaskMode, TaskModeRecord } from './types.ts'
