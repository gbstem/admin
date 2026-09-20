import { prepareDocForCompare } from '../support/utils'

describe('Section K: Registration Signup Tokens', () => {
  beforeEach(() => {
    // Ignore transient Firebase emulator connection exceptions
    Cypress.on('uncaught:exception', (err) => {
      if (
        err.message.includes('Connection failed') ||
        err.message.includes('Firebase')
      ) {
        return false
      }
      return true
    })

    // Authenticate as Admin
    cy.signedInSession('admin', { initialPage: '/tokens' })
    cy.selectOption('input[name="per-page"]', '50')
  })

  it('Test Case 20: Create, Copy, and Delete Signup Tokens', () => {
    // Click the blue "+" button in the table header to open creation modal
    cy.get('th').find('button').click({ force: true })
    cy.get('[role="dialog"]').should('exist')

    // Fill out Token creation form
    // Role selection
    cy.get('input[name="what-role-should-this-token-grant"]').clear()
    cy.get('input[name="what-role-should-this-token-grant"]').type('admin')
    cy.get('input[name="what-role-should-this-token-grant"]')
      .parent()
      .find('button')
      .contains('admin')
      .click({ force: true })

    // Check "Should this token be one-time use?"
    cy.get('input[name="should-this-token-be-one-time-use"]').check({
      force: true,
    })

    cy.setFieldValue(
      'input[name="after-how-many-hours-should-this-token-expire"]',
      '24',
    )

    // Click Create
    cy.contains('button', 'Create').click({ force: true })
    cy.waitForNotification('Changes were saved successfully.')

    cy.window().then((win) => {
      const stub = cy.stub(win.navigator.clipboard, 'writeText')
      stub.resolves()
      cy.wrap(stub).as('clipboardCopy')
    })

    // Find the newly created row (role "admin" and token ID has length 20).
    // Retry via .should() until the row renders instead of guessing how long
    // the table takes to pick up the new token.
    cy.get('tbody tr', { timeout: 10000 }).should(($rows) => {
      const found = $rows
        .toArray()
        .some((el) => Cypress.$(el).find('th').text().trim().length === 20)
      expect(
        found,
        'expected a newly created 20-character token ID row',
      ).to.equal(true)
    })
    cy.get('tbody tr').then(($rows) => {
      const foundRow = $rows
        .toArray()
        .find((el) => Cypress.$(el).find('th').text().trim().length === 20)
      cy.wrap(Cypress.$(foundRow)).as('newAdminRow')
    })

    cy.get('@newAdminRow').within(() => {
      cy.contains('button', 'Copy').click({ force: true })
    })
    cy.get('@clipboardCopy').then((stub: any) => {
      expect(stub.callCount).to.equal(1)
      const url = stub.firstCall.args[0]
      expect(url).to.match(/\/signup\?token=[a-zA-Z0-9]{20}$/)
    })
    cy.waitForNotification('Token copied.')

    // Click Delete on the admin token row
    cy.get('@newAdminRow')
      .find('th')
      .invoke('text')
      .then((text) => {
        const tokenId = text.trim()
        cy.get('@newAdminRow').within(() => {
          cy.contains('button', 'Delete').click({ force: true })
        })
        cy.waitForNotification('Token deleted.')
        cy.get('tbody').should('not.contain', tokenId)
      })
  })
})

/**
 * `expires` is a Firestore timestamp, which `getFirestoreDoc` returns as a raw
 * wrapper rather than a date. It is checked separately.
 */
const TOKEN_TIMESTAMP_FIELDS = ['expires']

describe('Section H: Signup Token Field Coverage', () => {
  beforeEach(() => {
    Cypress.on('uncaught:exception', (err) => {
      if (
        err.message.includes('Connection failed') ||
        err.message.includes('Firebase')
      ) {
        return false
      }
      return true
    })
    cy.signedInSession('admin', { initialPage: '/tokens' })
  })

  it('Test Case 20b: Token - Every Field Reaches Firestore', () => {
    // Test Case 20 creates a token and checks that a row appears with a
    // 20-character id, but never reads the document back - so a token created
    // with the wrong role, the wrong expiry, or a missing `consumers` array
    // looks identical to a correct one.
    cy.get('th').find('button').click({ force: true })
    cy.get('[role="dialog"]').should('exist')

    // A reviewer token, deliberately: Test Case 20 above creates an *admin*
    // one in the same seeded database, so the role is what tells the two
    // 20-character rows apart.
    cy.selectOption(
      'input[name="what-role-should-this-token-grant"]',
      'reviewer',
    )
    cy.get('input[name="should-this-token-be-one-time-use"]').check({
      force: true,
    })
    cy.get('input[name="after-how-many-hours-should-this-token-expire"]').clear(
      {
        force: true,
      },
    )
    cy.get('input[name="after-how-many-hours-should-this-token-expire"]').type(
      '6',
      {
        force: true,
      },
    )

    // The id comes from the clipboard, not the table. `CreateTokenForm` copies
    // `/signup?token=<id>` on success, and that is deterministic - whereas the
    // table is paginated and sorted by expiry, so a token expiring in six
    // hours lands on the last page rather than anywhere findable.
    cy.window().then((win) => {
      const stub = cy.stub(win.navigator.clipboard, 'writeText')
      stub.resolves()
      cy.wrap(stub).as('tokenClipboard')
    })

    const createdAt = Date.now()
    cy.contains('button', 'Create').click({ force: true })
    cy.waitForNotification('Changes were saved successfully.')

    cy.get('@tokenClipboard')
      .then((stub: any) => {
        expect(stub.callCount, 'signup URL copied').to.equal(1)
        const match = /\/signup\?token=([a-zA-Z0-9]{20})$/.exec(
          stub.firstCall.args[0],
        )
        expect(match, 'token id in the copied URL').to.not.equal(null)
        return (match as RegExpExecArray)[1]
      })
      .then((tokenId: string) => {
        cy.getFirebaseAuthToken().then((authToken: string) => {
          cy.getFirestoreDoc(authToken, 'tokens', tokenId).then((data: any) => {
            expect(data, 'token document').to.not.equal(null)
            expect(
              prepareDocForCompare(data, { omit: TOKEN_TIMESTAMP_FIELDS }),
            ).to.deep.equal({
              role: 'reviewer',
              consumable: true,
              // Not rendered by the form at all, and the thing that makes a
              // one-time token work once someone signs up with it.
              consumers: [],
            })
            // Six hours out, not the form's default of 24 - the hours field is
            // the one input whose effect is invisible in the table.
            // `getFirestoreDoc`'s value converter has no `timestampValue`
            // branch, so a Firestore timestamp comes back as the raw REST
            // wrapper - an ISO string under `timestampValue` - rather than a
            // date. That is also why `expires` is omitted from the deep-equal
            // above and checked here instead.
            expect(data.expires, 'expiry wrapper').to.have.property(
              'timestampValue',
            )
            const expiresAt = new Date(data.expires.timestampValue).getTime()
            const sixHours = 6 * 60 * 60 * 1000
            expect(expiresAt).to.be.greaterThan(createdAt + sixHours - 120000)
            expect(expiresAt).to.be.lessThan(createdAt + sixHours + 120000)
          })
        })
      })
  })
})
