import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  transform: {
    // Rune-backed shared-state modules (src/lib/stores.svelte.ts) need the
    // Svelte compiler, not just TS transpilation - matched before the
    // general `.tsx?$` pattern below, which would otherwise also match.
    // Also covers `*.svelte.test.ts` specs that use runes directly (e.g.
    // `$effect.root`) to exercise a `.svelte.ts` module's reactivity.
    '\\.svelte$': '<rootDir>/jest-transform-svelte-module.cjs',
    '\\.svelte\\.(test\\.)?ts$': '<rootDir>/jest-transform-svelte-module.cjs',
    // Dependencies ship rune modules as `*.svelte.js` (runed, svelte-toolbelt).
    // They need the Svelte compiler for the same reason our own `.svelte.ts`
    // modules do - `$state`/`$derived` are compiler macros, not functions - so
    // they must be matched before the generic node_modules `.js$` rule below,
    // which would only down-level them to CJS and leave the runes undefined.
    'node_modules[/\\\\].*\\.svelte\\.js$':
      '<rootDir>/jest-transform-svelte-module.cjs',
    '^.+\\.tsx?$': ['ts-jest', {}],
    // The compiled output above imports Svelte's runtime straight from
    // `svelte/internal/client`, which ships as raw ESM (as does its own
    // `esm-env` dependency) - down-level both so Jest's CJS loader can
    // read them (paired with transformIgnorePatterns below, since
    // node_modules is untransformed by default).
    'node_modules[/\\\\](svelte|esm-env|lodash-es|formsnap|svelte-toolbelt|sveltekit-superforms|ts-deepmerge|memoize-weak|devalue|runed|@steeze-ui)[/\\\\].*\\.js$':
      '<rootDir>/jest-transform-esm-to-cjs.cjs',
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\](?!(svelte|esm-env|lodash-es|formsnap|svelte-toolbelt|sveltekit-superforms|ts-deepmerge|memoize-weak|devalue|runed|@steeze-ui)[/\\\\])',
  ],
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/(.*)$': '<rootDir>/$1',
    // These packages publish an `exports` map with only a `svelte` condition
    // (no `import`/`require`/`default`), which Jest's resolver can't read - it
    // reports "Cannot find module" rather than a condition mismatch. Point at
    // the entry those conditions name. Needed since the form components moved
    // to formsnap/superforms and a `.svelte.test.ts` now mounts one.
    // SvelteKit's `$app/*` virtual modules - see __mocks__/sveltekit/README.md.
    '^\\$app/stores$': '<rootDir>/__mocks__/sveltekit/stores.cjs',
    '^\\$app/state$': '<rootDir>/__mocks__/sveltekit/state.cjs',
    '^\\$app/environment$': '<rootDir>/__mocks__/sveltekit/environment.cjs',
    '^\\$app/navigation$': '<rootDir>/__mocks__/sveltekit/navigation.cjs',
    '^\\$app/forms$': '<rootDir>/__mocks__/sveltekit/forms.cjs',
    '^formsnap$': '<rootDir>/node_modules/formsnap/dist/index.js',
    '^svelte-toolbelt$': '<rootDir>/node_modules/svelte-toolbelt/dist/index.js',
    '^sveltekit-superforms$':
      '<rootDir>/node_modules/sveltekit-superforms/dist/index.js',
    // Same missing condition for the icon data, which every icon imports.
    '^@steeze-ui/heroicons$':
      '<rootDir>/node_modules/@steeze-ui/heroicons/dist/index.js',
    // The zod adapter directly, not `adapters/index.js`. That barrel eagerly
    // imports every validation library superforms supports - effect, typebox,
    // arktype, valibot, joi, yup - each of which drags in its own ESM-only
    // package that Jest would then need transformed. This repo only ever uses
    // zod, so resolve straight to it.
    '^sveltekit-superforms/adapters$':
      '<rootDir>/node_modules/sveltekit-superforms/dist/adapters/zod.js',
  },
  // __tests__/rules evaluates firestore.rules against a running Firestore
  // emulator, where every other suite here mocks Firestore and needs nothing
  // installed. Keeping it out means `yarn test` still runs anywhere; those
  // tests have their own config and run via `yarn test:rules`.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/rules/'],
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx,svelte}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
}

export default config
