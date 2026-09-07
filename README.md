# gbSTEM Admin

<https://www.gbstem.org/>

## Description

> Inspiring the Next Generation of STEM Innovators

Greater Boston STEM Program's website for administering the portal. It serves as the administrative interface for managing applications, registrations, classes, and users.

This website is part of the gbSTEM ecosystem. **It is primarily maintained by a rotating group of High School and college students.** Because of this, maintaining clear, readable code and robust documentation is highly prioritized.

## Frameworks and Libraries

This project relies on several key modern web technologies:

- **[SvelteKit](https://kit.svelte.dev/)**: The core Svelte framework used for building the site. We use SvelteKit's filesystem-based routing, server hooks, and server-side loading logic.
- **[Svelte](https://svelte.dev/)**: The reactive component framework (using Svelte 5 runes) for building lightweight, highly responsive user interfaces.
- **[TypeScript](https://www.typescriptlang.org/)**: A strongly typed programming language that builds on JavaScript, giving you better tooling and strict type-checking at any scale.
- **[Tailwind CSS](https://tailwindcss.com/)**: A utility-first CSS framework packed with classes that can be composed to build any design, directly in your markup.
- **[Firebase](https://firebase.google.com/)**: Client-side SDK used for interacting with the database (Cloud Firestore) and Firebase Authentication.
- **[Firebase Admin SDK](https://firebase.google.com/docs/admin)**: Node.js SDK used for server-side management tasks, backend hooks, and admin-level database operations.
- **[Algolia Search](https://www.algolia.com/)**: Integrated search client (`algoliasearch`) used for indexing and searching portal entries efficiently.
- **[SendGrid](https://sendgrid.com/)**: Transactional email service used to send system notifications, confirmations, and reminders.
- **[Jest](https://jestjs.io/) & [Svelte Testing Tools](https://testing-library.com/)**: Our primary testing suite. We use Jest to write unit tests for utility functions and helper files.
- **[SvelteKit Superforms](https://superforms.rocks/)**: Form state management library for SvelteKit, used to handle form loading states, bindings, validation, and progressive enhancement.
- **[Zod](https://zod.dev/)**: A schema declaration and validation library, used to declare form schemas and validate client/server payloads.
- **[Formsnap](https://formsnap.dev/)**: Accessible, accessible-first form builder library for Svelte, integrating SvelteKit-Superforms validation with shadcn/bits-ui components.
- **[Bits UI](https://bits-ui.com/)**: A headless component library for Svelte providing accessible, unstyled components that serve as the foundation for Formsnap and shadcn components.
- **[MJML](https://github.com/mjmlio/mjml)**: Email templating language and engine used to generate responsive HTML emails.

## Getting Started with Development

### 1. Environment Configuration

Before running the development server, you must configure your local environment variables:

1. Copy the `.env.example` file to create a `.env.local` file:

   ```bash
   cp .env.example .env.local
   ```

2. For general development, step 1 gives you everything you need. For special cases where you need access to production resources, you may edit `.env.local` to adjust the placeholder values with the actual service credentials.

> [!WARNING]
> **Never commit your `.env.local` file or actual secrets to GitHub.** This file is configured to be ignored by Git to prevent exposing sensitive API keys and credentials. For details on how `.env` files work and how to avoid exposing credentials, read the [dotenv environment secrets guide](https://github.com/motdotla/dotenv#should-i-commit-my-env-file) and [GitHub's guide on ignoring files](https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files).

### 2. Firebase Emulator Suite (Local Development)

For local development and testing, you can use the **Firebase Emulator Suite** to run local instances of Firebase products (Firestore, Authentication, and Storage). This allows you to test application features offline without affecting production or development cloud resources.

1. Follow the official [Firebase Emulator Suite: Connect and Prototype](https://firebase.google.com/docs/emulator-suite/connect_and_prototype?database=Firestore) guide to set up the emulators on your local machine.
2. `.env.example` ships with the emulator environment variables already active, so a fresh `.env.local` routes client and server operations to the emulator by default:

   ```env
   FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
   FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
   STORAGE_EMULATOR_HOST="127.0.0.1:9199"
   ```

   The host and port values match the emulator configurations in `firebase.json`. Comment these out only if you intentionally want the app itself to talk to production Firestore instead of the emulator.

3. For new emulator instances, run `yarn seed` to seed the database with a demo admin user and a demo signup token.
   - Email: <demo@gbstem.org>
   - Password: `penguin`
   - Signup Token: `demo-admin-token`

> [!WARNING]
> By default, the Firestore emulator runs in-memory. This means all seeded data and modifications are lost whenever you restart the emulator. If you want to persist the database state across restarts, start the emulator with the `--import` and `--export-on-exit` flags:
>
> ```bash
> firebase emulators:start --log-verbosity=quiet --import=./emulator-data --export-on-exit
> ```
>
> Otherwise, you must re-run the seed script every time you restart the emulator.

### 3. Run the Development Server

```bash
# install dependencies
yarn install

# run the development server
yarn dev

# start the development server and open in browser
yarn start

# preview the production build locally
yarn preview

# automatically format code
yarn format

# check for type errors
yarn run check

# check for type errors and watch for changes
yarn run check:watch

# check for style and lint issues
yarn lint

# run unit tests
yarn test

# build for production
yarn build
```

Open [http://localhost:5173](http://localhost:5173) with your browser to see the result for `yarn dev` or `yarn start`. You can start editing any page or component, and when running in development mode, your changes will be reflected in the browser automatically.

## Code Organization: Helpers, Services, and Where New Code Should Go

If you're new to this codebase, one question comes up constantly: **"I need to write some code — where does it go?"** This section answers that.

Historically, a lot of this app's logic lived directly inside `.svelte` files: a component's `<script>` block would fetch data from Firestore, figure out what that data meant (e.g. "is this class full?"), and render it, all tangled together. That's fast to write, but it makes files huge (many were 500–1,000 lines), hard to read, and nearly impossible to unit test — you can't write a quick, automated Jest test for logic that's buried inside a Svelte component and calls the live database directly.

To fix this, every new (or newly-touched) piece of logic gets split into one of two places, based on a simple question: **does it touch the network, or not?**

### 1. Pure logic (no network calls) → `src/lib/helpers/*.ts`

A **pure function** only looks at the inputs you give it and returns an output — no database calls, no reading page/global state, no side effects. Give it the same inputs today or a year from now, and it returns the same result. Examples already in this codebase: deciding whether a student's grade qualifies them for a class, calculating an application's interview deadline, or building the JSON payload we send to an email API.

**Why this matters:** pure functions are the cheapest, easiest thing in the entire codebase to unit test — no mocking, no setup, just "call it with some inputs, check what comes back." If you're writing an `if`/`else` chain, a date calculation, a status computation, or anything that transforms data without touching Firestore or an API, it almost certainly belongs in a `.ts` file under `src/lib/helpers/`, with a matching test file in `__tests__/` (see `application.test.ts`, `setInterviewTimesHelpers.test.ts`, etc. for examples of the pattern), not buried in a `.svelte` file's `<script>` block.

### 2. Firestore reads/writes → the Data Access Layer (`src/lib/services/*.ts`)

A **Data Access Layer (DAL)** is just a name for "the one place in the app allowed to talk directly to the database." Instead of every `.svelte` file calling Firestore functions like `getDoc`, `setDoc`, or `updateDoc` directly, those calls live in `src/lib/services/<name>Service.ts` files (`classService.ts`, `applicationService.ts`, `studentService.ts`, `interviewService.ts`, `registrationService.ts`, `tokenService.ts`, `dashboardService.ts`), each exporting an object of `async` functions named for _what_ they do (`enrollStudent`, `fetchDecisionType`) rather than _how_ they do it.

A `.svelte` component then just calls something like:

```ts
await studentService.enrollStudent(studentData, selectedClass, studentId)
```

instead of constructing a raw `updateDoc(doc(db, classesCollection, classId), { students: arrayUnion(studentId) })` call inline, mixed in with template markup and UI state.

**Why this matters, especially for a small, rotating volunteer team:**

- **Testability without a real database.** Our Jest tests shouldn't need an internet connection or a live Firestore/emulator instance to run — that would make the whole test suite slow, flaky, and dependent on specific data existing. By funneling every Firestore call through a service function, a test can "mock" (fake) the `firebase/firestore` module — see any `__tests__/*Service.test.ts` file — and check that our code calls the database correctly, _including what happens when a write fails_ (permission denied, network error, missing document), all in milliseconds, with nothing real running.
- **One place to fix things.** If we ever rename a Firestore field or restructure a collection, we only need to update the service function(s) that touch it — not hunt through every `.svelte` file that happened to read or write that field.
- **No copy-pasted queries.** Multiple pages often need the same data (e.g. "this student's registration record"). Without a DAL, that Firestore query gets copy-pasted into several components; when a bug is found and fixed in one copy, the others are silently left behind with the old, buggy version. With a DAL, every caller shares the same `registrationService.fetchRegistration(...)` function, so a fix in one place fixes it everywhere.
- **Shorter, more readable components.** A `.svelte` file's `<script>` block should mostly be about _what the page does_ and _how it's laid out_ — not the mechanics of database queries.

### A rule of thumb when writing new code

Before adding code to a `.svelte` file, ask:

- **Does it call Firestore (`getDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `addDoc`, `getDocs`, `getCountFromServer`, a `query(...)`, etc.)?** → It belongs in a `src/lib/services/*.ts` file, with a Jest test in `__tests__/` that mocks `firebase/firestore` (copy the top of an existing `*Service.test.ts` file to get the mocking pattern right).
- **Is it a calculation or transformation with no side effects?** → It belongs in a `src/lib/helpers/*.ts` file, with a matching Jest test.
- **Is it about what's rendered on screen, or wiring the two above together?** → That's the one thing that _does_ belong in the `.svelte` file itself.

Whenever you add or change a service or helper function, add or update its test in the same commit — a change without a test is much more likely to silently break something down the road once the next volunteer touches that file, since there's no automated check that would catch it.

## Firestore Schema

Most collections are scoped under a semester document: `semesters/{semesterId}/{collectionType}/{docId}` (e.g. `semesters/Spring26/applications/{uid}`). The semester-scoped types are `applications`, `classFeedback`, `classes`, `decisions`, `instructorFeedback`, `instructorInterviewTimes`, and `registrations`.

[`src/lib/data/collections.ts`](src/lib/data/collections.ts) derives every one of these paths from a single `suffix` constant (the current semester ID, e.g. `'Spring26'`) via a `semesterCollectionPath(semesterId, name)` helper. The exported constant names (`applicationsCollection`, `registrationsCollection`, etc.) stay the same regardless, so call sites throughout the app never construct paths manually.

A handful of collections are **not** semester-scoped and live at the top level: `subRequests`, `interviewTimeRequests`, `instructorClasses`, `confirmations`, `checkIns`, `users`, `tokens`, `mail`, `announcements`.

The current semester's key dates (`classesStart`, `registrationsDue`, etc.) aren't in Firestore at all — every read site only ever needs the _current_ semester's dates, never a past one, so they're static data in [`semesterDates.json`](src/lib/data/semesterDates.json), re-exported as `semesterDates` from `collections.ts`. `__tests__/collections.test.ts` validates every field is a well-formed `MM/DD/YY` date whose year matches `currentSemester`. The portal and website repos each keep a verbatim copy of this same file (see [Adding a New Semester](#adding-a-new-semester) for the paths and the copy step).

The course catalog works the same way. [`courses.json`](src/lib/data/courses.json) lists every course gbSTEM offers, in both halves of the year — `id` (its page on curriculum.gbstem.org, and a **case-sensitive** URL segment), `track`, `name` (the display string, and the exact value stored on class, registration and application documents), and `semester`. `data/index.ts` slices it to the current half using `currentSemester`, not the wall clock, so the catalog and the collection paths can't disagree. Portal keeps a verbatim copy and builds every curriculum link from it as `/{track}/{id}`; the curriculum repo keeps one too, where `__tests__/courses.test.ts` fails if the catalog and its `tracks.ts` stop agreeing about which courses exist.

So two files are copied by hand across repos at a rollover, and both are copied — never retyped, never edited in the destination.

Every semesterized document also carries a `semester` field (e.g. `"Spring26"`), stamped on write via the `withSemester(...)` helper in `collections.ts`. This lets the shared, cross-semester Algolia index for each collection type (one index total, covering every semester) filter results down to a single semester.

Within Firestore, all user identifiers should be `uid`s, not email addresses. Users can change their email address, but their `uid` is a stable identifier. This is also important for security and privacy reasons: it makes it harder for users to impersonate other users, harder to probe our backends to identify our users, and prevents users from being identified by client-side loaded data or re-identified after account deletion (except through secured audit logs).

A class's co-instructors follow that rule strictly: they are stored as `otherInstructorUids`, and there is no email equivalent. The `otherInstructorEmails` string this replaced was free text a class owner typed by hand, and `firestore.rules`'s `isInstructorOfClass()` granted write access on it directly — so any address at all could be given control of a class, with no check that the person had ever been interviewed. A uid now only reaches that field through the portal's `/api/lookupCoInstructor`, which resolves an address to a uid only when the account holds the `instructor` role **and** has an `accepted` decision for that semester (gbSTEM leadership's rule: nobody teaches a class they weren't assigned and accepted for). Everything that needs a co-instructor's email address — currently only the reminder emails — resolves it server-side at send time through `src/lib/server/instructorDirectory.ts`, which also drops uids whose account has since been deleted. Existing documents were converted by [`scripts/backfill-class-instructor-uids.ts`](scripts/backfill-class-instructor-uids.ts); its header documents the five-step deploy order, which matters because the security rule and the data have to change in the right sequence.

That same script also stamps a class's **primary** `instructorUid`, which was added after `instructorEmail` and so is absent on older documents — leaving `isInstructorOfClass()` to fall back to matching the stored address, which goes stale as soon as that instructor changes their account email. Unlike the co-instructor half, this must not change who can reach a class, so it stamps whoever currently owns `instructorEmail`; it falls back to the uid encoded in the class ID (the portal names classes `${uid}-${n}`, and the rules only allow creating one under your own uid) when that address no longer resolves to an account, which restores access that had already been silently lost. `instructorEmail` itself is not removed — it is still read for display and reminders and self-heals on every save. Retiring the rules' fallback on it is a separate migration, possible only once no class is left without an `instructorUid`.

[Composite indexes](firestore.indexes.json) and [security rules](firestore.rules) are keyed by **collection ID**, not by full path, so they automatically cover `semesters/{any semesterId}/{type}` — a new semester needs neither of these touched.

Admins can browse a past semester's data via the `?semester=<id>` URL param on the Applications and Registrations pages (see `CollectionFilter.svelte`), validated against [`collectionsList.json`](src/lib/data/collectionsList.json) before being used to build a Firestore path.

> [!NOTE]
> Before this schema, each collection type was duplicated per semester by name (e.g. `applicationsSpring26`, `registrationsFall25`). Those collections still exist in Firestore as a read-only historical backup — nothing reads or writes them anymore — and should eventually be deleted after a comfortable soak period.

## Adding a New Semester

Transitioning gbSTEM to a new semester (e.g., from `Spring26` to `Fall26`) is a small, code-only change: no Firestore console work at all, no index creation, and no Algolia or security rules changes, since those are keyed by collection type rather than per-semester (see [Firestore Schema](#firestore-schema) above).

**Four repos are involved**, because this repo holds the single source of truth for two files the others copy: [`semesterDates.json`](src/lib/data/semesterDates.json) (the semester's key dates) and [`courses.json`](src/lib/data/courses.json) (the course catalog). The repos are **admin** (where you edit both), **portal**, **website** (the public marketing site, which reads the dates to decide whether registration and instructor applications are open, and to print them on the home page and FAQ), and **curriculum** (which needs the catalog so its pages and gbSTEM's offerings stay in step). Each destination holds a _verbatim copy_ — same JSON, just a different path — so the sites can never advertise different dates or different courses. Copy, don't retype:

| Repo       | `semesterDates.json`                                         | `courses.json`                             |
| ---------- | ------------------------------------------------------------ | ------------------------------------------ |
| admin      | `src/lib/data/semesterDates.json` (the original — edit here) | `src/lib/data/courses.json` (the original) |
| portal     | `src/lib/data/semesterDates.json`                            | `src/lib/data/courses.json`                |
| website    | `lib/semesterDates.json`                                     | — (doesn't need it)                        |
| curriculum | — (doesn't need it)                                          | `app/data/courses.json`                    |

1. In **both the admin and portal repos**, update the `suffix` constant at the top of `src/lib/data/collections.ts` (e.g., `const suffix = 'Fall26'`). The website repo has no `suffix` — it has no Firestore access at all, and only ever needs the dates.
2. In the **admin repo**:
   - Add `{ "id": "Fall26", "name": "Fall 2026" }` to the **top** of [`collectionsList.json`](src/lib/data/collectionsList.json), so it's selected by default and appears first in the past-semester dropdown.
   - Review and update the course catalog in [`courses.json`](src/lib/data/courses.json). You only need to touch the entries whose `semester` matches the half you're rolling into — adding a course means adding **both** its fall and spring entries, each with the `id` of its page in the curriculum repo. Then copy the file to the portal and curriculum repositories per the table above. (The website doesn't need this one.)

     ```bash
     cp src/lib/data/courses.json ../portal/src/lib/data/courses.json
     cp src/lib/data/courses.json ../curriculum/app/data/courses.json
     ```

     A course whose `id` has no page in the curriculum repo will fail that repo's `__tests__/courses.test.ts` rather than silently becoming a dead "Curriculum" button in an instructor's dashboard — so add the page there in the same rollover.

   - Update every field in [`semesterDates.json`](src/lib/data/semesterDates.json) to the new semester's actual dates (`MM/DD/YY`, matching the new suffix's year), then copy the updated file to **both** the portal repository's `src/lib/data/` directory **and** the website repository's `lib/` directory, per the table above:

     ```bash
     cp src/lib/data/semesterDates.json ../portal/src/lib/data/semesterDates.json
     cp src/lib/data/semesterDates.json ../website/lib/semesterDates.json
     ```

     Never hand-edit a copy in portal, website or curriculum: the next rollover overwrites it, and a copy that has drifted is exactly the bug these shared files exist to prevent. It has happened — portal's old `springCourses.json` was hand-edited in place and silently became a duplicate of its own fall file, so portal offered no spring courses at all while the seed still wrote spring names.
3. Run `yarn lint && yarn test` in **all four repos** to verify the changes (this will fail loudly for errors like a malformed date, incorrect year in `semesterDates.json`, or a course with no page in the curriculum repo — the website's `__tests__/constants.test.ts` re-checks the copied dates the same way this repo's `__tests__/collections.test.ts` does, and curriculum's `__tests__/courses.test.ts` re-checks the copied catalog).
4. Create a PR for each repo you changed and merge each to `main` for the Vercel auto-deployment to update the live apps. Merge curriculum's first if you added a course, so the pages exist before portal starts linking to them.
5. Load the deployed public site's [home page](https://www.gbstem.org/) and [FAQ](https://www.gbstem.org/faq) and confirm the registration/application copy, links, and dates match the new semester. Those sections switch between "open" and "closed" wording purely from the dates in the JSON, so a wrong date there is visible to families and prospective instructors immediately.

That's it — the new semester's subcollections (`semesters/Fall26/applications`, etc.) spring into existence automatically on first write.

## Updating Dependencies

It is important to periodically update the project's dependencies to address security vulnerabilities, receive bug fixes, improve performance, and keep up with the latest features. Since this project is maintained by a rotating group of students, regular updates prevent the codebase from falling behind or becoming incompatible with modern deployment platforms.

While GitHub Dependabot handles minor and patch dependency updates automatically, we still need to manually run `ncu` to catch major updates that Dependabot misses. Check `npx depcheck` occasionally to catch any missing dependencies. While doing this, also check for the latest yarn berry v4 package manager release and update `packageManager` at the bottom of `package.json` to use that instead.

For those manual updates, we use the [npm-check-updates (ncu)](https://github.com/raineorshine/npm-check-updates) tool to check for and apply updates. Refer to the [installation instructions](https://github.com/raineorshine/npm-check-updates#installation) to install it.

Once `ncu` is installed, follow this sequence of commands to update dependencies:

> [!IMPORTANT]
> **Pin Zod to version 3 (`^3.x.x`)**: We currently restrict Zod to v3 because SvelteKit Superforms and Formsnap adapters have known type resolution and shape-generation compatibility issues with Zod v4 (refer to the public discussion at [ciscoheat/sveltekit-superforms #630](https://github.com/ciscoheat/sveltekit-superforms/issues/630)).
>
> **Pin TypeScript to version 6 (`^6.x.x`), `@types/node` to version 24 (`^24.x.x`) due to us configuring Vercel to use Node.js 24.x, and firebase/firebase-admin to their current versions**.
>
> When executing `ncu -u`, ensure the avoided major upgrades aren't applied.

```bash
# Update pinned dependencies to their latest minor/patch versions
ncu -t minor -u firebase firebase-admin typescript "@types/node" zod

# Update all other dependencies in package.json to the latest versions
ncu --peer --reject firebase,firebase-admin,typescript,"@types/node",zod -u

# Install the updated packages and update yarn.lock
yarn install

# Run unit tests to verify no breaking changes were introduced
yarn test

# Run type checks
yarn run check

# Run lint checks to ensure code style consistency
yarn lint

# Go to http://localhost:5173 and do manual visual checks and tests

# Build the project for production to verify compatibility and compile-time checks
yarn build
```

After verifying that the tests, linting, and build pass successfully, commit and submit both `package.json` and `yarn.lock` to the repository.

## Directory and File Index

Below is an alphabetical list of the top-level directories and significant configuration files to help you navigate the codebase:

### Directories

- **`.github/`**: Contains GitHub configuration for GitHub, including our Dependabot configuration for automating minor and patch package updates, and our Continuous Integration (CI) test workflows.
- **`.husky/`**: Configuration for Husky, managing Git hooks like pre-commit formatting and linting.
- **`.svelte-kit/`**: Automatically generated directory containing SvelteKit configuration, generated routes, and typings.
- **`__tests__/`**: Contains all of our Jest unit tests (such as utility tests and form validation schema scenario tests).
- **`cypress/`**: Contains the Cypress e2e test suite, test configurations, fixtures, and page object/support configurations.
- **`node_modules/`**: Contains the project's dependencies.
- **`scripts/`**: Contains development and setup script utilities: the database seeding script (`seed.ts`), backfill utilities, and email build tools.
- **`src/`**: The core SvelteKit application source code.
- **`src/lib/`**: Reusable libraries, utility modules, and components:
  - **`src/lib/client/`**: Client-side specific integrations, such as clients for Firestore.
  - **`src/lib/components/`**: Reusable Svelte UI components (e.g. tables, buttons, and form components like `FormInput.svelte`).
    - **`src/lib/components/forms/`**: Sub-components containing form structures and validation logic (`schemas.ts`).
  - **`src/lib/data/`**: Centralized static data constants, models, mock data, and TS types.
  - **`src/lib/helpers/`**: Pure, side-effect-free TypeScript functions (calculations, data transformations, payload builders) extracted out of `.svelte` files so they're easy to unit test — see [Code Organization](#code-organization-helpers-services-and-where-new-code-should-go) above.
  - **`src/lib/server/`**: Server-side specific integrations, such as initializing Firebase Admin.
  - **`src/lib/services/`**: The Data Access Layer — every Firestore read/write goes through a function here instead of being called directly from a `.svelte` file — see [Code Organization](#code-organization-helpers-services-and-where-new-code-should-go) above.
- **`src/routes/`**: Handles application URL routing based on the filesystem. Subdirectories (like `applications/`, `registrations/`, `user/`) represent URL paths.
- **`static/`**: Static assets such as images and icons that can be accessed publicly by the browser.

### Files

- **`.env.example`**: Template file defining required local environment variables.
- **`.firebaserc`**: Firebase project configuration mapping aliases to Firebase project IDs.
- **`.gitignore`**: Specifies which files and directories Git should ignore (like `node_modules/` and `.svelte-kit/`).
- **`.prettierignore`**: Specifies which files and directories Prettier should ignore when formatting.
- **`cypress.config.ts`**: The configuration file for the Cypress e2e testing interface and environmental triggers.
- **`eslint.config.js`**: ESLint configuration mapping coding rules and checks (replacing the legacy `.eslintrc.cjs`).
- **`firebase.json`**: Defines local configurations for Firebase emulator environments and project builds.
- **`firestore.indexes.json`**: Declarative composite index definitions for Cloud Firestore, deployed via `firebase deploy --only firestore:indexes`. Indexes are keyed by collection ID, so they cover every semester's subcollections automatically.
- **`firestore.rules`**: Firebase security rules defining read/write permissions for the Cloud Firestore database. This is applied by the Firebase emulators for local testing, but needs to be manually pushed to production because it has to be merged with the `curriculum` repo version of this file in production (simple copy-and-paste).
- **`jest.config.ts`**: The configuration file for our Jest testing environment, specifically tailored to work alongside TypeScript and Svelte.
- **`jest.setup.ts`**: Initial setup code that runs before our Jest tests, importing tools like `@testing-library/jest-dom` for custom DOM matchers.
- **`package.json`**: Defines the project's details, scripts, and dependencies (the npm packages we rely on).
- **`postcss.config.js`**: Configuration for PostCSS, typically used for transforming CSS with plugins.
- **`prettier.config.js`**: Configuration rules for Prettier, ensuring consistent code formatting across the project.
- **`svelte.config.js`**: SvelteKit-specific configuration (like adapter configurations and compiler options).
- **`TEST_PLAN.md`**: A comprehensive test plan outlining testing strategies, test scenarios, coverage, and instructions for running Jest and Cypress tests.
- **`tsconfig.json`**: Configuration settings for the TypeScript compiler.
- **`vite.config.js`**: Vite configuration file for compiling, bundling, and configuring build plugins.
- **`yarn.lock`**: An automatically generated file that locks down the exact versions of dependencies used, ensuring that all developers have identical, reproducible environments.
