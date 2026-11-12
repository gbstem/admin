# Roles come from the Auth claim, never from a document

See also README's [Roles and Authorization](../README.md#roles-and-authorization).

A user's role is the Firebase Auth **custom claim**, and there is no copy of it anywhere else: `users/{uid}` holds `firstName`/`lastName` only, and `firestore.rules` refuses a client write of any other field there. Rules read the claim via `hasRRole()`; server code reads `locals.user.role`, which `hooks.server.ts` took off the Auth record. Pages and components read that same value as `page.data.user.role` (from `$app/state`, or a page's `data` prop), which `(signedIn)/+layout.server.ts` provides on the first render; the client `user` store carries no role, so there is only one to read.

**Never authorize against a document the subject of that authorization can write** — `firestore.rules` once read the instructor role out of `users/{uid}`, which any signed-in user could rewrite to grant themselves read access to every student registration.

## `instructor` means "applied to teach", not "teaches"

It is granted at signup, before any interview. Whether someone was accepted lives in `semesters/{id}/decisions/{uid}.type`, which only an admin or reviewer can write. Portal's server code checks it with `isAcceptedInstructor(uid)` from `instructorDirectory.ts`, or `canSubstitute(uid)` where a `substitute` decision should count too. `firestore.rules` grants an instructor no write beyond their own name in `users/{uid}`: saving a class, changing its schedule, filing or claiming a sub request, and booking or requesting an interview slot are all portal API routes that check with the Admin SDK. Add a route like those rather than widening a rule.

## Changing a role

Change the claim, server-side — `scripts/set-user-role.ts` for one account. **Don't store a role in a Firestore document**, not even "for display": a stored `users/{uid}.role` fell out of step with the claim on 521 accounts and got read by UI code in place of the claim.

## Rules tests

`firestore.rules` has its own test suite — `yarn test:rules`, needs the emulator — because `yarn test` mocks Firestore and so cannot see rules at all. Any rule you change wants a case for what it grants _and_ what it must still refuse.
