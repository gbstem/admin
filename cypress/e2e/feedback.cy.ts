describe('Section I: Feedback Views', () => {
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

    cy.signedInSession('admin')
  })

  it('Test Case 17: Audit Student Feedback', () => {
    cy.visit('/student-feedback')
    cy.url().should('include', '/student-feedback')
    cy.title().should('contain', 'Student Feedback')
    // This is a raw cy.visit(), unlike other specs' cy.signedInSession(), so
    // there's no built-in settle time for Svelte to attach event handlers --
    // submitSearch's typing/click below needs the page to actually be
    // interactive, which a retrying assertion on visible content doesn't
    // guarantee on its own.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000)

    // Verify columns
    cy.get('th').contains('Student Name').should('be.visible')
    cy.get('th').contains('Course').should('be.visible')
    cy.get('th').contains('Instructor Name').should('be.visible')
    cy.get('th').contains('Date').should('be.visible')
    cy.get('th').contains('Feedback').should('be.visible')
    cy.get('th').contains('Rating').should('be.visible')

    // Verify initial state
    cy.get('table', { timeout: 10000 }).should(($table) => {
      expect($table).to.contain('Christopher Lee')
      expect($table).to.contain('Charles Jackson')
    })

    // Search by student name
    cy.submitSearch('Christopher')
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Charles gets filtered out and Christopher stays
      expect($table).to.not.contain('Charles Jackson')
      expect($table).to.contain('Christopher Lee')
    })

    // Clear search using Clear button
    cy.contains('button', 'Clear').click()
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify both Charles and Christopher show up again
      expect($table).to.contain('Charles Jackson')
      expect($table).to.contain('Christopher Lee')
    })

    // Filter by course
    cy.selectOption('input[name="course"]', 'Python 1')
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Christopher gets filtered out and John stays
      expect($table).to.not.contain('Christopher Lee')
      expect($table).to.contain('John Williams')
    })

    // Verify Download button links to a CSV Blob
    cy.contains('a', 'Download')
      .should('have.attr', 'href')
      .and('include', 'blob:')
      .then((href) => {
        cy.window().then((win) => {
          return win.fetch(href).then((res: Response) => res.text())
        })
      })
      .then((text) => {
        cy.parseCsv(text).then((parsedRows) => {
          const headers = parsedRows[0]
          expect(headers).to.deep.equal([
            'id',
            'studentName',
            'course',
            'instructorName',
            'date',
            'feedback',
            'rating',
          ])
          const first5Rows = parsedRows.slice(1, 6)
          expect(first5Rows).to.deep.equal([
            [
              'feedback-fake-1',
              'John Williams',
              'Python 1',
              'Mary Johnson',
              '2026-03-11',
              'The class was very fun and I learned Python! (#1)',
              '2',
            ],
            [
              'feedback-fake-11',
              'Richard Gonzalez',
              'Python 1',
              'Barbara Lopez',
              '2026-03-21',
              'The class was very fun and I learned Python! (#11)',
              '2',
            ],
            [
              'feedback-fake-16',
              'Sarah Moore',
              'Python 1',
              'Thomas Taylor',
              '2026-03-26',
              'The class was very fun and I learned Python! (#16)',
              '2',
            ],
            [
              'feedback-fake-21',
              'Daniel Thompson',
              'Python 1',
              'Nancy Perez',
              '2026-03-11',
              'The class was very fun and I learned Python! (#21)',
              '2',
            ],
            [
              'feedback-fake-26',
              'Margaret Ramirez',
              'Python 1',
              'Anthony Clark',
              '2026-03-16',
              'The class was very fun and I learned Python! (#26)',
              '2',
            ],
          ])
        })
      })
  })

  it('Test Case 18: Audit Instructor Feedback and View Details', () => {
    cy.visit('/instructor-feedback')
    cy.url().should('include', '/instructor-feedback')
    cy.title().should('contain', 'Class Feedback') // The title is Class Feedback or similar
    // See the same comment in Test Case 17 -- raw cy.visit() with no built-in
    // settle time before submitSearch's typing/click.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000)

    // Verify columns
    cy.get('th').contains('Instructor Name').should('be.visible')
    cy.get('th').contains('Course').should('be.visible')
    cy.get('th').contains('Class Number').should('be.visible')
    cy.get('th').contains('Date').should('be.visible')
    cy.get('th').contains('Attendance Percent').should('be.visible')
    cy.get('th').contains('Feedback').should('be.visible')

    // Verify initial state
    cy.get('table', { timeout: 10000 }).should(($table) => {
      expect($table).to.contain('Karen Martin')
      expect($table).to.contain('Charles Jackson')
    })

    // Search by instructor name
    cy.submitSearch('Karen')
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Ensure Charles gets filtered out and Karen stays
      expect($table).to.not.contain('Charles Jackson')
      expect($table).to.contain('Karen Martin')
    })

    // Clear search using Clear button
    cy.contains('button', 'Clear').click()
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify both Charles and Karen show up again
      expect($table).to.contain('Charles Jackson')
      expect($table).to.contain('Karen Martin')
    })

    // Filter by course
    cy.selectOption('input[name="course"]', 'Python 1')
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Karen gets filtered out and Mary stays
      expect($table).to.not.contain('Karen Martin')
      expect($table).to.contain('Mary Johnson')
    })

    // Click on feedback row to open modal
    cy.get('table').find('tbody').find('tr').eq(0).click()
    cy.get('[role="dialog"]').should('exist')

    // Close the details modal using exact regex matching
    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')

    // Verify Download button links to a CSV Blob
    cy.contains('a', 'Download')
      .should('have.attr', 'href')
      .and('include', 'blob:')
      .then((href) => {
        cy.window().then((win) => {
          return win.fetch(href).then((res: Response) => res.text())
        })
      })
      .then((text) => {
        cy.parseCsv(text).then((parsedRows) => {
          const headers = parsedRows[0]
          expect(headers).to.deep.equal([
            'id',
            'instructorName',
            'courseName',
            'classNumber',
            'date',
            'feedback',
          ])
          const first5Rows = parsedRows.slice(1, 6)
          expect(first5Rows).to.deep.equal([
            [
              'instructor-feedback-fake-1',
              'Mary Johnson',
              'Python 1',
              '2',
              '2026-03-11',
              'Both students participated actively today. Class #1.',
            ],
            [
              'instructor-feedback-fake-11',
              'Barbara Lopez',
              'Python 1',
              '4',
              '2026-03-21',
              'Both students participated actively today. Class #11.',
            ],
            [
              'instructor-feedback-fake-16',
              'Thomas Taylor',
              'Python 1',
              '1',
              '2026-03-26',
              'Both students participated actively today. Class #16.',
            ],
            [
              'instructor-feedback-fake-21',
              'Nancy Perez',
              'Python 1',
              '2',
              '2026-03-11',
              'Both students participated actively today. Class #21.',
            ],
            [
              'instructor-feedback-fake-26',
              'Anthony Clark',
              'Python 1',
              '3',
              '2026-03-16',
              'Both students participated actively today. Class #26.',
            ],
          ])
        })
      })
  })
})
