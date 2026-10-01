import { checkInsCollection } from '../../src/lib/data/collections'
import { retreatMealSchedule } from '../../src/lib/data/retreatMealSchedule'

/** Demo Student One's registration id, which keys their check-in record. */
const CHECK_IN_PATH = `${checkInsCollection}/student-demo-uid-1`

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
    // No record yet, so the one read below can only have come from this
    // check-in - including on a retry.
    cy.task('deleteFirestoreDoc', CHECK_IN_PATH)

    // Search for Demo Student
    cy.submitSearch('Demo Student')

    // Click Demo Student One to open modal
    cy.contains('td', 'Demo Student One').click()
    cy.get('[role="dialog"]').should('exist')

    // Verify Check In & Meals card is visible
    cy.contains('h2', 'Check In & Meals').should('exist')

    // Click Check In button
    const clickedAt = Date.now()
    cy.contains('button', 'Check In').click({ force: true })
    cy.waitForNotification('Student checked in successfully!')

    // The record the check-in page and the meal buttons work from. Nothing
    // else in the suite writes or reads it.
    cy.task('readFirestoreDoc', CHECK_IN_PATH).then((record: any) => {
      expect(record, 'check-in record').to.not.equal(null)
      const { checkedInAt, ...rest } = record
      expect(rest).to.deep.equal({
        checkedIn: true,
        food: retreatMealSchedule,
      })
      const checkedInMs = checkedInAt._seconds * 1000
      expect(
        checkedInMs,
        'checked in when the button was clicked',
      ).to.be.within(clickedAt - 1000, Date.now())
    })

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
