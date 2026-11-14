describe('Section C: Announcements Page', () => {
  beforeEach(() => {
    // Authenticate as Admin using the optimized session command
    cy.signedInSession('admin', { initialPage: '/announcements' })
  })

  it('Test Case 8: View Announcements and Control Pagination', () => {
    // Verify announcements are listed in a table
    cy.get('table', { timeout: 10000 }).should('be.visible')
    cy.get('th').contains('Date').should('be.visible')
    cy.get('th').contains('Title').should('be.visible')
    cy.get('th').contains('Content').should('be.visible')

    // Navigate to a URL with custom limit parameter
    cy.visit('/announcements?limit=50&page=1')

    // The dropdown should automatically reflect the limit "50"
    cy.get('select[name="per-page"]').should('have.value', '50')

    // Since we seeded 30 mock announcements, and the limit is 50:
    // Page 1 should contain all 30 announcements, and Next button should be hidden.
    cy.contains('button', 'Previous').should('not.exist')
    cy.contains('button', 'Next').should('not.exist')
  })
})
