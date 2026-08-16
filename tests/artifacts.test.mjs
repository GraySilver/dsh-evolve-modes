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
    assert.deepEqual(exports.inject, ['slots', 'locale', 'remote', 'remote.commands'])
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
    const calls = []
    const ctx = {
      effect: (effect) => effect(),
      locale: { register: () => () => {} },
      remote: { commands: { execute: async (sessionId, line) => {
        calls.push([sessionId, line])
        return { ok: true, value: { result: { kind: 'success', text: '## Verdict\n\nPass' } } }
      } } },
      slots: {
        inject: (_name, effect) => effect(),
        register: (options) => { registrations.push(options); return () => {} },
      },
    }
    plugin.apply(ctx)

    assert.deepEqual(registrations.map(item => item.name), [
      'conversation.input.left',
      'conversation.chat.turnTail',
    ])
    const tail = registrations[1]
    const face = tail.inject('session-1')
    assert.equal(await face.review(7), '## Verdict\n\nPass')
    assert.deepEqual(calls, [['session-1', '/task-mode review 7']])
  } finally {
    delete globalThis.window
  }
})
