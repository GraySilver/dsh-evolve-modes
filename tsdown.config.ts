import { defineConfig } from 'tsdown'

export default defineConfig([
  { entry: { index: 'src/index.ts' }, format: 'esm', dts: false, outDir: 'lib', fixedExtension: false, deps: { neverBundle: [/^@deepseek-ai\//, 'react', 'zod'] } },
  { entry: { client: 'src/client/index.tsx' }, format: 'esm', dts: false, outDir: 'lib', fixedExtension: false, deps: { neverBundle: [/^@deepseek-ai\//, 'react', 'react/jsx-runtime'] } },
])
