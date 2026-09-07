import { kebabCase } from 'lodash-es'
import { currentSemester } from '../../src/lib/data/collections'
import courses from '../../src/lib/data/courses.json'

/**
 * The seed fills the math and science columns from the current semester's
 * catalog (`seededCourse` in scripts/seedLib.ts), and those names differ
 * between the halves of the year - `Mathematics 1a` in fall, `1b` in spring.
 * Deriving the expected values from the same catalog is what keeps this table
 * from having to be retyped at every rollover.
 */
const offeredCourses = courses.filter(
  (course) =>
    course.semester ===
    (currentSemester.startsWith('Fall') ? 'fall' : 'spring'),
)
const seededCourse = (track: string) =>
  offeredCourses.find((course) => course.track === track)!.name
// The directory kebab-cases this one column; the others render verbatim.
const MATH_COURSE = kebabCase(seededCourse('math'))
const SCIENCE_COURSE = seededCourse('science')

describe('Section F: Students Directory', () => {
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

  it('Test Case 14: Students Search, Filtering, and Enrolling/Dropping Classes', () => {
    // Verify initial state
    cy.get('table', { timeout: 10000 }).should(($table) => {
      expect($table).to.contain('Charlie Brown')
      expect($table).to.contain('Sally Brown')
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
            'firstName',
            'lastName',
            'email',
            'secondaryEmail',
            'school',
            'grade',
            'csCourse',
            'engineeringCourse',
            'mathCourse',
            'scienceCourse',
            'In-person',
          ])
          const first5Rows = parsedRows.slice(1, 6)
          expect(first5Rows.length).to.be.at.most(5)
          expect(first5Rows).to.deep.equal([
            [
              'reg-charlie',
              'Charlie',
              'Brown',
              'parent1@gmail.com',
              'parent1_sec@gmail.com',
              'Pinecrest Elementary',
              '4',
              'Scratch 1',
              'Engineering 1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'No',
            ],
            [
              'reg-fake-10',
              'David',
              'Hernandez',
              'student-10@gmail.com',
              '',
              'Pinecrest Elementary',
              '5',
              'Scratch 1',
              'Engineering 1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'Yes',
            ],
            [
              'reg-fake-11',
              'Barbara',
              'Lopez',
              'student-11@gmail.com',
              '',
              'Oakridge Elementary',
              '6',
              'Python 1',
              'Engineering 1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'No',
            ],
            [
              'reg-fake-12',
              'Richard',
              'Gonzalez',
              'student-12@gmail.com',
              '',
              'Brookside School',
              '1',
              'Python 2',
              'Engineering 1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'No',
            ],
            [
              'reg-fake-13',
              'Susan',
              'Wilson',
              'student-13@gmail.com',
              '',
              'Maple Valley Academy',
              '2',
              'Web Development',
              'Engineering 1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'No',
            ],
          ])
        })
      })

    // Search for Charlie
    cy.submitSearch('Charlie')
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Sally gets filtered out and Charlie stays
      expect($table).to.not.contain('Sally Brown')
      expect($table).to.contain('Charlie Brown')
    })

    // Click Charlie Brown's row to open details modal
    cy.contains('td', 'Charlie Brown').click()
    cy.get('[role="dialog"]').should('exist')

    // Enroll Charlie in "Python 1"
    // eq(0) is the Add Class dropdown
    cy.get('input[name="select-a-class"]', { timeout: 15000 })
      .eq(0)
      .clear({ force: true })
      .type('Python 1', { force: true })
    cy.get('input[name="select-a-class"]')
      .eq(0)
      .parent()
      .parent()
      .find('button')
      .contains('Python 1')
      .click({ force: true })

    // Click Add Class
    cy.contains('button', 'Add Class').click({ force: true })
    cy.waitForNotification('Enrolled in class successfully!')
    cy.verifyEmailSent('parent1@gmail.com', 'class details for Charlie Brown')

    // Class 1 Information should appear
    cy.contains('h2', 'Class 1 Information').should('exist')
    cy.contains('td', 'Python 1').should('exist')

    // Drop the class
    // eq(1) is the Drop Class dropdown
    cy.get('input[name="select-a-class"]', { timeout: 15000 })
      .eq(1)
      .clear({ force: true })
      .type('Python 1', { force: true })
    cy.get('input[name="select-a-class"]')
      .eq(1)
      .parent()
      .parent()
      .find('button')
      .contains('Python 1')
      .click({ force: true })

    // Click Drop Class
    cy.contains('button', 'Drop Class').click({ force: true })
    cy.waitForNotification('Dropped class successfully!')

    // Class 1 Information should no longer exist
    cy.contains('h2', 'Class 1 Information').should('not.exist')

    // Close the details modal
    cy.contains('button', 'Close').click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')
  })
})
