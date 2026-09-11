import {
  classesCollection,
  currentSemester,
} from '../../src/lib/data/collections'
import { prepareDocForCompare } from '../support/utils'

describe('Section E: Classes Directory', () => {
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
    cy.signedInSession('admin', { initialPage: '/classes' })
  })

  it('Test Case 12: Classes Search, Filters, and Email Export', () => {
    // Verify initial state
    cy.get('table', { timeout: 10000 }).should(($table) => {
      expect($table).to.contain('Python 1')
      expect($table).to.contain('Scratch 1')
    })

    // Select "Python 1" from Course filter dropdown
    cy.get('input[name="course"]').clear().type('Python 1')
    cy.get('input[name="course"]')
      .parent()
      .find('button')
      .contains('Python 1')
      .click({ force: true })

    // Table should contain Python 1 classes only
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Ensure Scratch is filtered out and Python 1 stays
      expect($table).to.not.contain('Scratch 1')
      expect($table).to.contain('Python 1')
    })

    // Stub clipboard
    cy.window().then((win) => {
      const stub = cy.stub(win.navigator.clipboard, 'writeText')
      stub.resolves()
      cy.wrap(stub).as('clipboardCopy')
    })

    // Click "Copy Emails" button
    cy.contains('button', 'Copy Emails').click()
    cy.get('@clipboardCopy').then((stub: any) => {
      expect(stub.called).to.equal(true)
      const text = stub.lastCall.args[0]
      cy.parseCopiedEmails(text).then((emails) => {
        expect(emails.slice(0, 5)).to.deep.equal([
          'instructor-fake-11@gbstem.org',
          'instructor-fake-16@gbstem.org',
          'instructor-fake-1@gbstem.org',
          'instructor-fake-21@gbstem.org',
          'instructor-fake-26@gbstem.org',
        ])
      })
    })
    cy.waitForNotification('copied to clipboard')

    // Verify Download button links to a CSV Blob
    cy.contains('a', 'Download')
      .should('have.attr', 'href')
      .and('include', 'blob:')
      .then((href) => {
        cy.window().then((win) => {
          return win.fetch(href).then((resRes: Response) => resRes.text())
        })
      })
      .then((text) => {
        cy.parseCsv(text).then((parsedRows) => {
          const headers = parsedRows[0]
          expect(headers).to.deep.equal([
            'id',
            'name',
            'email',
            'class',
            'students',
            'classes complete',
            'classes missing feedback',
            'classes missed',
            'meeting link',
            'class times',
          ])
          const first5Rows = parsedRows.slice(1, 6)
          expect(first5Rows).to.deep.equal([
            [
              'class-fake-1',
              'Mary Johnson',
              'instructor-fake-1@gbstem.org',
              'Python 1',
              'student-fake-1',
              '1',
              '0',
              '0',
              'https://zoom.us/j/123456789',
              'Monday at 4:00 PM, Wednesday at 4:00 PM',
            ],
            [
              'class-fake-11',
              'Barbara Lopez',
              'instructor-fake-11@gbstem.org',
              'Python 1',
              'student-fake-11',
              '0',
              '0',
              '0',
              'https://zoom.us/j/123456789',
              'Monday at 4:00 PM, Wednesday at 4:00 PM',
            ],
            [
              'class-fake-16',
              'Thomas Taylor',
              'instructor-fake-16@gbstem.org',
              'Python 1',
              'student-fake-16',
              '0',
              '0',
              '0',
              'https://zoom.us/j/123456789',
              'Monday at 4:00 PM, Wednesday at 4:00 PM',
            ],
            [
              'class-fake-21',
              'Nancy Perez',
              'instructor-fake-21@gbstem.org',
              'Python 1',
              'student-fake-21',
              '0',
              '0',
              '0',
              'https://zoom.us/j/123456789',
              'Monday at 4:00 PM, Wednesday at 4:00 PM',
            ],
            [
              'class-fake-26',
              'Anthony Clark',
              'instructor-fake-26@gbstem.org',
              'Python 1',
              'student-fake-26',
              '0',
              '0',
              '0',
              'https://zoom.us/j/123456789',
              'Monday at 4:00 PM, Wednesday at 4:00 PM',
            ],
          ])
        })
      })
  })

  it('Test Case 13: Class Details Modal Actions', () => {
    // Open modal for Python 1 class taught by Demo Instructor
    cy.contains('tr', 'Demo Instructor').click()
    cy.get('[role="dialog"]').should('exist')

    // Verify Class List columns
    cy.get('table', { timeout: 10000 }).should('exist')
    cy.get('th').contains('Student Name').should('exist')
    cy.get('th').contains('Email').should('exist')
    cy.get('th').contains('Secondary Email').should('exist')
    cy.get('th').contains('Phone').should('exist')
    cy.get('th').contains('Grade').should('exist')
    cy.get('th').contains('School').should('exist')

    // Wait for student list to load asynchronously from Firestore
    cy.get('[role="dialog"]').contains('td', 'Demo Student One').should('exist')

    // Stub clipboard
    cy.window().then((win) => {
      const stub = cy.stub(win.navigator.clipboard, 'writeText')
      stub.resolves()
      cy.wrap(stub).as('clipboardCopy')
    })

    // Click Copy button inside class details
    cy.get('[role="dialog"]').contains('button', 'Copy').click()
    cy.get('@clipboardCopy').then((stub: any) => {
      expect(stub.called).to.equal(true)
      const text = stub.lastCall.args[0]
      cy.parseCopiedEmails(text).then((emails) => {
        expect(emails).to.deep.equal([
          'student1@gbstem.org',
          'student2@gbstem.org',
          'student@gbstem.org',
        ])
      })
    })
    cy.waitForNotification('copied to clipboard')

    // Click reminders (trigger alert)
    cy.captureConfirms().as('confirms')
    cy.contains('button', 'Send Reminder To All Students').click()
    cy.get('body', { timeout: 10000 }).should(($body) => {
      expect($body.find('.bg-red-200, .bg-green-200').length).to.be.greaterThan(
        0,
      )
    })
    cy.get('body').then(($body) => {
      if ($body.find('.bg-red-200').length > 0) {
        cy.get('.bg-red-200').should('contain', 'No upcoming classes')
      } else {
        cy.waitForNotification('sent')
        cy.verifyEmailSent('student@gbstem.org', 'gbSTEM Class Reminder')
      }
    })

    cy.get('@confirms').should('have.length', 1)
    cy.get('@confirms')
      .its(0)
      .should('contain', 'Send class reminder to all students')

    cy.contains('button', 'Send Instructor Reminder').click()
    cy.get('body', { timeout: 10000 }).should(($body) => {
      expect($body.find('.bg-red-200, .bg-green-200').length).to.be.greaterThan(
        0,
      )
    })
    cy.get('body').then(($body) => {
      if ($body.find('.bg-red-200').length > 0) {
        cy.get('.bg-red-200').should('contain', 'No upcoming classes')
      } else {
        cy.waitForNotification('sent')
        cy.verifyEmailSent(
          'instructor@gbstem.org',
          'gbSTEM Class Teaching Reminder',
        )
      }
    })

    cy.get('@confirms').should('have.length', 2)
    cy.get('@confirms')
      .its(1)
      .should('contain', 'Send class reminder to instructor')

    // Edit capacity
    cy.contains('button', 'Edit').click()

    // Generate a random capacity to ensure we verify write success
    const newCapacity = Math.floor(Math.random() * 50) + 15
    cy.setFieldValue('input[name="class-capacity"]', String(newCapacity))

    // Click Save changes
    cy.contains('button', 'Save changes').click()
    cy.waitForNotification('Changes were saved successfully.')

    // Close and reopen to verify capacity saved
    cy.contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')

    cy.contains('tr', 'Demo Instructor').click()
    cy.get('[role="dialog"]').should('exist')
    cy.get('input[name="class-capacity"]').should(
      'have.value',
      String(newCapacity),
    )

    // Close modal
    cy.contains('button', 'Close').click()

    // The two reminders are the only things here that should have prompted --
    // editing and saving the class must not.
    cy.get('@confirms').should('have.length', 2)
  })
})

/** Every field EditClassForm actually renders. */
interface ClassInput {
  course: string
  gradeRecommendation: string
  classCap: string
  meetingLink: string
  classDay1: string
  classTime1: string
  classDay2: string
  classTime2: string
  online: boolean
}

/** Bob Jones's Scratch 1 class - Test Case 13 works on Demo Instructor's. */
const SEEDED_CLASS_ID = 'class-scratch'
const SEEDED_CLASS_INSTRUCTOR = 'Bob Jones'
/** Search matches one name field at a time, so a full name matches nothing. */
const SEEDED_CLASS_SEARCH = 'Bob'

/**
 * `meetingTimes` and `completedClassDates` hold Firestore timestamps, which
 * `getFirestoreDoc`'s converter returns as raw wrappers rather than dates.
 * They are asserted for length separately.
 */
const CLASS_TIMESTAMP_FIELDS = ['meetingTimes', 'completedClassDates']

function fillClassForm(input: ClassInput) {
  // Native `<select>` elements here, not the custom combobox the other admin
  // forms use, so `cy.select` rather than `cy.selectOption`.
  cy.get('select[name="course"]').select(input.course, { force: true })
  cy.setFieldValue(
    'input[name="gradeRecommendation"]',
    input.gradeRecommendation,
  )
  cy.setFieldValue('input[name="class-capacity"]', input.classCap)

  if (input.online) {
    cy.get('input[name="online"]').check({ force: true })
  } else {
    cy.get('input[name="online"]').uncheck({ force: true })
  }

  cy.get('select[name="classDay1"]').select(input.classDay1, { force: true })
  cy.setFieldValue('input[name="classTime1"]', input.classTime1)

  // `meetingLink`, `classDay2` and `classTime2` only render while the class is
  // online - Test Case 13c covers what happens to them when it isn't.
  if (input.online) {
    cy.setFieldValue('input[name="meetingLink"]', input.meetingLink)
    cy.get('select[name="classDay2"]').select(input.classDay2, { force: true })
    cy.setFieldValue('input[name="classTime2"]', input.classTime2)
  }
}

/**
 * The complete class document the form is expected to have written.
 *
 * `classService.saveClassDetails` merges only the fields the form owns (see
 * `classEditedFields`), so every unrendered field below - the roster, the
 * generated schedule, the instructor's name, the co-instructor list - has to
 * come through from the stored document untouched. It used to write the whole
 * document back from the copy loaded when the dialog opened, which could drop
 * an enrollment made in the meantime.
 */
function expectedClassDoc(input: ClassInput) {
  return {
    semester: currentSemester,
    course: input.course,
    gradeRecommendation: input.gradeRecommendation,
    classCap: Number(input.classCap),
    meetingLink: input.meetingLink,
    classDay1: input.classDay1,
    classTime1: input.classTime1,
    classDay2: input.classDay2,
    classTime2: input.classTime2,
    online: input.online,
    // None of these are rendered by this form.
    instructorEmail: 'instructor2@gbstem.org',
    instructorFirstName: 'Bob',
    instructorLastName: 'Jones',
    otherInstructorUids: ['instructor-cohost-uid'],
    students: ['student3'],
    classStatuses: ['FeedbackIncomplete', 'ClassInFuture'],
    feedbackCompleted: [false, false],
  }
}

function readClassDoc(): Cypress.Chainable<any> {
  return cy
    .getFirebaseAuthToken()
    .then((authToken: string) =>
      cy.getFirestoreDoc(authToken, classesCollection, SEEDED_CLASS_ID),
    )
}

function assertClassDoc(input: ClassInput) {
  readClassDoc().then((data: any) => {
    expect(data, 'class document').to.not.equal(null)
    expect(
      prepareDocForCompare(data, { omit: CLASS_TIMESTAMP_FIELDS }),
    ).to.deep.equal(
      prepareDocForCompare(expectedClassDoc(input), {
        omit: CLASS_TIMESTAMP_FIELDS,
      }),
    )
    // Dropped from the comparison above, so checked here rather than not at
    // all - a full-document overwrite that lost them would be invisible
    // otherwise.
    expect(data.meetingTimes, 'meeting times').to.have.length(2)
    expect(data.completedClassDates, 'completed class dates').to.have.length(0)
  })
}

function openClassForEdit() {
  // Close any dialog a previous step left open, so the row underneath is
  // clickable and the form remounts from the stored document.
  cy.get('body').then(($body) => {
    if ($body.find('[role="dialog"]').length) {
      cy.contains('button', /^Close$/).click({ force: true })
      cy.get('[role="dialog"]').should('not.exist')
    }
  })
  // Searched rather than scanned: the directory paginates, and this class is
  // not on the first page. Only searched when the term isn't already applied -
  // re-typing into a box that already holds it races the box's own controlled
  // value and lands as "BobBob".
  cy.url().then((url) => {
    if (!url.includes(`query=${SEEDED_CLASS_SEARCH}`)) {
      cy.submitSearch(SEEDED_CLASS_SEARCH)
    }
  })
  cy.contains('tr', SEEDED_CLASS_INSTRUCTOR).click({ force: true })
  cy.get('[role="dialog"]').should('exist')
  cy.contains('button', 'Edit').click({ force: true })
  cy.get('input[name="gradeRecommendation"]').should('not.be.disabled')
  // Wait for the form store to be populated from the stored document before
  // filling anything. `toXFormValues` runs in an `$effect` after the dialog
  // opens, and a field set before it lands is overwritten by it - silently,
  // because the input shows the typed value while the store still holds the
  // stored one, and it is the store that gets saved.
  cy.get('input[name="classTime1"]').should('not.have.value', '')
  cy.get('input[name="class-capacity"]').should('not.have.value', '')
}

function saveClass() {
  cy.contains('button', 'Save changes').click({ force: true })
  cy.waitForNotification('Changes were saved successfully.')
}

const CLASS_INITIAL: ClassInput = {
  course: 'Python 1',
  gradeRecommendation: '3-5',
  classCap: '9',
  meetingLink: 'https://zoom.us/j/111222333',
  classDay1: 'Monday',
  classTime1: '15:30',
  classDay2: 'Wednesday',
  classTime2: '16:45',
  online: true,
}

/** Every field differs except `online`, which Test Case 13c covers. */
const CLASS_MODIFIED: ClassInput = {
  course: 'Engineering 1',
  gradeRecommendation: '6-8',
  classCap: '14',
  meetingLink: 'https://zoom.us/j/444555666',
  classDay1: 'Thursday',
  classTime1: '17:15',
  classDay2: 'Friday',
  classTime2: '18:00',
  online: true,
}

describe('Section E: Class Field Coverage', () => {
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
    cy.signedInSession('admin', { initialPage: '/classes' })
  })

  it('Test Case 13b: Class - Every Field Reaches Firestore', () => {
    openClassForEdit()
    fillClassForm(CLASS_INITIAL)
    saveClass()
    assertClassDoc(CLASS_INITIAL)
  })

  it('Test Case 13c: Class - Every Field Can Be Modified', () => {
    openClassForEdit()
    fillClassForm(CLASS_INITIAL)
    saveClass()
    assertClassDoc(CLASS_INITIAL)

    // Re-open so the stored document is read back through `toClassFormValues`,
    // which is where a field missing from that mapper comes back as the
    // schema's default - and with no `{ merge: true }` on the write, that
    // default is then stored.
    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')
    openClassForEdit()
    cy.get('input[name="class-capacity"]').should(
      'have.value',
      CLASS_INITIAL.classCap,
    )

    fillClassForm(CLASS_MODIFIED)
    saveClass()
    assertClassDoc(CLASS_MODIFIED)
  })

  it('Test Case 13d: Class - Offline Class Keeps Its Hidden Online Fields', () => {
    // `meetingLink`, `classDay2` and `classTime2` stop rendering once a class
    // is marked in-person, but they stay in the form data and so stay in the
    // write. With a non-merging `setDoc` behind this form, blanking them
    // instead would erase the stored values outright.
    openClassForEdit()
    fillClassForm(CLASS_INITIAL)
    saveClass()

    openClassForEdit()
    cy.get('input[name="online"]').uncheck({ force: true })
    cy.get('input[name="meetingLink"]').should('not.exist')
    saveClass()

    assertClassDoc({ ...CLASS_INITIAL, online: false })
  })
})
