import test from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'

test('ships both DSH plugin entry points', async () => {
  await access(new URL('../lib/index.js', import.meta.url))
  await access(new URL('../lib/client.js', import.meta.url))
  assert.ok(true)
})
