import z from '@deepseek-ai/schemastery'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z as zod } from 'zod'

const FIRST_PRINCIPLES = 'For this task, reason from first principles. State the objective and success criteria, separate verified facts from assumptions, identify hard constraints, derive the solution from those facts, and describe how you will verify the result. Do not treat conventions or guesses as requirements.'
const READ_ONLY_REVIEW_TOOLS = ['read', 'glob', 'grep', 'read_image']
const reviewSchema = zod.object({ turn: zod.number().int().nonnegative(), status: zod.enum(['completed', 'unavailable']), text: zod.string(), createdAt: zod.number().int().nonnegative() })
const recordSchema = zod.object({ mode: zod.enum(['normal', 'first-principles', 'adversarial-review']), updatedAt: zod.number().int().nonnegative(), reviews: zod.array(reviewSchema) })
const taskModesDomain = defineDomain({ name: 'graysilver_task_modes', version: 1, tables: { sessions: domainTable(recordSchema) } })

export const Config = z.object({ shellTool: z.union(['bash', 'pwsh']).required() })

function recordFor(table, sessionId) { return table.get(sessionId) ?? { mode: 'normal', updatedAt: 0, reviews: [] } }
function textContent(content) { return content.flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n') }
function currentTurnInput(agent, turn) {
  const start = agent.session.events.findLastIndex(event => event.type === 'turn/start' && event.data.turn === turn)
  if (start === -1) return undefined
  const tasks = []; let answer = ''
  for (const event of agent.session.events.slice(start + 1)) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') { const text = textContent(event.data.content); if (text) tasks.push(text) }
    if (event.type === 'assistant/message') answer = textContent(event.data.message.content)
  }
  const task = tasks.join('\n\n'); return task && answer ? { task, answer } : undefined
}
async function reviewTurn(scope, agent, turn, signal, shellTool) {
  const input = currentTurnInput(agent, turn); if (!input) return undefined
  const unavailable = text => ({ turn, status: 'unavailable', text, createdAt: Date.now() })
  if (scope.subagents.getProvider('fork') === undefined) return unavailable('The fork subagent provider is unavailable.')
  try {
    const run = await scope.subagents.start('fork', { parent: agent, signal, label: 'adversarial-review', toolFilter: { allow: [...READ_ONLY_REVIEW_TOOLS, shellTool] }, prompt: [{ type: 'text', text: `Review the current task and candidate answer. Identify unmet requirements, unsupported claims, omissions, regressions, counterexamples, and security risks. Use inspection tools only when evidence is needed. The shell is for non-mutating inspection only. Do not modify files or start background processes. Return a structured Markdown verdict with evidence and concrete follow-up actions.\n\nCurrent task:\n${input.task}\n\nCandidate answer:\n${input.answer}` }] })
    const result = await run.result; await run.dispose()
    const text = result.output.map(block => block.type === 'text' ? block.text : '').join('')
    return result.stopReason === 'completed' ? { turn, status: 'completed', text: text || 'Review completed without a text report.', createdAt: Date.now() } : unavailable(`The reviewer did not complete (${result.stopReason}).`)
  } catch (error) { return unavailable(error instanceof Error ? error.message : String(error)) }
}

/** Mount the persisted task-mode command, prompt section, and review hook. */
export async function apply(ctx, config) {
  await ctx.inject(['commands', 'systemPrompt', 'subagents', 'storageDomain'], async scope => {
    const domain = await scope.storageDomain.open(taskModesDomain)
    const records = domain.table('sessions')
    scope.effect(() => () => domain.close(), 'dsh-task-modes: storage close')
    const modeOf = agent => recordFor(records, String(agent.session.id)).mode
    scope.effect(() => scope.systemPrompt.section({ name: 'task-mode:first-principles', order: 80, text: ({ agent }) => agent && modeOf(agent) === 'first-principles' ? FIRST_PRINCIPLES : '' }), 'dsh-task-modes: first-principles prompt')
    scope.effect(() => scope.commands.register({ name: 'task-mode', description: 'Select normal, first-principles, or adversarial-review task execution.', recordInput: false, handler: async ({ agent, rawInput }) => {
      const sessionId = String(agent.session.id); const input = rawInput.trim(); const current = recordFor(records, sessionId)
      if (input === '') return { kind: 'success', text: `task mode: ${current.mode}` }
      if (input === 'reviews') return { kind: 'success', text: current.reviews.map(review => `## Turn ${review.turn} - ${review.status}\n\n${review.text}`).join('\n\n') || 'No adversarial reviews yet.' }
      if (!['normal', 'first-principles', 'adversarial-review'].includes(input)) return { kind: 'error', text: 'task-mode expects normal, first-principles, adversarial-review, or reviews' }
      await records.put(sessionId, { ...current, mode: input, updatedAt: Date.now() })
      return { kind: 'success', text: `task mode: ${input}` }
    }), 'dsh-task-modes: task-mode command')
    scope.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
      if (modeOf(agent) !== 'adversarial-review') return
      const review = await reviewTurn(scope, agent, turn, signal, config.shellTool)
      if (!review) return
      const sessionId = String(agent.session.id); const current = recordFor(records, sessionId)
      await records.put(sessionId, { ...current, reviews: [...current.reviews.filter(item => item.turn !== turn), review] })
    })
  })
}
