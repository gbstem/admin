import { generateDateHash } from '../support/utils'

describe('Section N: End-to-End Account Lifecycle', () => {
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
  })

  it('Test Case 23: Complete Account Creation and Management Lifecycle', () => {
    // 1. Generate the Registration Token
    cy.signedInSession('admin', { initialPage: '/tokens' })
    cy.selectOption('input[name="per-page"]', '50')

    // Open creation modal
    cy.get('th').find('button').click({ force: true })
    cy.get('[role="dialog"]').should('exist')

    // Role selection: admin
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

    // Setup clipboard stub to capture the token
    let signupUrl = ''
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').callsFake((text) => {
        signupUrl = text
        return Promise.resolve()
      })
    })

    // Find the new row. Retry via .should() until it renders instead of
    // guessing how long the table takes to pick up the new token.
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

    // Copy token link
    cy.get('@newAdminRow').within(() => {
      cy.contains('button', 'Copy').click({ force: true })
    })
    cy.waitForNotification('Token copied.')

    // Sign out
    cy.signOutViaUi()

    // 2. Register the New Account
    cy.then(() => {
      expect(signupUrl).to.match(/\/signup\?token=[a-zA-Z0-9]{20}$/)
      cy.visit(signupUrl)
    })

    const initialEmail = `${generateDateHash('lifecycle.admin')}@gbstem.org`
    const initialPassword = 'initialPassword123'

    cy.get('h1').should('contain', 'Sign up')
    cy.fillInput('input[name="first-name"]', 'Lifecycle')
    cy.fillInput('input[name="last-name"]', 'Test')
    cy.fillInput('input[name="email"]', initialEmail)
    cy.fillInput('input[name="password"]', initialPassword)
    cy.fillInput('input[name="confirm-password"]', initialPassword)
    cy.get('button[type="submit"]').click()

    // Expect sign up to leave user signed in and redirect to profile page on success
    cy.url().should('include', '/profile')
    cy.get('h1').should('contain', 'Profile')
    cy.get('[role="dialog"]').should('exist')
    cy.contains('Please verify your email').should('be.visible')
    cy.get('[data-testid="email-unverified-banner"]')
      .should('be.visible')
      .and('contain', 'Email is not verified.')

    // Verify main navigation links are hidden
    cy.contains('a', 'Dashboard').should('not.exist')
    cy.contains('a', 'Classes').should('not.exist')

    // Close verification dialog
    cy.get('[role="dialog"]')
      .find('button')
      .contains('Close')
      .click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')

    // 4. Verify Email (emulated email side-channel)
    cy.getLatestOobLink(initialEmail, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    // Return to the profile page
    cy.visit('/profile')
    cy.get('.bg-red-200').should('not.exist')
    cy.contains('Please verify your email').should('not.exist')

    // Verify main navigation links are now visible
    cy.contains('a', 'Dashboard').should('be.visible')
    cy.contains('a', 'Classes').should('be.visible')

    // 5. Modify Profile Information
    // Update Name. The form seeds from the canonical `users` document and
    // exposes separate first/last name fields, matching the signup form above.
    const updatedLastName = 'TestUpdated'
    cy.get('input[name="first-name"]').should('have.value', 'Lifecycle')
    cy.get('input[name="last-name"]').should('have.value', 'Test')
    cy.get('input[name="last-name"]').clear()
    cy.get('input[name="last-name"]').type(updatedLastName)
    cy.get('input[name="last-name"]')
      .closest('.items-end')
      .contains('button', 'Update')
      .click({ force: true })
    cy.waitForNotification('Name successfully updated.')
    cy.get('input[name="first-name"]').should('have.value', 'Lifecycle')
    cy.get('input[name="last-name"]').should('have.value', updatedLastName)

    // Update Email
    const updatedEmail = `${generateDateHash('lifecycle.admin.new')}@gbstem.org`
    cy.contains('span', 'Change email')
      .parent()
      .within(() => {
        cy.get('input[name="new-email"]').clear()
        cy.get('input[name="new-email"]').type(updatedEmail)
      })
    cy.get('input[name="new-email"]')
      .closest('.items-end')
      .contains('button', 'Update')
      .click({ force: true })

    // Reauthenticate dialog opens
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]').find('input[type="password"]').clear()
    cy.get('[role="dialog"]')
      .find('input[type="password"]')
      .type(initialPassword)
    cy.get('[role="dialog"]')
      .find('button[type="submit"]')
      .click({ force: true })

    cy.waitForNotification('A verification email was sent.', 'bg-gray-200')

    // Verify the new email (emulated email side-channel)
    cy.getLatestOobLink(updatedEmail, 'VERIFY_AND_CHANGE_EMAIL').then(
      (link) => {
        cy.request(link)
      },
    )

    // Refresh profile and check email is updated
    cy.visit('/profile')
    cy.get('#current-email').should('have.value', updatedEmail)

    // Update Password
    const newPassword = 'newPassword789'
    cy.contains('span', 'Change password')
      .parent()
      .within(() => {
        cy.get('input[name="new-password"]').clear()
        cy.get('input[name="new-password"]').type(newPassword)
        cy.get('input[name="confirm-password"]').clear()
        cy.get('input[name="confirm-password"]').type(newPassword)
      })
    cy.get('input[name="confirm-password"]')
      .closest('.items-end')
      .contains('button', 'Update')
      .click({ force: true })

    // Reauthenticate dialog opens
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]').find('input[type="password"]').clear()
    cy.get('[role="dialog"]')
      .find('input[type="password"]')
      .type(initialPassword)
    cy.get('[role="dialog"]')
      .find('button[type="submit"]')
      .click({ force: true })

    // Explicitly delete the session cookie to ensure SvelteKit treats us as signed out
    // and doesn't redirect us back to /dashboard when visiting /signin.
    cy.request('DELETE', '/api/auth')
    cy.visit('/signin')
    cy.url().should('include', '/signin')

    // 6. Password Reset
    cy.visit('/reset-password')
    cy.get('h1').should('contain', 'Reset password')
    cy.fillInput('input[type="email"]', updatedEmail)
    cy.get('button[type="submit"]').click()
    cy.get('body').should('contain', 'Password reset email was sent')

    // Get the password reset link (emulated email side-channel)
    const finalPassword = 'finalPassword456'
    cy.getLatestOobLink(updatedEmail, 'PASSWORD_RESET').then((link) => {
      const resetLink = `${link}&newPassword=${finalPassword}`
      cy.request(resetLink)
    })

    // Sign in with new credentials
    cy.visit('/signin')
    cy.fillInput('input[type="email"]', updatedEmail)
    cy.fillInput('input[type="password"]', finalPassword)
    cy.get('button[type="submit"]').click()
    cy.url().should('include', '/dashboard')

    // 7. Delete Account
    cy.visit('/profile')
    cy.waitForFormHydration()
    cy.contains('span', 'Delete account')
      .parent()
      .find('button[type="button"]')
      .click({ force: true })

    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]').find('input[type="password"]').clear()
    cy.get('[role="dialog"]').find('input[type="password"]').type(finalPassword)
    cy.get('[role="dialog"]')
      .find('button[type="submit"]')
      .contains('Delete')
      .click({ force: true })

    cy.waitForNotification('Account was successfully deleted.')

    // DeleteAccountForm.svelte reloads the page 2000ms after this toast, which
    // then redirects to /signin since the account no longer has a session --
    // let the assertion's own retry window span that delay instead of a fixed wait.
    cy.url({ timeout: 8000 }).should('include', '/signin')
  })
})
