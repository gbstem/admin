describe('Section O: Reviewer Role Access Control', () => {
  beforeEach(() => {
    // Ignore transient Firebase emulator connection exceptions
    Cypress.on('uncaught:exception', (err) => {
      if (
        err.message.includes('Connection failed') ||
        err.message.includes('Firebase') ||
        err.message.includes('FIRESTORE')
      ) {
        return false
      }
      return true
    })

    // Authenticate as Reviewer using the optimized session command
    cy.signedInSession('reviewer')
  })

  it('Test Case 24: Reviewer Navigation and Nav Bar Layout', () => {
    cy.visit('/dashboard')
    cy.get('h1').should('contain', 'Dashboard')

    // Navigation bar displays allowed pages
    cy.contains('a', 'Dashboard').should('be.visible')
    cy.contains('a', 'Classes').should('be.visible')
    cy.contains('a', 'Students').should('be.visible')
    cy.contains('a', 'Interviews').should('be.visible')
    cy.contains('a', 'Applications').should('be.visible')
    cy.contains('a', 'Registrations').should('be.visible')
    cy.contains('a', 'Sub Requests Log').should('be.visible')

    // Navigation bar does NOT display restricted pages
    cy.contains('a', 'Tokens').should('not.exist')
    cy.contains('a', 'Student Feedback').should('not.exist')
    cy.contains('a', 'Instructor Feedback').should('not.exist')

    // Navigate to each allowed page and make sure mock data loads
    cy.contains('a', 'Dashboard').click()
    cy.get('h1').should('contain', 'Dashboard')
    cy.contains('total instructor applications created.').should('be.visible')
    cy.contains('students pre-registered.').should('not.exist')
    cy.contains('Copy Emails for Uncompleted Registrations').should('not.exist')
    cy.contains('h2', 'Users').should('not.exist')
    cy.contains('h2', 'Classes Today').should('not.exist')

    cy.contains('a', 'Classes').click()
    cy.url().should('include', '/classes')
    cy.contains('Demo Instructor').should('be.visible')

    cy.contains('a', 'Students').click()
    cy.url().should('include', '/students')
    cy.contains('Demo Student').should('be.visible')

    cy.contains('a', 'Interviews').click()
    cy.url().should('include', '/interviews')
    cy.contains('Interview Time Requests').should('be.visible')

    cy.contains('a', 'Applications').click()
    cy.url().should('include', '/applications')
    cy.contains('David Miller').should('be.visible')

    cy.contains('a', 'Registrations').click()
    cy.url().should('include', '/registrations')
    cy.contains('Charlie Brown').should('be.visible')

    cy.contains('a', 'Sub Requests Log').click()
    cy.url().should('include', '/sub-requests')
    cy.contains('originalInstructorEmail').should('not.exist')
  })

  it('Test Case 25: Reviewer Blocked from Accessing Restricted Pages (Manual Navigation)', () => {
    // Manually navigate to /tokens and assert blocked
    cy.visit('/tokens', { failOnStatusCode: false })
    cy.get('body').should(
      'contain',
      'You do not have permission to view this page.',
    )

    // Manually navigate to /student-feedback and assert blocked
    cy.visit('/student-feedback', { failOnStatusCode: false })
    cy.get('body').should(
      'contain',
      'You do not have permission to view this page.',
    )

    // Manually navigate to /instructor-feedback and assert blocked
    cy.visit('/instructor-feedback', { failOnStatusCode: false })
    cy.get('body').should(
      'contain',
      'You do not have permission to view this page.',
    )
  })

  // Same as Test Case 11: Application Details Modal and Decision Updates but with a reviewer account
  it('Test Case 26: Reviewer Allowed Operations', () => {
    cy.visit('/applications')
    cy.title().should('contain', 'Applications')
    // Raw cy.visit() (not cy.signedInSession()), so there's no built-in
    // settle time for Svelte to attach event handlers before the click below.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000)

    // Open application modal for David Miller
    cy.contains('td', 'David Miller').click()
    cy.get('[role="dialog"]').should('exist')

    // Click Likely Yes
    cy.contains('button', 'Likely Yes').click({ force: true })

    // Close the details modal
    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')

    // David Miller's row should now have the green check icon (text-green-300) in the Likely Decision column
    cy.contains('tr', 'David Miller').within(() => {
      cy.get('.text-green-300').should('exist')
    })

    // Re-open David Miller
    cy.contains('td', 'David Miller').click()
    cy.get('[role="dialog"]').should('exist')

    // Click Accept and confirm
    cy.captureConfirms().as('confirms')
    cy.contains('button', 'Accept').click({ force: true })
    cy.get('@confirms').should('have.length', 1)
    cy.get('@confirms').its(0).should('contain', 'update the decision')

    // Close the modal
    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')
    cy.verifyEmailSent('applicant1@gmail.com', 'gbSTEM Instructor Decision')

    // Row should show accepted decision (green check icon in Decision column)
    cy.contains('tr', 'David Miller').within(() => {
      // It should have two text-green-300 icons now (Likely Yes and Accepted Decision)
      cy.get('.text-green-300').should('exist')
    })
  })

  it('Test Case 27: Reviewer Disallowed Write Operations (Firestore Level)', () => {
    cy.visit('/registrations')
    cy.title().should('contain', 'Registrations')
    // Raw cy.visit() (not cy.signedInSession()), so there's no built-in
    // settle time for Svelte to attach event handlers before the click below.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000)

    // Try to toggle "Bypass Age Limits?" which reviewer doesn't have permissions to write
    cy.contains('tr', 'Charlie Brown').find('input[id^="bypass-"]').click()

    // Assert they get a permission denied error toast
    cy.waitForNotification(
      'You do not have permission to modify this registration.',
      'bg-red-200',
      10000,
    )
  })
})
