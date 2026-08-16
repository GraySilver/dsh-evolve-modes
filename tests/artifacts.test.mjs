import test from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)

test('ships both DSH plugin entry points', async () => {
  await access(new URL('../lib/index.js', import.meta.url))
  await access(new URL('../lib/client.js', import.meta.url))
  assert.ok(true)
})

test('ships syntactically valid JavaScript entry points', async () => {
  for (const file of ['index.js', 'client.js']) {
    await execFileAsync(process.execPath, ['--check', new URL(`../lib/${file}`, import.meta.url).pathname])
  }
})

test('registers the browser entry through the DSH module loader', async () => {
  let handoff
  globalThis.window = { __ModuleLoader__: { load: (value) => { handoff = value } } }
  try {
    await import(`${pathToFileURL(new URL('../lib/client.js', import.meta.url).pathname).href}?test=${Date.now()}`)
    assert.equal(handoff?.id, '@graysilver/dsh-task-modes')
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
      locale: { register: () => () => {} },
      remote: { commands: { execute: async (sessionId, line) => {
        calls.push([sessionId, line])
        return { ok: true, value: { result: { kind: 'success', text: '## Verdict\n\nPass' } } }
      } } },
      conversationEvents: { register: definition => { definitions.push(definition); return () => {} } },
      slots: {
        inject: (_name, effect) => effect(),
        register: (options) => { registrations.push(options); return () => {} },
      },
    }
    plugin.apply(ctx)

    assert.equal(definitions.length, 1)
    assert.deepEqual(registrations.map(item => item.name), [
      'conversation.input.left',
      'conversation.chat.turnTail',
      'conversation.chat.commandview',
    ])
    const tail = registrations[1]
    assert.equal(tail.select({}), true)
    const face = tail.inject('session-1')
    assert.equal(await face.review(7), '## Verdict\n\nPass')
    assert.deepEqual(calls, [['session-1', '/task-mode-review 7']])
  } finally {
    delete globalThis.window
  }
})

test('projects a verified first-principles request header into Trajectory', async () => {
  let handoff
  globalThis.window = { __ModuleLoader__: { load: (value) => { handoff = value } } }
  try {
    await import(`${pathToFileURL(new URL('../lib/client.js', import.meta.url).pathname).href}?trajectory=${Date.now()}`)
    const plugin = handoff.factory(() => ({}))
    let definition
    const ctx = {
      effect: effect => effect(),
      locale: { register: () => () => {} },
      remote: { commands: { execute: async () => ({ ok: true }) } },
      conversationEvents: { register: value => { definition = value; return () => {} } },
      slots: { inject: () => {}, register: () => () => {} },
    }
    plugin.apply(ctx)

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
    assert.deepEqual(state.source, { kind: 'plugin', plugin: 'dsh-task-modes:first-principles' })
    const node = definition.buildViewNode({
      key: 'task-mode-first-principles-injection\u000022',
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
