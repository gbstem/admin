# Changes that span admin and portal

Admin and portal share the **same Firestore database and Firebase project**, the same `firestore.rules` (merged by hand for production deploys — see README), and each keeps its own copy of `src/lib/data/collections.ts`, `semesterDates.json`, and `courses.json` (the course catalog) that must be updated **in both repos together** during a semester rollover (see README's "Adding a New Semester"). `courses.json` is mastered here and copied verbatim to portal **and to the curriculum and website repos**; curriculum's `__tests__/courses.test.ts` fails if a course in the catalog has no page there, because portal builds every `curriculum.gbstem.org` link as `/{track}/{id}` straight from these entries. If you change a collection path, a security rule, or the `Data` type namespace here, check whether `../portal` needs the identical change.

## Two PRs on a branch of the same name

Portal's e2e job seeds the shared emulator from _this_ repo — from an admin branch with the same name when one exists, and from admin's default branch otherwise (see portal's `.github/workflows/ci.yml`). So a change to `scripts/seed.ts` here is what portal's Cypress suite runs against, and matching the branch name is what lets a portal PR that depends on a new fixture go green before this one merges.

## `src/lib/shared/` is identical in both repos

It holds small utilities both sites need, each with a test of the same name in `__tests__/`:

- `timestamps.ts`: `toDate`/`toDateOrNull` for a stored date in any shape.
- `apiErrors.ts`: `errorMessage(res, fallback)` for a refused `fetch` to one of our routes.
- `gbstemTime.ts`: a `semesterDates.json` date as an instant in New York time, and `localTimeZoneLabel()` for labelling times shown in the viewer's zone.
- `interviews.ts`: `INTERVIEW_DURATION_MINUTES` and the interview window.

Files there import nothing from `#lib`, so they can be copied across verbatim: change one in both repos together, on branches of the same name. Before writing a helper that isn't specific to this site (another `typeof value.toDate === 'function'`, another `res.json().catch(...)`), look there first, and put a new one there rather than in the file that happens to need it.
