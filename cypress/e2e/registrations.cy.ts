import { kebabCase } from 'lodash-es'
import {
  currentSemester,
  registrationsCollection,
} from '../../src/lib/data/collections'
import courses from '../../src/lib/data/courses.json'
import { prepareDocForCompare } from '../support/utils'

/**
 * The seed fills the math and science courses from the current semester's
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
  kebabCase(offeredCourses.find((course) => course.track === track)!.name)
const MATH_COURSE = seededCourse('math')
const SCIENCE_COURSE = seededCourse('science')

describe('Section G: Pre-Registrations Directory', () => {
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
    cy.signedInSession('admin', { initialPage: '/registrations' })
  })

  it('Test Case 15: Filter, Search, and Edit Pre-Registrations', () => {
    // Verify initial state
    cy.get('table', { timeout: 10000 }).should(($table) => {
      expect($table).to.contain('Charlie Brown')
      expect($table).to.contain('Sally Brown')
    })

    // Search for Charlie
    cy.submitSearch('Charlie')

    // Table should contain Charlie Brown
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Sally gets filtered out and Charlie stays
      expect($table).to.not.contain('Sally Brown')
      expect($table).to.contain('Charlie Brown')
    })

    // Clear search using Clear button
    cy.contains('button', 'Clear').click()
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify both Sally and Charlie show up again
      expect($table).to.contain('Sally Brown')
      expect($table).to.contain('Charlie Brown')
    })

    // Verify Per Page dropdown functionality
    cy.get('input[name="per-page"]').should('have.value', '25')
    cy.selectOption('input[name="per-page"]', '50')
    cy.url().should('contain', 'limit=50')
    cy.get('input[name="per-page"]').should('have.value', '50')

    // Select "submitted" from Status filter dropdown
    cy.selectOption('input[name="status"]', 'incomplete')
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Charlie gets filtered out and Mark stays
      expect($table).to.not.contain('Charlie Brown')
      expect($table).to.contain('Mark Lewis')
    })

    cy.selectOption('input[name="status"]', 'all')
    cy.get('table', { timeout: 10000 }).should(($table) => {
      // Verify Charlie gets restored and Mark stays
      expect($table).to.contain('Charlie Brown')
      expect($table).to.contain('Mark Lewis')
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
            'studentFirstName',
            'studentLastName',
            'parentFirstName',
            'parentLastName',
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
              'Lucy',
              'Brown',
              'parent1@gmail.com',
              'parent1_sec@gmail.com',
              'Pinecrest Elementary',
              '4',
              'scratch-1',
              'engineering-1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'No',
            ],
            [
              'reg-fake-0',
              'James',
              'Smith',
              'Parent',
              'Smith',
              'student-0@gmail.com',
              '',
              'Pinecrest Elementary',
              '1',
              'scratch-1',
              'engineering-1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'Yes',
            ],
            [
              'reg-fake-1',
              'Mary',
              'Johnson',
              'Parent',
              'Johnson',
              'student-1@gmail.com',
              '',
              'Oakridge Elementary',
              '2',
              'python-1',
              'engineering-1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'No',
            ],
            [
              'reg-fake-10',
              'David',
              'Hernandez',
              'Parent',
              'Hernandez',
              'student-10@gmail.com',
              '',
              'Pinecrest Elementary',
              '5',
              'scratch-1',
              'engineering-1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'Yes',
            ],
            [
              'reg-fake-11',
              'Barbara',
              'Lopez',
              'Parent',
              'Lopez',
              'student-11@gmail.com',
              '',
              'Oakridge Elementary',
              '6',
              'python-1',
              'engineering-1',
              MATH_COURSE,
              SCIENCE_COURSE,
              'No',
            ],
          ])
        })
      })

    // Verify Download Schools List button links to a CSV Blob
    cy.contains('a', 'Download Schools List')
      .should('have.attr', 'href')
      .and('include', 'blob:')
      .then((href) => {
        cy.window().then((win) => {
          return win.fetch(href).then((res: Response) => res.text())
        })
      })
      .then((text) => {
        const schools = text
          .split('\n')
          .map((line: string) => line.trim())
          .filter(Boolean)
        expect(schools).to.deep.equal([
          'brookside school',
          'maple valley academy',
          'oakridge elementary',
          'pinecrest elementary',
          'riverdale charter',
        ])
      })

    // Toggle Bypass Age Limits on Charlie Brown's row
    // Charlie Brown row's bypass checkbox is in column 9 (index 8)
    cy.contains('tr', 'Charlie Brown')
      .scrollIntoView()
      .within(() => {
        cy.get('td').eq(8).find('input[type="checkbox"]').check()
      })
    cy.waitForNotification('Bypass age limits updated successfully.')
    cy.contains('tr', 'Charlie Brown').within(() => {
      cy.get('td').eq(8).find('input[type="checkbox"]').should('be.checked')
    })

    // Open Registration details modal for Charlie Brown
    cy.contains('td', 'Charlie Brown').click()
    cy.get('[role="dialog"]').should('exist')

    // Verify parent education select field displays the seeded choice
    cy.get('input[name="personal.parentEducation"]').should(
      'have.value',
      "Bachelor's degree",
    )

    // Click Edit on the sticky header
    cy.contains('button', 'Edit').click()
    cy.contains('button', 'Save changes').should('be.visible')

    // Verify parent education select field validity is clean
    cy.get('input[name="personal.parentEducation"]').then(($el) => {
      const input = $el[0] as HTMLInputElement
      expect(input.validationMessage).to.equal('')
      expect(input.checkValidity()).to.equal(true)
    })

    // Change student grade from 4 to 5
    cy.get('input[name="student-grade"]')
      .scrollIntoView()
      .clear({ force: true })
      .type('5', { force: true })

    // Click Save changes
    cy.contains('button', 'Save changes').scrollIntoView().click()
    cy.waitForNotification('Changes were saved successfully.')

    // Verify parent education remains intact after save
    cy.get('input[name="personal.parentEducation"]').should(
      'have.value',
      "Bachelor's degree",
    )

    // Close dialog
    cy.contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')

    // Re-verify grade on the table row
    cy.contains('tr', 'Charlie Brown').within(() => {
      cy.get('td').eq(5).should('contain', '5')
    })
  })
})

/**
 * Every field EditRegistrationForm actually renders.
 *
 * Note the course names below are the *fall* catalogue. `src/lib/data/index.ts`
 * picks fall or spring by the current month, so these - like the course names
 * already hard-coded across both repos' specs - are seasonal.
 */
interface RegistrationInput {
  studentFirstName: string
  studentLastName: string
  email: string
  secondaryEmail: string
  phoneNumber: string
  dateOfBirth: string
  gender: string
  race: string[]
  frlp: string
  parentEducation: string
  school: string
  grade: string
  csCourse: string
  mathCourse: string
  engineeringCourse: string
  scienceCourse: string
  reason: string
  inPerson: boolean
  allergies: string
  parentPickup: string
  mediaRelease: boolean
  bypassAgeLimits: boolean
  entireProgram: boolean
  timeCommitment: boolean
  submitting: boolean
}

/** Sally Brown - deliberately not Charlie, whom Test Case 15 mutates. */
const SEEDED_REGISTRATION_ID = 'reg-sally'

/** `bind:group` stores tick order, so this array needs sorting before compare. */
const REGISTRATION_ARRAY_FIELDS = ['personal.race']

/**
 * Fills every field the form renders.
 *
 * `program.inPerson` is set before the in-person block because
 * `inPerson.allergies`/`inPerson.parentPickup` only render while it is ticked -
 * the same conditional-field trap the portal's application form has.
 */
function fillRegistrationForm(input: RegistrationInput) {
  cy.setFieldValue(
    'input[name="personal.studentFirstName"]',
    input.studentFirstName,
  )
  cy.setFieldValue(
    'input[name="personal.studentLastName"]',
    input.studentLastName,
  )
  cy.setFieldValue('input[name="personal.email"]', input.email)
  cy.setFieldValue(
    'input[name="personal.secondaryEmail"]',
    input.secondaryEmail,
  )
  cy.setFieldValue('input[name="personal.phoneNumber"]', input.phoneNumber)
  cy.setFieldValue('input[name="personal.dateOfBirth"]', input.dateOfBirth)
  cy.selectOption('input[name="personal.gender"]', input.gender)
  cy.selectOption('input[name="personal.frlp"]', input.frlp)
  cy.selectOption(
    'input[name="personal.parentEducation"]',
    input.parentEducation,
  )

  // Checkbox group: clear every box first so the result is the input exactly,
  // not the input unioned with whatever was stored.
  cy.get('input[id^="race-"]').uncheck({ force: true })
  input.race.forEach((race) => {
    cy.get(`input[id="race-${race}"]`).check({ force: true })
  })

  cy.setFieldValue('input[name="academic.school"]', input.school)
  cy.selectOption('input[name="student-grade"]', input.grade)

  cy.selectOption('input[name="program.csCourse"]', input.csCourse)
  cy.selectOption('input[name="program.mathCourse"]', input.mathCourse)
  cy.selectOption(
    'input[name="program.engineeringCourse"]',
    input.engineeringCourse,
  )
  cy.selectOption('input[name="program.scienceCourse"]', input.scienceCourse)
  cy.selectOption('input[name="program.reason"]', input.reason)

  const setCheckbox = (selector: string, checked: boolean) => {
    if (checked) cy.get(selector).check({ force: true })
    else cy.get(selector).uncheck({ force: true })
  }

  setCheckbox('input[name="program.inPerson"]', input.inPerson)
  if (input.inPerson) {
    cy.setFieldValue('input[name="inPerson.allergies"]', input.allergies)
    cy.setFieldValue('input[name="inPerson.parentPickup"]', input.parentPickup)
  }

  setCheckbox('input[name="agreements.mediaRelease"]', input.mediaRelease)
  setCheckbox('input[name="agreements.bypassAgeLimits"]', input.bypassAgeLimits)
  setCheckbox('input[name="agreements.entireProgram"]', input.entireProgram)
  setCheckbox('input[name="agreements.timeCommitment"]', input.timeCommitment)
  setCheckbox('input[name="agreements.submitting"]', input.submitting)
}

/**
 * The complete registration document the form is expected to have written.
 *
 * Most of this is *not* rendered by the form: the save is a `{ merge: true }`
 * write of the validated form data only, so every field below has to survive
 * untouched, and a regression that starts writing one shows up here.
 */
function expectedRegistrationDoc(input: RegistrationInput) {
  return {
    semester: currentSemester,
    personal: {
      studentFirstName: input.studentFirstName,
      studentLastName: input.studentLastName,
      email: input.email,
      secondaryEmail: input.secondaryEmail,
      phoneNumber: input.phoneNumber,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      race: input.race,
      frlp: input.frlp,
      parentEducation: input.parentEducation,
      // Displayed by the form but stripped by zod, so the seeded values stand.
      // This is the assertion behind `registrationEditedFields`' contract.
      parentFirstName: 'Lucy',
      parentLastName: 'Brown',
    },
    academic: {
      school: input.school,
      grade: input.grade,
    },
    program: {
      csCourse: input.csCourse,
      mathCourse: input.mathCourse,
      engineeringCourse: input.engineeringCourse,
      scienceCourse: input.scienceCourse,
      reason: input.reason,
      inPerson: input.inPerson,
    },
    inPerson: {
      allergies: input.allergies,
      parentPickup: input.parentPickup,
    },
    agreements: {
      mediaRelease: input.mediaRelease,
      bypassAgeLimits: input.bypassAgeLimits,
      entireProgram: input.entireProgram,
      timeCommitment: input.timeCommitment,
      submitting: input.submitting,
    },
    // Owned by the portal and by admin's own bypass toggle - never this form.
    meta: { uid: 'user2', submitted: true },
    enrolled: true,
  }
}

function assertRegistrationDoc(input: RegistrationInput) {
  cy.getFirebaseAuthToken().then((authToken: string) => {
    cy.getFirestoreDoc(
      authToken,
      registrationsCollection,
      SEEDED_REGISTRATION_ID,
    ).then((data: any) => {
      expect(data, 'registration document').to.not.equal(null)
      expect(
        prepareDocForCompare(data, {
          sortArraysAt: REGISTRATION_ARRAY_FIELDS,
        }),
      ).to.deep.equal(
        prepareDocForCompare(expectedRegistrationDoc(input), {
          sortArraysAt: REGISTRATION_ARRAY_FIELDS,
        }),
      )
    })
  })
}

/**
 * Opens the fixture registration's dialog and puts it into edit mode.
 *
 * Found by student name, because the table renders no document id column and
 * every other column is either edited by these tests or shared with Charlie
 * Brown (both students have parent "Lucy Brown"). That is why the two fixtures
 * below keep `studentFirstName`/`studentLastName` at their seeded values - the
 * seed runs once per spec file, so a rename would carry into the tests that
 * follow. Test Case 15d covers renaming, and restores the name itself.
 */
function openRegistrationForEdit(name = 'Sally Brown') {
  // Close any dialog a previous step left open, so the row underneath is
  // clickable and the form remounts from the stored document.
  cy.get('body').then(($body) => {
    if ($body.find('[role="dialog"]').length) {
      cy.contains('button', 'Close').click({ force: true })
      cy.get('[role="dialog"]').should('not.exist')
    }
  })
  // Forced: this row sits at the bottom of the page, where the pagination
  // controls overlap it. The click only has to reach the row's handler.
  cy.contains('td', name).click({ force: true })
  cy.get('[role="dialog"]').should('exist')
  cy.contains('button', 'Edit').click()
  cy.contains('button', 'Save changes').should('be.visible')
  cy.get('input[name="personal.studentFirstName"]').should('not.be.disabled')
  // Wait for the form store to be populated from the stored document before
  // filling anything. `toXFormValues` runs in an `$effect` after the dialog
  // opens, and a field set before it lands is overwritten by it - silently,
  // because the input shows the typed value while the store still holds the
  // stored one, and it is the store that gets saved.
  cy.get('input[name="personal.studentFirstName"]').should('not.have.value', '')
  cy.get('input[name="personal.dateOfBirth"]').should('not.have.value', '')
}

function saveRegistration() {
  cy.contains('button', 'Save changes').scrollIntoView().click()
  cy.waitForNotification('Changes were saved successfully.')
}

const REGISTRATION_INITIAL: RegistrationInput = {
  // Held at the seeded values on purpose - see `openRegistrationForEdit`.
  studentFirstName: 'Sally',
  studentLastName: 'Brown',
  email: 'edited-parent@example.com',
  secondaryEmail: 'edited-secondary@example.com',
  phoneNumber: '555-0142',
  dateOfBirth: '2017-03-09',
  gender: 'Female',
  race: ['White', 'Chinese'],
  frlp: 'Yes',
  parentEducation: "Master's degree",
  school: 'Riverdale Charter',
  grade: '3',
  csCourse: 'Python 1',
  mathCourse: 'Mathematics 2a',
  engineeringCourse: 'Engineering 2',
  scienceCourse: 'Physics A',
  reason: 'School',
  inPerson: true,
  allergies: 'Peanuts',
  parentPickup: 'Lucy Brown, Linus Brown',
  mediaRelease: true,
  bypassAgeLimits: true,
  entireProgram: true,
  timeCommitment: true,
  submitting: true,
}

/** Every field differs, including every boolean. */
const REGISTRATION_MODIFIED: RegistrationInput = {
  studentFirstName: 'Sally',
  studentLastName: 'Brown',
  email: 'second-parent@example.com',
  secondaryEmail: 'second-secondary@example.com',
  phoneNumber: '555-0188',
  dateOfBirth: '2015-11-22',
  gender: 'Prefer not to answer',
  race: ['Korean'],
  frlp: 'No',
  parentEducation: 'High school diploma or equivalent',
  school: 'Maple Valley Academy',
  grade: '6',
  csCourse: 'Scratch 2',
  mathCourse: 'Mathematics 3a',
  engineeringCourse: 'Engineering 3',
  scienceCourse: 'Environmental Science A',
  reason: 'Friend/family',
  // Stays true: flipping it hides `inPerson.allergies`/`parentPickup`, and
  // Test Case 15e covers that those keep their stored values when hidden.
  inPerson: true,
  allergies: 'None',
  parentPickup: 'Linus Brown',
  mediaRelease: false,
  bypassAgeLimits: false,
  entireProgram: false,
  timeCommitment: false,
  submitting: false,
}

describe('Section G: Pre-Registration Field Coverage', () => {
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
    cy.signedInSession('admin', { initialPage: '/registrations' })
  })

  it('Test Case 15b: Registration - Every Field Reaches Firestore', () => {
    openRegistrationForEdit()
    fillRegistrationForm(REGISTRATION_INITIAL)
    saveRegistration()
    assertRegistrationDoc(REGISTRATION_INITIAL)
  })

  it('Test Case 15c: Registration - Every Field Can Be Modified', () => {
    openRegistrationForEdit()
    fillRegistrationForm(REGISTRATION_INITIAL)
    saveRegistration()
    assertRegistrationDoc(REGISTRATION_INITIAL)

    // Re-open so the stored document is read back through
    // `toRegistrationFormValues`, which is where a field missing from that
    // mapper comes back empty and is then written over the stored value.
    cy.contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')
    openRegistrationForEdit()
    cy.get('input[name="academic.school"]').should(
      'have.value',
      REGISTRATION_INITIAL.school,
    )

    fillRegistrationForm(REGISTRATION_MODIFIED)
    saveRegistration()
    assertRegistrationDoc(REGISTRATION_MODIFIED)
  })

  it('Test Case 15d: Registration - Student Name Round-Trips', () => {
    // The one pair of fields `openRegistrationForEdit` can't vary, covered here
    // instead and restored at the end so the rest of the spec still finds the
    // row. Renaming is worth pinning: the student's name is the only part of
    // `personal` that admin owns outright rather than sharing with the portal.
    openRegistrationForEdit()
    fillRegistrationForm(REGISTRATION_INITIAL)
    saveRegistration()

    openRegistrationForEdit()
    cy.setFieldValue('input[name="personal.studentFirstName"]', 'Patricia')
    cy.setFieldValue('input[name="personal.studentLastName"]', 'Reichardt')
    saveRegistration()
    assertRegistrationDoc({
      ...REGISTRATION_INITIAL,
      studentFirstName: 'Patricia',
      studentLastName: 'Reichardt',
    })

    cy.contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')

    openRegistrationForEdit('Patricia Reichardt')
    cy.setFieldValue('input[name="personal.studentFirstName"]', 'Sally')
    cy.setFieldValue('input[name="personal.studentLastName"]', 'Brown')
    saveRegistration()
    assertRegistrationDoc(REGISTRATION_INITIAL)
  })

  it('Test Case 15e: Registration - Hidden In-Person Fields Keep Their Values', () => {
    // `inPerson.allergies`/`parentPickup` stop rendering when the hybrid box is
    // unticked, but they stay in the form data and so stay in the write. If
    // they were blanked instead, re-ticking the box would show them empty.
    openRegistrationForEdit()
    fillRegistrationForm(REGISTRATION_INITIAL)
    saveRegistration()

    openRegistrationForEdit()
    cy.get('input[name="program.inPerson"]').uncheck({ force: true })
    cy.get('input[name="inPerson.allergies"]').should('not.exist')
    saveRegistration()

    assertRegistrationDoc({
      ...REGISTRATION_INITIAL,
      inPerson: false,
    })
  })

  it('Test Case 15f: Registration - Delete Changes Discards Edits', () => {
    // Reseeding the form is driven by an explicit signal from the dialog
    // rather than by `values` changing, so that a slow load can't overwrite
    // what is being typed. "Delete changes" is the other sender of that
    // signal, and it had no coverage - a reseed that stopped firing here
    // would leave the discarded edits sitting in the form.
    openRegistrationForEdit()
    cy.get('input[name="academic.school"]')
      .invoke('val')
      .then((stored) => {
        cy.setFieldValue('input[name="academic.school"]', 'Discarded Academy')
        cy.contains('button', 'Delete changes').click()
        cy.get('input[name="academic.school"]').should('have.value', stored)
        // ...and the form goes back to read-only.
        cy.get('input[name="academic.school"]').should('be.disabled')
      })
  })
})
