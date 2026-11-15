const ADMIN_EMAIL = 'demo@gbstem.org'

function ignoreEmulatorNoise() {
  Cypress.on('uncaught:exception', (err) => {
    if (
      err.message.includes('Connection failed') ||
      err.message.includes('Firebase')
    ) {
      return false
    }
    return true
  })
}

/** Opens the create dialog and fills it in; the caller clicks Create. */
function fillCreateTokenForm({
  role,
  hours,
  purpose,
}: {
  role: 'admin' | 'reviewer'
  hours: string
  purpose: string
}) {
  // The blue "+" in the table header.
  cy.get('thead th').find('button').click({ force: true })
  cy.get('[role="dialog"]').should('exist')
  cy.get('select[name="what-role-should-this-token-grant"]').select(role)
  cy.get('input[name="should-this-token-be-one-time-use"]').check({
    force: true,
  })
  cy.setFieldValue(
    'input[name="after-how-many-hours-should-this-token-expire"]',
    hours,
  )
  if (purpose) {
    cy.setFieldValue('input[name="what-is-this-token-for"]', purpose)
  }
}

function stubClipboard(alias: string) {
  cy.window().then((win) => {
    const stub = cy.stub(win.navigator.clipboard, 'writeText')
    stub.resolves()
    cy.wrap(stub).as(alias)
  })
}

const row = (tokenId: string) => cy.get(`tbody tr[data-token-id="${tokenId}"]`)

describe('Section K: Registration Signup Tokens', () => {
  beforeEach(() => {
    ignoreEmulatorNoise()
    cy.signedInSession('admin', { initialPage: '/tokens' })
  })

  it('Test Case 20: Create, Copy, and Delete Signup Tokens', () => {
    const purpose = 'TC20 admin token for create-copy-delete'
    fillCreateTokenForm({ role: 'admin', hours: '24', purpose })
    cy.contains('button', 'Create').click({ force: true })
    cy.waitForNotification('Changes were saved successfully.')

    stubClipboard('clipboardCopy')

    // Newest first: the token just made is the top row, whatever its expiry,
    // with who made it and why.
    cy.get('tbody tr', { timeout: 10000 })
      .first()
      .should('contain', purpose)
      .and('contain', ADMIN_EMAIL)
      .invoke('attr', 'data-token-id')
      .should('have.length', 20)
      .then((tokenId) => {
        const id = tokenId as unknown as string
        row(id)
          .find('[data-testid="token-status"]')
          .should('have.text', 'active')

        row(id).contains('button', 'Copy').click({ force: true })
        cy.get('@clipboardCopy').then((stub: any) => {
          expect(stub.callCount).to.equal(1)
          // A full URL, scheme included, so it pastes as a working link.
          expect(stub.firstCall.args[0]).to.equal(
            `${Cypress.config('baseUrl')}/signup?token=${id}`,
          )
        })
        cy.waitForNotification('Token copied.')

        // Unused, so it can be deleted outright.
        row(id).contains('button', 'Delete').click({ force: true })
        cy.waitForNotification('Token deleted.')
        row(id).should('not.exist')
        // Gone from Firestore too, not just from the table - a token left
        // behind would still sign someone up.
        cy.task('checkFirestoreDocExists', `tokens/${id}`).should('eq', false)
      })
  })

  it('Test Case 20c: A Token Cannot Be Created Without a Purpose', () => {
    stubClipboard('noCopy')
    fillCreateTokenForm({ role: 'reviewer', hours: '6', purpose: '' })
    cy.contains('button', 'Create').click({ force: true })

    cy.get('[role="dialog"]')
      .should('exist')
      .and('contain', 'Minimum is 10 characters')
    // No token id came back, so nothing was created.
    cy.get('@noCopy').should('not.have.been.called')

    // Padding doesn't count toward the minimum.
    cy.setFieldValue('input[name="what-is-this-token-for"]', '   short    ')
    cy.contains('button', 'Create').click({ force: true })
    cy.get('[role="dialog"]').should('contain', 'Minimum is 10 characters')
    cy.get('@noCopy').should('not.have.been.called')
  })

  it('Test Case 20d: The List Defaults to Active Tokens', () => {
    cy.createTestToken('expired-list-token', {
      purpose: 'TC20d expired token hidden by default',
      expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    cy.createTestToken('active-list-token', {
      purpose: 'TC20d active token shown by default',
    })
    cy.reload()
    cy.waitForHydration()

    row('active-list-token').should('exist')
    row('expired-list-token').should('not.exist')

    cy.get('select[name="status"]').select('all')
    cy.url().should('include', 'filter=all')
    row('expired-list-token')
      .find('[data-testid="token-status"]')
      .should('have.text', 'expired')
    // Nothing to copy or revoke on a dead token, but nobody used it, so it
    // can still be cleared away.
    row('expired-list-token').within(() => {
      cy.contains('button', 'Copy').should('not.exist')
      cy.contains('button', 'Revoke').should('not.exist')
      cy.contains('button', 'Delete').should('exist')
    })
  })

  it('Test Case 20e: A Used Token Is Revoked, Keeping Its History', () => {
    cy.createTestToken('used-revoke-token', {
      purpose: 'TC20e used token to revoke',
      consumable: true,
      consumers: ['tc20e-previous-signup-uid'],
    })
    cy.reload()
    cy.waitForHydration()

    row('used-revoke-token').within(() => {
      cy.get('[data-testid="token-status"]').should('have.text', 'used')
      // Deleting would lose the record of who signed up with it.
      cy.contains('button', 'Delete').should('not.exist')
      cy.contains('button', 'Revoke').click({ force: true })
    })
    cy.waitForNotification('Token revoked.')
    row('used-revoke-token').should('not.exist')

    cy.task('getFirestoreUserId', ADMIN_EMAIL).then((adminUid) => {
      cy.task('readFirestoreDoc', 'tokens/used-revoke-token').then(
        (doc: any) => {
          expect(doc, 'revoked token still stored').to.not.equal(null)
          expect(doc.consumers).to.deep.equal(['tc20e-previous-signup-uid'])
          expect(doc.revokedBy).to.equal(adminUid)
          expect(doc.revokedAt, 'revokedAt').to.not.equal(null)
          // Expired at the moment of revoking, so signup refuses it too.
          expect(doc.expires._seconds * 1000).to.be.at.most(Date.now() + 5000)
        },
      )
    })

    cy.get('select[name="status"]').select('all')
    row('used-revoke-token')
      .should('contain', `by ${ADMIN_EMAIL}`)
      .find('[data-testid="token-status"]')
      .should('have.text', 'revoked')
  })

  it('Test Case 20f: Bulk Revoke Acts on the Checked Token, Not Its Row Position', () => {
    cy.createTestToken('bulk-checked-token', {
      purpose: 'TC20f the token that is checked',
    })
    cy.reload()
    cy.waitForHydration()

    row('bulk-checked-token').find('input[type="checkbox"]').check({
      force: true,
    })

    // A new token lands on top and pushes every row down one; the checked
    // token must still be the one acted on.
    fillCreateTokenForm({
      role: 'reviewer',
      hours: '1',
      purpose: 'TC20f a token created while another is checked',
    })
    cy.contains('button', 'Create').click({ force: true })
    cy.waitForNotification('Changes were saved successfully.')
    cy.get('tbody tr')
      .first()
      .should('contain', 'TC20f a token created while another is checked')
      .invoke('attr', 'data-token-id')
      .as('newTokenId')

    cy.contains('button', 'Revoke 1 token').click()
    cy.waitForNotification('Tokens revoked.')

    cy.task('readFirestoreDoc', 'tokens/bulk-checked-token').then(
      (doc: any) => {
        expect(doc.revokedAt, 'checked token revoked').to.not.equal(null)
      },
    )
    cy.get<string>('@newTokenId').then((id) => {
      cy.task('readFirestoreDoc', `tokens/${id}`).then((doc: any) => {
        expect(doc.revokedAt, 'new token untouched').to.equal(null)
      })
      row(id).should('exist')
    })
  })
})

describe('Section H: Signup Token Field Coverage', () => {
  beforeEach(() => {
    ignoreEmulatorNoise()
    cy.signedInSession('admin', { initialPage: '/tokens' })
  })

  it('Test Case 20b: Token - Every Field Reaches Firestore', () => {
    // Read the document back: a token created with the wrong role, expiry,
    // creator or purpose, or without a `consumers` array, renders much like
    // a correct one.
    fillCreateTokenForm({
      role: 'reviewer',
      hours: '6',
      // Padded, to show the stored purpose is trimmed.
      purpose: '  TC20b reviewer token for field coverage  ',
    })
    stubClipboard('tokenClipboard')

    const createdAt = Date.now()
    cy.contains('button', 'Create').click({ force: true })
    cy.waitForNotification('Changes were saved successfully.')

    cy.task('getFirestoreUserId', ADMIN_EMAIL).as('adminUid')
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
        // Read with the Admin SDK: firestore.rules lets no client, not even
        // an admin's, read a token.
        cy.get<string>('@adminUid').then((adminUid) => {
          cy.task('readFirestoreDoc', `tokens/${tokenId}`).then((data: any) => {
            expect(data, 'token document').to.not.equal(null)
            const { expires, createdAt: stored, ...rest } = data
            expect(rest).to.deep.equal({
              role: 'reviewer',
              consumable: true,
              // Not rendered by the form at all, and the thing that makes a
              // one-time token work once someone signs up with it.
              consumers: [],
              createdBy: adminUid,
              purpose: 'TC20b reviewer token for field coverage',
              revokedAt: null,
              revokedBy: null,
            })
            const window = 120000
            const createdAtMs = stored._seconds * 1000
            expect(createdAtMs).to.be.within(
              createdAt - window,
              createdAt + window,
            )
            // Six hours out, not the form's default of 24 - the hours field
            // is the one input whose effect the table only shows as a date.
            const sixHours = 6 * 60 * 60 * 1000
            expect(expires._seconds * 1000).to.be.within(
              createdAt + sixHours - window,
              createdAt + sixHours + window,
            )
          })
        })
      })
  })
})
