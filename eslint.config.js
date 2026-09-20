import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import prettier from 'eslint-config-prettier'
import cypress from 'eslint-plugin-cypress'
import tailwindcss from 'eslint-plugin-tailwindcss'
import jest from 'eslint-plugin-jest'
import testingLibrary from 'eslint-plugin-testing-library'
import globals from 'globals'

/** @type {import('eslint').Linter.Config[]} */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  tailwindcss.configs.recommended,
  prettier,
  {
    settings: {
      tailwindcss: {
        cssConfigPath: './src/app.css',
      },
    },
    rules: {
      // prettier-plugin-tailwindcss already sorts classnames on format; a lint
      // rule for the same thing just fights the formatter over ordering it
      // doesn't actually control.
      'tailwindcss/classnames-order': 'off',
      // The rule can't distinguish a real typo from a deliberate custom
      // utility class (e.g. `link`, `show-validation` defined in src/app.css),
      // so it flags every one of the latter as if it were the former.
      'tailwindcss/no-custom-classname': 'off',
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'svelte/no-navigation-without-resolve': 'off',
      // Off deliberately, not deferred. The rule flags any mutable instance
      // of a built-in (Map/Set/Date/URL/URLSearchParams) inside a .svelte
      // file; it can't tell whether the instance is actually held in
      // reactive state. All 26 violations here are the same transient shape:
      //   const base = new URLSearchParams(page.url.searchParams)
      //   base.set('page', ...); return `?${base.toString()}`
      // - a local built inside a $derived IIFE, serialized on the next line,
      // never stored and never read reactively. SvelteURLSearchParams would
      // add proxy overhead for an object with a three-line lifetime. Revisit
      // only if a built-in instance is ever assigned to $state and mutated
      // in place, which is the case the rule is actually for.
      'svelte/prefer-svelte-reactivity': 'off',
      // Mostly false positives against $bindable prop writes (e.g.
      // EditApplicationForm/EditRegistrationForm's dbValues/loading), which
      // the Phase 2c form-seeding rewrite addresses; plus one unrelated
      // dead-initializer nit in src/lib/server/search.ts (allDocs).
      'no-useless-assignment': 'off',
      'svelte/a11y-consider-explicit-label': 'off',
      // no-constant-binary-expression's only violations are intentional
      // literal true/false in __tests__/utils.test.ts demonstrating cn()'s
      // conditional-class behavior - pre-existing test fixture, not a bug,
      // and unrelated to the Svelte 5 migration.
      'no-constant-binary-expression': 'off',
      'svelte/no-at-html-tags': 'off',
    },
  },
  // Scoped to the Cypress tree on purpose: the plugin's own `recommended` config
  // ships no `files` key, so spreading it unscoped would apply the Cypress rules
  // to app code and leak ~1200 browser globals into every file.
  {
    ...cypress.configs.recommended,
    files: ['cypress/**/*.ts'],
    rules: {
      ...cypress.configs.recommended.rules,
      'cypress/no-debug': 'error',
      'cypress/no-pause': 'error',
    },
  },
  // Scoped to __tests__ for the same reason as the Cypress block above:
  // both configs' rules assume their respective globals/APIs are in scope,
  // which is only true under this tree.
  {
    ...jest.configs['flat/recommended'],
    files: ['__tests__/**/*.ts'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      // The rule only recognizes literal `expect(...)` calls, so it can't see
      // into this codebase's local assertion helpers (expectDecisionBatch,
      // assertSucceeds/assertFails from @firebase/rules-unit-testing, ...).
      'jest/expect-expect': [
        'warn',
        { assertFunctionNames: ['expect', 'expect*', 'assert*'] },
      ],
    },
  },
  {
    ...testingLibrary.configs['flat/dom'],
    files: ['__tests__/**/*.ts'],
  },
  {
    ignores: [
      '**/node_modules/**',
      'build/**',
      '.svelte-kit/**',
      'package/**',
      '.env',
      '.env.*',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      '.vercel/**',
      'coverage/**',
    ],
  },
)
