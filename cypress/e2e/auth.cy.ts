import { generateDateHash } from '../support/utils'

describe('Section A: Authentication and Navigation', () => {
  it('Test Case 1: Unauthenticated Redirect to Sign In', () => {
    // Attempting to visit protected routes should redirect to signin
    cy.visit('/')
    cy.url().should('include', '/signin')
    cy.get('h1').should('contain', 'Sign in')

    cy.visit('/dashboard')
    cy.url().should('include', '/signin')
    cy.get('h1').should('contain', 'Sign in')

    cy.visit('/profile')
    cy.url().should('include', '/signin')
    cy.get('h1').should('contain', 'Sign in')
  })

  it('Test Case 2: Unsuccessful Sign In', () => {
    cy.visit('/signin')
    cy.get('input[type="email"]').should('be.visible')
    cy.waitForFormHydration()
    cy.fillInput('input[type="email"]', 'demo@gbstem.org')
    cy.fillInput('input[type="password"]', 'wrongpassword')
    cy.get('button[type="submit"]').click()

    // Assert that we stay on signin and an alert error is visible
    cy.url().should('include', '/signin')
    cy.waitForNotification('Wrong password.', 'bg-red-200')
  })

  it('Test Case 2b: Unauthorized Role Sign In (Student & Instructor)', () => {
    // Try logging in as instructor
    cy.visit('/signin')
    cy.get('input[type="email"]').should('be.visible')
    cy.waitForFormHydration()
    cy.fillInput('input[type="email"]', 'instructor@gbstem.org')
    cy.fillInput('input[type="password"]', 'penguin')
    cy.get('button[type="submit"]').click()

    // Assert that we stay on signin and get the appropriate error message
    cy.url().should('include', '/signin')
    cy.waitForNotification(
      'Unauthorized: You do not have permission to access the admin site.',
      'bg-red-200',
    )

    // Clear session/cookies and try logging in as student
    cy.clearAllCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()

    cy.visit('/signin')
    cy.get('input[type="email"]').should('be.visible')
    cy.waitForFormHydration()
    cy.fillInput('input[type="email"]', 'student@gbstem.org')
    cy.fillInput('input[type="password"]', 'penguin')
    cy.get('button[type="submit"]').click()

    // Assert that we stay on signin and get the appropriate error message
    cy.url().should('include', '/signin')
    cy.waitForNotification(
      'Unauthorized: You do not have permission to access the admin site.',
      'bg-red-200',
    )
  })

  it('Test Case 3: Successful Sign In', () => {
    cy.visit('/')
    cy.url().should('include', '/signin')
    cy.get('input[type="email"]').should('be.visible')
    cy.waitForFormHydration()
    cy.fillInput('input[type="email"]', 'demo@gbstem.org')
    cy.fillInput('input[type="password"]', 'penguin')
    cy.get('button[type="submit"]').click()

    cy.url().should('include', '/dashboard')
    cy.get('h1').should('contain', 'Dashboard')

    // Verify authorized navigation components are visible
    cy.contains('a', 'Dashboard').should('be.visible')
    cy.contains('a', 'Classes').should('be.visible')
    cy.contains('a', 'Students').should('be.visible')
    cy.get('button[aria-label="Profile menu"]').should('be.visible')
  })

  it('Test Case 4: Password Reset Form', () => {
    cy.visit('/signin')
    cy.contains('a', 'Forgot password?').click()
    cy.url().should('include', '/reset-password')
    cy.get('input[type="email"]').should('be.visible')
    cy.waitForFormHydration()

    cy.fillInput('input[type="email"]', 'demo@gbstem.org')
    cy.get('button[type="submit"]').click()

    // Verify reset notification toast shows up
    cy.get('body').should('contain', 'Password reset email was sent')
    cy.get('input[type="email"]').should('have.value', '')
  })

  ;[
    { resend: false, label: 'Original Email' },
    { resend: true, label: 'Resent Email' },
  ].forEach(({ resend, label }) => {
    it(`Test Case 5a: Admin Sign Up with Registration Token (${label})`, () => {
      // Navigate using the demo token seeded in scripts/seed.js
      cy.visit('/signup?token=demo-admin-token')
      cy.get('h1').should('contain', 'Sign up')
      cy.get('input[name="first-name"]').should('be.visible')
      cy.waitForFormHydration()

      const first = 'Charlie'
      const last = generateDateHash(`Brown-${resend ? 'resend' : 'orig'}`)
      const email = `${generateDateHash(`charlie.brown.${resend ? 'resend' : 'orig'}`)}@gmail.com`

      cy.fillInput('input[name="first-name"]', first)
      cy.fillInput('input[name="last-name"]', last)
      cy.fillInput('input[name="email"]', email)
      cy.fillInput('input[name="password"]', 'penguin')
      cy.fillInput('input[name="confirm-password"]', 'penguin')
      cy.get('button[type="submit"]').click()

      // Expect sign up to leave user signed in and redirect to profile page on success
      cy.url().should('include', '/profile')
      cy.get('h1').should('contain', 'Profile')

      // Expect a dialog to pop up asking the user to verify their email
      cy.get('[role="dialog"]').should('exist')
      cy.contains('Please verify your email').should('be.visible')
      cy.get('[data-testid="email-unverified-banner"]')
        .should('be.visible')
        .and('contain', 'Email is not verified.')

      // Verify main navigation links are hidden until this account is verified
      cy.contains('a', 'Dashboard').should('not.exist')
      cy.contains('a', 'Classes').should('not.exist')
      cy.contains('a', 'Students').should('not.exist')
      cy.contains('a', 'Interviews').should('not.exist')
      cy.contains('a', 'Applications').should('not.exist')
      cy.contains('a', 'Registrations').should('not.exist')
      cy.contains('a', 'Sub Requests Log').should('not.exist')

      // Close verification dialog
      cy.get('[role="dialog"]')
        .find('button')
        .contains('Close')
        .click({ force: true })
      cy.get('[role="dialog"]').should('not.exist')

      if (resend) {
        // Verify original OOB link exists but don't click it
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').should('exist')
        // Clear out the original verification email
        cy.clearTestEmails()
        // Click "Send it again" to get a second OOB link
        cy.contains('button', 'Send it again.').click()
        cy.waitForNotification('Verification email was sent.', 'bg-gray-200')
        // Verify using the new OOB link
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
          cy.request(link)
        })
      } else {
        // Verify Email (emulated email side-channel using original link)
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
          cy.request(link)
        })
      }

      // Return to the profile page
      cy.visit('/profile')
      cy.get('.bg-red-200').should('not.exist')
      cy.contains('Please verify your email').should('not.exist')
      cy.contains('Role: admin').should('be.visible')

      // Verify main navigation links are now visible
      cy.contains('a', 'Dashboard').should('be.visible')
      cy.contains('a', 'Classes').should('be.visible')
      cy.contains('a', 'Students').should('be.visible')
      cy.contains('a', 'Interviews').should('be.visible')
      cy.contains('a', 'Applications').should('be.visible')
      cy.contains('a', 'Registrations').should('be.visible')
      cy.contains('a', 'Sub Requests Log').should('be.visible')
    })
  })

  ;[
    { resend: false, label: 'Original Email' },
    { resend: true, label: 'Resent Email' },
  ].forEach(({ resend, label }) => {
    it(`Test Case 5b: Reviewer Sign Up with Registration Token (${label})`, () => {
      // Navigate using the demo token seeded in scripts/seed.js
      cy.visit('/signup?token=demo-reviewer-token')
      cy.get('h1').should('contain', 'Sign up')
      cy.get('input[name="first-name"]').should('be.visible')
      cy.waitForFormHydration()

      const first = 'Charlie'
      const last = generateDateHash(`Reviewer-${resend ? 'resend' : 'orig'}`)
      const email = `${generateDateHash(`charlie.reviewer.${resend ? 'resend' : 'orig'}`)}@gmail.com`

      cy.fillInput('input[name="first-name"]', first)
      cy.fillInput('input[name="last-name"]', last)
      cy.fillInput('input[name="email"]', email)
      cy.fillInput('input[name="password"]', 'penguin')
      cy.fillInput('input[name="confirm-password"]', 'penguin')
      cy.get('button[type="submit"]').click()

      // Expect sign up to leave user signed in and redirect to profile page on success
      cy.url().should('include', '/profile')
      cy.get('h1').should('contain', 'Profile')

      // Expect a dialog to pop up asking the user to verify their email
      cy.get('[role="dialog"]').should('exist')
      cy.contains('Please verify your email').should('be.visible')
      cy.get('[data-testid="email-unverified-banner"]')
        .should('be.visible')
        .and('contain', 'Email is not verified.')

      // Verify main navigation links are hidden because this account is not verified.
      cy.contains('a', 'Dashboard').should('not.exist')
      cy.contains('a', 'Classes').should('not.exist')
      cy.contains('a', 'Students').should('not.exist')
      cy.contains('a', 'Interviews').should('not.exist')
      cy.contains('a', 'Applications').should('not.exist')
      cy.contains('a', 'Registrations').should('not.exist')
      cy.contains('a', 'Sub Requests Log').should('not.exist')

      // Close verification dialog
      cy.get('[role="dialog"]')
        .find('button')
        .contains('Close')
        .click({ force: true })
      cy.get('[role="dialog"]').should('not.exist')

      if (resend) {
        // Verify original OOB link exists but don't click it
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').should('exist')
        // Clear out the original verification email
        cy.clearTestEmails()
        // Click "Send it again" to get a second OOB link
        cy.contains('button', 'Send it again.').click()
        cy.waitForNotification('Verification email was sent.', 'bg-gray-200')
        // Verify using the new OOB link
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
          cy.request(link)
        })
      } else {
        // Verify Email (emulated email side-channel using original link)
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
          cy.request(link)
        })
      }

      // Return to the profile page
      cy.visit('/profile')
      cy.get('.bg-red-200').should('not.exist')
      cy.contains('Please verify your email').should('not.exist')
      cy.contains('Role: reviewer').should('be.visible')

      // Verify main navigation links are now visible
      cy.contains('a', 'Dashboard').should('be.visible')
      cy.contains('a', 'Classes').should('be.visible')
      cy.contains('a', 'Students').should('be.visible')
      cy.contains('a', 'Interviews').should('be.visible')
      cy.contains('a', 'Applications').should('be.visible')
      cy.contains('a', 'Registrations').should('be.visible')
      cy.contains('a', 'Sub Requests Log').should('be.visible')
    })
  })

  // Production report: a user visiting a stale registration link (expired, or
  // already used to create an account) saw no usable feedback. `load` in
  // +page.server.ts runs on that GET before the signup form ever renders, so
  // whatever it does on a bad token is the entire user-facing behavior here -
  // there's no form/dialog to fall back on like the POST-time failures below.
  ;[
    {
      label: 'Expired Token',
      id: 'expired-test-token',
      setup: () =>
        cy.createTestToken('expired-test-token', {
          expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        }),
      message: 'Token has expired. If you need a new token, contact an admin.',
    },
    {
      label: 'Already-Used Token',
      id: 'consumed-test-token',
      setup: () =>
        cy.createTestToken('consumed-test-token', {
          consumable: true,
          consumers: ['some-previous-signup-uid'],
        }),
      message:
        'Token already consumed. If this token was meant specifically for your account, immediately contact an admin with this message.',
    },
  ].forEach(({ label, id, setup, message }) => {
    it(`Test Case 6z: Visiting Sign Up with a ${label} Reports the Error`, () => {
      setup()
      cy.visit(`/signup?token=${id}`)

      // The failure has to reach the user as a notification, the same as
      // every other auth failure in this suite - not a blank/crashed page.
      cy.waitForNotification(message, 'bg-red-200')
    })
  })

  // Both sites share one Firebase Auth instance, so an email that already has an
  // account anywhere - same role, other role, or the portal site - can never be
  // signed up again here. `adminAuth.createUser` rejects with
  // `auth/email-already-exists` and the server action returns `fail(400)`, whose
  // only user-visible feedback is the error dialog below. That dialog is the
  // whole point of these cases: a production report of "the password field just
  // clears and nothing happens" is exactly what this suite looks like when the
  // dialog regresses, since the failure branch of `use:enhance` blanks both
  // password fields on its way out.
  ;[
    {
      label: 'Same Role (Existing Reviewer)',
      email: 'reviewer@gbstem.org',
      token: 'demo-reviewer-token',
    },
    {
      label: 'Different Role, Same Site (Existing Admin)',
      email: 'demo@gbstem.org',
      token: 'demo-reviewer-token',
    },
    {
      label: 'Different Role, Portal Site (Existing Instructor)',
      email: 'instructor@gbstem.org',
      token: 'demo-reviewer-token',
    },
    // Same cross-site case as above, but through the admin token, so a
    // divergence between the two token paths can't hide here.
    {
      label: 'Different Role, Portal Site (Existing Student)',
      email: 'student@gbstem.org',
      token: 'demo-admin-token',
    },
  ].forEach(({ label, email, token }) => {
    it(`Test Case 6: Sign Up Rejected for Existing Account - ${label}`, () => {
      cy.visit(`/signup?token=${token}`)
      cy.get('h1').should('contain', 'Sign up')
      cy.get('input[name="first-name"]').should('be.visible')
      cy.waitForFormHydration()

      cy.fillInput('input[name="first-name"]', 'Duplicate')
      cy.fillInput('input[name="last-name"]', generateDateHash('Account'))
      cy.fillInput('input[name="email"]', email)
      cy.fillInput('input[name="password"]', 'penguin')
      cy.fillInput('input[name="confirm-password"]', 'penguin')
      cy.get('button[type="submit"]').click()

      // The failure has to be visible, not just implied by a cleared form.
      cy.get('[role="dialog"]', { timeout: 15000 }).should('be.visible')
      cy.get('[role="dialog"]').should('contain', 'Error')
      cy.get('[role="dialog"]').should(
        'contain',
        'The email address is already in use by another account.',
      )

      // Still on the signup form, and not signed in as anyone - least of all as
      // the pre-existing account whose email was just typed in.
      cy.url().should('include', '/signup')
      cy.get('[role="dialog"]')
        .find('button')
        .contains('Close')
        .click({ force: true })
      cy.get('[role="dialog"]').should('not.exist')
      cy.get('h1').should('contain', 'Sign up')

      cy.visit('/dashboard')
      cy.url().should('include', '/signin')
    })
  })

  it('Test Case 6b: Repeated Failed Sign Up Still Shows the Error', () => {
    // The regression behind the production report. `showErrorDialog` is only
    // flipped false by the dialog's own Close button, so before the fix a
    // second failed submit on the same page render re-rendered the dialog with
    // open=false: the user saw the password fields blank out and nothing else.
    // Retrying without a reload is what a real user does after a typo, so it
    // has to be exercised here rather than assumed from the first attempt.
    const submitDuplicate = () => {
      cy.fillInput('input[name="first-name"]', 'Duplicate')
      cy.fillInput('input[name="last-name"]', generateDateHash('Retry'))
      cy.fillInput('input[name="email"]', 'reviewer@gbstem.org')
      cy.fillInput('input[name="password"]', 'penguin')
      cy.fillInput('input[name="confirm-password"]', 'penguin')
      cy.get('button[type="submit"]').click()
    }

    cy.visit('/signup?token=demo-reviewer-token')
    cy.get('input[name="first-name"]').should('be.visible')
    cy.waitForFormHydration()

    submitDuplicate()
    cy.get('[role="dialog"]', { timeout: 15000 }).should('be.visible')
    cy.get('[role="dialog"]').should(
      'contain',
      'The email address is already in use by another account.',
    )
    cy.get('[role="dialog"]')
      .find('button')
      .contains('Close')
      .click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')

    // Same page render, no reload - the dialog has to come back.
    submitDuplicate()
    cy.get('[role="dialog"]', { timeout: 15000 }).should('be.visible')
    cy.get('[role="dialog"]').should(
      'contain',
      'The email address is already in use by another account.',
    )
  })
})
