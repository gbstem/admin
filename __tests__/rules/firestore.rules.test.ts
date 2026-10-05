import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  currentSemester,
  interviewTimeRequestsCollection,
  semesterCollectionPath,
} from '../../src/lib/data/collections'

/**
 * Exercises `firestore.rules` against the Firestore emulator.
 *
 * These tests exist because the role a user holds used to be readable out of
 * a document that same user could write: `hasRole()` read
 * `users/{uid}.role`, and `allow write: if isUser(userId)` let anyone set it.
 * Signing up as a student and then writing `role: 'instructor'` to your own
 * document was enough to read every student registration for the semester.
 * The rules are the only thing standing between a browser and that data, and
 * nothing else in this repo tests them, so a regression here would be silent.
 *
 * Requires the emulator: `yarn emulators`, then `yarn test:rules`.
 */

const PROJECT_ID = 'gbstem-rules-test'
const decisions = semesterCollectionPath(currentSemester, 'decisions')
const registrations = semesterCollectionPath(currentSemester, 'registrations')
const classes = semesterCollectionPath(currentSemester, 'classes')
const checkIns = semesterCollectionPath(currentSemester, 'checkIns')
const applications = semesterCollectionPath(currentSemester, 'applications')
const interviewTimes = semesterCollectionPath(
  currentSemester,
  'instructorInterviewTimes',
)
const classFeedback = semesterCollectionPath(currentSemester, 'classFeedback')
const instructorFeedback = semesterCollectionPath(
  currentSemester,
  'instructorFeedback',
)

const UIDS = {
  student: 'uid-student',
  otherStudent: 'uid-other-student',
  accepted: 'uid-accepted',
  substitute: 'uid-substitute',
  interviewing: 'uid-interviewing',
  rejected: 'uid-rejected',
  undecided: 'uid-undecided',
  admin: 'uid-admin',
  reviewer: 'uid-reviewer',
} as const

let testEnv: RulesTestEnvironment

/** A client carrying `role` as a custom claim, the way a real ID token does. */
function as(uid: string, role?: string) {
  const context = role
    ? testEnv.authenticatedContext(uid, { role })
    : testEnv.authenticatedContext(uid)
  return context.firestore()
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  })
})

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(async () => {
  await testEnv?.cleanup()
  ;(console.error as any).mockRestore?.()
  ;(console.warn as any).mockRestore?.()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  // The fixtures every test authorizes against. Written with rules disabled
  // because they are exactly the documents a client is not allowed to write.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, decisions, UIDS.accepted), { type: 'accepted' })
    await setDoc(doc(db, decisions, UIDS.substitute), { type: 'substitute' })
    await setDoc(doc(db, decisions, UIDS.interviewing), { type: 'interview' })
    await setDoc(doc(db, decisions, UIDS.rejected), { type: 'rejected' })
    await setDoc(doc(db, registrations, UIDS.student), {
      personal: { studentFirstName: 'Ada', dateOfBirth: '2014-01-01' },
    })
    await setDoc(doc(db, `users/${UIDS.student}`), {
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
    await setDoc(doc(db, classes, `${UIDS.accepted}-1`), {
      course: 'Python 1',
      instructorUid: UIDS.accepted,
      otherInstructorUids: [],
    })
    await setDoc(doc(db, applications, UIDS.student), {
      personal: { firstName: 'Ada', email: 'ada@example.com' },
      meta: { uid: UIDS.student, submitted: true, decided: true },
    })
    await setDoc(doc(db, interviewTimes, 'slot-1'), {
      date: '2026-10-01T10:00:00.000Z',
      interviewerName: 'Alice Admin',
      interviewerUid: UIDS.admin,
      interviewerEmail: 'alice@example.com',
      interviewSlotStatus: 'available',
      meetingLink: 'https://zoom.example/slot-1',
    })
    await setDoc(doc(db, classFeedback, 'cf-1'), {
      rating: 5,
      comment: 'Great class!',
    })
    await setDoc(doc(db, instructorFeedback, 'if-1'), {
      sessionNotes: 'Students did well',
    })
  })
})

describe('users/{uid} - a name and nothing else', () => {
  it('lets a user read their own document', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(getDoc(doc(db, `users/${UIDS.student}`)))
  })

  it("refuses a read of someone else's document", async () => {
    const db = as(UIDS.otherStudent, 'student')
    await assertFails(getDoc(doc(db, `users/${UIDS.student}`)))
  })

  it('lets a user change their own name', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
      updateDoc(doc(db, `users/${UIDS.student}`), { firstName: 'Augusta' }),
    )
  })

  it('refuses writing a role into the document', async () => {
    // The role is the Auth claim. A copy here is what the rules and portal's
    // UI used to read, so no field but the name may be written at all.
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, `users/${UIDS.student}`), { role: 'instructor' }),
    )
    await assertFails(
      setDoc(
        doc(db, `users/${UIDS.student}`),
        { role: 'admin' },
        { merge: true },
      ),
    )
  })

  it('refuses a field smuggled in alongside a legitimate name change', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, `users/${UIDS.student}`), {
        firstName: 'Augusta',
        role: 'instructor',
      }),
    )
  })

  it('lets a user create a document that holds only a name', async () => {
    // admin's userService.updateUserName uses setDoc(merge) so accounts
    // predating the users collection can still rename themselves.
    const db = as(UIDS.undecided, 'admin')
    await assertSucceeds(
      setDoc(doc(db, `users/${UIDS.undecided}`), { firstName: 'Grace' }),
    )
  })

  it('refuses a created document that carries anything but a name', async () => {
    const db = as(UIDS.undecided, 'student')
    await assertFails(
      setDoc(doc(db, `users/${UIDS.undecided}`), {
        firstName: 'Grace',
        role: 'instructor',
      }),
    )
  })

  it('lets a name change through setDoc(merge)', async () => {
    // Both repos' userService.updateUserName use setDoc(merge) rather than
    // updateDoc.
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
      setDoc(
        doc(db, `users/${UIDS.student}`),
        { firstName: 'Augusta', lastName: 'King' },
        { merge: true },
      ),
    )
  })

  it('still lets a name change through on a document written before the role field was removed', async () => {
    // Production documents kept a `role` until the user-document role removal
    // migration ran. The update rule checks only the fields a write changes,
    // so those accounts can rename themselves whether or not it has run yet.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/${UIDS.otherStudent}`), {
        role: 'student',
        firstName: 'Charles',
        lastName: 'Babbage',
      })
    })
    const db = as(UIDS.otherStudent, 'student')
    await assertSucceeds(
      updateDoc(doc(db, `users/${UIDS.otherStudent}`), { firstName: 'Chas' }),
    )
    await assertSucceeds(
      setDoc(
        doc(db, `users/${UIDS.otherStudent}`),
        { firstName: 'Charles', lastName: 'B.' },
        { merge: true },
      ),
    )
  })

  it('lets a user delete their own document', async () => {
    // portal's rollbackNewUser and DeleteAccountForm both need this.
    const db = as(UIDS.student, 'student')
    await assertSucceeds(deleteDoc(doc(db, `users/${UIDS.student}`)))
  })

  it("refuses an admin writing a role into another user's document", async () => {
    // Even an admin changes roles through the Admin SDK, on the claim.
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      updateDoc(doc(db, `users/${UIDS.student}`), { role: 'instructor' }),
    )
  })
})

describe('registrations - no client writes at all', () => {
  // Parents create and edit their registrations through portal's /apply form
  // actions, and admins through admin's /registrations actions; both sites
  // enroll through their /api/enroll. All of those use the Admin SDK. So no
  // client write is allowed here at all - including the enrollment fields
  // (`classes`, `enrolled`), whose other half is the class's `students`: a
  // parent changing only the registration side would leave the two
  // disagreeing.
  const ENROLLED = { classes: [`${UIDS.accepted}-1`], enrolled: true }

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), registrations, UIDS.student), {
        personal: { studentFirstName: 'Ada', dateOfBirth: '2014-01-01' },
        ...ENROLLED,
      })
    })
  })

  it('refuses a parent creating a registration, even with the empty defaults', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      setDoc(doc(db, registrations, `${UIDS.student}-2`), {
        personal: { studentFirstName: 'Charles' },
        classes: [],
        enrolled: false,
      }),
    )
  })

  it('refuses a parent creating a registration already in a class', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      setDoc(doc(db, registrations, `${UIDS.student}-2`), {
        personal: { studentFirstName: 'Charles' },
        ...ENROLLED,
      }),
    )
  })

  it('refuses a parent editing their registration, even leaving the enrollment alone', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), {
        'personal.studentFirstName': 'Augusta',
      }),
    )
    await assertFails(
      setDoc(
        doc(db, registrations, UIDS.student),
        { personal: { studentFirstName: 'Augusta' }, ...ENROLLED },
        { merge: true },
      ),
    )
  })

  it('refuses a parent changing the enrollment', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), {
        classes: [`${UIDS.accepted}-1`, `${UIDS.accepted}-2`],
      }),
    )
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), { enrolled: false }),
    )
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), {
        classes: deleteField(),
      }),
    )
  })

  it('refuses a parent deleting a registration, in a class or not', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), registrations, `${UIDS.student}-2`),
        {
          personal: { studentFirstName: 'Charles' },
          classes: [],
          enrolled: false,
        },
      )
    })
    const db = as(UIDS.student, 'student')
    await assertFails(deleteDoc(doc(db, registrations, UIDS.student)))
    await assertFails(deleteDoc(doc(db, registrations, `${UIDS.student}-2`)))
  })

  it('refuses an admin changing the enrollment through the client SDK', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), {
        classes: [`${UIDS.accepted}-1`, `${UIDS.accepted}-2`],
      }),
    )
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), {
        classes: [],
        enrolled: false,
      }),
    )
  })

  it('refuses an admin editing a registration through the client SDK', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), {
        'agreements.bypassAgeLimits': true,
      }),
    )
    await assertFails(
      setDoc(
        doc(db, registrations, UIDS.student),
        { personal: { studentFirstName: 'Augusta' } },
        { merge: true },
      ),
    )
  })

  it('refuses an admin creating a registration', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      setDoc(doc(db, registrations, `${UIDS.student}-2`), {
        personal: { studentFirstName: 'Charles' },
        ...ENROLLED,
      }),
    )
  })

  it('refuses an admin deleting a registration', async () => {
    // Nothing in either site deletes one through the client SDK: account
    // deletion (portal's /api/account) removes a parent's registrations with
    // the Admin SDK.
    const db = as(UIDS.admin, 'admin')
    await assertFails(deleteDoc(doc(db, registrations, UIDS.student)))
  })

  it('refuses a reviewer changing the enrollment', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), { enrolled: false }),
    )
  })
})

describe('applications/{uid} - read by their applicant, admins and reviewers; no client writes', () => {
  it('lets an applicant read their own application', async () => {
    const db = as(UIDS.student, 'instructor')
    await assertSucceeds(getDoc(doc(db, applications, UIDS.student)))
  })

  it("refuses reading another applicant's application", async () => {
    const db = as(UIDS.otherStudent, 'instructor')
    await assertFails(getDoc(doc(db, applications, UIDS.student)))
  })

  // Applicants create and edit their applications through portal's /apply
  // form actions, with the Admin SDK, so no applicant write is allowed here.
  it('refuses an applicant editing their own application', async () => {
    const db = as(UIDS.student, 'instructor')
    await assertFails(
      updateDoc(doc(db, applications, UIDS.student), {
        personal: { firstName: 'Augusta', email: 'ada@example.com' },
      }),
    )
  })

  it('refuses an applicant hiding their own decided interview notes', async () => {
    // The fixture seeds meta.decided: true - this is the exploit
    // applicationService.loadApplicationDetails documents: setting it back
    // to false stops the admin UI from loading the decision doc at all.
    const db = as(UIDS.student, 'instructor')
    await assertFails(
      updateDoc(doc(db, applications, UIDS.student), {
        meta: { uid: UIDS.student, submitted: true, decided: false },
      }),
    )
  })

  it('refuses meta.decided smuggled in alongside a legitimate field change', async () => {
    const db = as(UIDS.student, 'instructor')
    await assertFails(
      updateDoc(doc(db, applications, UIDS.student), {
        personal: { firstName: 'Augusta', email: 'ada@example.com' },
        meta: { uid: UIDS.student, submitted: true, decided: false },
      }),
    )
  })

  it('refuses an admin setting meta.decided through the client SDK', async () => {
    // /api/decision sets this with the Admin SDK, together with the decision
    // document it flags.
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      updateDoc(doc(db, applications, UIDS.student), {
        meta: { uid: UIDS.student, submitted: true, decided: false },
      }),
    )
  })

  it('refuses a reviewer setting meta.decided through the client SDK', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(
      updateDoc(doc(db, applications, UIDS.student), {
        meta: { uid: UIDS.student, submitted: true, decided: false },
      }),
    )
  })

  it('refuses an applicant creating their own application', async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false, decided: false },
      }),
    )
  })

  it('refuses an applicant creating an application with decided omitted', async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false },
      }),
    )
  })

  it('refuses an applicant creating an application with decided: true', async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false, decided: true },
      }),
    )
  })

  it('refuses an admin creating an application', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false, decided: true },
      }),
    )
  })

  it('refuses a reviewer creating an application', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false, decided: true },
      }),
    )
  })

  // No client, of any role, can delete an application document any more:
  // account deletion (portal's /api/account) removes an instructor's own
  // application with the Admin SDK, which bypasses these rules entirely.
  it('refuses an applicant deleting their own application', async () => {
    const db = as(UIDS.student, 'instructor')
    await assertFails(deleteDoc(doc(db, applications, UIDS.student)))
  })

  it('refuses an admin deleting an application', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(deleteDoc(doc(db, applications, UIDS.student)))
  })

  it('refuses a reviewer deleting an application', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(deleteDoc(doc(db, applications, UIDS.student)))
  })
})

describe('registrations - instructors never read directly; client access restricted to owner, admin, or reviewer', () => {
  it('lets a student read their own registration', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(getDoc(doc(db, registrations, UIDS.student)))
  })

  it("refuses a student reading another family's registration", async () => {
    const db = as(UIDS.otherStudent, 'student')
    await assertFails(getDoc(doc(db, registrations, UIDS.student)))
  })

  it('refuses an accepted instructor reading a registration directly', async () => {
    // Instructors access student data strictly via server-side class roster APIs (/api/classRoster)
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(getDoc(doc(db, registrations, UIDS.student)))
  })

  it('refuses a substitute reading a registration directly', async () => {
    const db = as(UIDS.substitute, 'instructor')
    await assertFails(getDoc(doc(db, registrations, UIDS.student)))
  })

  it('refuses an instructor still awaiting an interview', async () => {
    const db = as(UIDS.interviewing, 'instructor')
    await assertFails(getDoc(doc(db, registrations, UIDS.student)))
  })

  it('refuses a rejected instructor', async () => {
    const db = as(UIDS.rejected, 'instructor')
    await assertFails(getDoc(doc(db, registrations, UIDS.student)))
  })

  it('refuses an instructor with no decision at all', async () => {
    // The signup-day case: the role is held from the moment an account is
    // created.
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(getDoc(doc(db, registrations, UIDS.student)))
  })

  it('lets an admin read a registration', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(getDoc(doc(db, registrations, UIDS.student)))
  })

  it('lets a reviewer read a registration', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(getDoc(doc(db, registrations, UIDS.student)))
  })

  it('refuses an unauthenticated user reading a registration', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, registrations, UIDS.student)))
  })

  it('lets a student read their secondary child registration by uid prefix', async () => {
    const db = as(UIDS.student, 'student')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), registrations, `${UIDS.student}-2`),
        {
          personal: { studentFirstName: 'Charles' },
        },
      )
    })
    await assertSucceeds(getDoc(doc(db, registrations, `${UIDS.student}-2`)))
  })

  it('refuses a student creating their own registration', async () => {
    const db = as(UIDS.undecided, 'student')
    await assertFails(
      setDoc(doc(db, registrations, UIDS.undecided), {
        personal: { studentFirstName: 'Grace' },
      }),
    )
  })

  it('refuses a student creating a secondary child registration by uid prefix', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      setDoc(doc(db, registrations, `${UIDS.student}-2`), {
        personal: { studentFirstName: 'Charles' },
      }),
    )
  })

  it('refuses a student updating their own registration', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), {
        'personal.studentFirstName': 'Augusta',
      }),
    )
  })

  it("refuses a student writing another family's registration", async () => {
    const db = as(UIDS.otherStudent, 'student')
    await assertFails(
      setDoc(doc(db, registrations, UIDS.student), {
        personal: { studentFirstName: 'Mallory' },
      }),
    )
  })

  it('refuses an instructor writing a registration', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(
      setDoc(doc(db, registrations, UIDS.student), {
        personal: { studentFirstName: 'Mallory' },
      }),
    )
  })

  it('refuses a reviewer writing a registration', async () => {
    // Reviewers have read access via isAdminOrReviewer(), but only admins write
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), {
        'personal.studentFirstName': 'Reviewer',
      }),
    )
  })

  it('refuses an unauthenticated user writing a registration', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      setDoc(doc(db, registrations, UIDS.student), {
        personal: { studentFirstName: 'Anonymous' },
      }),
    )
  })

  it('refuses an arbitrary prefix collision (non-numeric suffix)', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      setDoc(doc(db, registrations, `${UIDS.student}_evil`), {
        personal: { studentFirstName: 'Attacker' },
      }),
    )
    await assertFails(
      setDoc(doc(db, registrations, `${UIDS.student}-abc`), {
        personal: { studentFirstName: 'Attacker' },
      }),
    )
  })
})

describe('classes - written only by the server', () => {
  // Admin never creates classes; instructors do, through portal.
  it('refuses an admin creating a class', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      setDoc(doc(db, classes, `${UIDS.accepted}-2`), { course: 'Python 1' }),
    )
  })

  // Creation goes through portal's /api/classDetails.
  it('refuses an accepted instructor creating a class, even under their own uid', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(
      setDoc(doc(db, classes, `${UIDS.accepted}-2`), { course: 'Python 1' }),
    )
  })

  // Rescheduling and holding a session go through portal's
  // /api/classSchedule, which computes the statuses itself.
  it("refuses an accepted instructor writing their own class's sessions", async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(
      updateDoc(doc(db, classes, `${UIDS.accepted}-1`), {
        meetingTimes: [new Date('2026-10-05T16:00:00.000Z')],
        feedbackCompleted: [false],
        classStatuses: ['ClassInFuture'],
        completedClassDates: [],
      }),
    )
  })

  // Details, co-instructors and ownership go through /api/classDetails,
  // which checks every added co-instructor is an accepted instructor.
  it("refuses an instructor changing their class's details, co-instructors or owner", async () => {
    const db = as(UIDS.accepted, 'instructor')
    const ref = doc(db, classes, `${UIDS.accepted}-1`)
    await assertFails(
      updateDoc(ref, { meetingLink: 'https://teams.example/join' }),
    )
    await assertFails(updateDoc(ref, { otherInstructorUids: [UIDS.rejected] }))
    await assertFails(updateDoc(ref, { instructorUid: UIDS.rejected }))
    await assertFails(
      updateDoc(ref, {
        classStatuses: ['ClassInFuture'],
        meetingLink: 'https://evil.example/join',
      }),
    )
  })

  it("refuses an update to a class the caller doesn't teach", async () => {
    const db = as(UIDS.substitute, 'instructor')
    await assertFails(
      updateDoc(doc(db, classes, `${UIDS.accepted}-1`), {
        classStatuses: ['ClassInFuture'],
      }),
    )
  })

  // Edits go through admin's /classes?/saveClass action, which merges only
  // the fields the edit form owns.
  it('refuses an admin updating a class', async () => {
    const db = as(UIDS.admin, 'admin')
    const ref = doc(db, classes, `${UIDS.accepted}-1`)
    await assertFails(
      updateDoc(ref, { meetingLink: 'https://teams.example/join' }),
    )
    await assertFails(
      updateDoc(ref, { otherInstructorUids: [UIDS.substitute] }),
    )
    await assertFails(updateDoc(ref, { students: [] }))
  })

  it('refuses a co-instructor updating the class', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), classes, `${UIDS.accepted}-1`),
        {
          instructorUid: UIDS.accepted,
          otherInstructorUids: [UIDS.substitute],
        },
        { merge: true },
      )
      await setDoc(doc(context.firestore(), decisions, UIDS.substitute), {
        type: 'accepted',
      })
    })
    const db = as(UIDS.substitute, 'instructor')
    await assertFails(
      updateDoc(doc(db, classes, `${UIDS.accepted}-1`), {
        classStatuses: ['FeedbackIncomplete'],
      }),
    )
  })

  // Session statuses are refreshed by admin's /api/classStatuses, which
  // computes them itself.
  it('refuses a reviewer updating a class', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(
      updateDoc(doc(db, classes, `${UIDS.accepted}-1`), {
        classStatuses: ['FeedbackIncomplete'],
      }),
    )
  })

  it('lets any signed-in user read a class', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(getDoc(doc(db, classes, `${UIDS.accepted}-1`)))
  })

  it('refuses an unauthenticated user reading a class', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, classes, `${UIDS.accepted}-1`)))
  })

  it.each([
    ['an admin', UIDS.admin, 'admin'],
    ['a reviewer', UIDS.reviewer, 'reviewer'],
  ] as const)('refuses %s deleting a class', async (_, uid, role) => {
    const db = as(uid, role)
    await assertFails(deleteDoc(doc(db, classes, `${UIDS.accepted}-1`)))
  })

  it('refuses an instructor deleting their own class', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(deleteDoc(doc(db, classes, `${UIDS.accepted}-1`)))
  })
})

describe('instructorInterviewTimes - admins and reviewers read; every write goes through an API', () => {
  // Portal's /api/interview lists open slots and books one in a transaction.
  it('refuses an applicant or an accepted instructor reading, listing or booking a slot', async () => {
    for (const uid of [UIDS.undecided, UIDS.accepted]) {
      const db = as(uid, 'instructor')
      await assertFails(getDoc(doc(db, interviewTimes, 'slot-1')))
      await assertFails(getDocs(collection(db, interviewTimes)))
      await assertFails(
        updateDoc(doc(db, interviewTimes, 'slot-1'), {
          interviewSlotStatus: 'pending',
          intervieweeFirstName: 'Grace',
          intervieweeLastName: 'Hopper',
          intervieweeEmail: 'grace@example.com',
          intervieweeId: uid,
        }),
      )
    }
  })

  it('lets an admin or reviewer read and list slots', async () => {
    for (const [uid, role] of [
      [UIDS.admin, 'admin'],
      [UIDS.reviewer, 'reviewer'],
    ]) {
      const db = as(uid, role)
      await assertSucceeds(getDoc(doc(db, interviewTimes, 'slot-1')))
      await assertSucceeds(getDocs(collection(db, interviewTimes)))
    }
  })

  it('refuses an admin updating an interview slot through the client SDK', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      updateDoc(doc(db, interviewTimes, 'slot-1'), {
        meetingLink: 'https://zoom.example/new-link',
      }),
    )
  })

  it('refuses a reviewer updating an interview slot through the client SDK', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(
      updateDoc(doc(db, interviewTimes, 'slot-1'), {
        meetingLink: 'https://zoom.example/new-link',
      }),
    )
  })

  it('refuses a student updating an interview slot', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, interviewTimes, 'slot-1'), {
        interviewSlotStatus: 'pending',
      }),
    )
  })

  it('refuses an unauthenticated user reading an interview slot', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, interviewTimes, 'slot-1')))
  })

  it('refuses an admin creating an interview slot through the client SDK', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      setDoc(doc(db, interviewTimes, 'slot-admin-new'), {
        date: '2026-10-02T10:00:00.000Z',
        meetingLink: 'https://zoom.example/new',
      }),
    )
  })

  it('refuses a reviewer creating an interview slot through the client SDK', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(
      setDoc(doc(db, interviewTimes, 'slot-rev-new'), {
        date: '2026-10-02T10:00:00.000Z',
        meetingLink: 'https://zoom.example/new',
      }),
    )
  })

  it('refuses an instructor creating an interview slot', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(
      setDoc(doc(db, interviewTimes, 'slot-inst-new'), {
        date: '2026-10-02T10:00:00.000Z',
        meetingLink: 'https://zoom.example/new',
      }),
    )
  })

  it('refuses an admin deleting an interview slot through the client SDK', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(deleteDoc(doc(db, interviewTimes, 'slot-1')))
  })

  it('refuses a reviewer deleting an interview slot through the client SDK', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(deleteDoc(doc(db, interviewTimes, 'slot-1')))
  })

  it('refuses an instructor deleting an interview slot', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(deleteDoc(doc(db, interviewTimes, 'slot-1')))
  })
})

describe('classFeedback and instructorFeedback - written only by the Admin SDK', () => {
  // No client writes feedback, whatever its role: a role alone doesn't
  // authorize writing about a particular class or student. Portal's
  // /api/studentFeedback, /api/instructorFeedback and /api/substituteFeedback
  // file it after checking the caller against the class.
  const clients = {
    'a student': () => as(UIDS.student, 'student'),
    'an accepted instructor of a class': () => as(UIDS.accepted, 'instructor'),
    'an instructor who has only applied': () =>
      as(UIDS.undecided, 'instructor'),
    'a substitute': () => as(UIDS.substitute, 'instructor'),
    'a reviewer': () => as(UIDS.reviewer, 'reviewer'),
    'an admin': () => as(UIDS.admin, 'admin'),
    'an account with no role': () => as(UIDS.otherStudent),
    'a signed-out user': () => testEnv.unauthenticatedContext().firestore(),
  }
  const collections = { classFeedback, instructorFeedback }

  describe.each(Object.entries(collections))('%s', (_name, path) => {
    const existingId = path === classFeedback ? 'cf-1' : 'if-1'

    it.each(Object.keys(clients))('refuses %s creating one', async (who) => {
      const db = clients[who as keyof typeof clients]()
      await assertFails(
        setDoc(doc(db, path, `${UIDS.accepted}-1-123`), {
          classId: `${UIDS.accepted}-1`,
          feedback: 'Written straight from the browser',
        }),
      )
    })

    it.each(Object.keys(clients))(
      'refuses %s changing or deleting one',
      async (who) => {
        const db = clients[who as keyof typeof clients]()
        await assertFails(
          updateDoc(doc(db, path, existingId), { feedback: 'Rewritten' }),
        )
        await assertFails(deleteDoc(doc(db, path, existingId)))
      },
    )

    it('lets an admin read one', async () => {
      const db = as(UIDS.admin, 'admin')
      await assertSucceeds(getDoc(doc(db, path, existingId)))
    })

    it.each(Object.keys(clients).filter((who) => who !== 'an admin'))(
      'refuses %s reading one',
      async (who) => {
        const db = clients[who as keyof typeof clients]()
        await assertFails(getDoc(doc(db, path, existingId)))
      },
    )
  })
})

describe('tokens - account creation tokens are server-only', () => {
  // The tokens page lists, creates and deletes them with the Admin SDK.
  it.each([
    ['an admin', UIDS.admin, 'admin'],
    ['a reviewer', UIDS.reviewer, 'reviewer'],
  ] as const)('refuses %s reading or writing tokens', async (_, uid, role) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'tokens/tok-1'), { role: 'admin' })
    })
    const db = as(uid, role)
    await assertFails(getDoc(doc(db, 'tokens/tok-1')))
    await assertFails(getDocs(collection(db, 'tokens')))
    await assertFails(setDoc(doc(db, 'tokens/tok-2'), { role: 'admin' }))
    await assertFails(updateDoc(doc(db, 'tokens/tok-1'), { role: 'admin' }))
    await assertFails(deleteDoc(doc(db, 'tokens/tok-1')))
  })

  it('refuses an instructor reading or writing tokens', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(setDoc(doc(db, 'tokens/tok-2'), { role: 'instructor' }))
    await assertFails(getDoc(doc(db, 'tokens/tok-1')))
  })

  it('refuses a student reading or writing tokens', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(setDoc(doc(db, 'tokens/tok-2'), { role: 'instructor' }))
    await assertFails(getDoc(doc(db, 'tokens/tok-1')))
  })

  it('refuses an unauthenticated user reading or writing tokens', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'tokens/tok-1')))
    await assertFails(setDoc(doc(db, 'tokens/tok-3'), { role: 'instructor' }))
  })
})

describe('semesters/{semesterId} - parent document read access', () => {
  it('lets any signed-in user read the semester document', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(getDoc(doc(db, `semesters/${currentSemester}`)))
  })

  it('refuses an unauthenticated user reading the semester document', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, `semesters/${currentSemester}`)))
  })

  it('refuses client writes to the semester document', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      setDoc(doc(db, `semesters/${currentSemester}`), { name: 'Fall 2026' }),
    )
  })
})

describe('decisions - read by their applicant, admins and reviewers; no client writes', () => {
  it('lets an applicant read their own decision', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertSucceeds(getDoc(doc(db, decisions, UIDS.accepted)))
  })

  it("refuses an applicant reading another user's decision", async () => {
    const db = as(UIDS.rejected, 'instructor')
    await assertFails(getDoc(doc(db, decisions, UIDS.accepted)))
  })

  it('refuses an applicant writing their own decision', async () => {
    const db = as(UIDS.rejected, 'instructor')
    await assertFails(
      setDoc(doc(db, decisions, UIDS.rejected), { type: 'accepted' }),
    )
  })

  it('lets an admin read decisions but not write them', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(getDoc(doc(db, decisions, UIDS.accepted)))
    await assertFails(
      setDoc(doc(db, decisions, UIDS.undecided), { type: 'accepted' }),
    )
  })

  it('lets a reviewer read decisions but not write them', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(getDoc(doc(db, decisions, UIDS.accepted)))
    await assertFails(
      setDoc(doc(db, decisions, UIDS.undecided), { type: 'interview' }),
    )
  })

  it('refuses an unauthenticated user', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, decisions, UIDS.accepted)))
  })
})

describe('interviewTimeRequests - admins/reviewers read; applicants file through the API', () => {
  // Keyed `${uid}-${requestedDate}` - see portal's /api/slotRequest.
  const requestId = (uid: string) => `${uid}-2026-10-05T14:00`
  const request = (uid: string) => ({
    uid,
    firstName: 'Timmy',
    lastName: 'Tester',
    email: 'applicant@example.com',
    date: new Date('2026-10-05T14:00:00.000Z'),
  })

  async function seedRequest(uid: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          interviewTimeRequestsCollection,
          requestId(uid),
        ),
        request(uid),
      )
    })
  }

  it('refuses an instructor applicant creating even their own request', async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      setDoc(
        doc(db, interviewTimeRequestsCollection, requestId(UIDS.undecided)),
        request(UIDS.undecided),
      ),
    )
  })

  it('refuses creating a request keyed under another uid', async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      setDoc(
        doc(db, interviewTimeRequestsCollection, requestId(UIDS.interviewing)),
        request(UIDS.undecided),
      ),
    )
  })

  it("refuses a request whose uid field isn't the caller's", async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      setDoc(
        doc(db, interviewTimeRequestsCollection, requestId(UIDS.undecided)),
        request(UIDS.interviewing),
      ),
    )
  })

  it('refuses an instructor applicant reading any request, even their own', async () => {
    await seedRequest(UIDS.undecided)
    await seedRequest(UIDS.interviewing)
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      getDoc(
        doc(db, interviewTimeRequestsCollection, requestId(UIDS.undecided)),
      ),
    )
    await assertFails(
      getDoc(
        doc(db, interviewTimeRequestsCollection, requestId(UIDS.interviewing)),
      ),
    )
  })

  it('refuses an instructor applicant updating or deleting their own request', async () => {
    await seedRequest(UIDS.undecided)
    const db = as(UIDS.undecided, 'instructor')
    const ref = doc(
      db,
      interviewTimeRequestsCollection,
      requestId(UIDS.undecided),
    )
    await assertFails(
      updateDoc(ref, { date: new Date('2026-10-06T14:00:00.000Z') }),
    )
    await assertFails(deleteDoc(ref))
  })

  it.each([
    ['an admin', UIDS.admin, 'admin'],
    ['a reviewer', UIDS.reviewer, 'reviewer'],
  ] as const)(
    'lets %s read requests, but not write one',
    async (_, uid, role) => {
      await seedRequest(UIDS.undecided)
      const db = as(uid, role)
      const ref = doc(
        db,
        interviewTimeRequestsCollection,
        requestId(UIDS.undecided),
      )
      await assertSucceeds(getDoc(ref))
      await assertSucceeds(
        getDocs(collection(db, interviewTimeRequestsCollection)),
      )
      await assertFails(
        updateDoc(ref, { date: new Date('2026-10-06T14:00:00.000Z') }),
      )
      await assertFails(deleteDoc(ref))
      await assertFails(
        setDoc(
          doc(
            db,
            interviewTimeRequestsCollection,
            requestId(UIDS.interviewing),
          ),
          request(UIDS.interviewing),
        ),
      )
    },
  )

  it("refuses a student reading another user's request", async () => {
    await seedRequest(UIDS.undecided)
    const db = as(UIDS.student, 'student')
    await assertFails(
      getDoc(
        doc(db, interviewTimeRequestsCollection, requestId(UIDS.undecided)),
      ),
    )
  })

  it('refuses an unauthenticated user', async () => {
    await seedRequest(UIDS.undecided)
    const db = testEnv.unauthenticatedContext().firestore()
    const ref = doc(
      db,
      interviewTimeRequestsCollection,
      requestId(UIDS.undecided),
    )
    await assertFails(getDoc(ref))
    await assertFails(setDoc(ref, request(UIDS.undecided)))
  })
})

describe("subRequests - a request's own people read it; every write goes through the API", () => {
  // Keyed `${classId}---${classNumber}`, like portal's subRequestDocId.
  const REQUEST_ID = `${UIDS.accepted}-1---2`

  const subRequest = (overrides: Record<string, unknown> = {}) => ({
    id: `${UIDS.accepted}-1`,
    classNumber: 2,
    course: 'Python 1',
    dateOfClass: new Date('2026-10-05T20:00:00.000Z'),
    notes: 'Loops.',
    link: 'https://zoom.example/1',
    originalInstructorEmail: 'accepted@example.com',
    originalInstructorUid: UIDS.accepted,
    requestedByUid: UIDS.accepted,
    subInstructorId: '',
    subInstructorFirstName: '',
    subInstructorEmail: '',
    subRequestStatus: 'SubstituteNeeded',
    ...overrides,
  })

  async function seed(
    overrides: Record<string, unknown> = {},
    id: string = REQUEST_ID,
  ) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'subRequests', id),
        subRequest(overrides),
      )
    })
  }

  // Filing goes through portal's /api/subRequest, which takes the class's
  // instructors from the class document.
  it('refuses an instructor filing a request, even for their own class', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(setDoc(doc(db, 'subRequests', REQUEST_ID), subRequest()))
  })

  it("refuses a co-instructor filing one naming the class's instructor of record", async () => {
    const db = as(UIDS.substitute, 'instructor')
    await assertFails(
      setDoc(
        doc(db, 'subRequests', REQUEST_ID),
        subRequest({ requestedByUid: UIDS.substitute }),
      ),
    )
  })

  it("refuses filing a request in somebody else's name", async () => {
    const db = as(UIDS.rejected, 'instructor')
    await assertFails(setDoc(doc(db, 'subRequests', REQUEST_ID), subRequest()))
  })

  // Editing and cancelling go through /api/subRequest too.
  it('lets the requester and the instructor of record read it, but not edit or cancel it', async () => {
    await seed({ requestedByUid: UIDS.substitute })
    for (const uid of [UIDS.substitute, UIDS.accepted]) {
      const db = as(uid, 'instructor')
      const ref = doc(db, 'subRequests', REQUEST_ID)
      await assertSucceeds(getDoc(ref))
      await assertFails(
        updateDoc(ref, {
          notes: `Edited by ${uid}.`,
          dateOfClass: new Date('2026-10-06T20:00:00.000Z'),
        }),
      )
      await assertFails(deleteDoc(ref))
    }
  })

  it('refuses the requester changing who covers it, its status or its session', async () => {
    await seed()
    const ref = doc(as(UIDS.accepted, 'instructor'), 'subRequests', REQUEST_ID)
    await assertFails(
      updateDoc(ref, {
        subInstructorId: UIDS.accepted,
        subRequestStatus: 'SubstituteFound',
      }),
    )
    await assertFails(
      updateDoc(ref, { subRequestStatus: 'NoSubstituteNeeded' }),
    )
    await assertFails(updateDoc(ref, { classNumber: 3 }))
    await assertFails(updateDoc(ref, { requestedByUid: UIDS.rejected }))
  })

  it('lets the substitute read the session they cover, but not change or cancel it', async () => {
    await seed({
      subInstructorId: UIDS.substitute,
      subRequestStatus: 'SubstituteFound',
    })
    const ref = doc(
      as(UIDS.substitute, 'instructor'),
      'subRequests',
      REQUEST_ID,
    )
    await assertSucceeds(getDoc(ref))
    await assertFails(updateDoc(ref, { notes: 'Not mine to edit.' }))
    await assertFails(deleteDoc(ref))
  })

  // Claiming goes through portal's /api/substitute, in a transaction.
  it('refuses any other instructor reading, claiming or cancelling a request', async () => {
    await seed()
    const ref = doc(
      as(UIDS.substitute, 'instructor'),
      'subRequests',
      REQUEST_ID,
    )
    await assertFails(getDoc(ref))
    await assertFails(
      updateDoc(ref, {
        subInstructorId: UIDS.substitute,
        subRequestStatus: 'SubstituteFound',
      }),
    )
    await assertFails(deleteDoc(ref))
  })

  it("lets an instructor query their own requests and cover, but not everyone's", async () => {
    await seed()
    await seed(
      { requestedByUid: UIDS.rejected, originalInstructorUid: UIDS.rejected },
      'other-1---1',
    )
    await seed(
      {
        requestedByUid: UIDS.rejected,
        originalInstructorUid: UIDS.rejected,
        subInstructorId: UIDS.accepted,
        subRequestStatus: 'NoSubstituteNeeded',
      },
      'other-1---2',
    )
    const requests = collection(as(UIDS.accepted, 'instructor'), 'subRequests')

    await assertSucceeds(
      getDocs(query(requests, where('requestedByUid', '==', UIDS.accepted))),
    )
    await assertSucceeds(
      getDocs(
        query(requests, where('originalInstructorUid', '==', UIDS.accepted)),
      ),
    )
    await assertSucceeds(
      getDocs(
        query(
          requests,
          where('subInstructorId', '==', UIDS.accepted),
          where('subRequestStatus', 'in', [
            'SubstituteFound',
            'SubstituteFeedbackNeeded',
          ]),
        ),
      ),
    )
    await assertSucceeds(
      getCountFromServer(
        query(
          requests,
          where('subInstructorId', '==', UIDS.accepted),
          where('subRequestStatus', '==', 'NoSubstituteNeeded'),
        ),
      ),
    )
    await assertFails(getDocs(requests))
    await assertFails(
      getDocs(
        query(requests, where('subRequestStatus', '==', 'SubstituteNeeded')),
      ),
    )
  })

  it.each([
    ['an admin', UIDS.admin, 'admin'],
    ['a reviewer', UIDS.reviewer, 'reviewer'],
  ] as const)(
    'lets %s read any request, but not write one',
    async (_, uid, role) => {
      await seed()
      const db = as(uid, role)
      const ref = doc(db, 'subRequests', REQUEST_ID)
      await assertSucceeds(getDoc(ref))
      await assertSucceeds(getDocs(collection(db, 'subRequests')))
      await assertFails(
        updateDoc(ref, { subRequestStatus: 'NoSubstituteNeeded' }),
      )
      await assertFails(deleteDoc(ref))
      await assertFails(
        setDoc(doc(db, 'subRequests', 'class-9---1'), subRequest()),
      )
    },
  )

  it('refuses a student or an unauthenticated user', async () => {
    await seed()
    await assertFails(
      getDoc(doc(as(UIDS.student, 'student'), 'subRequests', REQUEST_ID)),
    )
    await assertFails(
      setDoc(
        doc(as(UIDS.student, 'student'), 'subRequests', 'student-1---1'),
        subRequest({ requestedByUid: UIDS.rejected }),
      ),
    )
    const anonymous = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonymous, 'subRequests', REQUEST_ID)))
  })

  // Past semesters' requests are archived under the semester by
  // scripts/archive-past-sub-requests.ts, readable by the same people.
  const archived = semesterCollectionPath('Spring26', 'subRequests')

  it("lets an archived request's own people read it, and nobody else", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), archived, REQUEST_ID),
        subRequest({ subInstructorId: UIDS.substitute }),
      )
    })
    for (const uid of [UIDS.accepted, UIDS.substitute]) {
      await assertSucceeds(
        getDoc(doc(as(uid, 'instructor'), archived, REQUEST_ID)),
      )
    }
    await assertSucceeds(
      getDoc(doc(as(UIDS.admin, 'admin'), archived, REQUEST_ID)),
    )
    await assertFails(
      getDoc(doc(as(UIDS.rejected, 'instructor'), archived, REQUEST_ID)),
    )
    await assertFails(
      setDoc(
        doc(as(UIDS.admin, 'admin'), archived, 'class-9---1'),
        subRequest(),
      ),
    )
  })

  // Portal's community-service page counts a substitute's covered sessions
  // in every semester, archived or not.
  it('lets a substitute count their own covered sessions across semesters, and no one else', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const covered = subRequest({
        subInstructorId: UIDS.substitute,
        subRequestStatus: 'NoSubstituteNeeded',
      })
      await setDoc(doc(context.firestore(), 'subRequests', REQUEST_ID), covered)
      await setDoc(doc(context.firestore(), archived, REQUEST_ID), covered)
    })
    const covered = (uid: string, role: string, subUid: string) =>
      getCountFromServer(
        query(
          collectionGroup(as(uid, role), 'subRequests'),
          where('subInstructorId', '==', subUid),
          where('subRequestStatus', '==', 'NoSubstituteNeeded'),
        ),
      )

    const count = await assertSucceeds(
      covered(UIDS.substitute, 'instructor', UIDS.substitute),
    )
    expect(count.data().count).toBe(2)
    await assertFails(covered(UIDS.rejected, 'instructor', UIDS.substitute))
    await assertFails(
      getDocs(
        collectionGroup(as(UIDS.substitute, 'instructor'), 'subRequests'),
      ),
    )
  })
})

describe('checkIns - real-time program check-ins and meal checkouts', () => {
  // Checking in is admin work; portal never reads or writes checkIns, so a
  // parent has no reason to reach even their own child's record.
  it("refuses a parent reading or writing their own child's checkIn", async () => {
    const db = as(UIDS.student, 'student')
    for (const id of [UIDS.student, `${UIDS.student}-2`]) {
      await assertFails(
        setDoc(doc(db, `${checkIns}/${id}`), {
          checkedIn: true,
        }),
      )
      await assertFails(getDoc(doc(db, `${checkIns}/${id}`)))
    }
  })

  it('refuses an instructor', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(getDoc(doc(db, `${checkIns}/${UIDS.student}`)))
    await assertFails(
      setDoc(doc(db, `${checkIns}/${UIDS.student}`), {
        checkedIn: true,
      }),
    )
  })

  it("refuses a user reading or writing another user's checkIn", async () => {
    const db = as(UIDS.otherStudent, 'student')
    await assertFails(getDoc(doc(db, `${checkIns}/${UIDS.student}`)))
    await assertFails(
      setDoc(doc(db, `${checkIns}/${UIDS.student}`), {
        checkedIn: true,
      }),
    )
  })

  // Checking in and recording meals go through admin's /api/checkIn.
  it.each([
    ['an admin', UIDS.admin, 'admin'],
    ['a reviewer', UIDS.reviewer, 'reviewer'],
  ] as const)(
    'lets %s read any checkIn, but not write one',
    async (_, uid, role) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `${checkIns}/${UIDS.student}`), {
          checkedIn: true,
          food: { '2026-10-17': { lunch: false } },
        })
      })
      const db = as(uid, role)
      const ref = doc(db, `${checkIns}/${UIDS.student}`)
      await assertSucceeds(getDoc(ref))
      await assertFails(updateDoc(ref, { 'food.2026-10-17.lunch': true }))
      await assertFails(deleteDoc(ref))
      await assertFails(
        setDoc(doc(db, `${checkIns}/${UIDS.otherStudent}`), {
          checkedIn: true,
        }),
      )
    },
  )

  it('refuses an unauthenticated user', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, `${checkIns}/${UIDS.student}`)))
  })
})

describe('the escalation this change closes, end to end', () => {
  it('a student cannot write themselves into instructor access', async () => {
    const db = as(UIDS.student, 'student')

    // Step 1, which used to work: claim the role in your own document.
    await assertFails(
      setDoc(
        doc(db, `users/${UIDS.student}`),
        { role: 'instructor' },
        { merge: true },
      ),
    )

    // Step 2, which the write above used to unlock. Denied on its own merits
    // now too: the rules read the Auth claim, so even a forged document would
    // not have helped.
    await assertFails(getDoc(doc(db, registrations, UIDS.otherStudent)))
  })
})
