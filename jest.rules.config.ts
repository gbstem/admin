import type { Config } from 'jest'

/**
 * Security-rules tests, kept out of `yarn test` on purpose.
 *
 * Every other suite in this repo mocks Firestore and runs with nothing
 * installed (see README's Testing section). These are the opposite: they load
 * `firestore.rules` into the Firestore emulator and exercise it for real,
 * because a rule can only be verified by the engine that evaluates it. That
 * means they need `firebase emulators:start` running, so they get their own
 * config and their own `yarn test:rules` script rather than making the main
 * suite depend on it.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/rules/**/*.test.ts'],
  moduleNameMapper: {
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
  },
  transform: {
    // __tests__/rules has its own tsconfig, which does not extend the root
    // one: that chain reaches .svelte-kit/tsconfig.json, a generated file that
    // only exists after `svelte-kit sync`. These tests contain no SvelteKit,
    // and CI runs them in the emulator job, which does no build - inheriting
    // that dependency failed there with TS5083.
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/__tests__/rules/tsconfig.json' },
    ],
  },
  // Rules evaluation goes over the wire to the emulator; the default 5s is
  // tight for the first test in a file, which also uploads the ruleset.
  testTimeout: 20000,
  globalSetup: '<rootDir>/__tests__/rules/globalSetup.ts',
}

export default config
