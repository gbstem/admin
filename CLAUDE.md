@AGENTS.md

# Codebase Conventions for AI Assistants

This supplements [README.md](README.md) (architecture, setup, Firestore semester schema) with code-level conventions the README doesn't cover. Read the README first.

## Tightly coupled with `../portal`

Admin and portal share the **same Firestore database and Firebase project**, the same `firestore.rules` (merged by hand for production deploys — see README), and each keeps its own copy of `src/lib/data/collections.ts`, `semesterDates.json`, and `courses.json` (the course catalog) that must be updated **in both repos together** during a semester rollover (see README's "Adding a New Semester"). `courses.json` is mastered here and copied verbatim to portal **and to the curriculum repo**, whose `__tests__/courses.test.ts` fails if a course in the catalog has no page there — portal builds every `curriculum.gbstem.org` link as `/{track}/{id}` straight from these entries. If you change a collection path, a security rule, or the `Data` type namespace here, check whether `../portal` needs the identical change.

**Ship a cross-repo change as two PRs on a branch of the same name in both repos.** Portal's e2e job seeds the shared emulator from _this_ repo — from an admin branch with the same name when one exists, and from admin's default branch otherwise (see portal's `.github/workflows/ci.yml`). So a change to `scripts/seed.ts` here is what portal's Cypress suite runs against, and matching the branch name is what lets a portal PR that depends on a new fixture go green before this one merges.

## Route groups are auth gates, not just folders

- `(signedIn)/+layout.server.ts` redirects to `/signin` if `locals.user === null`.
- `(signedIn)/(emailVerified)/+layout.server.ts` additionally redirects to `/profile` if the email isn't verified.
- `locals.user` is populated in `src/hooks.server.ts` from the `__session` cookie via `adminAuth.verifySessionCookie`; only `admin`/`reviewer` custom-claim roles are accepted — everyone else is redirected to `portal.gbstem.org`.
- **New protected page → put it under `src/routes/(signedIn)/(emailVerified)/<name>/+page.svelte`.** Don't add manual auth checks; the layout hierarchy already gates it.

## Svelte 5 runes, callback props, snippets

`package.json` pins `svelte@^5` and the codebase is written in runes mode: `$props()`/`$state`/`$derived`/`$bindable` for component state, `$effect` for side effects (never for syncing state that is also read in the same effect — see below). Component "events" are plain callback props (`onclick`, `onSubmit`, `onCancel`, ...), not `createEventDispatcher`/`on:*`. Use snippets (`{#snippet ...}` / `children: Snippet`) instead of `<slot />`. Shared cross-component state lives in rune-backed `.svelte.ts` modules (see `src/lib/stores.svelte.ts`), not `svelte/store` — the one deliberate exception is `src/lib/client/firebase.ts`'s `user` store, which stays a `svelte/store` on purpose because module-level `$state` would leak between requests during SSR. Navigation/page info comes from `$app/state` (`page`, `navigating`), not the deprecated `$app/stores`; note `navigating` is always truthy there — check `navigating.to`/`navigating.type`, not `if (navigating)`.

When a value is derived from other reactive state, use `$derived`/`$derived.by` — don't reach for `$effect` to "copy" one piece of state into another; that's the guard-variable-hack shape this codebase spent real effort removing.

## Forms: SPA Superforms, not server actions

Nearly every form writes directly to Firestore client-side; only `(signedOut)/signup` uses a real SvelteKit form `action`. The pattern (see `EditClassForm.svelte`):

```js
superForm(defaults(initialValues, zod(schema)), {
  SPA: true,
  validators: zod(schema),
  resetForm: false,
  applyAction: false,
  async onUpdate({ form }) {
    /* setDoc(...) then alert.trigger(...) on failure */
  },
})
```

Schemas live in `src/lib/components/forms/schemas.ts` (also reused by `scripts/seed.ts`). Field wrapper components (`FormInput`, `FormNativeSelect`, `FormCheckbox`) take `form`, `name`, `label`, `bind:value`.

## The semester-derivation rule (a real bug we've hit before)

`src/lib/data/collections.ts` exports both static current-semester collection constants (`decisionsCollection`, `applicationsCollection`, ...) **and** `semesterCollectionPath(semesterId, name)` / `semesterIdFromPath(path)` / `withSemester(values, semesterId?)`. Admins can browse a past semester's applications/registrations via `?semester=`. **Any component that receives a semester-scoped `collection` path as a prop must derive the semester it writes to from that prop — never from a static current-semester constant** — or writes silently land in the wrong semester (or, if the same uid also has a current-semester document, overwrite unrelated data with no error surfaced). Follow the pattern already used in `EditApplicationForm.svelte`/`EditRegistrationForm.svelte`: `semesterIdFromPath(collection) ?? currentSemester`.

## Firestore access

- `src/lib/client/firebase.ts` → client SDK, used in `.svelte` components/forms, gated by `firestore.rules`.
- `src/lib/server/firebase.ts` → Admin SDK, used only in `hooks.server.ts` and `src/routes/api/*/+server.ts`.
- API routes: guard with `verifyAdmin(locals)` / `verifyAuthenticated(locals)` and wrap the body in `try { ... } catch (err) { throw handleApiError(err) }` (both from `src/lib/server/apiHelpers.ts`).

## Types

Domain types live in `src/lib/data/types/` plus a global ambient `Data` namespace in `src/data.d.ts` (e.g. `Data.User.Peek`, `Data.Role`) — usable unimported anywhere. `tsconfig.json` sets `strict: true` and `verbatimModuleSyntax: true`, so type-only imports must use `import type`.

## Error handling

Client-side: the `alert` store (`src/lib/stores.ts`) drives toast UI — `alert.trigger('error', err.code ?? err.message, true)`. Server-side: `handleError` in `hooks.server.ts` logs non-404s; API routes use `handleApiError`.

## Testing

Jest, one `<module>.test.ts` per `src/lib` module under `__tests__/`. `firebase-admin`/Firestore calls are mocked with hand-rolled `DocumentReference`/`Query`/`CollectionReference` classes (see `firebase.test.ts`) — no emulator needed for unit tests. `collections.test.ts` asserts against `currentSemester` via a `^(Spring|Fall)\d\d$` regex rather than a hardcoded string, so it survives semester rollovers unedited; keep that pattern for new semester-aware tests.
