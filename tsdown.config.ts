import { defineConfig } from 'tsdown'

const CLIENT_ID = '@graysilver/dsh-task-modes'

export default defineConfig([
  {
    entry: { index: 'src/index.ts', 'typert.host': 'src/typert.ts', 'typert.remote-client': 'src/remote.ts' },
    format: 'esm',
    dts: false,
    outDir: 'lib',
    fixedExtension: false,
    deps: { neverBundle: [/^@deepseek-ai\//, 'react', 'zod'] },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    format: 'cjs',
    platform: 'browser',
    minify: true,
    dts: false,
    outDir: 'lib',
    clean: false,
    deps: {
      alwaysBundle: ['zod'],
      neverBundle: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
