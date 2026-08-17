import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)

test('ships both DSH plugin entry points', async () => {
  for (const file of ['index.js', 'client.js', 'typert.host.js', 'typert.remote-client.js']) {
    await access(new URL(`../lib/${file}`, import.meta.url))
  }
  assert.ok(true)
})

test('ships syntactically valid JavaScript entry points', async () => {
  for (const file of ['index.js', 'client.js', 'typert.host.js', 'typert.remote-client.js']) {
    await execFileAsync(process.execPath, ['--check', new URL(`../lib/${file}`, import.meta.url).pathname])
  }
})

test('registers the browser entry through the DSH module loader', async () => {
  let handoff
  globalThis.window = { __ModuleLoader__: { load: (value) => { handoff = value } } }
  try {
    await import(`${pathToFileURL(new URL('../lib/client.js', import.meta.url).pathname).href}?test=${Date.now()}`)
    assert.equal(handoff?.id, '@graysilver/dsh-evolve-modes')
    assert.equal(typeof handoff?.factory, 'function')
    const exports = handoff.factory(() => ({}))
    assert.deepEqual(exports.inject, ['slots', 'locale', 'remote', 'remote.commands', 'conversationEvents'])
    assert.equal(typeof exports.apply, 'function')
  } finally {
    delete globalThis.window
  }
})

test('mounts reviews beneath their matching completed turn', async () => {
  let handoff
  globalThis.window = { __ModuleLoader__: { load: (value) => { handoff = value } } }
  try {
    await import(`${pathToFileURL(new URL('../lib/client.js', import.meta.url).pathname).href}?turn-tail=${Date.now()}`)
    const plugin = handoff.factory(() => ({}))
    const registrations = []
    const definitions = []
    const calls = []
    const ctx = {
      effect: (effect) => effect(),
      inject: (_dependencies, effect) => effect(ctx),
      locale: { register: () => () => {} },
      remote: { $mount: () => () => {}, commands: { execute: async (sessionId, line) => {
        calls.push([sessionId, line])
        return { ok: true, value: { result: { kind: 'success', text: JSON.stringify({
          turn: 7,
          profile: 'acceptance-review',
          status: 'completed',
          text: '## Verdict\n\nPass',
          createdAt: 123,
        }) } } }
      } } },
      conversationEvents: { register: definition => { definitions.push(definition); return () => {} } },
      slots: {
        inject: (_name, effect) => effect(),
        register: (options) => { registrations.push(options); return () => {} },
      },
    }
    plugin.apply(ctx)

    assert.equal(definitions.length, 2)
    assert.deepEqual(registrations.map(item => item.name), [
      'conversation.input.left',
      'conversation.input.plan',
      'conversation.chat.turnTail',
      'conversation.chat.commandview',
      'settings.section',
    ])
    const tail = registrations[2]
    assert.equal(tail.select({}), true)
    const face = tail.inject('session-1')
    assert.deepEqual(await face.review(7), {
      turn: 7,
      profile: 'acceptance-review',
      status: 'completed',
      text: '## Verdict\n\nPass',
      createdAt: 123,
    })
    assert.deepEqual(calls, [['session-1', '/evolve-mode-review 7']])
  } finally {
    delete globalThis.window
  }
})

test('exposes independent working, reasoning, quality, and evolution command controls', async () => {
  let handoff
  globalThis.window = { __ModuleLoader__: { load: (value) => { handoff = value } } }
  try {
    await import(`${pathToFileURL(new URL('../lib/client.js', import.meta.url).pathname).href}?controls=${Date.now()}`)
    const plugin = handoff.factory(() => ({}))
    const calls = []
    const registrations = []
    const stateText = 'working: execute\nreasoning: first-principles\nquality: acceptance-review\nevolution: propose\nlearning-batch-size: 3\npending-evolution-turns: 2'
    const ctx = {
      effect: effect => effect(),
      inject: (_dependencies, effect) => effect(ctx),
      locale: { register: () => () => {} },
      remote: { $mount: () => () => {}, commands: { execute: async (sessionId, line) => {
        calls.push([sessionId, line])
        return { ok: true, value: { result: { kind: 'success', text: stateText } } }
      } } },
      conversationEvents: { register: () => () => {} },
      slots: {
        inject: (_name, effect) => effect(),
        register: (options) => { registrations.push(options); return () => {} },
      },
    }
    plugin.apply(ctx)

    const face = registrations[0].inject('session-axes')
    const expected = {
      working: 'execute',
      reasoning: 'first-principles',
      quality: 'acceptance-review',
      evolution: 'propose',
      learningBatchSize: 3,
      pendingEvolutionTurns: 2,
    }
    assert.deepEqual(await face.getState(), expected)
    assert.deepEqual(await face.setWorking('plan'), expected)
    assert.deepEqual(await face.setReasoning('standard'), expected)
    assert.deepEqual(await face.setQuality('general-review'), expected)
    assert.deepEqual(await face.setEvolution('off'), expected)
    assert.deepEqual(await face.setBatchSize(5), expected)
    assert.deepEqual(calls, [
      ['session-axes', '/evolve-mode'],
      ['session-axes', '/evolve-mode working plan'],
      ['session-axes', '/evolve-mode reasoning standard'],
      ['session-axes', '/evolve-mode quality general-review'],
      ['session-axes', '/evolve-mode evolution off'],
      ['session-axes', '/evolve-mode evolution batch-size 5'],
    ])

    const artifact = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    for (const label of ['Execute', 'Plan', 'Standard', 'First principles', 'Off', 'Adversarial review', 'Acceptance review', 'Self-evolution', 'Propose']) {
      assert.match(artifact, new RegExp(label))
    }
    for (const label of ['正常', '工作模式', '审查', '自进化']) {
      assert.match(artifact, new RegExp(label))
    }
    assert.match(artifact, /execute:`正常`/u)
    assert.match(artifact, /workingLabel:`工作模式`/u)
    assert.match(artifact, /qualityLabel:`审查`/u)
    assert.match(artifact, /qualityOff:`关`/u)
    assert.match(artifact, /evolutionOff:`关`/u)
    assert.match(artifact, /evolutionPropose:`开`/u)
    assert.match(artifact, /selectedIds:/u)
    assert.doesNotMatch(artifact, /qualityOpen/u)
    assert.match(artifact, /conversation\.input\.plan/u)
    assert.match(artifact, /priority:\s*-1/u)
  } finally {
    delete globalThis.window
  }
})

test('ships migration, Plan enforcement, and both quality profiles', async () => {
  const artifact = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

  assert.match(artifact, /name:\s*"graysilver_dsh_evolve_modes",\s*version:\s*1/u)
  assert.match(artifact, /case "normal":[\s\S]{0,100}reasoning: "standard",[\s\S]{0,50}quality: "off"/u)
  assert.match(artifact, /case "first-principles":[\s\S]{0,100}reasoning: "first-principles",[\s\S]{0,50}quality: "off"/u)
  assert.match(artifact, /case "adversarial-review":[\s\S]{0,100}reasoning: "standard",[\s\S]{0,50}quality: "general-review"/u)
  for (const tool of ['read', 'glob', 'grep', 'read_image']) assert.match(artifact, new RegExp(`"${tool}"`))
  assert.match(artifact, /PLAN_EXIT_TOOL = "exit_plan_mode"/u)
  assert.match(artifact, /scope\.on\("tools\/pre-execute"/u)
  assert.match(artifact, /agentPresets\.serviceFor\(agent, "planMode"\)/u)
  assert.doesNotMatch(artifact, /\["commands", "systemPrompt", "subagents", "storageDomain", "planMode", "tools"\]/u)
  assert.match(artifact, /profile === "general-review"/u)
  assert.match(artifact, /Met, Gap, Unverified, Evidence, and Concrete follow-up/u)
  assert.match(artifact, /name:\s*"graysilver_dsh_evolve_modes_evolution",\s*version:\s*1/u)
  assert.match(artifact, /name:\s*"evolve-mode:evolution"/u)
  assert.match(artifact, /evolution\\s\+batch-size/u)
  assert.match(artifact, /dsh-evolve-modes:evolution-learning/u)
  assert.match(artifact, /validationError/u)
  assert.match(artifact, /mode:\s*"repair"/u)
  assert.match(artifact, /category must be exactly identity, preference, or work_rule/u)
  assert.match(artifact, /scope\.llm\.stream/u)
  assert.match(artifact, /const messages = \[createUserMessage/u)
  assert.doesNotMatch(artifact, /LEARNING_TOOLS/u)
  assert.doesNotMatch(patch, /dsh-plan-mode/u)
})

test('projects a verified first-principles request header into Trajectory', async () => {
  let handoff
  globalThis.window = { __ModuleLoader__: { load: (value) => { handoff = value } } }
  try {
    await import(`${pathToFileURL(new URL('../lib/client.js', import.meta.url).pathname).href}?trajectory=${Date.now()}`)
    const plugin = handoff.factory(() => ({}))
    const definitions = []
    const ctx = {
      effect: effect => effect(),
      inject: (_dependencies, effect) => effect(ctx),
      locale: { register: () => () => {} },
      remote: { $mount: () => () => {}, commands: { execute: async () => ({ ok: true }) } },
      conversationEvents: { register: value => { definitions.push(value); return () => {} } },
      slots: { inject: () => {}, register: () => () => {} },
    }
    plugin.apply(ctx)
    const definition = definitions.find(value => value.kind === 'evolve-mode-first-principles-injection')
    assert.ok(definition)

    const prompt = 'For this task, reason from first principles. State the objective and success criteria, separate verified facts from assumptions, identify hard constraints, derive the solution from those facts, and describe how you will verify the result. Do not treat conventions or guesses as requirements.'
    const event = {
      type: 'request/header',
      seq: 22,
      time: 1234,
      data: {
        header: {
          config: { provider: 'test', model: 'test' },
          system: `base\n\n${prompt}`,
        },
        reason: 'change',
      },
    }
    const location = { kind: 'step', turn: { turn: 2 }, step: { turn: 2, step: 1 } }
    assert.deepEqual(definition.match(event), { id: '22', role: 'start' })
    assert.equal(definition.match({
      ...event,
      data: { ...event.data, header: { ...event.data.header, system: 'base' } },
    }), null)
    assert.equal(definition.match({
      ...event,
      data: { ...event.data, header: { ...event.data.header, system: prompt.slice(0, -1) } },
    }), null)

    const match = { event, role: 'start', location }
    const state = definition.start({ matches: [match] }, match, {})
    assert.deepEqual(state.content, [{ type: 'text', text: prompt }])
    assert.deepEqual(state.source, { kind: 'plugin', plugin: 'dsh-evolve-modes:first-principles' })
    const node = definition.buildViewNode({
      key: 'evolve-mode-first-principles-injection\u000022',
      kind: definition.kind,
      id: '22',
      matches: [match],
      start: match,
      state,
      current: new Map(),
    })
    assert.equal(node.anchorSeq, 22)
    assert.deepEqual(node.location, location)
    assert.deepEqual(node.data.node, state)
  } finally {
    delete globalThis.window
  }
})

test('projects only the approved learned-instruction block into Trajectory', async () => {
  let handoff
  globalThis.window = { __ModuleLoader__: { load: (value) => { handoff = value } } }
  try {
    await import(`${pathToFileURL(new URL('../lib/client.js', import.meta.url).pathname).href}?learned-trajectory=${Date.now()}`)
    const plugin = handoff.factory(() => ({}))
    const definitions = []
    const ctx = {
      effect: effect => effect(),
      inject: (_dependencies, effect) => effect(ctx),
      locale: { register: () => () => {} },
      remote: { $mount: () => () => {}, commands: { execute: async () => ({ ok: true }) } },
      conversationEvents: { register: value => { definitions.push(value); return () => {} } },
      slots: { inject: () => {}, register: () => () => {} },
    }
    plugin.apply(ctx)
    const definition = definitions.find(value => value.kind === 'evolve-mode-learned-instructions-injection')
    assert.ok(definition)

    const learned = '<dsh-evolve-modes-learned-instructions>\n# Global learned instructions\n\n- Prefer Chinese\n</dsh-evolve-modes-learned-instructions>'
    const event = {
      type: 'request/header',
      seq: 31,
      time: 5678,
      data: {
        header: { config: { provider: 'test', model: 'test' }, system: `base\n\n${learned}\n\ntail` },
        reason: 'change',
      },
    }
    const location = { kind: 'step', turn: { turn: 3 }, step: { turn: 3, step: 1 } }
    assert.deepEqual(definition.match(event), { id: '31', role: 'start' })
    assert.equal(definition.match({
      ...event,
      data: { ...event.data, header: { ...event.data.header, system: 'base' } },
    }), null)
    const match = { event, role: 'start', location }
    const state = definition.start({ matches: [match] }, match, {})
    assert.deepEqual(state.content, [{ type: 'text', text: learned }])
    assert.deepEqual(state.source, { kind: 'plugin', plugin: 'dsh-evolve-modes:evolution' })
  } finally {
    delete globalThis.window
  }
})
