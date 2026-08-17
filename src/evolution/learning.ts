import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, deepFreeze } from '@deepseek-ai/dsh-llm'
import type { FinishReason, GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { completeEvolutionBatch } from '../storage.ts'
import type { StoredTaskModeRecord } from '../storage.ts'
import type { EvolutionProposal, EvolutionSetting } from '../types.ts'
import { evolutionMessages } from './messages.ts'
import {
  EVOLUTION_LEARNING_SYSTEM_PROMPT,
  evolutionLearningPrompt,
  evolutionLearningRepairPrompt,
  parseEvolutionLearningResult,
} from './prompt.ts'
import type { EvolutionLearningInput } from './prompt.ts'
import type { EvolutionProposalDraft, EvolutionStore } from './store.ts'

function relevantState(
  store: EvolutionStore,
): { readonly settings: readonly EvolutionSetting[]; readonly proposals: readonly EvolutionProposal[] } {
  const state = store.state()
  return { settings: state.settings, proposals: state.proposals }
}

function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'stop':
      return undefined
    case 'error':
    case 'aborted': {
      const error = new Error(finish.failure.message) as Error & { code?: string }
      error.code = finish.failure.code
      return error
    }
    case 'max-tokens':
      return new Error('The self-evolution learning output reached the token limit.')
    case 'tool-calls':
      return new Error('The self-evolution learning model unexpectedly requested a tool.')
    default:
      return new Error(`Unsupported self-evolution finish reason "${String((finish as { kind?: unknown }).kind)}".`)
  }
}

function learningRoute(agent: Agent): Pick<GenerateOptions, 'provider' | 'model' | 'maxTokens'> {
  const header = agent.session.requestHeader()
  const provider = header?.config.provider || agent.options.provider
  const model = header?.config.model || agent.options.model
  if (!provider || !model) {
    throw new Error('Self-evolution learning requires a resolved provider and model on the source session.')
  }
  const maxTokens = header?.config.maxTokens ?? agent.options.maxTokens
  return { provider, model, ...maxTokens === undefined ? {} : { maxTokens } }
}

/** Run one isolated auxiliary LLM call with no Agent, preset, tools, or inherited history. */
export async function runEvolutionLearningCall(
  scope: Context,
  agent: Agent,
  signal: AbortSignal,
  prompt: string,
): Promise<string> {
  signal.throwIfAborted()
  const route = learningRoute(agent)
  const messages = [createUserMessage({
    content: [{ type: 'text', text: prompt }],
    source: { kind: 'plugin', plugin: 'dsh-task-modes:evolution-learning' },
  })]
  const options: GenerateOptions = deepFreeze({
    ...route,
    messages,
    system: EVOLUTION_LEARNING_SYSTEM_PROMPT,
    signal,
    sessionId: agent.session.id,
  })
  const assembler = new BlockAssembler()
  let finished = false
  for await (const chunk of scope.llm.stream(options)) {
    signal.throwIfAborted()
    assembler.push(chunk)
    if (chunk.type === 'finish') finished = true
  }
  signal.throwIfAborted()
  if (!finished) throw new Error('The self-evolution learning model returned no terminal finish reason.')
  const terminalError = finishError(assembler.finish)
  if (terminalError !== undefined) throw terminalError
  const blocks = assembler.blocks()
  if (blocks.some(block => block.type !== 'text' && block.type !== 'reasoning')) {
    throw new Error('The self-evolution learning model must return text only.')
  }
  const text = blocks
    .filter((block): block is Extract<(typeof blocks)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
  if (text.trim() === '') throw new Error('The self-evolution learning model returned no text.')
  return text
}

/** Analyze one accumulated learning batch and retire its turns only after a validated durable result. */
export async function learnFromTurns(
  scope: Context,
  agent: Agent,
  turns: readonly number[],
  signal: AbortSignal,
  store: EvolutionStore,
  records: KvTable<string, StoredTaskModeRecord>,
): Promise<void> {
  const sessionId = String(agent.session.id)
  const run = {
    sessionId,
    turns,
  }
  try {
    const messages = evolutionMessages(agent, turns)
    const current = relevantState(store)
    const input: EvolutionLearningInput = { sessionId, messages, ...current }
    if (messages.some(message => message.role === 'user')) {
      const text = await runEvolutionLearningCall(scope, agent, signal, evolutionLearningPrompt(input))
      let drafts: EvolutionProposalDraft[]
      try {
        drafts = parseEvolutionLearningResult(text, input)
      } catch (error: unknown) {
        const repaired = await runEvolutionLearningCall(
          scope,
          agent,
          signal,
          evolutionLearningRepairPrompt(input, text, error),
        )
        drafts = parseEvolutionLearningResult(repaired, input)
      }
      await store.recordLearningResult({ ...run, status: 'completed', error: null }, drafts)
    } else {
      await store.recordLearningResult({ ...run, status: 'completed', error: null }, [])
    }
    await completeEvolutionBatch(records, sessionId, turns)
  } catch (error: unknown) {
    await store.recordLearningResult({
      ...run,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }, [])
  }
}
