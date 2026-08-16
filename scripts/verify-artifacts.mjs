import { access } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const artifacts = ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts']

for (const file of artifacts) await access(new URL(`../${file}`, import.meta.url))
for (const file of ['lib/index.js', 'lib/client.js']) await execFileAsync(process.execPath, ['--check', new URL(`../${file}`, import.meta.url).pathname])
console.log('prebuilt plugin artifacts are present and parse as JavaScript')
