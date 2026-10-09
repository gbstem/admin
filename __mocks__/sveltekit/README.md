Stubs for SvelteKit's `$app/*` virtual modules.

Vite provides these at build time; Jest has no equivalent, so `moduleNameMapper`
in `jest.config.ts` points at the files here. They exist because
`sveltekit-superforms`' entry point pulls in `SuperDebug.svelte`, which imports
`$app/state` - so any test that mounts a superforms-based component needs them,
not just tests that use SvelteKit navigation directly.

Keep them minimal: a test that depends on real navigation behaviour should mock
the specific module itself rather than growing these.
