# Transactional emails

Every email this app sends is authored here as [MJML](https://documentation.mjml.io),
compiled to HTML at build time, and filled in at send time with Handlebars.

```
src/lib/emails/
  templates/*.mjml     <- edit these
  layout/*.mjml        <- shared chrome, included by every template
  __goldens__/*.txt    <- committed regression gate (see Testing)
  render.ts            <- renderEmail(name, data)
  registry.ts          <- name -> compiled HTML
src/lib/data/emailTemplates/*.ts   <- GENERATED, do not edit
scripts/emails/                    <- build + verification tooling
```

## Changing an email

1. Edit the `.mjml` file. Only the content belongs there — the header, footer
   and `<mj-head>` come from `layout/`.
2. `yarn email:build` to regenerate `src/lib/data/emailTemplates/*.ts`.
3. `yarn test` — the goldens will fail, showing your copy change as a readable
   text diff.
4. `yarn email:goldens` to accept it, then commit the `.mjml`, the generated
   `.ts` and the golden together.

If the change touches layout rather than copy, run `yarn email:preview` and look
at it — see below for why.

`yarn email:check` fails if the generated files are out of date with their
sources; run it in CI so a stale commit can't ship.

## Sending

```ts
import { renderEmail } from '#lib/emails/render.js'

const html = renderEmail('rejectionEmailTemplate', {
  app: { firstName, name: 'Portal', link: 'https://portal.gbstem.org' },
})
```

`footerYear` is filled in automatically — don't pass it, and don't hardcode a
year in the footer. It is top-level rather than `app.year` because portal's
community-service email uses `app.year` for the semester year.

### Interpolation rules

- `{{app.firstName}}` — HTML-escaped by Handlebars. Missing keys render empty.
- `{{url app.link}}` — **required for anything that lands in an `href`.** The
  helper allows only `http:`, `https:` and `mailto:`; everything else renders
  empty. The previous hand-rolled substituter escaped HTML but never looked at
  the scheme, so a `javascript:` URL in a link field reached the recipient's
  `href` in 9 of the 11 templates.

## Testing

| Command            | What it checks                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn test`        | Semantic goldens: the text, links, images and headings of every template against 4 fixtures each, plus an assertion that no fixture can produce executable content. |
| `yarn email:check` | The committed generated HTML matches the `.mjml` sources. Runs in the husky pre-commit hook and should run in CI.                                                   |

The goldens deliberately ignore wrapper markup, so an MJML upgrade that changes
table scaffolding doesn't produce noise, while a changed sentence or a broken
link fails loudly. Fixtures live in `scripts/emails/fixtures.ts` and cover
production-shaped data, XSS probes, unicode/overlong values, and no data at all.

### Looking at an email

```sh
yarn email:preview          # renders every template with the `typical` fixture
yarn email:preview edge     # or adversarial / missing / typical
```

Open the index it prints. Output goes to `.email-preview/`, which is gitignored.

**Do this whenever you change layout** — padding, a section, a button — rather
than only trusting `yarn test`. The goldens compare meaning, not appearance, so
a wrong padding shifts the entire email while every golden stays green. That is
not hypothetical: it happened twice while these templates were being ported, and
only a rendered comparison caught it. Copy-only edits are safe to trust to the
goldens alone.

## Why MJML

The templates were already MJML output — someone compiled them once and pasted
the HTML into a `.ts` file, after which all 11 copies of the ~90-line chrome had
to be maintained by hand. Keeping MJML as the _source_ means the generated HTML
is nearly identical to what shipped before (the migration's worst pixel delta
was 0.02%, all of it the footer year), while `mj-include` reduces each template
to just its own content.

The migration was verified by a temporary before/after audit pipeline that
rendered both engines, screenshotted each at 600px and 375px, and pixel-diffed
them. It reported 0 unexplained differences with a 0.02% worst-case pixel delta,
all of it the footer year. That tooling was removed once it had served its
purpose; recover it from the commit history if a comparable migration ever comes
up again.

Do not add an HTML formatting pass to `scripts/emails/build.ts`. Prettier's HTML
parser rewrites the Outlook conditional comments these templates depend on
(`<!--[if mso | IE]>` becomes `<!--[if mso | IE ]>`, `<![endif]-->` becomes
`<! [endif]-->`), which silently breaks the Outlook fallback tables.

## Keeping `../portal` in sync

`portal` runs the same system. `src/lib/emails/layout/*.mjml` and
`scripts/emails/*` are byte-identical in both repos on purpose — change them
together. Four template sources are byte-identical too
(`actionEmailTemplate`, `classReminderEmailTemplate`,
`inPersonClassEnrolledEmailTemplate`, `onlineClassEnrolledEmailTemplate`), so
`diff` across the two repos is a meaningful drift check;
`interviewScheduledEmailTemplate` differs only in its opening sentence. If you
edit one of those here, check whether `portal` needs the same edit.

Note portal reserves `app.year` for the semester year in its community-service
email — that is why the footer's copyright uses top-level `footerYear`.
