describe('Section M: Check In Details and Meals', () => {
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
    cy.signedInSession('admin', { initialPage: '/students' })
  })

  it('Test Case 22: Student Attendance and Meal Checkouts', () => {
    // Search for Demo Student
    cy.submitSearch('Demo Student')

    // Click Demo Student One to open modal
    cy.contains('td', 'Demo Student One').click()
    cy.get('[role="dialog"]').should('exist')

    // Verify Check In & Meals card is visible
    cy.contains('h2', 'Check In & Meals').should('exist')

    // Click Check In button
    cy.contains('button', 'Check In').click({ force: true })
    cy.waitForNotification('Student checked in successfully!')

    // Meal Status should now be visible
    cy.contains('div', 'Meal Status').should('exist')

    // The following tests are disabled because src/lib/data/retreatMealSchedule.ts is empty.
    // When a retreat is scheduled, this file should be updated to include the retreat's meal
    // schedule tests.

    // Find and click the dinner: available button
    // It should change to dinner: already eaten
    // cy.contains('button', 'dinner: available').click({ force: true })
    // cy.contains('button', 'dinner: already eaten').should('exist')

    // Click it again to toggle it back to dinner: available
    // cy.contains('button', 'dinner: already eaten').click({ force: true })
    // cy.contains('button', 'dinner: available').should('exist')

    // Close the details modal using exact regex
    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')
  })
})
