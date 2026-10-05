import {
  applicationsCollection,
  currentSemester,
  interviewTimeRequestsCollection,
  interviewTimesCollection,
} from '../../src/lib/data/collections'
import { interviewSlotDocId, slotRequestDocId } from '../../src/lib/data/docIds'
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
        cy.setFieldValue(
          'input[type="datetime-local"]',
          ASSIGNED_SLOT_DATE_LOCAL,
        )
        cy.setFieldValue(
          'input[name="interview-meeting-link"]',
          'https://zoom.us/j/9999999999',
        )

        // Assign Interviewee: select David Miller
        cy.get('input[name^="assign-interviewee"]').clear()
        cy.get('input[name^="assign-interviewee"]').type('David Miller')
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

    // Both halves of the booking `createOrAssignInterviewSlot` batches: the
    // slot naming its interviewee, and the application flagged as having an
    // interview, which is what takes it out of the "needs an interview" lists.
    getDemoAdminUid().then((uid: string) => {
      const docId = interviewSlotDocId(ASSIGNED_SLOT_DATE_LOCAL, uid)
      readSlotDoc(docId).then((data: any) => {
        expect(data, 'assigned slot document').to.not.equal(null)
        expect(
          prepareDocForCompare(data, { omit: SLOT_TIMESTAMP_FIELDS }),
        ).to.deep.equal({
          semester: currentSemester,
          id: docId,
          meetingLink: 'https://zoom.us/j/9999999999',
          interviewerName: 'Demo Admin',
          interviewerUid: uid,
          intervieweeFirstName: 'David',
          intervieweeLastName: 'Miller',
          intervieweeId: 'app-david',
          interviewSlotStatus: 'pending',
        })
        expect(slotTime(data.date), 'slot date').to.equal(
          new Date(ASSIGNED_SLOT_DATE_LOCAL).getTime(),
        )
      })
    })
    expectInterviewFlag('app-david', true)

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
    cy.waitForNotification(
      'Timeslot updated successfully. The applicant was emailed.',
    )
    // He holds the slot, so he hears about the new link.
    cy.verifyEmailSent('applicant1@gmail.com', 'has been updated')

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
    cy.waitForNotification(
      'Timeslot successfully deleted. The applicant was emailed.',
    )
    cy.verifyEmailSent('applicant1@gmail.com', 'has been canceled')

    // Verify it is removed from list
    cy.contains('a', 'https://zoom.us/j/8888888888').should('not.exist')

    // ...and from Firestore, along with the applicant's interview flag -
    // left `true`, it would hide him from every list an admin could use to
    // book him again.
    getDemoAdminUid().then((uid: string) => {
      cy.task(
        'checkFirestoreDocExists',
        `${interviewTimesCollection}/${interviewSlotDocId(ASSIGNED_SLOT_DATE_LOCAL, uid)}`,
      ).should('eq', false)
    })
    expectInterviewFlag('app-david', false)

    // Assigning the interviewee is the only prompt this flow should raise --
    // editing and deleting the slot must not.
    cy.get('@confirms').should('have.length', 1)
  })

  it('Test Case 16a: Interview Time Requests - Each Request Shows Its Requester', () => {
    // The seed has no time requests, so these are written the way portal's
    // "request a time" does. The list only shows requests from applicants
    // still waiting for an interview. Test Case 16 books David Miller and
    // then frees him again (and checks it), but this test can run without it
    // on a retry, so he is put back explicitly.
    const requestDates = ['2030-01-15T10:00', '2030-01-16T11:00']
    const requestIds = requestDates.map((date) =>
      slotRequestDocId('app-david', date),
    )
    setDavidMeta({ interview: false, decisionType: null })
    requestDates.forEach((date, i) => {
      cy.task('setInterviewTimeRequest', {
        id: requestIds[i],
        uid: 'app-david',
        firstName: 'David',
        lastName: 'Miller',
        date,
      })
    })
    cy.reload()
    cy.intercept('POST', '/api/resolveEmails').as('resolveEmails')

    // One group per applicant, headed by their name and address. The request
    // stores no address: the one shown is what Auth holds for its uid,
    // fetched through /api/resolveEmails.
    requestsCard()
      .contains('b', 'David Miller', { timeout: 10000 })
      .parent()
      .should('contain.text', 'applicant1@gmail.com')
    cy.wait('@resolveEmails')
      .its('response.body.emails')
      .should('deep.equal', { 'app-david': 'applicant1@gmail.com' })
    requestsCard().find('b:contains("David Miller")').should('have.length', 1)
    requestsCard()
      .find('button:contains("Schedule this")')
      .should('have.length', 2)

    // "Schedule this" fills the card with that request's time and applicant.
    requestsCard().find('button:contains("Schedule this")').first().click()
    cy.contains('h2', 'Add A Time Slot')
      .parent()
      .within(() => {
        cy.get('input[name="set-date-your-local-time"]').should(
          'have.value',
          requestDates[0],
        )
        cy.get('input[name^="assign-interviewee"]').should(
          'have.value',
          'David Miller',
        )
        cy.setFieldValue('input[name="interview-meeting-link"]', REQUEST_LINK)
      })
    cy.captureConfirms().as('confirms')
    cy.contains('button', 'Confirm Timeslot').click({ force: true })
    cy.waitForNotification('Interviewee assigned and email sent.')

    // Booked: every one of his requests leaves the list, none was deleted.
    expectInterviewFlag('app-david', true)
    requestsCard().should('not.contain.text', 'David Miller')
    requestIds.forEach((id) => {
      cy.task(
        'checkFirestoreDocExists',
        `${interviewTimeRequestsCollection}/${id}`,
      ).should('eq', true)
    })

    // Deleting the interview brings them back for someone else to take.
    cy.contains('a', REQUEST_LINK)
      .parent()
      .parent()
      .within(() => {
        cy.contains('button', 'Edit').click({ force: true })
      })
    cy.contains('Edit Interview Meeting Link')
      .parent()
      .parent()
      .within(() => {
        cy.contains('button', 'Delete').click({ force: true })
      })
    cy.waitForNotification('Timeslot successfully deleted.')
    expectInterviewFlag('app-david', false)
    requestsCard().contains('b', 'David Miller').should('exist')

    // A final decision hides them; an invitation to interview doesn't.
    setDavidMeta({ decisionType: 'rejected' })
    cy.reload()
    cy.contains('h2', 'Add A Time Slot').should('exist')
    requestsCard().should('not.contain.text', 'David Miller')
    setDavidMeta({ decisionType: 'interview' })
    cy.reload()
    requestsCard().contains('b', 'David Miller').should('exist')

    setDavidMeta({ decisionType: null })
    requestIds.forEach((id) =>
      cy.task('deleteFirestoreDoc', `${interviewTimeRequestsCollection}/${id}`),
    )
  })

  it('Test Case 16g: Marking A Booked Interview Missed Frees The Applicant', () => {
    const slotId = 'missed-slot-16g'
    const missedLink = 'https://zoom.us/j/4444444444'
    const requestId = slotRequestDocId('app-david', '2030-02-01T10:00')
    setDavidMeta({ interview: true, decisionType: null })
    getDemoAdminUid().then((uid: string) => {
      cy.setInterviewSlot({
        collectionPath: interviewTimesCollection,
        id: slotId,
        // An hour ago: its time has come, so it can be marked missed.
        date: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        interviewerName: 'Demo Admin',
        interviewerUid: uid,
        meetingLink: missedLink,
        semester: currentSemester,
        intervieweeId: 'app-david',
      })
    })
    cy.task('setInterviewTimeRequest', {
      id: requestId,
      uid: 'app-david',
      firstName: 'David',
      lastName: 'Miller',
      date: '2030-02-01T10:00',
    })
    cy.reload()

    // Booked, so his request isn't listed yet.
    cy.contains('h2', 'Add A Time Slot').should('exist')
    requestsCard().should('not.contain.text', 'David Miller')

    cy.get('input[name="only-show-future-interview-slots"]').click({
      force: true,
    })
    cy.contains('a', missedLink)
      .parent()
      .parent()
      .within(() => {
        cy.contains('button', 'Mark missed').click({ force: true })
        cy.contains('button', "The interviewer couldn't make it").click({
          force: true,
        })
      })
    cy.waitForNotification('Marked missed.')
    cy.verifyEmailSent('applicant1@gmail.com', 'was missed')

    // The slot stays as the record, naming him and who missed it; his
    // application is free to be scheduled again.
    cy.task('readFirestoreDoc', `${interviewTimesCollection}/${slotId}`).then(
      (slot: any) => {
        expect(slot.interviewSlotStatus).to.equal('missed')
        expect(slot.missedBy).to.equal('interviewer')
        expect(slot.intervieweeId).to.equal('app-david')
      },
    )
    expectInterviewFlag('app-david', false)
    requestsCard().contains('b', 'David Miller').should('exist')
    cy.contains('a', missedLink)
      .parent()
      .parent()
      .should('contain.text', 'missed (by the interviewer)')
      .and('not.contain.text', 'Mark missed')

    cy.task('deleteFirestoreDoc', `${interviewTimesCollection}/${slotId}`)
    cy.task(
      'deleteFirestoreDoc',
      `${interviewTimeRequestsCollection}/${requestId}`,
    )
  })
})

/** The "Interview Time Requests" card. */
function requestsCard(): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.contains('h2', 'Interview Time Requests').parent()
}

/** Merges `meta` into David Miller's application, as the API routes would. */
function setDavidMeta(meta: Record<string, unknown>) {
  cy.task('mergeFirestoreDoc', {
    docPath: `${applicationsCollection}/app-david`,
    data: { meta },
  })
}

/** The meeting link Test Case 16a books David Miller's request with. */
const REQUEST_LINK = 'https://zoom.us/j/7777777777'

/**
 * `interviewSlotDocId` builds the document id from the slot's local time and
 * the signed-in uid, so the test computes it the same way rather than scraping
 * it back out of the UI.
 */
const SLOT_DATE_LOCAL = '2028-03-14T09:30'
const SLOT_LINK = 'https://zoom.us/j/1231231234'

/** `date` is a Firestore timestamp, which `getFirestoreDoc` returns as a raw wrapper. */
const SLOT_TIMESTAMP_FIELDS = ['date']

/** A stored slot `date`, as `getFirestoreDoc` returns it, in epoch ms. */
const slotTime = (value: { timestampValue: string }) =>
  new Date(value.timestampValue).getTime()

/** The slot Test Case 16 creates with an interviewee already assigned. */
const ASSIGNED_SLOT_DATE_LOCAL = '2027-10-10T10:00'

/** Asserts an application's `meta.interview` flag, read through the Admin SDK. */
function expectInterviewFlag(applicationId: string, expected: boolean) {
  cy.task(
    'readFirestoreDoc',
    `${applicationsCollection}/${applicationId}`,
  ).then((application: any) => {
    expect(
      application.meta.interview,
      `${applicationId}'s meta.interview`,
    ).to.equal(expected)
  })
}

function getDemoAdminUid(): Cypress.Chainable<string> {
  return cy
    .getFirebaseAuthToken()
    .then((authToken: string) =>
      cy.getFirestoreUserId(authToken, 'demo@gbstem.org'),
    )
}

function addSlotDocId(): Cypress.Chainable<string> {
  return getDemoAdminUid().then((uid: string) =>
    interviewSlotDocId(SLOT_DATE_LOCAL, uid),
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
            // Stamped from the signed-in user's Firebase Auth uid on
            // creation, and the only record of who owns the slot: no address
            // is written, so "Only include my interviews" keeps matching it
            // after the interviewer changes their account email.
            interviewerUid: uid,
            intervieweeFirstName: '',
            intervieweeLastName: '',
            intervieweeId: '',
            interviewSlotStatus: 'available',
          })
          expect(slotTime(data.date), 'slot date').to.equal(
            new Date(SLOT_DATE_LOCAL).getTime(),
          )
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
          // scripts/seed.ts stamps this - never rendered by the edit card, so
          // this pins that the edit path doesn't drop it, same as the
          // interviewee fields below.
          interviewerUid: uid,
          // Never rendered by the edit card - these are the fields at risk.
          intervieweeFirstName: 'David',
          intervieweeLastName: 'Miller',
          intervieweeId: 'app-david',
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
    // unchecked it. That matched a slot created before she changed her
    // account's email, back when the filter compared addresses. It now
    // compares interviewerUid, stamped once at creation, and a slot stores no
    // address that could disagree with it.
    const staleEmailLink = 'https://zoom.us/j/3333333333'

    getDemoAdminUid().then((uid: string) => {
      cy.setInterviewSlot({
        collectionPath: interviewTimesCollection,
        id: 'stale-email-own-slot-16f',
        date: '2028-04-02T09:00',
        interviewerName: 'Demo Admin',
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
