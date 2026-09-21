import { interviewTimesCollection } from '../../src/lib/data/collections'
import { generateDateHash } from '../support/utils'

describe('Section L: Profile and Account Customization', () => {
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
    cy.signedInSession('admin', { initialPage: '/profile' })
  })

  it('Test Case 21: Name, Email, and Password Mutations', () => {
    // 1. Stub clipboard and verify UID copy
    cy.window().then((win) => {
      const stub = cy.stub(win.navigator.clipboard, 'writeText')
      stub.resolves()
      cy.wrap(stub).as('clipboardCopy')
    })

    cy.contains('div', /^UID:/)
      .invoke('text')
      .then((uidText) => {
        const expectedUid = uidText.replace('UID:', '').trim()
        cy.get('button[aria-label="Copy user ID to clipboard"]').click()
        cy.get('@clipboardCopy').then((stub: any) => {
          expect(stub.calledOnce).to.equal(true)
          expect(stub.firstCall.args[0]).to.equal(expectedUid)
        })
      })

    // 2. Change name. The form seeds from the canonical `users` document, so
    // these assert the seeded profile rather than the Auth displayName.
    cy.get('input[name="first-name"]').should('have.value', 'Demo')
    cy.get('input[name="last-name"]').should('have.value', 'Admin')
    cy.get('input[name="first-name"]').clear()
    cy.get('input[name="first-name"]').type('Demo')
    cy.get('input[name="last-name"]').clear()
    cy.get('input[name="last-name"]').type('AdminTest')
    cy.get('input[name="last-name"]')
      .closest('.items-end')
      .contains('button', 'Update')
      .click({ force: true })
    cy.waitForNotification('Name successfully updated.')
    cy.get('input[name="first-name"]').should('have.value', 'Demo')
    cy.get('input[name="last-name"]').should('have.value', 'AdminTest')

    // Put the seeded name back. Every mutation in this test restores what it
    // changed, because the assertions above are written against the seeded
    // profile - a run that left 'AdminTest' behind made its own retry fail on
    // the very first assertion, for reasons that had nothing to do with what
    // actually went wrong.
    cy.get('input[name="last-name"]').clear()
    cy.get('input[name="last-name"]').type('Admin')
    cy.get('input[name="last-name"]')
      .closest('.items-end')
      .contains('button', 'Update')
      .click({ force: true })
    cy.waitForNotification('Name successfully updated.')
    cy.get('input[name="last-name"]').should('have.value', 'Admin')

    // 3. Request an email change.
    //
    // There is nothing to change back here: /api/action's `changeEmail` only
    // *sends* a verify-and-change link (generateVerifyAndChangeEmailLink), and
    // the address does not move until a recipient clicks it, which no test
    // does. This step used to ask for a second change, back to
    // demo@gbstem.org -- a link from the account's own address to itself,
    // which Firebase rejects as auth/email-already-exists. That 400 was
    // invisible: waitForNotification matched `.bg-gray-200` anywhere on the
    // page, and the page's own <h1> carries that class, so the assertion
    // passed on a heading while the real toast was red. It is scoped to the
    // Alert component now, so the request has to actually succeed.
    cy.contains('span', 'Change email')
      .parent()
      .within(() => {
        cy.get('input[name="new-email"]').clear()
        cy.get('input[name="new-email"]').type('tempadmin@gbstem.org')
        cy.get('input[name="new-email"]')
          .closest('.items-end')
          .contains('button', 'Update')
          .click({ force: true })
      })

    // Reauthenticate dialog opens
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]').find('input[type="password"]').clear()
    cy.get('[role="dialog"]').find('input[type="password"]').type('penguin')
    cy.get('[role="dialog"]')
      .find('button[type="submit"]')
      .click({ force: true })
    cy.waitForNotification('A verification email was sent.', 'bg-gray-200')

    // ...and the account still answers to its original address, because the
    // emailed link was never used.
    cy.task('getFirestoreUserId', 'tempadmin@gbstem.org').should('eq', null)
    cy.task('getFirestoreUserId', 'demo@gbstem.org').should('be.a', 'string')

    // 4. Change the password, then put it back.
    //
    // A password change bumps Firebase's `tokensValidAfterTime`, which revokes
    // the `__session` cookie hooks.server.ts verifies with `checkRevoked`.
    // ChangePasswordForm signs in again with the new password and mints a
    // replacement before it reports success, so the session survives.
    //
    // This used to be a coin flip, and it failed this spec in roughly half of
    // CI runs: ReauthenticateForm fired its callback without awaiting it while
    // superforms' default `invalidateAll: true` reloaded the page in parallel,
    // so whether the reload saw a live or a revoked cookie -- and therefore
    // whether you stayed on /profile or were bounced to /signin -- depended on
    // which request happened to land first. Both outcomes broke this test, and
    // both reported it as a beforeEach failure on the *retry*
    // ("expected 'Sign in' to include 'Profile'"), naming neither the step
    // that failed nor the reason.
    cy.contains('span', 'Change password')
      .parent()
      .within(() => {
        cy.get('input[name="new-password"]').clear()
        cy.get('input[name="new-password"]').type('penguin123')
        cy.get('input[name="confirm-password"]').clear()
        cy.get('input[name="confirm-password"]').type('penguin123')
        cy.get('input[name="confirm-password"]')
          .closest('.items-end')
          .contains('button', 'Update')
          .click({ force: true })
      })

    // Reauthenticate dialog
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]').find('input[type="password"]').clear()
    cy.get('[role="dialog"]').find('input[type="password"]').type('penguin')
    cy.get('[role="dialog"]')
      .find('button[type="submit"]')
      .click({ force: true })
    cy.waitForNotification('Password was successfully changed.')
    cy.contains('span', 'Change password')
      .parent()
      .within(() => {
        cy.get('input[name="new-password"]').should('have.value', '')
        cy.get('input[name="confirm-password"]').should('have.value', '')
      })
    // The session has to survive the change, and only a server-rendered
    // request proves it: a full visit is what hooks.server.ts's
    // `verifySessionCookie(..., checkRevoked)` would reject and redirect to
    // /signin if the cookie were still the revoked one. Staying put on the
    // client says nothing, because nothing asks the server.
    cy.visit('/profile')
    cy.url().should('include', '/profile')
    cy.title().should('contain', 'Profile')
    cy.get('h1').should('contain', 'Profile')
    // A fresh full-page visit - the Change Password form's use:enhance handler
    // needs a moment to attach, or the click below native-GETs instead of
    // opening the reauthenticate dialog (see waitForFormHydration's comment).
    cy.waitForFormHydration()

    // Change it again, reauthenticating with the password set above - which
    // is what proves that first change reached Firebase and not just the UI.
    cy.contains('span', 'Change password')
      .parent()
      .within(() => {
        cy.get('input[name="new-password"]').clear()
        cy.get('input[name="new-password"]').type('penguin!')
        cy.get('input[name="confirm-password"]').clear()
        cy.get('input[name="confirm-password"]').type('penguin!')
        cy.get('input[name="confirm-password"]')
          .closest('.items-end')
          .contains('button', 'Update')
          .click({ force: true })
      })

    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]').find('input[type="password"]').clear()
    cy.get('[role="dialog"]').find('input[type="password"]').type('penguin123')
    cy.get('[role="dialog"]')
      .find('button[type="submit"]')
      .click({ force: true })
    cy.waitForNotification('Password was successfully changed.')
    cy.contains('span', 'Change password')
      .parent()
      .within(() => {
        cy.get('input[name="new-password"]').should('have.value', '')
        cy.get('input[name="confirm-password"]').should('have.value', '')
      })
    cy.url().should('include', '/profile')
  })

  // `afterEach`, not `after`, because it has to run between a failed attempt
  // and its retry. cypress/support/e2e.ts re-seeds once per spec file, not per
  // test, so a retry inherits whatever password the failed attempt left
  // behind - and cy.signedInSession only knows the seeded one. That is what
  // turned any single failure in this test into a second, misleading failure:
  // the retry's beforeEach could not sign in, and reported it as
  // `expected 'Sign in' to include 'Profile'`, naming neither this test nor
  // the password.
  //
  // It goes through the Admin SDK rather than the form above because the
  // seeded password is one the form would reject - see the `setUserPassword`
  // task.
  afterEach(() => {
    cy.task('setUserPassword', {
      email: 'demo@gbstem.org',
      password: 'penguin',
    })
  })
})

// A separate describe: the block above's beforeEach signs in as the seeded
// demo admin before every test, which would redirect a plain cy.visit of
// /signup away to /profile since (signedOut) refuses an already-signed-in
// session. These tests need a fresh, signed-out browser instead.
describe('Section L: Account Deletion Eligibility', () => {
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
  })

  it('Test Case 22: Blocked From Deleting An Account With A Future Scheduled Interview', () => {
    const emailPrefix = generateDateHash('delete-blocked-reviewer')
    const email = `${emailPrefix}@gbstem.org`

    cy.visit('/signup?token=demo-reviewer-token')
    cy.get('h1').should('contain', 'Sign up')
    cy.get('input[name="first-name"]').should('be.visible')
    cy.waitForFormHydration()
    cy.fillInput('input[name="first-name"]', 'Blocked')
    cy.fillInput('input[name="last-name"]', 'Reviewer')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', 'penguin')
    cy.fillInput('input[name="confirm-password"]', 'penguin')
    cy.get('button[type="submit"]').click()
    cy.url().should('include', '/profile')

    // Close the "please verify your email" dialog that blocks the page.
    cy.get('[role="dialog"]').find('button').contains('Close').click({
      force: true,
    })
    cy.get('[role="dialog"]').should('not.exist')

    cy.task('getFirestoreUserId', email).then((uid) => {
      expect(uid).to.be.a('string')
      cy.setInterviewSlot({
        collectionPath: interviewTimesCollection,
        id: `future-booked-slot-${emailPrefix}`,
        date: '2028-05-01T09:00',
        interviewerName: 'Blocked Reviewer',
        interviewerUid: uid as string,
        intervieweeId: 'some-applicant-uid',
        meetingLink: 'https://zoom.us/j/1111111111',
      })

      cy.contains('button', 'Delete account').click()
      cy.get('[role="dialog"]').should('contain', "Can't delete account")
      cy.get('[role="dialog"]').should('contain', 'scheduled interview')
      // The password-confirmation dialog never opens.
      cy.get('[role="dialog"]')
        .find('input[type="password"]')
        .should('not.exist')
      cy.get('[role="dialog"]').contains('button', 'Close').click({
        force: true,
      })
      cy.get('[role="dialog"]').should('not.exist')

      // The account was never touched.
      cy.task('getFirestoreUserId', email).should('eq', uid)
    })
  })

  it('Test Case 22b: Deleting An Eligible Account Clears Its Open Interview Slots', () => {
    const emailPrefix = generateDateHash('delete-eligible-reviewer')
    const email = `${emailPrefix}@gbstem.org`
    const slotId = `open-slot-${emailPrefix}`

    cy.visit('/signup?token=demo-reviewer-token')
    cy.get('h1').should('contain', 'Sign up')
    cy.get('input[name="first-name"]').should('be.visible')
    cy.waitForFormHydration()
    cy.fillInput('input[name="first-name"]', 'Eligible')
    cy.fillInput('input[name="last-name"]', 'Reviewer')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', 'penguin')
    cy.fillInput('input[name="confirm-password"]', 'penguin')
    cy.get('button[type="submit"]').click()
    cy.url().should('include', '/profile')

    cy.get('[role="dialog"]').find('button').contains('Close').click({
      force: true,
    })
    cy.get('[role="dialog"]').should('not.exist')

    cy.task('getFirestoreUserId', email).then((uid) => {
      expect(uid).to.be.a('string')
      cy.setInterviewSlot({
        collectionPath: interviewTimesCollection,
        id: slotId,
        date: '2028-05-01T09:00',
        interviewerName: 'Eligible Reviewer',
        interviewerUid: uid as string,
        meetingLink: 'https://zoom.us/j/2222222222',
      })

      const slotPath = `${interviewTimesCollection}/${slotId}`
      cy.task('checkFirestoreDocExists', slotPath).should('eq', true)

      cy.contains('button', 'Delete account').click()
      cy.get('[role="dialog"]').should('contain', 'Delete account')
      cy.get('[role="dialog"]').find('input[type="password"]').type('penguin')
      cy.get('[role="dialog"]').contains('button', 'Delete').click({
        force: true,
      })
      cy.url().should('include', '/signin', { timeout: 10000 })

      cy.task('checkFirestoreDocExists', slotPath).should('eq', false)
      cy.task('checkFirestoreDocExists', `users/${uid}`).should('eq', false)
      cy.task('getFirestoreUserId', email).should('eq', null)
    })
  })
})
