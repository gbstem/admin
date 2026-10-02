@AGENTS.md

# Codebase Conventions for AI Assistants

This supplements [README.md](README.md) (architecture, setup, Firestore semester schema) with code-level conventions the README doesn't cover. Read the README first.

## Tightly coupled with `../portal`

Admin and portal share the **same Firestore database and Firebase project**, the same `firestore.rules` (merged by hand for production deploys — see README), and each keeps its own copy of `src/lib/data/collections.ts`, `semesterDates.json`, and `courses.json` (the course catalog) that must be updated **in both repos together** during a semester rollover (see README's "Adding a New Semester"). `courses.json` is mastered here and copied verbatim to portal **and to the curriculum repo**, whose `__tests__/courses.test.ts` fails if a course in the catalog has no page there — portal builds every `curriculum.gbstem.org` link as `/{track}/{id}` straight from these entries. If you change a collection path, a security rule, or the `Data` type namespace here, check whether `../portal` needs the identical change.

**Ship a cross-repo change as two PRs on a branch of the same name in both repos.** Portal's e2e job seeds the shared emulator from _this_ repo — from an admin branch with the same name when one exists, and from admin's default branch otherwise (see portal's `.github/workflows/ci.yml`). So a change to `scripts/seed.ts` here is what portal's Cypress suite runs against, and matching the branch name is what lets a portal PR that depends on a new fixture go green before this one merges.

**`src/lib/shared/` is the same in both repos, file for file.** It holds small utilities both sites need (`timestamps.ts`: `toDate`/`toDateOrNull` for a stored date in any shape; `apiErrors.ts`: `errorMessage(res, fallback)` for a refused `fetch` to one of our routes), each with a test of the same name in `__tests__/`. Files there import nothing from `$lib`, so they can be copied across verbatim: change one in both repos together, on branches of the same name. Before writing a helper that isn't specific to this site (another `typeof value.toDate === 'function'`, another `res.json().catch(...)`), look there first, and put a new one there rather than in the file that happens to need it.

## Route groups are auth gates, not just folders

- `(signedIn)/+layout.server.ts` redirects to `/signin` if `locals.user === null`.
- `(signedIn)/(emailVerified)/+layout.server.ts` additionally redirects to `/profile` if the email isn't verified.
- `locals.user` is populated in `src/hooks.server.ts` from the `__session` cookie via `adminAuth.verifySessionCookie`; only `admin`/`reviewer` custom-claim roles are accepted — everyone else is redirected to `portal.gbstem.org`.
- **New protected page → put it under `src/routes/(signedIn)/(emailVerified)/<name>/+page.svelte`.** Don't add manual auth checks; the layout hierarchy already gates it.

## Svelte 5 runes, callback props, snippets

`package.json` pins `svelte@^5` and the codebase is written in runes mode: `$props()`/`$state`/`$derived`/`$bindable` for component state, `$effect` for side effects (never for syncing state that is also read in the same effect — see below). Component "events" are plain callback props (`onclick`, `onSubmit`, `onCancel`, ...), not `createEventDispatcher`/`on:*`. Use snippets (`{#snippet ...}` / `children: Snippet`) instead of `<slot />`. Shared cross-component state lives in rune-backed `.svelte.ts` modules (see `src/lib/stores.svelte.ts`), not `svelte/store` — the one deliberate exception is `src/lib/client/firebase.ts`'s `user` store, which stays a `svelte/store` on purpose because module-level `$state` would leak between requests during SSR. Navigation/page info comes from `$app/state` (`page`, `navigating`), not the deprecated `$app/stores`; note `navigating` is always truthy there — check `navigating.to`/`navigating.type`, not `if (navigating)`.

When a value is derived from other reactive state, use `$derived`/`$derived.by` — don't reach for `$effect` to "copy" one piece of state into another; that's the guard-variable-hack shape this codebase spent real effort removing.

## The browser never writes Firestore

**Every Firestore write is server-side, with the Admin SDK. `firestore.rules` grants a client one write only: a person's own `firstName`/`lastName` in `users/{uid}` (`userService.updateUserName`).** That exception stays because the rule itself confines it to the caller's document and those two keys, the values are display text, and nothing authorizes or decides anything from them. Don't add an `allow write` (or `create`/`update`/`delete`) to `firestore.rules`, and don't add `setDoc`/`updateDoc`/`addDoc`/`deleteDoc` to `src/lib/services/`; add a form action or an API route. `__tests__/rules/` asserts the refusals for admins and reviewers too.

Why, since `allow write: if isAdmin()` would keep outsiders out: a rule checks who writes, not what. It can't run a Zod schema, keep two documents in agreement, stop a dialog's stale copy overwriting newer data, compute a derived field, or express "a reviewer may edit only their own slot". Server code can, and `yarn test` covers it where rules need the emulator. See README's [Code Organization](README.md#code-organization-helpers-services-and-where-new-code-should-go), section 3.

How a write is shaped:

- **A form posts to a form action.** EditApplicationForm, EditRegistrationForm, EditClassForm and CreateTokenForm post to `/applications?/saveApplication`, `/registrations?/saveRegistration`, `/classes?/saveClass` and `/tokens?/createToken`. Each action checks the role (`verifyAdmin` for registrations and tokens, `verifyAdminOrReviewer` for applications and classes), validates with `superValidate` against the same schema, and writes through the server `<name>Service`. The edit actions take their target from `&id=…&semester=…` through `$lib/server/editTarget`, which refuses an unknown semester rather than falling back to the current one, and merge only the fields the form owns. The client keeps `superForm(defaults(..., { id }))` without `SPA`, sharing the form id with the action (`EDIT_APPLICATION_FORM_ID`, ...), with `dataType: 'json'` and `invalidateAll: false` plus an explicit `invalidate(...)`. `__tests__/editFormActions.test.ts` shows how to drive an action with a superforms request.
- **Anything else calls an API route** through the browser-side service: `/api/enroll` (enroll and drop, class and registration in one transaction), `/api/decision` (notes, likely and official decisions with their emails), `/api/interviewSlot` (add, assign, edit, delete), `/api/classStatuses` (per-session statuses, computed with `$lib/helpers/classStatuses`, kept identical to portal's `computeUpdatedClassStatuses`), `/api/tokens` (delete) and `/api/checkIn` (check in, record a meal). The registrations table's bypass-age checkbox posts to the `?/setBypassAgeLimits` action.
- **A request carries ids and the person's choices; the server looks up the rest** (names, uids, the interviewer, the time, statuses) from the session, its clock and the stored documents. An email that fails after the write is reported (`emailSent`, `emailsFailed`) rather than thrown.

The dialogs still _read_ their documents with the client SDK, so the read rules remain.

## Forms

The forms that don't write Firestore (sign-in, password, email, the name change above) are SPA Superforms that call Firebase Auth or a service from `onUpdate`; `(signedOut)/signup` uses a real SvelteKit form `action`. The SPA pattern (see `ChangeNameForm.svelte`):

```js
superForm(defaults(initialValues, zod(schema)), {
  SPA: true,
  validators: zod(schema),
  resetForm: false,
  applyAction: false,
  async onUpdate({ form }) {
    /* call the service, then alert.trigger(...) on failure */
  },
})
```

Schemas live in `src/lib/components/forms/schemas.ts` (also reused by `scripts/seed.ts`). Field wrapper components (`FormInput`, `FormNativeSelect`, `FormCheckbox`) take `form`, `name`, `label`, `bind:value`. They read the schema's constraints (`required`, `maxlength`, `pattern`, ...) from the superForm's constraints **store** via `$lib/components/fieldConstraints` (identical to portal's); reading `form.constraints` as a plain object is the bug that once kept every constraint off every input. Every Superforms `<form>` is `novalidate`, so zod reports every error inline rather than some as browser popups — which means a rule only an input's `required` attribute enforces is not enforced at all. Put it in the schema (see `agreementSchema`, the `essay` refinement, `editClassFormSchema`).

## The semester-derivation rule (a real bug we've hit before)

`src/lib/data/collections.ts` exports both static current-semester collection constants (`decisionsCollection`, `applicationsCollection`, ...) **and** `semesterCollectionPath(semesterId, name)` / `semesterIdFromPath(path)` / `withSemester(values, semesterId?)`. Admins can browse a past semester's applications/registrations via `?semester=`. **Any component that receives a semester-scoped `collection` path as a prop must derive the semester it writes to from that prop — never from a static current-semester constant** — or writes silently land in the wrong semester (or, if the same uid also has a current-semester document, overwrite unrelated data with no error surfaced). Follow the pattern already used in `EditApplicationForm.svelte`/`EditRegistrationForm.svelte`: `semesterIdFromPath(collection) ?? currentSemester`.

## Firestore access

- `src/lib/client/firebase.ts` → client SDK, used by `src/lib/services/` for reads (and the one name write above), gated by `firestore.rules`.
- `src/lib/server/firebase.ts` → Admin SDK, used in `hooks.server.ts`, `src/routes/api/*/+server.ts`, and `+page.server.ts` loads.
- `+page.server.ts` Firestore queries belong in a server-side DAL module, `src/lib/server/<name>Service.ts` (see `subRequestService.ts`), not inline in the load. Every current load follows this; account deletion is the one flow still outside it (see the TODO in README's [Code Organization](README.md#code-organization-helpers-services-and-where-new-code-should-go)).
- API routes: guard with `verifyAdmin(locals)` / `verifyAuthenticated(locals)` and wrap the body in `try { ... } catch (err) { throw handleApiError(err) }` (both from `src/lib/server/apiHelpers.ts`).
- **Writes that have to agree go in one atomic write.** When an operation changes more than one document that must stay consistent - a class's `students` and a registration's `classes`, a decision and its application's `meta.decided`, a slot and `meta.interview` - use a `writeBatch` for blind writes and `runTransaction` when a write is computed from something read (`$lib/server/classEnrollments`, `$lib/server/applicationDecisions`, `$lib/server/interviewSlots`, `accountService.recordNewAccount`). Sequential `await updateDoc(...)` calls leave half the change behind whenever the second one fails. And an edit form saves only the fields it owns, merged: writing the whole document back from the copy it loaded silently undoes what those atomic writes did in the meantime.
- **A view that shows another person's email address resolves it from their uid**, never from a copy stored on a document, which goes stale when its owner changes their account email. A `+page.server.ts` load calls `resolveAccountEmails` (`$lib/server/accountEmails.ts`, one batched Auth call per 100 uids) from its DAL. A component reading Firestore from the browser goes through `/api/resolveEmails`: each use case is an _intent_ in `$lib/server/emailIntents.ts`, whose policy reads a context document to decide which uids this caller may resolve, reached through a task-named wrapper in the owning service (`studentService.fetchClassInstructorEmail`). Add an intent there rather than a new endpoint. The route, `accountEmails.ts` and `$lib/services/accountEmailService.ts` are byte-identical with portal's; `emailIntents.ts` is not. Applications and registrations still store `personal.email`, but only as an audit record of the submitting account's address, written on every save and never read (resolve the applicant from the application id, the parent from the registration key via `registrationParentUid`); only a registration's `personal.secondaryEmail`, a second guardian's typed address with no Auth account behind it, is read.

## Roles come from the Auth claim, never from a document

A user's role is the Firebase Auth **custom claim**, and there is no copy of it anywhere else: `users/{uid}` holds `firstName`/`lastName` only, and `firestore.rules` refuses a client write of any other field there. Rules read the claim via `hasRRole()`; server code reads `locals.user.role`, which `hooks.server.ts` took off the Auth record. Pages and components read that same value as `page.data.user.role` (from `$app/state`, or a page's `data` prop), which `(signedIn)/+layout.server.ts` provides on the first render; the client `user` store carries no role, so there is only one to read. **Never authorize against a document the subject of that authorization can write** — `firestore.rules` used to read the instructor role out of `users/{uid}`, which any signed-in user could rewrite to grant themselves read access to every student registration.

`instructor` means "applied to teach", not "teaches": it is granted at signup, before any interview. Whether someone was accepted lives in `semesters/{id}/decisions/{uid}.type`, which only an admin or reviewer can write. Portal's server code checks it with `isAcceptedInstructor(uid)` from `instructorDirectory.ts`, or `canSubstitute(uid)` where a `substitute` decision should count too. `firestore.rules` grants an instructor no write beyond their own name in `users/{uid}`: saving a class, changing its schedule, filing or claiming a sub request, and booking or requesting an interview slot are all portal API routes that check with the Admin SDK (see README's [Roles and Authorization](README.md#roles-and-authorization)). Add a route like those rather than widening a rule.

Changing a role means changing the claim, server-side — `scripts/set-user-role.ts` for one account. **Don't store a role in a Firestore document**, not even "for display": `users/{uid}.role` used to exist, fell out of step with the claim on 521 accounts, and got read by UI code in place of the claim. See README's [Roles and Authorization](README.md#roles-and-authorization).

`firestore.rules` has its own test suite — `yarn test:rules`, needs the emulator — because `yarn test` mocks Firestore and so cannot see rules at all. Any rule you change wants a case for what it grants _and_ what it must still refuse.

## Icons come from Heroicons, not pasted `<svg>`s

Icons are Heroicons, through `@steeze-ui/heroicons` and `@steeze-ui/svelte-icon`: `<Icon src={XMark} class="h-5 w-5" />`, with `theme="mini"` for the 20px solid set. `Icon` renders the `<svg>` inline, so server-rendered pages still carry it in their HTML. `$lib/components/icons/` holds only glyphs Heroicons lacks (`SpinnerIcon`, `PersonIcon`). **Don't paste a new `<svg>` into a page or component** — use a Heroicon, or add a component there when none fits. Keep one glyph per idea: check what the app already uses for a concept before picking an icon for it. Portal follows the same convention.

## Types

Domain types live in `src/lib/data/types/` plus a global ambient `Data` namespace in `src/data.d.ts` (e.g. `Data.User.Peek`, `Data.Role`) — usable unimported anywhere. `tsconfig.json` sets `strict: true` and `verbatimModuleSyntax: true`, so type-only imports must use `import type`.

## Error handling

Client-side: the `alert` store (`src/lib/stores.ts`) drives toast UI — `alert.trigger('error', err.code ?? err.message, true)`. Server-side: `handleError` in `hooks.server.ts` logs non-404s; API routes use `handleApiError`.

## Testing

Jest, one `<module>.test.ts` per `src/lib` module under `__tests__/`. `firebase-admin`/Firestore calls are mocked with hand-rolled `DocumentReference`/`Query`/`CollectionReference` classes (see `firebase.test.ts`) — no emulator needed for unit tests (the sole exception is `__tests__/rules/`, which evaluates `firestore.rules` for real and runs under `yarn test:rules`). `collections.test.ts` asserts against `currentSemester` via a `^(Spring|Fall)\d\d$` regex rather than a hardcoded string, so it survives semester rollovers unedited; keep that pattern for new semester-aware tests.
