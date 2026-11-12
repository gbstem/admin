# Firestore: writes, reads and email addresses

## The browser never writes Firestore

**Every Firestore write is server-side, with the Admin SDK. `firestore.rules` grants a client one write only: a person's own `firstName`/`lastName` in `users/{uid}` (`userService.updateUserName`).** That exception stays because the rule itself confines it to the caller's document and those two keys, the values are display text, and nothing authorizes or decides anything from them. Don't add an `allow write` (or `create`/`update`/`delete`) to `firestore.rules`, and don't add `setDoc`/`updateDoc`/`addDoc`/`deleteDoc` to `src/lib/services/`; add a form action or an API route. `__tests__/rules/` asserts the refusals for admins and reviewers too.

Why, since `allow write: if isAdmin()` would keep outsiders out: a rule checks who writes, not what. It can't run a Zod schema, keep two documents in agreement, stop a dialog's stale copy overwriting newer data, compute a derived field, or express "a reviewer may edit only their own slot". Server code can, and `yarn test` covers it where rules need the emulator. See README's [Code Organization](../README.md#code-organization-helpers-services-and-where-new-code-should-go), section 3.

### How a write is shaped

- **A form posts to a form action.** EditApplicationForm, EditRegistrationForm, EditClassForm and CreateTokenForm post to `/applications?/saveApplication`, `/registrations?/saveRegistration`, `/classes?/saveClass` and `/tokens?/createToken`. Each action checks the role (`verifyAdmin` for registrations and tokens, `verifyAdminOrReviewer` for applications and classes), validates with `superValidate` against the same schema, and writes through the server `<name>Service`. The edit actions take their target from `&id=…&semester=…` through `#lib/server/editTarget`, which refuses an unknown semester rather than falling back to the current one, and merge only the fields the form owns. The client keeps `superForm(defaults(..., { id }))` without `SPA`, sharing the form id with the action (`EDIT_APPLICATION_FORM_ID`, ...), with `dataType: 'json'` and `invalidateAll: false` plus an explicit `invalidate(...)`. `__tests__/editFormActions.test.ts` shows how to drive an action with a superforms request.
- **Anything else calls an API route** through the browser-side service: `/api/enroll` (enroll and drop, class and registration in one transaction), `/api/decision` (notes, likely and official decisions with their emails), `/api/interviewSlot` (add, assign, edit, mark missed, delete, and the availability grid's bulk create and delete of open slots), `/api/classStatuses` (per-session statuses, computed with `#lib/helpers/classStatuses`, kept identical to portal's `computeUpdatedClassStatuses`), `/api/tokens` (delete) and `/api/checkIn` (check in, record a meal). The registrations table's bypass-age checkbox posts to the `?/setBypassAgeLimits` action.
- **A request carries ids and the person's choices; the server looks up the rest** (names, uids, the interviewer, the time, statuses) from the session, its clock and the stored documents. An email that fails after the write is reported (`emailSent`, `emailsFailed`) rather than thrown.

The dialogs still _read_ their documents with the client SDK, so the read rules remain.

## Writes that have to agree go in one atomic write

When an operation changes more than one document that must stay consistent — a class's `students` and a registration's `classes`, a decision and its application's `meta.decided`/`meta.decisionType`, a slot and `meta.interview` — use a `writeBatch` for blind writes and `runTransaction` when a write is computed from something read (`#lib/server/classEnrollments`, `#lib/server/applicationDecisions`, `#lib/server/interviewSlots`, `accountService.recordNewAccount`). Sequential `await updateDoc(...)` calls leave half the change behind whenever the second one fails. And an edit form saves only the fields it owns, merged: writing the whole document back from the copy it loaded silently undoes what those atomic writes did in the meantime.

## Server loads use a DAL module

`+page.server.ts` Firestore queries belong in a server-side DAL module, `src/lib/server/<name>Service.ts` (see `subRequestService.ts`), not inline in the load. Every current load follows this; account deletion is the one flow still outside it (see the TODO in README's [Code Organization](../README.md#code-organization-helpers-services-and-where-new-code-should-go)).

## Email addresses are resolved from uids

**A view that shows another person's email address resolves it from their uid**, never from a copy stored on a document, which goes stale when its owner changes their account email.

- A `+page.server.ts` load calls `resolveAccountEmails` (`#lib/server/accountEmails.ts`, one batched Auth call per 100 uids) from its DAL.
- A component reading Firestore from the browser goes through `/api/resolveEmails`: each use case is an _intent_ in `#lib/server/emailIntents.ts`, whose policy reads a context document to decide which uids this caller may resolve, reached through a task-named wrapper in the owning service (`studentService.fetchClassInstructorEmail`). Add an intent there rather than a new endpoint.

The route, `accountEmails.ts` and `#lib/services/accountEmailService.ts` are byte-identical with portal's; `emailIntents.ts` is not.

Applications and registrations still store `personal.email`, but only as an audit record of the submitting account's address, written on every save and never read (resolve the applicant from the application id, the parent from the registration key via `registrationParentUid`); only a registration's `personal.secondaryEmail`, a second guardian's typed address with no Auth account behind it, is read.
