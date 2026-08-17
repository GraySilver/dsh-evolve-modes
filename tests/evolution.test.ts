import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { DomainGlobal, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it } from 'vitest'
import { learnFromTurns, runEvolutionLearningCall } from '../src/evolution/learning.ts'
import { evolutionMessages } from '../src/evolution/messages.ts'
import {
  EVOLUTION_LEARNING_SYSTEM_PROMPT,
  evolutionLearningPrompt,
  evolutionLearningRepairPrompt,
  parseEvolutionLearningResult,
} from '../src/evolution/prompt.ts'
import type { EvolutionLearningInput } from '../src/evolution/prompt.ts'
import type { EvolutionStore } from '../src/evolution/store.ts'
import { EMPTY_EVOLUTION_STATE, migrateRenamedEvolutionState } from '../src/evolution/store.ts'
import { migrateRenamedModeRecords, normalizeRecord, recordFor } from '../src/storage.ts'
import type { StoredEvolveModeRecord } from '../src/storage.ts'
import type { EvolutionState } from '../src/types.ts'

interface FakeEvent {
  readonly type: string
  readonly seq: number
  readonly data: unknown
}

function fakeAgent(events: readonly FakeEvent[]): Agent {
  return {
    options: { provider: 'fallback-provider', model: 'fallback-model', maxTokens: 1024 },
    session: {
      id: 'session-a',
      events,
      requestHeader: () => ({
        config: { provider: 'source-provider', model: 'source-model', maxTokens: 4096 },
      }),
    },
  } as unknown as Agent
}

function streamContext(
  chunks: readonly StreamChunk[],
  requests: GenerateOptions[] = [],
): Context {
  return {
    llm: {
      stream: async function* (options: GenerateOptions) {
        requests.push(options)
        yield* chunks
      },
    },
  } as unknown as Context
}

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'text-delta', index: 0, text },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function recordTable(
  entries: readonly (readonly [string, StoredEvolveModeRecord])[],
): KvTable<string, StoredEvolveModeRecord> {
  const values = new Map<string, StoredEvolveModeRecord>(entries)
  return {
    get: key => values.get(key),
    entries: () => values.entries(),
    keys: () => values.keys(),
    get size() { return values.size },
    put: async (key, value) => { values.set(key, value) },
    delete: async key => values.delete(key),
  } as KvTable<string, StoredEvolveModeRecord>
}

function fakeRecords(pendingEvolutionTurns: readonly number[]): KvTable<string, StoredEvolveModeRecord> {
  return recordTable([[
    'session-a',
    {
      reasoning: 'standard', quality: 'off', evolution: 'propose',
      pendingEvolutionTurns: [...pendingEvolutionTurns], updatedAt: 0, reviews: [],
    },
  ]])
}

function turnEvents(turn: number, user: string, assistants: readonly string[] = []): FakeEvent[] {
  const base = turn * 10
  return [
    { type: 'turn/start', seq: base, data: { turn } },
    {
      type: 'user/message',
      seq: base + 1,
      data: { source: { kind: 'user' }, content: [{ type: 'text', text: user }] },
    },
    ...assistants.map((text, index) => ({
      type: 'assistant/message',
      seq: base + index + 2,
      data: { message: { content: [{ type: 'text', text }] } },
    })),
  ]
}

describe('self-evolution learning messages', () => {
  it('keeps the full user message and only the final visible assistant message for each selected turn', () => {
    const events = [
      ...turnEvents(1, 'First request', ['Draft answer', '', 'Final answer']),
      ...turnEvents(2, 'Second request', ['Second answer']),
    ]

    expect(evolutionMessages(fakeAgent(events), [1, 2]).map(({ role, text }) => ({ role, text }))).toEqual([
      { role: 'user', text: 'First request' },
      { role: 'assistant', text: 'Final answer' },
      { role: 'user', text: 'Second request' },
      { role: 'assistant', text: 'Second answer' },
    ])
  })

  it('truncates a long assistant message to the same head-and-tail snapshot as Jarvis learning', () => {
    const longAnswer = `${'A'.repeat(2500)}${'B'.repeat(2500)}`
    const messages = evolutionMessages(fakeAgent(turnEvents(1, 'Request', [longAnswer])), [1])

    expect(messages[1]?.text).toBe(`${'A'.repeat(1000)}...${'B'.repeat(1000)}`)
    expect(messages[1]?.text).toHaveLength(2003)
  })

  it('limits the snapshot to the latest 100 messages and drops an orphan assistant at the boundary', () => {
    const events: FakeEvent[] = []
    for (let turn = 0; turn < 50; turn += 1) {
      events.push(...turnEvents(turn, `User ${turn}`, [`Assistant ${turn}`]))
    }
    events.push(...turnEvents(50, 'Final user'))

    const messages = evolutionMessages(fakeAgent(events), Array.from({ length: 51 }, (_, index) => index))

    expect(messages).toHaveLength(99)
    expect(messages[0]).toMatchObject({ turn: 1, role: 'user', text: 'User 1' })
    expect(messages.at(-1)).toMatchObject({ turn: 50, role: 'user', text: 'Final user' })
  })
})

describe('self-evolution defaults', () => {
  it('enables proposal learning for a new session and learns every three completed replies', () => {
    const records = fakeRecords([])
    expect(recordFor(records, 'new-session')).toMatchObject({
      evolution: 'propose',
      pendingEvolutionTurns: [],
    })
    expect(EMPTY_EVOLUTION_STATE.config.learningBatchSize).toBe(3)
  })

  it('enables migrated records that had no evolution choice but preserves an explicit off choice', () => {
    expect(normalizeRecord({
      reasoning: 'standard', quality: 'off', updatedAt: 0, reviews: [],
    })).toMatchObject({ evolution: 'propose' })
    expect(normalizeRecord({
      reasoning: 'standard', quality: 'off', evolution: 'off',
      pendingEvolutionTurns: [], updatedAt: 0, reviews: [],
    })).toMatchObject({ evolution: 'off' })
  })

  it('copies renamed session records without overwriting new-domain choices', async () => {
    const legacy = fakeRecords([1])
    const target = recordTable([])
    await migrateRenamedModeRecords(target, legacy)
    expect(target.get('session-a')).toMatchObject({ evolution: 'propose', pendingEvolutionTurns: [1] })

    await target.put('session-a', {
      reasoning: 'first-principles', quality: 'off', evolution: 'off',
      pendingEvolutionTurns: [], updatedAt: 1, reviews: [],
    })
    await migrateRenamedModeRecords(target, legacy)
    expect(target.get('session-a')).toMatchObject({ reasoning: 'first-principles', evolution: 'off' })
  })

  it('copies renamed global evolution state only into a pristine new domain', async () => {
    let targetState: EvolutionState = structuredClone(EMPTY_EVOLUTION_STATE)
    const legacyState: EvolutionState = {
      ...structuredClone(EMPTY_EVOLUTION_STATE),
      revision: 2,
      updatedAt: 10,
      config: { learningBatchSize: 7, maxPendingProposals: 42 },
    }
    const target = {
      get: () => targetState,
      set: async (value: EvolutionState) => { targetState = value },
    } as unknown as DomainGlobal<EvolutionState>
    const legacy = {
      get: () => legacyState,
    } as unknown as DomainGlobal<EvolutionState>

    await migrateRenamedEvolutionState(target, legacy)
    expect(targetState).toMatchObject({ revision: 2, config: { learningBatchSize: 7 } })

    targetState = { ...targetState, revision: 3, config: { learningBatchSize: 5, maxPendingProposals: 10 } }
    await migrateRenamedEvolutionState(target, legacy)
    expect(targetState).toMatchObject({ revision: 3, config: { learningBatchSize: 5 } })
  })
})

describe('self-evolution learning prompt', () => {
  const input: EvolutionLearningInput = {
    sessionId: 'session-a',
    settings: [],
    proposals: [],
    messages: [{
      sessionId: 'session-a',
      turn: 1,
      eventSeq: 11,
      role: 'user',
      text: 'Use concise answers.',
    }],
  }

  it('keeps the Jarvis-style persona and proposal protocol exclusively in the system prompt', () => {
    expect(EVOLUTION_LEARNING_SYSTEM_PROMPT).toContain('Learn durable facts, preferences, and work requirements')
    expect(EVOLUTION_LEARNING_SYSTEM_PROMPT).toContain('Every operation becomes a pending proposal')
    expect(EVOLUTION_LEARNING_SYSTEM_PROMPT).toContain('does not change approved learned instructions until a human applies it')
    expect(EVOLUTION_LEARNING_SYSTEM_PROMPT).toContain('Assistant messages provide context only and are never evidence')
    expect(EVOLUTION_LEARNING_SYSTEM_PROMPT).toContain('Follow this field matrix exactly')
    expect(EVOLUTION_LEARNING_SYSTEM_PROMPT).toContain('does not need to be repeated')
    expect(EVOLUTION_LEARNING_SYSTEM_PROMPT).toContain('mode="repair"')
  })

  it('serializes source messages and state only as an analyze data payload', () => {
    const payload = JSON.parse(evolutionLearningPrompt(input)) as {
      mode: string
      input: { sessionId: string; messages: Array<{ eventSeq: number }> }
    }

    expect(payload).toMatchObject({
      mode: 'analyze',
      input: { sessionId: 'session-a' },
    })
    expect(payload.input.messages[0]?.eventSeq).toBe(11)
    expect(evolutionLearningPrompt(input)).not.toContain('Follow this field matrix exactly')
  })

  it('serializes repair details as data without changing the dedicated system prompt', () => {
    const payload = JSON.parse(evolutionLearningRepairPrompt(input, 'not json', new Error('invalid'))) as {
      mode: string
      validationError: string
      previousOutput: string
    }

    expect(payload).toMatchObject({
      mode: 'repair',
      validationError: 'invalid',
      previousOutput: 'not json',
    })
  })

  it('accepts separate identity and preference proposals from one explicit user statement', () => {
    const input: EvolutionLearningInput = {
      sessionId: 'session-a',
      settings: [],
      proposals: [],
      messages: [{
        sessionId: 'session-a',
        turn: 1,
        eventSeq: 11,
        role: 'user',
        text: '我是一个算法工程师，我喜欢写文章',
      }],
    }
    const result = JSON.stringify({ operations: [
      {
        action: 'add', settingId: null, scope: 'global', category: 'identity',
        content: 'The user is an algorithm engineer.', inference: 'explicit', deleteReason: null,
        evidence: [{ eventSeq: 11, excerpt: '我是一个算法工程师' }],
      },
      {
        action: 'add', settingId: null, scope: 'global', category: 'preference',
        content: 'The user likes writing articles.', inference: 'explicit', deleteReason: null,
        evidence: [{ eventSeq: 11, excerpt: '我喜欢写文章' }],
      },
    ] })

    expect(parseEvolutionLearningResult(result, input)).toMatchObject([
      { category: 'identity', inference: 'explicit' },
      { category: 'preference', inference: 'explicit' },
    ])
  })
})

describe('isolated self-evolution LLM call', () => {
  it('sends one plugin-owned data message with no tools or inherited Agent context', async () => {
    const requests: GenerateOptions[] = []
    const parentEvents = turnEvents(1, 'Parent conversation', [
      'Inherited AGENTS.md and parent working context must not appear.',
    ])
    const result = await runEvolutionLearningCall(
      streamContext(textResponse('{"operations":[]}'), requests),
      fakeAgent(parentEvents),
      new AbortController().signal,
      '{"mode":"analyze","input":{"messages":[]}}',
    )

    expect(result).toBe('{"operations":[]}')
    expect(requests).toHaveLength(1)
    const request = requests[0] as GenerateOptions
    expect(request).toMatchObject({
      provider: 'source-provider',
      model: 'source-model',
      maxTokens: 4096,
      system: EVOLUTION_LEARNING_SYSTEM_PROMPT,
      sessionId: 'session-a',
    })
    expect(request).not.toHaveProperty('tools')
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0]).toMatchObject({
      role: 'user',
      source: { kind: 'plugin', plugin: 'dsh-evolve-modes:evolution-learning' },
      content: [{ type: 'text', text: '{"mode":"analyze","input":{"messages":[]}}' }],
    })
    expect(JSON.stringify(request)).not.toContain('Inherited AGENTS.md')
    expect(JSON.stringify(request)).not.toContain('Parent conversation')
  })

  it('falls back to the Agent route when no resolved request header exists', async () => {
    const requests: GenerateOptions[] = []
    const agent = fakeAgent([]) as Agent & { session: Agent['session'] & { requestHeader: () => undefined } }
    agent.session.requestHeader = () => undefined

    await runEvolutionLearningCall(
      streamContext(textResponse('{"operations":[]}'), requests),
      agent,
      new AbortController().signal,
      '{}',
    )

    expect(requests[0]).toMatchObject({
      provider: 'fallback-provider',
      model: 'fallback-model',
      maxTokens: 1024,
    })
  })

  it.each([
    [{ type: 'finish', reason: { kind: 'max-tokens' } } as StreamChunk, 'token limit'],
    [{ type: 'finish', reason: { kind: 'tool-calls' } } as StreamChunk, 'requested a tool'],
    [{
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'TEST', message: 'provider failed' } },
    } as StreamChunk, 'provider failed'],
  ])('rejects an unsuccessful terminal finish', async (finish, expected) => {
    await expect(runEvolutionLearningCall(
      streamContext([finish]),
      fakeAgent([]),
      new AbortController().signal,
      '{}',
    )).rejects.toThrow(expected)
  })

  it('rejects a stream with no terminal finish event', async () => {
    await expect(runEvolutionLearningCall(
      streamContext([{ type: 'text-delta', index: 0, text: '{}' }]),
      fakeAgent([]),
      new AbortController().signal,
      '{}',
    )).rejects.toThrow('no terminal finish reason')
  })

  it('records a failed learning run without retiring its pending turns', async () => {
    const events = turnEvents(1, 'Remember that I prefer concise answers.')
    const runs: Array<{ status: string; error: string | null }> = []
    const store = {
      state: () => ({ settings: [], proposals: [] }),
      recordLearningResult: async (run: { status: string; error: string | null }) => {
        runs.push(run)
        return 0
      },
    } as unknown as EvolutionStore
    const records = fakeRecords([1])

    await learnFromTurns(
      streamContext([{ type: 'finish', reason: { kind: 'max-tokens' } }]),
      fakeAgent(events),
      [1],
      new AbortController().signal,
      store,
      records,
    )

    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ status: 'failed' })
    expect(runs[0]?.error).toContain('token limit')
    expect((records.get('session-a') as { pendingEvolutionTurns: number[] }).pendingEvolutionTurns).toEqual([1])
  })

  it('repairs one invalid result in a fresh isolated call and then retires the batch', async () => {
    const requests: GenerateOptions[] = []
    let call = 0
    const scope = {
      llm: {
        stream: async function* (options: GenerateOptions) {
          requests.push(options)
          const response = call++ === 0 ? 'not json' : '{"operations":[]}'
          yield* textResponse(response)
        },
      },
    } as unknown as Context
    const recorded: Array<{ run: { status: string }; drafts: readonly unknown[] }> = []
    const store = {
      state: () => ({ settings: [], proposals: [] }),
      recordLearningResult: async (run: { status: string }, drafts: readonly unknown[]) => {
        recorded.push({ run, drafts })
        return drafts.length
      },
    } as unknown as EvolutionStore
    const records = fakeRecords([1])

    await learnFromTurns(
      scope,
      fakeAgent(turnEvents(1, 'Remember that I prefer concise answers.')),
      [1],
      new AbortController().signal,
      store,
      records,
    )

    expect(requests).toHaveLength(2)
    expect(requests.every(request => request.system === EVOLUTION_LEARNING_SYSTEM_PROMPT)).toBe(true)
    expect(requests.every(request => request.messages.length === 1 && !('tools' in request))).toBe(true)
    const repairText = requests[1]?.messages[0]?.content.find(block => block.type === 'text')
    expect(repairText).toMatchObject({ type: 'text' })
    expect(JSON.parse(repairText?.type === 'text' ? repairText.text : '')).toMatchObject({
      mode: 'repair',
      previousOutput: 'not json',
    })
    expect(recorded).toMatchObject([{ run: { status: 'completed' }, drafts: [] }])
    expect((records.get('session-a') as { pendingEvolutionTurns: number[] }).pendingEvolutionTurns).toEqual([])
  })
})
