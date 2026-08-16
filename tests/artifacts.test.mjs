import test from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

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
