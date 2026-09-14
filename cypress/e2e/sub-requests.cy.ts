import { expectCellInColumn } from '../support/utils'

describe('Section J: Substitute Requests Log', () => {
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
    cy.signedInSession('admin', { initialPage: '/sub-requests' })
  })

  it('Test Case 19: Filter, Search, and Audit Sub Requests', () => {
    // Verify columns
    cy.get('th').contains('Class').should('be.visible')
    cy.get('th').contains('Original Instructor Email').should('be.visible')
    cy.get('th').contains('Date Of Class').should('be.visible')
    cy.get('th').contains('Request Status').should('be.visible')
    cy.get('th').contains('Substitute Instructor').should('be.visible')
    cy.get('th').contains('Substitute Instructor Email').should('be.visible')

    // Verify preconditions
    cy.get('table', { timeout: 10000 }).should(($table) => {
      expect($table).to.contain('Scratch')
      expect($table).to.contain('Python')
    })

    // Search query
    cy.submitSearch('Python')
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Scratch gets filtered out and Python stays
      expect($table).to.not.contain('Scratch')
      expect($table).to.contain('Python')
    })

    // Clear search using Clear button
    cy.contains('button', 'Clear').click()
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Scratch reappears
      expect($table).to.contain('Scratch')
      expect($table).to.contain('Python')
    })

    // Filter by course
    cy.selectOption('input[name="course"]', 'Python 1')
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Python 2 gets filtered out and Python 1 stays
      expect($table).to.not.contain('Python 2')
      expect($table).to.contain('Python 1')
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
            'course',
            'classNumber',
            'originalInstructorEmail',
            'dateOfClass',
            'subRequestStatus',
            'subInstructorFirstName',
            'subInstructorEmail',
            'notes',
          ])
          // Verify the date string matches ISO format for all but the header row
          parsedRows.slice(1).forEach((row: string[]) => {
            expect(row[4]).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
          })
          // Drop the date column and check if the first 5 rows match the expected rows
          cy.dropCsvColumn(parsedRows, 'dateOfClass').then((revisedRows) => {
            const first5Rows = revisedRows.slice(1, 6)
            expect(first5Rows).to.deep.equal([
              [
                'sub-req-fake-1',
                'Python 1',
                '2',
                'instructor-fake-1@gbstem.org',
                'accepted',
                'Patricia',
                'sub-1@gbstem.org',
                'Dentist appointment fake #1.',
              ],
              [
                'sub-req-fake-11',
                'Python 1',
                '4',
                'instructor-fake-11@gbstem.org',
                'completed',
                'Susan',
                'sub-11@gbstem.org',
                'Dentist appointment fake #11.',
              ],
              [
                'sub-req-fake-16',
                'Python 1',
                '1',
                'instructor-fake-16@gbstem.org',
                'accepted',
                'Charles',
                'sub-16@gbstem.org',
                'Dentist appointment fake #16.',
              ],
              [
                'sub-req-fake-21',
                'Python 1',
                '2',
                'instructor-fake-21@gbstem.org',
                'open',
                '',
                '',
                'Dentist appointment fake #21.',
              ],
              [
                'sub-req-fake-26',
                'Python 1',
                '3',
                'instructor-fake-26@gbstem.org',
                'completed',
                'Mark',
                'sub-26@gbstem.org',
                'Dentist appointment fake #26.',
              ],
            ])
          })
        })
      })

    // Verify row statuses match background colors
    // Check one red row (open / needs substitute) or green row (no substitute needed) or blue row (substitute found)
    cy.get('table')
      .find('tbody')
      .find('tr')
      .each(($tr) => {
        if ($tr.text().includes('no substitute needed')) {
          cy.wrap($tr).should('have.class', 'bg-green-100')
        } else if ($tr.text().includes('open')) {
          cy.wrap($tr).should('have.class', 'bg-red-100')
        } else if ($tr.text().includes('substitute found')) {
          cy.wrap($tr).should('have.class', 'bg-blue-100')
        } else if ($tr.text().includes('substitute feedback needed')) {
          cy.wrap($tr).should('have.class', 'bg-yellow-100')
        }
      })

    // Click on a row containing notes. Found by its substitute's name, the one
    // column a person is named by here besides the addresses under test.
    // sub-req-fake-26 is Python 1, so the course filter above leaves it shown.
    expectCellInColumn(
      cy.contains('tr', 'Mark'),
      'Original Instructor Email',
      'instructor-fake-26@gbstem.org',
    )
    expectCellInColumn(
      cy.contains('tr', 'Mark'),
      'Substitute Instructor Email',
      'sub-26@gbstem.org',
    ).click()
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]').contains('div', 'Dentist appointment fake #26.')

    // Click Close inside the dialog
    cy.contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')
  })
})
