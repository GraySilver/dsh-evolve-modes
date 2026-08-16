import { access } from 'node:fs/promises'

for (const file of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts']) await access(new URL(`../${file}`, import.meta.url))
console.log('prebuilt plugin artifacts are present')
