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
    cy.get('input[name="first-name"]').clear().type('Demo')
    cy.get('input[name="last-name"]').clear().type('AdminTest')
    cy.get('input[name="last-name"]')
      .closest('.items-end')
      .contains('button', 'Update')
      .click({ force: true })
    cy.waitForNotification('Name successfully updated.')
    cy.get('input[name="first-name"]').should('have.value', 'Demo')
    cy.get('input[name="last-name"]').should('have.value', 'AdminTest')

    // 3. Change email to temp and then change it back
    // We target the "Change email" fieldset
    cy.contains('span', 'Change email')
      .parent()
      .within(() => {
        cy.get('input[name="new-email"]').clear().type('tempadmin@gbstem.org')
        cy.get('input[name="new-email"]')
          .closest('.items-end')
          .contains('button', 'Update')
          .click({ force: true })
      })

    // Reauthenticate dialog opens
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]')
      .find('input[type="password"]')
      .clear()
      .type('penguin')
    cy.get('[role="dialog"]')
      .find('button[type="submit"]')
      .click({ force: true })
    cy.waitForNotification('A verification email was sent.', 'bg-gray-200')
    // Firebase Auth appears to reject a second email-action-link request for
    // the same account made too soon after the first (verified via repeated
    // real test runs: removing this wait made the second request below fail
    // with a 400 from /api/action every time) -- not a client-side race, so
    // give it real breathing room rather than retrying blindly.
    cy.wait(1000)

    // Change email back to demo@gbstem.org
    cy.contains('span', 'Change email')
      .parent()
      .within(() => {
        cy.get('input[name="new-email"]').clear().type('demo@gbstem.org')
        cy.get('input[name="new-email"]')
          .closest('.items-end')
          .contains('button', 'Update')
          .click({ force: true })
      })
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]')
      .find('input[type="password"]')
      .clear()
      .type('penguin')
    cy.get('[role="dialog"]')
      .find('button[type="submit"]')
      .click({ force: true })
    cy.waitForNotification('A verification email was sent.', 'bg-gray-200')
    // Same Auth-throttling consideration as above, ahead of the next
    // reauthenticate-and-mutate flow.
    cy.wait(1000)

    // 4. Change password to temp and then change it back
    cy.contains('span', 'Change password')
      .parent()
      .within(() => {
        cy.get('input[name="new-password"]').clear().type('penguin123')
        cy.get('input[name="confirm-password"]').clear().type('penguin123')
        cy.get('input[name="confirm-password"]')
          .closest('.items-end')
          .contains('button', 'Update')
          .click({ force: true })
      })

    // Reauthenticate dialog
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]')
      .find('input[type="password"]')
      .clear()
      .type('penguin')
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
    // Same Auth-throttling consideration as above, ahead of the next
    // reauthenticate-and-mutate flow.
    cy.wait(1000)

    // Changing the password bumps Firebase's tokensValidAfterTime for this
    // account, which revokes the __session cookie minted at the original
    // sign-in - hooks.server.ts's verifySessionCookie(..., true) correctly
    // rejects it on the next server-rendered request, redirecting here to
    // /signin. Sign back in with the new password before testing the second
    // change below.
    cy.url().should('include', '/signin')
    cy.waitForFormHydration()
    cy.fillInput('input[type="email"]', 'demo@gbstem.org')
    cy.fillInput('input[type="password"]', 'penguin123')
    cy.get('button[type="submit"]').click()
    cy.wait(1000)
    cy.visit('/profile')
    cy.title().should('contain', 'Profile')
    cy.get('h1').should('contain', 'Profile')
    // A fresh full-page visit, unlike the rest of this test's SPA
    // navigation - the Change Password form's use:enhance handler needs a
    // moment to attach, or the click below native-GETs instead of triggering
    // the reauthenticate dialog (see waitForFormHydration's doc comment).
    cy.waitForFormHydration()

    // Change password to penguin!, which allows us to test that the previous
    // password change worked during the reauthenticate step.
    cy.contains('span', 'Change password')
      .parent()
      .within(() => {
        cy.get('input[name="new-password"]').clear().type('penguin!')
        cy.get('input[name="confirm-password"]').clear().type('penguin!')
        cy.get('input[name="confirm-password"]')
          .closest('.items-end')
          .contains('button', 'Update')
          .click({ force: true })
      })

    // Reauthenticate dialog (now password is penguin123!)
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]')
      .find('input[type="password"]')
      .clear()
      .type('penguin123')
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
        interviewerEmail: email,
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
        interviewerEmail: email,
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
