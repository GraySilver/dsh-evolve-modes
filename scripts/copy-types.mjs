import { cp, mkdir } from 'node:fs/promises'

const destination = new URL('../lib/types/', import.meta.url)
await mkdir(destination, { recursive: true })
await cp(new URL('../types/', import.meta.url), destination, { recursive: true })
