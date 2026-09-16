// Use this to include a unique hash within new records to help ensure edits
// really work as expected, rather than seeing stale data from a previous test run.
export const generateDateHash = (prefix: string): string => {
  if (!prefix) {
    throw new Error('Prefix is required for generateDateHash')
  }
  const hash = Date.now().toString().slice(-8)
  if (prefix.endsWith('.')) {
    return `${prefix.slice(0, -1)} ${hash}.`
  }
  if (prefix.includes(' ')) {
    return `${prefix} ${hash}`
  }
  return `${prefix}-${hash}`
}

/**
 * Asserts that the cell of `row` under the column headed `header` reads
 * exactly `text`, retrying until it does, and yields the row.
 *
 * Checking the cell by its column, rather than that the row contains the text
 * somewhere, is what gives an address assertion teeth: a row found by an
 * instructor's name also holds their name, course and link. Each address a
 * view shows is resolved from a uid rather than read off a document, so these
 * pin that the resolution reaches the right column.
 *
 * Headers are matched on `textContent` and case-insensitively, because the
 * admin `Table` uppercases them with CSS.
 */
export function expectCellInColumn(
  row: Cypress.Chainable<JQuery<HTMLElement>>,
  header: string,
  text: string,
): Cypress.Chainable<JQuery<HTMLElement>> {
  return row.should(($row) => {
    const $tr = $row.is('tr') ? $row : $row.closest('tr')
    const headers = $tr
      .closest('table')
      .find('th')
      .toArray()
      .map((th: HTMLElement) => (th.textContent ?? '').trim().toLowerCase())
    const index = headers.indexOf(header.toLowerCase())
    expect(index, `"${header}" column`).to.be.greaterThan(-1)
    expect($tr.children('td').eq(index).text().trim(), header).to.equal(text)
  })
}

/**
 * Prepares a document read back through `cy.getFirestoreDoc` for a
 * whole-document deep-equal against an expected shape.
 *
 * Two things have to be normalized away first:
 *
 * - `timestamps` is dropped. It holds `serverTimestamp()` sentinels, and
 *   `getFirestoreDoc`'s REST value converter has no `timestampValue` branch, so
 *   they come back as raw `{ timestampValue }` wrappers rather than dates.
 * - The arrays named in `sortArraysAt` are sorted. Svelte's `bind:group`
 *   appends in the order boxes are ticked, so a checkbox group's stored order
 *   reflects click order rather than anything meaningful - pinning it would
 *   make these tests fail for the wrong reason.
 * - The paths named in `omit` are dropped. Use this only for values that can't
 *   be compared literally - other `Date` fields, which come back as raw
 *   `{ timestampValue }` wrappers for the same reason `timestamps` does - and
 *   assert those separately. Every field dropped here is a field the
 *   deep-equal stops guarding, so keep the list short and justified.
 *
 * Deep-equal rather than per-field assertions is the point: a field added to a
 * form's schema but never wired through to the write path shows up here as an
 * unexpected default, whereas a list of `expect(data.x).to.equal(y)` lines only
 * ever checks the fields someone remembered to add.
 */
export const prepareDocForCompare = (
  doc: Record<string, any>,
  options: { sortArraysAt?: string[]; omit?: string[] } = {},
): Record<string, any> => {
  const { sortArraysAt = [], omit = [] } = options
  const { timestamps: _timestamps, ...rest } = doc
  const copy = JSON.parse(JSON.stringify(rest))

  const resolveParent = (path: string) => {
    const keys = path.split('.')
    const last = keys.pop() as string
    let cursor = copy
    for (const key of keys) {
      if (cursor === null || cursor === undefined) break
      cursor = cursor[key]
    }
    return { cursor, last }
  }

  for (const path of omit) {
    const { cursor, last } = resolveParent(path)
    if (cursor) delete cursor[last]
  }
  for (const path of sortArraysAt) {
    const { cursor, last } = resolveParent(path)
    if (cursor && Array.isArray(cursor[last])) {
      cursor[last] = [...cursor[last]].sort()
    }
  }
  return copy
}
