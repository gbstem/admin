import {
  currentSemester,
  interviewTimesCollection,
} from '../../src/lib/data/collections'
import { prepareDocForCompare } from '../support/utils'

describe('Section H: Interview Timeslots Configuration', () => {
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
    cy.signedInSession('admin', { initialPage: '/interviews' })
  })

  it('Test Case 16: View, Create, and Manage Interview Slots', () => {
    // Verify Interview Time Requests card is visible
    cy.contains('h2', 'Interview Time Requests').should('exist')

    // Fill slot details
    // Future date: 2027-10-10 at 10:00 AM
    cy.contains('h2', 'Add A Time Slot')
      .parent()
      .within(() => {
        cy.setFieldValue('input[type="datetime-local"]', '2027-10-10T10:00')
        cy.setFieldValue(
          'input[name="interview-meeting-link"]',
          'https://zoom.us/j/9999999999',
        )

        // Assign Interviewee: select David Miller
        cy.get('input[name^="assign-interviewee"]').clear().type('David Miller')
        cy.get('input[name^="assign-interviewee"]')
          .parent()
          .find('button')
          .contains('David Miller')
          .click({ force: true })
      })

    // Confirm Timeslot with an assigned interviewe
    cy.captureConfirms().as('confirms')
    cy.contains('button', 'Confirm Timeslot').click({ force: true })
    cy.get('@confirms').should('have.length', 1)
    cy.get('@confirms')
      .its(0)
      .should('contain', 'assign David Miller as the interviewee')
    cy.waitForNotification('Interviewee assigned and email sent.')
    cy.verifyEmailSent('applicant1@gmail.com', 'your interview with')

    // Verify slot is created and appears in list. Scope by the meeting link
    // we just typed rather than "David Miller" -- scripts/seed.ts also seeds
    // a "slot-1" interview owned by Demo Admin with David Miller as the
    // interviewee, and Firestore's unscoped query doesn't guarantee result
    // order, so matching on the name alone can land on the wrong card.
    cy.contains('a', 'https://zoom.us/j/9999999999').should('exist')

    // Find the newly created slot card and click Edit
    cy.contains('a', 'https://zoom.us/j/9999999999')
      .parent()
      .parent()
      .within(() => {
        cy.contains('button', 'Edit').click({ force: true })
      })

    // Edit meeting link and save inside the edit card
    cy.contains('Edit Interview Meeting Link')
      .parent()
      .parent()
      .within(() => {
        cy.setFieldValue(
          'input[name="edit-interview-meeting-link"]',
          'https://zoom.us/j/8888888888',
        )
        cy.contains('button', 'Save').click({ force: true })
      })
    cy.waitForNotification('Timeslot updated successfully.')

    // Verify updated details
    cy.contains('a', 'https://zoom.us/j/8888888888').should('exist')

    // Click Edit again on the same card, scoped by its (now updated) unique
    // meeting link for the same reason as above.
    cy.contains('a', 'https://zoom.us/j/8888888888')
      .parent()
      .parent()
      .within(() => {
        cy.contains('button', 'Edit').click({ force: true })
      })

    // Click Delete inside the edit card
    cy.contains('Edit Interview Meeting Link')
      .parent()
      .parent()
      .within(() => {
        cy.contains('button', 'Delete').click({ force: true })
      })
    cy.waitForNotification('Timeslot successfully deleted.')

    // Verify it is removed from list
    cy.contains('a', 'https://zoom.us/j/8888888888').should('not.exist')

    // Assigning the interviewee is the only prompt this flow should raise --
    // editing and deleting the slot must not.
    cy.get('@confirms').should('have.length', 1)
  })
})

/**
 * `generateInterviewSlotId` builds the document id from the slot's local time
 * and the signed-in uid, so the test computes it the same way rather than
 * scraping it back out of the UI.
 */
const SLOT_DATE_LOCAL = '2028-03-14T09:30'
const SLOT_LINK = 'https://zoom.us/j/1231231234'

/** `date` is a Firestore timestamp, which `getFirestoreDoc` returns as a raw wrapper. */
const SLOT_TIMESTAMP_FIELDS = ['date']

function getDemoAdminUid(): Cypress.Chainable<string> {
  return cy
    .getFirebaseAuthToken()
    .then((authToken: string) =>
      cy.getFirestoreUserId(authToken, 'demo@gbstem.org'),
    )
}

function addSlotDocId(): Cypress.Chainable<string> {
  return getDemoAdminUid().then(
    (uid: string) => `${new Date(SLOT_DATE_LOCAL).getTime()}${uid}`,
  )
}

function readSlotDoc(docId: string): Cypress.Chainable<any> {
  return cy
    .getFirebaseAuthToken()
    .then((authToken: string) =>
      cy.getFirestoreDoc(authToken, interviewTimesCollection, docId),
    )
}

function fillAddSlot() {
  cy.contains('h2', 'Add A Time Slot')
    .parent()
    .within(() => {
      cy.setFieldValue(
        'input[name="set-date-your-local-time"]',
        SLOT_DATE_LOCAL,
      )
      cy.setFieldValue('input[name="interview-meeting-link"]', SLOT_LINK)
    })
}

describe('Section F: Interview Slot Field Coverage', () => {
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
    cy.signedInSession('admin', { initialPage: '/interviews' })
  })

  it('Test Case 16b: Interview Slot - Every Field Reaches Firestore', () => {
    fillAddSlot()
    cy.contains('button', 'Confirm Timeslot').click({ force: true })
    cy.waitForNotification('Timeslot added successfully.')

    // `createOrAssignInterviewSlot` writes with `setDoc` and no
    // `{ merge: true }`, so this really is the whole document - a field the
    // form stops carrying is deleted rather than left alone.
    getDemoAdminUid().then((uid: string) => {
      addSlotDocId().then((docId: string) => {
        readSlotDoc(docId).then((data: any) => {
          expect(data, 'interview slot document').to.not.equal(null)
          expect(
            prepareDocForCompare(data, { omit: SLOT_TIMESTAMP_FIELDS }),
          ).to.deep.equal({
            semester: currentSemester,
            id: docId,
            meetingLink: SLOT_LINK,
            interviewerName: 'Demo Admin',
            interviewerEmail: 'demo@gbstem.org',
            // Stamped from the signed-in user's Firebase Auth uid on
            // creation, so "Only include my interviews" keeps matching this
            // slot even if the interviewer later changes their email.
            interviewerUid: uid,
            intervieweeFirstName: '',
            intervieweeLastName: '',
            intervieweeEmail: '',
            intervieweeId: '',
            interviewSlotStatus: 'available',
          })
          expect(data.date, 'slot date').to.not.equal(null)
        })
      })
    })
  })

  it('Test Case 16c: Interview Slot - An Empty Slot Is Refused', () => {
    // Before this form went through superforms, "Confirm Timeslot" called the
    // service directly, so an empty card wrote a slot with no date and no
    // meeting link - neither of which `interviewSlotSchema` allows, and both
    // of which the interviewee's email then quoted back as blank.
    cy.contains('button', 'Confirm Timeslot').click({ force: true })

    cy.contains('Date and time is required').should('be.visible')
    cy.contains('Meeting link is required').should('be.visible')

    // Nothing was written: the id an empty date would produce doesn't resolve
    // to a document.
    cy.getFirebaseAuthToken().then((authToken: string) => {
      cy.getFirestoreUserId(authToken, 'demo@gbstem.org').then(
        (uid: string) => {
          cy.getFirestoreDoc(
            authToken,
            interviewTimesCollection,
            `NaN${uid}`,
          ).then((data: any) => {
            expect(data, 'slot written from an empty form').to.equal(null)
          })
        },
      )
    })
  })

  it('Test Case 16d: Interview Slot - Editing Keeps The Fields It Does Not Render', () => {
    // The edit card renders only the date and the meeting link, and saves only
    // those (stamped with the semester) - it used to write the whole slot back
    // from the copy the page loaded. The seeded slot carries an assigned
    // interviewee, so this is where a save that dropped or overwrote those
    // fields would show.
    const editedLink = 'https://zoom.us/j/7777777777'

    cy.contains('a', 'https://zoom.us/j/555555555')
      .parent()
      .parent()
      .within(() => {
        cy.contains('button', 'Edit').click({ force: true })
      })
    cy.setFieldValue('input[name="edit-interview-meeting-link"]', editedLink)
    cy.contains('button', 'Save').click({ force: true })
    cy.waitForNotification('Timeslot updated successfully.')

    getDemoAdminUid().then((uid: string) => {
      readSlotDoc('slot-1').then((data: any) => {
        expect(data, 'seeded slot document').to.not.equal(null)
        expect(
          prepareDocForCompare(data, { omit: SLOT_TIMESTAMP_FIELDS }),
        ).to.deep.equal({
          semester: currentSemester,
          id: 'slot-1',
          meetingLink: editedLink,
          interviewerName: 'Demo Admin',
          interviewerEmail: 'demo@gbstem.org',
          // scripts/seed.ts stamps this - never rendered by the edit card, so
          // this pins that the edit path doesn't drop it, same as the
          // interviewee fields below.
          interviewerUid: uid,
          // Never rendered by the edit card - these are the fields at risk.
          intervieweeFirstName: 'David',
          intervieweeLastName: 'Miller',
          intervieweeEmail: 'applicant1@gmail.com',
          intervieweeId: 'user_app1',
          interviewSlotStatus: 'available',
        })
      })
    })
  })
})

describe('Section H: Interview Slot Ownership Filtering', () => {
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
  })

  it('Test Case 16e: "Only include my interviews" actually hides another interviewer\'s slot', () => {
    // Prior to this test, nothing in this file ever toggled the checkbox or
    // seeded a slot belonging to someone other than the signed-in user, so
    // the filter's actual job -- excluding other people's slots -- was never
    // exercised.
    const otherLink = 'https://zoom.us/j/2222222222'
    cy.setInterviewSlot({
      collectionPath: interviewTimesCollection,
      id: 'other-interviewer-slot-16e',
      date: '2028-04-01T09:00',
      interviewerName: 'Other Interviewer',
      interviewerEmail: 'other-interviewer@gbstem.org',
      interviewerUid: 'other-interviewer-uid',
      meetingLink: otherLink,
      semester: currentSemester,
    })

    cy.signedInSession('admin', { initialPage: '/interviews' })

    // Checked by default: someone else's slot must not appear.
    cy.contains('a', otherLink).should('not.exist')

    cy.get('input[name="only-include-my-interviews"]').click({ force: true })
    cy.contains('a', otherLink).should('exist')

    cy.get('input[name="only-include-my-interviews"]').click({ force: true })
    cy.contains('a', otherLink).should('not.exist')
  })

  it('Test Case 16f: a slot stays "mine" after the interviewer changes their account email', () => {
    // Reproduces the reported production bug: the admin's screencast showed
    // /interviews empty with "Only include my interviews" checked, and her
    // own slot ("Interviewer" showing her name) appeared only once she
    // unchecked it. That matches a slot created before she changed her
    // account's email -- its stored interviewerEmail is stale, so the old
    // pure-email comparison no longer matched her current Firebase Auth
    // email. Only interviewerUid, stamped once at creation, still does.
    const staleEmailLink = 'https://zoom.us/j/3333333333'

    getDemoAdminUid().then((uid: string) => {
      cy.setInterviewSlot({
        collectionPath: interviewTimesCollection,
        id: 'stale-email-own-slot-16f',
        date: '2028-04-02T09:00',
        interviewerName: 'Demo Admin',
        interviewerEmail: 'old-demo@gbstem.org',
        interviewerUid: uid,
        meetingLink: staleEmailLink,
        semester: currentSemester,
      })
    })

    cy.signedInSession('admin', { initialPage: '/interviews' })

    // "Only include my interviews" is checked by default -- the slot must
    // show without unchecking it.
    cy.contains('a', staleEmailLink).should('exist')

    // And it must be editable, not just visible -- `canUserModifySlot` has
    // the same stale-email hazard `isMyInterview` does.
    cy.contains('a', staleEmailLink)
      .parent()
      .parent()
      .within(() => {
        cy.contains('button', 'Edit').should('exist')
      })
  })
})
