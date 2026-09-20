import {
  applicationsCollection,
  currentSemester,
} from '../../src/lib/data/collections'
import collectionsList from '../../src/lib/data/collectionsList.json'
import { prepareDocForCompare } from '../support/utils'

// The display name (e.g. "Spring 2026") for the current semester, as shown in the
// CollectionFilter dropdown - derived from collections.ts/collectionsList.json so these
// tests don't need editing every time the semester rolls over.
const currentSemesterName =
  collectionsList.find((sem) => sem.id === currentSemester)?.name ??
  currentSemester

// Table assertions here follow a navigation that re-runs the page's server
// load. CI has no Algolia credentials, so `searchIndex` falls back to the local
// search in src/lib/server/search.ts, which reads the entire applications
// collection and then fetches each hit's decision document. This is headroom
// for that round trip; `submitSearch`'s own URL assertion (cypress/support/
// commands.ts) needs the same headroom for the same reason -- SvelteKit
// doesn't update the URL until that same load resolves -- and now carries it.
const TABLE_TIMEOUT = 30000

// Searches go through cy.submitSearch (cypress/support/commands.ts), which
// works around a typing race that otherwise submits a truncated query.

describe('Section D: Instructor Applications Management', () => {
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
    cy.signedInSession('admin', { initialPage: '/applications' })
  })

  it('Test Case 9: Filter, Search, and Download Applications Table', () => {
    // Verify initial state
    cy.get('table', { timeout: TABLE_TIMEOUT }).should(($table) => {
      expect($table).to.contain('David Miller')
      expect($table).to.contain('Mark Lewis')
    })

    // Search for "David"
    cy.submitSearch('David')
    cy.get('table', { timeout: TABLE_TIMEOUT }).should(($table) => {
      // Ensure Mark disappears and David stays
      expect($table).to.not.contain('Mark Lewis')
      expect($table).to.contain('David Miller')
    })

    // Clear search using Clear button
    cy.contains('button', 'Clear').click()
    cy.get('table', { timeout: TABLE_TIMEOUT }).should(($table) => {
      // Ensure Mark re-appears
      expect($table).to.contain('Mark Lewis')
      expect($table).to.contain('David Miller')
    })

    // Select "Fall 2025" from Collection dropdown
    cy.get('input[name="collection"]').clear()
    cy.get('input[name="collection"]').type('Fall 2025')
    cy.get('input[name="collection"]')
      .parent()
      .find('button')
      .contains('Fall 2025')
      .click({ force: true })
    cy.get('table', { timeout: TABLE_TIMEOUT }).should(($table) => {
      // Verify no applications from the current semester remain
      expect($table).to.not.contain('David Miller')
      expect($table).to.not.contain('Mark Lewis')
    })

    // Switch back to the current semester to see the applications again
    cy.get('input[name="collection"]').clear()
    cy.get('input[name="collection"]').type(currentSemesterName)
    cy.get('input[name="collection"]')
      .parent()
      .find('button')
      .contains(currentSemesterName)
      .click({ force: true })
    cy.get('table', { timeout: TABLE_TIMEOUT }).should(($table) => {
      // Ensure applications from the current semester reappear
      expect($table).to.contain('David Miller')
      expect($table).to.contain('Mark Lewis')
    })

    // Select "undecided" from Decision dropdown
    cy.get('input[name="decision"]').clear()
    cy.get('input[name="decision"]').type('undecided')
    cy.get('input[name="decision"]')
      .parent()
      .find('button')
      .contains('undecided')
      .click({ force: true })
    cy.get('table', { timeout: TABLE_TIMEOUT }).should(($table) => {
      // Ensure demo instructor is removed and David stays
      expect($table).to.not.contain('Demo Instructor')
      expect($table).to.contain('David Miller')
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
            'ID',
            'Submitted',
            'Decision',
            'Likely Decision',
            'Notes',
            'First Name',
            'Last Name',
            'Email',
            'School',
            'Graduation Year',
            'Courses',
            'Time Slots',
            'Taught Before',
            'In-person',
          ])
          const first5Rows = parsedRows.slice(1, 6)
          expect(first5Rows.length).to.be.at.most(5)
          expect(first5Rows).to.deep.equal([
            [
              'app-david',
              'Submitted',
              'Undecided',
              'Undecided',
              '',
              'David',
              'Miller',
              'applicant1@gmail.com',
              'Central High School',
              '2027',
              'Python 1;Scratch 1',
              'Monday/Wednesday',
              'Yes',
              'No',
            ],
            [
              'app-fake-1',
              'Submitted',
              'Undecided',
              'Undecided',
              '',
              'Mary',
              'Johnson',
              'applicant-1@gmail.com',
              'Oakridge Elementary',
              '2028',
              'Python 1',
              'Monday/Wednesday',
              'No',
              'No',
            ],
            [
              'app-fake-10',
              'Submitted',
              'Undecided',
              'Undecided',
              '',
              'David',
              'Hernandez',
              'applicant-10@gmail.com',
              'Pinecrest Elementary',
              '2028',
              'Scratch 1',
              'Monday/Wednesday',
              'Yes',
              'Yes',
            ],
            [
              'app-fake-11',
              'Submitted',
              'Undecided',
              'Undecided',
              '',
              'Barbara',
              'Lopez',
              'applicant-11@gmail.com',
              'Oakridge Elementary',
              '2028',
              'Python 1',
              'Monday/Wednesday',
              'No',
              'No',
            ],
            [
              'app-fake-13',
              'Submitted',
              'Undecided',
              'Undecided',
              '',
              'Susan',
              'Wilson',
              'applicant-13@gmail.com',
              'Maple Valley Academy',
              '2028',
              'Web Development',
              'Monday/Wednesday',
              'No',
              'No',
            ],
          ])
        })
      })
  })

  it('Test Case 10: Bulk Application Decisions', () => {
    // Check all applications
    cy.get('#check-all').check()
    cy.get('[id^="check-"]').should('be.checked')

    // Bulk actions bar should appear in navigation bar with action buttons
    cy.contains('button', 'Interview').should('exist')
    cy.contains('button', 'Accept').should('exist')
    cy.contains('button', 'Substitute').should('exist')
    cy.contains('button', 'Waitlist').should('exist')
    cy.contains('button', 'Reject').should('exist')

    // Uncheck header checkbox
    cy.get('#check-all').uncheck()
    cy.get('[id^="check-"]').should('not.be.checked')

    // Check two rows individually
    cy.get('#check-0').check()
    cy.get('#check-1').check()

    // Actions bar should update counts
    cy.contains('button', 'Interview 2 applicants').should('exist')
    cy.contains('button', 'Accept 2 applicants').should('exist')

    // Click Close to clear selection
    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[id^="check-"]').should('not.be.checked')
    cy.contains('button', 'Accept').should('not.exist')
  })

  it('Test Case 10b: Bulk Decisions Persist', () => {
    // Select a single applicant by name, scoped to their row, instead of by checkbox index,
    // so this test doesn't depend on the row ordering assumed by Test Case 10/11.
    cy.contains('tr', 'Mark Lewis').within(() => {
      cy.get('input[type="checkbox"]').check({ force: true })
    })

    cy.contains('button', 'Waitlist 1 applicant').click({ force: true })

    // A permission-denied write (the pre-fix behavior) surfaces as an error toast here
    // instead of this success toast.
    cy.waitForNotification('1 applicant waitlisted.')
    cy.verifyEmailSent('applicant-28@gmail.com', 'gbSTEM Instructor Decision')

    cy.contains('tr', 'Mark Lewis').within(() => {
      cy.get('.text-yellow-300').should('exist')
    })

    // Reload to confirm the decision was actually persisted server-side (and is readable
    // back from the correct collection), not just reflected in optimistic local state.
    cy.reload()
    cy.contains('tr', 'Mark Lewis').within(() => {
      cy.get('.text-yellow-300').should('exist')
    })

    // Test bulk decision to 'Interview' and verify interview scheduling email.
    // cy.reload() re-hydrates the page from scratch, so give Svelte a beat to
    // attach event handlers before interacting -- the row is visible from SSR
    // markup well before its checkbox's onclick listener is wired up, so a
    // retrying assertion on the row itself doesn't catch this.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000)
    // Search for this one rather than expecting to find her row on the first
    // page. Selecting by name already made the test independent of row
    // *ordering*, but not of the 25-row page: the default view lists submitted
    // applications newest-updated first, this applicant is the oldest of them,
    // and the seed had grown to exactly 25 - so the next application added to
    // it (any application, anywhere) tipped her onto page two. Searching pins
    // the row on screen however large the seed gets.
    //
    // Only this half searches: the decision below is the last thing the test
    // does, whereas the Mark Lewis half asserts on his row *after* deciding,
    // and a decided applicant drops out of the search results.
    //
    // A first name rather than a full one: without Algolia configured the
    // search falls back to matching the term against individual field values,
    // and no field holds "Mary Johnson".
    cy.submitSearch('Mary')
    cy.contains('tr', 'Mary Johnson').within(() => {
      cy.get('input[type="checkbox"]').check({ force: true })
    })

    cy.contains('button', 'Interview 1 applicant').click({ force: true })

    cy.waitForNotification('1 applicant interview.')
    cy.verifyEmailSent(
      'applicant-1@gmail.com',
      'Please schedule your gbSTEM instructor interview',
    )
  })

  it('Test Case 11: Application Details Modal, Editing Details, and Decision Updates', () => {
    // Open application modal for David Miller
    cy.contains('td', 'David Miller').click()
    cy.get('[role="dialog"]').should('exist')

    // Click Close Interview Form to reveal Edit button
    cy.contains('button', 'Close Interview Form').click({ force: true })
    cy.contains('button', 'Edit').should('be.visible')
    cy.get('input[name="personal.phoneNumber"]').should('be.disabled')

    // Click Edit to enable inputs
    cy.contains('button', 'Edit').click({ force: true })
    cy.get('input[name="personal.phoneNumber"]').should('not.be.disabled')

    // Cancel changes test
    cy.get('input[name="personal.phoneNumber"]').clear()
    cy.get('input[name="personal.phoneNumber"]').type('123-456-7890')
    cy.contains('button', 'Cancel changes').click({ force: true })
    cy.get('input[name="personal.phoneNumber"]').should('be.disabled')
    cy.get('input[name="personal.phoneNumber"]').should(
      'not.have.value',
      '123-456-7890',
    )

    // Save changes test
    cy.contains('button', 'Edit').click({ force: true })
    cy.get('input[name="personal.phoneNumber"]').clear()
    cy.get('input[name="personal.phoneNumber"]').type('123-456-7890')
    cy.contains('button', 'Save changes').click({ force: true })

    // Verify toast success
    cy.waitForNotification('Changes were saved successfully.')
    cy.get('input[name="personal.phoneNumber"]')
      .should('be.disabled')
      .and('have.value', '123-456-7890')

    // Restore Interview Form
    cy.contains('button', 'Show Interview Form').click({ force: true })

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
    cy.get('[role="dialog"]', { timeout: 10000 }).should('exist')

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

    // Test individual decision to 'Interview' via modal header button
    cy.clearTestEmails()
    cy.contains('td', 'David Hernandez').click()
    cy.get('[role="dialog"]').should('exist')
    // The capture above is still recording -- a confirm handler stays
    // registered for the rest of the test.
    cy.get('[role="dialog"]')
      .contains('button', 'Interview')
      .click({ force: true })
    cy.get('@confirms').should('have.length', 2)
    cy.get('@confirms').its(1).should('contain', 'update the decision')
    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')
    cy.verifyEmailSent(
      'applicant-10@gmail.com',
      'Please schedule your gbSTEM instructor interview',
    )
  })

  it('Test Case 11b: Instructor Interview Guide and Evaluation Form', () => {
    // Open application modal for David Miller
    cy.contains('td', 'David Miller').click()
    cy.get('[role="dialog"]').should('exist')

    // Make sure Interview Guide is open (if it's not, click Show Interview Form)
    cy.get('body').then(($body) => {
      if ($body.text().includes('Show Interview Form')) {
        cy.contains('button', 'Show Interview Form').click({ force: true })
      }
    })

    // Fill out the evaluation guide form. The fieldset stays disabled until
    // the modal's own application/decision fetch resolves (Application.svelte
    // wraps it in <fieldset disabled={loading}>, matching the decision
    // buttons above it) - waiting for that here, not just for the dialog to
    // exist, is what keeps this test from racing that fetch: filling a field
    // before it resolves gets silently overwritten when `interview` is
    // replaced wholesale with the fetched value, not merged into it.
    cy.get('input[type="datetime-local"]', { timeout: TABLE_TIMEOUT }).should(
      'be.enabled',
    )

    cy.contains('h2', 'Interview Guide & Evaluation Form')
      .closest('div')
      .within(() => {
        // cy.setFieldValue, not .type(): Cypress types into a datetime-local
        // widget one keystroke per sub-field (month/day/year/hour/minute),
        // which is slower and less reliable than a single assignment. See
        // interviews.cy.ts's "Add A Time Slot" case for the same fix on the
        // same input type.
        cy.setFieldValue('input[type="datetime-local"]', '2026-06-15T15:00')
        cy.get('input[name="interviewer"]').type('Jane Doe')
        cy.selectOption('input[name="attendance"]', 'On Time')

        // Ratings inputs
        cy.get('input[type="number"]').eq(0).clear()
        cy.get('input[type="number"]').eq(0).type('4') // Friendliness
        cy.get('input[type="number"]').eq(1).clear()
        cy.get('input[type="number"]').eq(1).type('4') // Explanations
        cy.get('input[type="number"]').eq(2).clear()
        cy.get('input[type="number"]').eq(2).type('3') // Engagement
        cy.get('input[type="number"]').eq(3).clear()
        cy.get('input[type="number"]').eq(3).type('4') // Pacing
        cy.get('input[type="number"]').eq(4).clear()
        cy.get('input[type="number"]').eq(4).type('4') // Overall

        // Textarea fields
        cy.get('textarea[name="conversation-notes"]').type(
          'Very polite, comfortable speaking to kids.',
        )
        cy.get(
          'textarea[name="what-courses-does-the-candidate-want-to-teach"]',
        ).type('Python 1, Scratch')
        cy.get('textarea[name="last-semester-notes"]').type(
          'Did a good job with Python 1.',
        )
        cy.get('textarea[name^="mock-lesson-notes"]').type(
          'Mock lesson was well structured. Pacing was clear.',
        )
        cy.get('textarea[name^="any-tech-or-other-issues"]').type(
          'None. Fast connection.',
        )
        cy.get('textarea[name^="availability-notes"]').type(
          'Available Saturdays and weekdays after 4pm.',
        )
        cy.get('textarea[name^="please-briefly-summarize"]').type(
          'Strong candidate, recommends for Scratch 1.',
        )

        // Save notes
        cy.contains('button', 'Save Notes').click({ force: true })
      })

    cy.waitForNotification('Notes updated successfully.')

    // Close details modal
    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')

    // Re-open and verify filled values remain
    cy.contains('td', 'David Miller').click()
    cy.get('[role="dialog"]').should('exist')

    cy.get('body').then(($body) => {
      if ($body.text().includes('Show Interview Form')) {
        cy.contains('button', 'Show Interview Form').click({ force: true })
      }
    })

    // Verify fields populated. The reopen re-fetches both the application and
    // decision docs (loadApplicationDetails), so this first assertion needs
    // the same CI round-trip headroom as TABLE_TIMEOUT above - the dialog
    // renders immediately with the default empty interview values and only
    // fills in once that fetch resolves.
    cy.contains('h2', 'Interview Guide & Evaluation Form')
      .closest('div')
      .within(() => {
        cy.get('input[type="datetime-local"]', {
          timeout: TABLE_TIMEOUT,
        }).should('have.value', '2026-06-15T15:00')
        cy.get('input[name="interviewer"]').should('have.value', 'Jane Doe')
        cy.get('input[name="attendance"]').should('have.value', 'On Time')
        cy.get('input[type="number"]').eq(0).should('have.value', '4')
        cy.get('textarea[name="conversation-notes"]').should(
          'have.value',
          'Very polite, comfortable speaking to kids.',
        )
        cy.get(
          'textarea[name="what-courses-does-the-candidate-want-to-teach"]',
        ).should('have.value', 'Python 1, Scratch')
      })

    // Close
    cy.contains('button', /^Close$/).click({ force: true })
  })
})

/** Every field EditApplicationForm actually renders. */
interface ApplicationInput {
  phoneNumber: string
  dateOfBirth: string
  gender: string
  race: string[]
  school: string
  graduationYear: string
  courses: string[]
  preferences: string
  timeSlots: string
  notAvailable: string
  inPerson: boolean
  reason: string
  taughtBefore: boolean
  academicBackground: string
  teachingScenario: string
  why: string
  entireProgram: boolean
  timeCommitment: boolean
  submitting: boolean
}

/**
 * `app-fake-1` - Mary Johnson. Chosen because no other test in this spec
 * touches her: Test Cases 9 through 11b all work on David Miller, David
 * Hernandez or Mark Lewis, and the seed runs once per spec file.
 */
const SEEDED_APPLICATION_ID = 'app-fake-1'
const SEEDED_APPLICANT_NAME = 'Mary Johnson'
/**
 * Searched by first name alone: the directory's search matches a single name
 * field at a time, so the full name matches nothing. 'Mary' is unique across
 * the seeded applicants - the seed assigns each of its 30 first names once.
 */
const SEEDED_APPLICANT_SEARCH = 'Mary'

/** `bind:group` stores tick order, so both need sorting before compare. */
const APPLICATION_ARRAY_FIELDS = ['personal.race', 'program.courses']

function setAppCheckbox(selector: string, checked: boolean) {
  if (checked) cy.get(selector).check({ force: true })
  else cy.get(selector).uncheck({ force: true })
}

/**
 * Fills every field the form renders.
 *
 * `essay.taughtBefore` is set before the essay fields because
 * `essay.teachingScenario`/`essay.why` only render while it is *un*ticked -
 * the same conditional-field trap the portal's application form has.
 */
function fillApplicationForm(input: ApplicationInput) {
  cy.setFieldValue('input[name="personal.phoneNumber"]', input.phoneNumber)
  cy.setFieldValue('input[name="personal.dateOfBirth"]', input.dateOfBirth)
  cy.selectOption('input[name="personal.gender"]', input.gender)

  // Clear every box first so the result is the input exactly, not the input
  // unioned with whatever was stored.
  cy.get('input[id^="app-race-"]').uncheck({ force: true })
  input.race.forEach((race) => {
    cy.get(`input[id="app-race-${race}"]`).check({ force: true })
  })

  cy.setFieldValue('input[name="academic.school"]', input.school)
  cy.setFieldValue(
    'input[name="academic.graduationYear"]',
    input.graduationYear,
  )

  cy.get('input[id^="app-course-"]').uncheck({ force: true })
  input.courses.forEach((course) => {
    cy.get(`input[id="app-course-${course}"]`).check({ force: true })
  })

  cy.setFieldValue('input[name="program.preferences"]', input.preferences)
  cy.setFieldValue('input[name="program.timeSlots"]', input.timeSlots)
  cy.setFieldValue('textarea[name="program.notAvailable"]', input.notAvailable)
  setAppCheckbox('input[name="program.inPerson"]', input.inPerson)
  cy.selectOption('input[name="program.reason"]', input.reason)

  setAppCheckbox('input[name="essay.taughtBefore"]', input.taughtBefore)
  cy.setFieldValue(
    'textarea[name="essay.academicBackground"]',
    input.academicBackground,
  )
  if (!input.taughtBefore) {
    cy.setFieldValue(
      'textarea[name="essay.teachingScenario"]',
      input.teachingScenario,
    )
    cy.setFieldValue('textarea[name="essay.why"]', input.why)
  }

  setAppCheckbox('input[name="agreements.entireProgram"]', input.entireProgram)
  setAppCheckbox(
    'input[name="agreements.timeCommitment"]',
    input.timeCommitment,
  )
  setAppCheckbox('input[name="agreements.submitting"]', input.submitting)
}

/**
 * The complete application document the form is expected to have written.
 *
 * `personal.email`/`firstName`/`lastName`, `program.numClasses` and the whole
 * of `meta` are never rendered by this form, so every one of them has to
 * survive the save untouched - which is exactly what `applicationEditedFields`
 * promises by writing only the validated form data.
 */
function expectedApplicationDoc(input: ApplicationInput, meta: any) {
  return {
    semester: currentSemester,
    personal: {
      email: 'applicant-1@gmail.com',
      firstName: 'Mary',
      lastName: 'Johnson',
      phoneNumber: input.phoneNumber,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      race: input.race,
    },
    academic: {
      school: input.school,
      graduationYear: Number(input.graduationYear),
    },
    program: {
      courses: input.courses,
      preferences: input.preferences,
      // Not in `applicationSchema` and not rendered, so zod strips it from the
      // write and the seeded value has to remain.
      numClasses: '1',
      timeSlots: input.timeSlots,
      notAvailable: input.notAvailable,
      inPerson: input.inPerson,
      reason: input.reason,
    },
    essay: {
      taughtBefore: input.taughtBefore,
      academicBackground: input.academicBackground,
      teachingScenario: input.teachingScenario,
      why: input.why,
    },
    agreements: {
      entireProgram: input.entireProgram,
      timeCommitment: input.timeCommitment,
      submitting: input.submitting,
    },
    // Passed in rather than hard-coded: `meta` is owned by the decision
    // actions and by the applicant in the portal, and the bulk-decision tests
    // earlier in this spec change `meta.decided`. Asserting it equals what it
    // was immediately before the save is both order-independent and a stronger
    // claim than any fixed value - it says this form changed none of it.
    meta,
  }
}

/** Reads the fixture application straight out of Firestore. */
function readApplicationDoc(): Cypress.Chainable<any> {
  return cy
    .getFirebaseAuthToken()
    .then((authToken: string) =>
      cy.getFirestoreDoc(
        authToken,
        applicationsCollection,
        SEEDED_APPLICATION_ID,
      ),
    )
}

/**
 * `meta` as it stood before the form saved. Captured per test rather than
 * assumed, so these tests don't depend on which decisions the tests above
 * happened to apply.
 */
let metaBeforeEdit: any

function captureApplicationMeta() {
  readApplicationDoc().then((data: any) => {
    expect(data, 'application document').to.not.equal(null)
    metaBeforeEdit = data.meta
  })
}

function assertApplicationDoc(input: ApplicationInput) {
  readApplicationDoc().then((data: any) => {
    expect(data, 'application document').to.not.equal(null)
    expect(
      prepareDocForCompare(data, { sortArraysAt: APPLICATION_ARRAY_FIELDS }),
    ).to.deep.equal(
      prepareDocForCompare(expectedApplicationDoc(input, metaBeforeEdit), {
        sortArraysAt: APPLICATION_ARRAY_FIELDS,
      }),
    )
  })
}

/**
 * Opens the fixture applicant's dialog and puts it into edit mode.
 *
 * The interview form covers the Edit button, and whether it starts open
 * depends on the applicant, so this handles either state - the same
 * defensive check Test Case 11b already makes.
 */
function openApplicationForEdit() {
  // Close any dialog a previous step left open, so the row underneath is
  // clickable and the form remounts from the stored document.
  cy.get('body').then(($body) => {
    if ($body.find('[role="dialog"]').length) {
      cy.contains('button', /^Close$/).click({ force: true })
      cy.get('[role="dialog"]').should('not.exist')
    }
  })
  // Only search when the term isn't already applied. Re-typing into a search
  // box that already holds it races the box's own controlled value and lands
  // as "Maryary", which then matches no rows.
  cy.url().then((url) => {
    if (!url.includes(`query=${SEEDED_APPLICANT_SEARCH}`)) {
      cy.submitSearch(SEEDED_APPLICANT_SEARCH)
    }
  })
  cy.contains('td', SEEDED_APPLICANT_NAME).click({ force: true })
  cy.get('[role="dialog"]').should('exist')
  cy.get('body').then(($body) => {
    if ($body.text().includes('Close Interview Form')) {
      cy.contains('button', 'Close Interview Form').click({ force: true })
    }
  })
  cy.contains('button', 'Edit').click({ force: true })
  cy.get('input[name="personal.phoneNumber"]').should('not.be.disabled')
  // Wait for the form store to be populated from the stored document before
  // filling anything. `toXFormValues` runs in an `$effect` after the dialog
  // opens, and a field set before it lands is overwritten by it - silently,
  // because the input shows the typed value while the store still holds the
  // stored one, and it is the store that gets saved.
  cy.get('input[name="personal.phoneNumber"]').should('not.have.value', '')
  cy.get('input[name="personal.dateOfBirth"]').should('not.have.value', '')
}

function saveApplication() {
  cy.contains('button', 'Save changes').click({ force: true })
  cy.waitForNotification('Changes were saved successfully.')
}

const APPLICATION_INITIAL: ApplicationInput = {
  phoneNumber: '555-0110',
  dateOfBirth: '2007-04-18',
  gender: 'Female',
  race: ['White', 'Korean'],
  school: 'Riverdale Charter',
  graduationYear: '2029',
  courses: ['Python 1', 'Scratch 1'],
  preferences: 'Mornings preferred',
  timeSlots: 'Tuesday/Thursday afternoons',
  notAvailable: 'Away the first week of October',
  inPerson: true,
  reason: 'School',
  // False so `essay.teachingScenario` and `essay.why` render at all.
  taughtBefore: false,
  academicBackground: 'Two years of AP Computer Science.',
  teachingScenario: 'I would pair the student with a worked example first.',
  why: 'I want to make CS less intimidating for younger students.',
  entireProgram: true,
  timeCommitment: true,
  submitting: true,
}

/** Every field differs, including every boolean. */
const APPLICATION_MODIFIED: ApplicationInput = {
  phoneNumber: '555-0999',
  dateOfBirth: '2006-12-02',
  gender: 'Prefer not to answer',
  race: ['Chinese'],
  school: 'Maple Valley Academy',
  graduationYear: '2031',
  courses: ['Engineering 1'],
  preferences: 'Evenings preferred',
  timeSlots: 'Monday/Wednesday evenings',
  notAvailable: 'Away over Thanksgiving',
  inPerson: false,
  reason: 'Friend/family',
  // Stays false: flipping it hides `teachingScenario`/`why`, which Test Case
  // 11e covers separately.
  taughtBefore: false,
  academicBackground: 'Tutored maths for three years.',
  teachingScenario: 'I would ask the student to explain it back to me.',
  why: 'Teaching is how I learned the material properly myself.',
  // The three agreements stay true because EditApplicationForm marks them
  // `required` - unlike EditRegistrationForm, which does not - so the browser
  // refuses to submit with any of them unchecked. There is no "modified"
  // value for them to take; Test Case 11f pins that rule instead.
  entireProgram: true,
  timeCommitment: true,
  submitting: true,
}

describe('Section D: Application Field Coverage', () => {
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
    cy.signedInSession('admin', { initialPage: '/applications' })
  })

  it('Test Case 11c: Application - Every Field Reaches Firestore', () => {
    captureApplicationMeta()
    openApplicationForEdit()
    fillApplicationForm(APPLICATION_INITIAL)
    saveApplication()
    assertApplicationDoc(APPLICATION_INITIAL)
  })

  it('Test Case 11d: Application - Every Field Can Be Modified', () => {
    captureApplicationMeta()
    openApplicationForEdit()
    fillApplicationForm(APPLICATION_INITIAL)
    saveApplication()
    assertApplicationDoc(APPLICATION_INITIAL)

    // Re-open so the stored document is read back through
    // `toApplicationFormValues`, which is where a field missing from that
    // mapper comes back empty and is then written over the stored value.
    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')
    openApplicationForEdit()
    cy.get('input[name="academic.school"]').should(
      'have.value',
      APPLICATION_INITIAL.school,
    )

    fillApplicationForm(APPLICATION_MODIFIED)
    saveApplication()
    assertApplicationDoc(APPLICATION_MODIFIED)
  })

  it('Test Case 11f: Application - A Required Agreement Blocks The Save', () => {
    // The Save button calls `formEl.requestSubmit()`, so an unchecked
    // `required` checkbox stops the submit in the browser before superforms or
    // Firestore ever see it - silently, with only a native bubble. Worth
    // pinning: nothing in the component says these three differ from the
    // registration form's agreements, which are freely uncheckable.
    captureApplicationMeta()
    openApplicationForEdit()
    fillApplicationForm(APPLICATION_INITIAL)
    saveApplication()
    assertApplicationDoc(APPLICATION_INITIAL)

    cy.contains('button', /^Close$/).click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')
    openApplicationForEdit()

    cy.get('input[name="agreements.timeCommitment"]').uncheck({ force: true })
    cy.contains('button', 'Save changes').click({ force: true })

    // Scoped to the form that owns the checkbox: the page has more than one
    // form element, and a bare `cy.get('form')` yields the first one.
    cy.get('input[name="agreements.timeCommitment"]')
      .closest('form')
      .should(($form) => {
        expect(
          ($form[0] as HTMLFormElement).checkValidity(),
          'form validity with a required agreement unchecked',
        ).to.equal(false)
      })
    // Nothing reached Firestore: the unchecked agreement is itself the edit
    // that was blocked, so the stored document still has it true.
    assertApplicationDoc(APPLICATION_INITIAL)
  })

  it('Test Case 11e: Application - Hidden Essay Fields Keep Their Values', () => {
    // `essay.teachingScenario`/`essay.why` stop rendering once the applicant
    // says they have taught before, but they stay in the form data and so stay
    // in the write. If they were blanked instead, un-ticking the box would show
    // them empty.
    captureApplicationMeta()
    openApplicationForEdit()
    fillApplicationForm(APPLICATION_INITIAL)
    saveApplication()

    openApplicationForEdit()
    cy.get('input[name="essay.taughtBefore"]').check({ force: true })
    cy.get('textarea[name="essay.teachingScenario"]').should('not.exist')
    saveApplication()

    assertApplicationDoc({ ...APPLICATION_INITIAL, taughtBefore: true })
  })
})
