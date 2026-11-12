@AGENTS.md

# Codebase Conventions for AI Assistants

Read [README.md](README.md) first (architecture, setup, Firestore semester schema). This file holds the rules every change must follow; the `docs/` pages it links hold the details and the reasons, so open one when your task touches its subject.

## Tightly coupled with `../portal`

Admin and portal share one Firebase project, one Firestore database and one `firestore.rules`. If you change a collection path, a security rule, the `Data` namespace, `collections.ts`, `semesterDates.json`, `courses.json` (mastered here, also copied to curriculum and website) or anything in `src/lib/shared/` (identical in both repos), make the matching change in `../portal`. **Ship it as two PRs on branches of the same name**: portal's e2e job seeds from this repo's `scripts/seed.ts` on the matching branch. Before writing a helper that isn't specific to admin, look in `src/lib/shared/` first. Details: [docs/cross-repo.md](docs/cross-repo.md).

## Route groups are auth gates, not just folders

- `(signedIn)/+layout.server.ts` redirects to `/signin` if `locals.user === null`.
- `(signedIn)/(emailVerified)/+layout.server.ts` additionally redirects to `/profile` if the email isn't verified.
- `locals.user` is populated in `src/hooks.server.ts` from the `__session` cookie via `adminAuth.verifySessionCookie`; only `admin`/`reviewer` custom-claim roles are accepted — everyone else is redirected to `portal.gbstem.org`.
- **New protected page → put it under `src/routes/(signedIn)/(emailVerified)/<name>/+page.svelte`.** Don't add manual auth checks; the layout hierarchy already gates it.

## Svelte 5 runes, callback props, snippets

- Runes mode throughout: `$props()`/`$state`/`$derived`/`$bindable`. `$effect` is for side effects only. **A value derived from other state uses `$derived`/`$derived.by`, never an `$effect` that copies one piece of state into another** (the guard-variable hack this codebase spent real effort removing).
- Component "events" are callback props (`onclick`, `onSubmit`, ...), not `createEventDispatcher`/`on:*`. Use snippets (`{#snippet}`, `children: Snippet`), not `<slot />`.
- Shared state lives in rune-backed `.svelte.ts` modules (`src/lib/stores.svelte.ts`), not `svelte/store`. The one exception is the `user` store in `src/lib/client/firebase.ts`, kept as a `svelte/store` because module-level `$state` would leak between SSR requests.
- Use `$app/state` (`page`, `navigating`), not `$app/stores` (removed in SvelteKit 3). `navigating` is always truthy: check `navigating.to`/`navigating.type`.

## Firestore

- **The browser never writes Firestore.** The only client write `firestore.rules` allows is a person's own `firstName`/`lastName` in `users/{uid}`. Don't add `allow write` rules or `setDoc`/`updateDoc`/`addDoc`/`deleteDoc` to `src/lib/services/`. A form posts to a form action; anything else calls an API route. Requests carry ids and choices, and the server looks up everything else.
- `src/lib/client/firebase.ts` is the client SDK, used by `src/lib/services/` for reads. `src/lib/server/firebase.ts` is the Admin SDK, used in `hooks.server.ts`, `src/routes/api/*/+server.ts` and `+page.server.ts`, whose queries belong in a DAL module `src/lib/server/<name>Service.ts`.
- API routes: guard with `verifyAdmin(locals)` / `verifyAuthenticated(locals)` and wrap the body in `try { ... } catch (err) { throw handleApiError(err) }` (both from `src/lib/server/apiHelpers.ts`).
- **Writes that have to agree go in one `writeBatch`/`runTransaction`**, never sequential awaits. Edit forms merge only the fields they own.
- **Another person's email address is resolved from their uid**, never read from a document: `resolveAccountEmails` in server loads, an intent in `#lib/server/emailIntents.ts` behind `/api/resolveEmails` from the browser.

Details (the form actions and API routes, why rules can't do this, email intents): [docs/firestore.md](docs/firestore.md).

## The semester-derivation rule (a real bug we've hit before)

Admins can browse past semesters via `?semester=`. **A component that receives a semester-scoped `collection` path as a prop must derive the semester it writes to from that prop, never from a static current-semester constant** like `applicationsCollection`. Otherwise writes silently land in the wrong semester, or overwrite the same uid's current-semester document. Follow `EditApplicationForm.svelte`: `semesterIdFromPath(collection) ?? currentSemester` (helpers in `src/lib/data/collections.ts`, alongside `semesterCollectionPath` and `withSemester`).

## Forms

Schemas live in `src/lib/components/forms/schemas.ts` (also used by `scripts/seed.ts`). Every Superforms `<form>` is `novalidate`, so **a validation rule must be in the zod schema**: an input's `required` attribute alone enforces nothing. Non-writing forms are SPA Superforms. Pattern and field-constraint details: [docs/forms.md](docs/forms.md).

## Roles come from the Auth claim, never from a document

A role is the Firebase Auth custom claim only: `hasRRole()` in rules, `locals.user.role` on the server, `page.data.user.role` in components. **Never store a role in a Firestore document, and never authorize against a document its subject can write.** `instructor` means "applied to teach"; acceptance is `decisions/{uid}.type`. Change a role with `scripts/set-user-role.ts`. A rule change needs `yarn test:rules` cases for what it grants and what it still refuses. Details: [docs/roles.md](docs/roles.md).

## Icons come from Heroicons, not pasted `<svg>`s

`<Icon src={XMark} class="h-5 w-5" />` from `@steeze-ui/heroicons` + `@steeze-ui/svelte-icon` (`theme="mini"` for the 20px solid set). `#lib/components/icons/` holds only glyphs Heroicons lacks. **Never paste a new `<svg>`.** Keep one glyph per idea: check what the app already uses for a concept. Portal follows the same convention.

## Types

Domain types live in `src/lib/data/types/` plus a global ambient `Data` namespace in `src/data.d.ts` (e.g. `Data.User.Peek`, `Data.Role`), usable unimported anywhere. `strict` and `verbatimModuleSyntax` are on, so type-only imports must use `import type`.

## Error handling

Client-side: the `alert` store (`src/lib/stores.ts`) drives toast UI: `alert.trigger('error', err.code ?? err.message, true)`. Server-side: `handleError` in `hooks.server.ts` logs non-404s; API routes use `handleApiError`.

## Testing

Jest, one `<module>.test.ts` per `src/lib` module under `__tests__/`. Firestore is mocked with hand-rolled `DocumentReference`/`Query`/`CollectionReference` classes (see `firebase.test.ts`), so no emulator is needed, except for `__tests__/rules/` (`yarn test:rules`). Semester-aware tests assert against `currentSemester` with a `^(Spring|Fall)\d\d$` regex rather than a hardcoded string (see `collections.test.ts`), so they survive rollovers.
