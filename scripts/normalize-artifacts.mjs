import { readFile, writeFile } from 'node:fs/promises'

for (const file of ['lib/client.js']) {
  const url = new URL(`../${file}`, import.meta.url)
  const source = await readFile(url, 'utf8')
  await writeFile(url, source.replace(/[\t ]+$/gmu, ''))
}
