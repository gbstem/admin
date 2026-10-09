/**
 * Renders one template against one fixture, with the clock pinned.
 *
 * Shared by `goldens.ts`, `preview.ts` and the Jest suite so all three agree on
 * exactly what "the rendered output" means - in particular that `footerYear` is
 * fixed rather than read from the system clock, which would otherwise make
 * goldens fail every January.
 */
import { FIXTURE_YEAR, fixtureFor, type Case } from './fixtures'
import { renderEmail } from '#lib/emails/render.js'

export function renderFixture(template: string, testCase: Case): string {
  const { data } = fixtureFor(template, testCase)
  return renderEmail(template, { ...data, footerYear: FIXTURE_YEAR })
}
