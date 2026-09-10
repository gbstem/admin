import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  currentSemester,
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
      role: 'student',
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

describe("users/{uid} - the role field is not the client's to write", () => {
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

  it('refuses a self-promotion to instructor', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, `users/${UIDS.student}`), { role: 'instructor' }),
    )
  })

  it('refuses a self-promotion to admin', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      setDoc(
        doc(db, `users/${UIDS.student}`),
        { role: 'admin' },
        { merge: true },
      ),
    )
  })

  it('refuses a role smuggled in alongside a legitimate name change', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, `users/${UIDS.student}`), {
        firstName: 'Augusta',
        role: 'instructor',
      }),
    )
  })

  it('lets a user create a document that carries no role', async () => {
    // admin's userService.updateUserName uses setDoc(merge) so accounts
    // predating the users collection can still rename themselves.
    const db = as(UIDS.undecided, 'admin')
    await assertSucceeds(
      setDoc(doc(db, `users/${UIDS.undecided}`), { firstName: 'Grace' }),
    )
  })

  it('refuses a created document that assigns itself a role', async () => {
    const db = as(UIDS.undecided, 'student')
    await assertFails(
      setDoc(doc(db, `users/${UIDS.undecided}`), {
        firstName: 'Grace',
        role: 'instructor',
      }),
    )
  })

  it('lets a name change through setDoc(merge) on a document that has a role', async () => {
    // Both repos' userService.updateUserName use setDoc(merge) rather than
    // updateDoc. The merged result still carries the stored role, so the
    // unchanged-role check passes - but only because it compares the *merged*
    // document, which is worth pinning down.
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
      setDoc(
        doc(db, `users/${UIDS.student}`),
        { firstName: 'Augusta', lastName: 'King' },
        { merge: true },
      ),
    )
  })

  it('lets a user delete their own document', async () => {
    // portal's rollbackNewUser and DeleteAccountForm both need this.
    const db = as(UIDS.student, 'student')
    await assertSucceeds(deleteDoc(doc(db, `users/${UIDS.student}`)))
  })

  it('refuses an admin promoting another user by document', async () => {
    // Even an admin changes roles through the Admin SDK, so that the claim
    // and the document can never disagree.
    const db = as(UIDS.admin, 'admin')
    await assertFails(
      updateDoc(doc(db, `users/${UIDS.student}`), { role: 'instructor' }),
    )
  })
})

describe("applications/{uid} - meta.decided is not the applicant's to write", () => {
  it('lets an applicant read their own application', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(getDoc(doc(db, applications, UIDS.student)))
  })

  it("refuses reading another applicant's application", async () => {
    const db = as(UIDS.otherStudent, 'student')
    await assertFails(getDoc(doc(db, applications, UIDS.student)))
  })

  it('lets an applicant edit an unrelated field', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
      updateDoc(doc(db, applications, UIDS.student), {
        personal: { firstName: 'Augusta', email: 'ada@example.com' },
      }),
    )
  })

  it('refuses an applicant hiding their own decided interview notes', async () => {
    // The fixture seeds meta.decided: true - this is the exploit
    // applicationService.loadApplicationDetails documents: setting it back
    // to false stops the admin UI from loading the decision doc at all.
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, applications, UIDS.student), {
        meta: { uid: UIDS.student, submitted: true, decided: false },
      }),
    )
  })

  it('refuses meta.decided smuggled in alongside a legitimate field change', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      updateDoc(doc(db, applications, UIDS.student), {
        personal: { firstName: 'Augusta', email: 'ada@example.com' },
        meta: { uid: UIDS.student, submitted: true, decided: false },
      }),
    )
  })

  it('lets an admin set meta.decided', async () => {
    // applicationService.saveNotes/submitOfficialDecision write this through
    // the client SDK, not the Admin SDK - unlike role, this one has to stay
    // writable by rules for admin/reviewer.
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(
      updateDoc(doc(db, applications, UIDS.student), {
        meta: { uid: UIDS.student, submitted: true, decided: false },
      }),
    )
  })

  it('lets a reviewer set meta.decided', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(
      updateDoc(doc(db, applications, UIDS.student), {
        meta: { uid: UIDS.student, submitted: true, decided: false },
      }),
    )
  })

  it('lets an applicant create their own application', async () => {
    const db = as(UIDS.undecided, 'student')
    await assertSucceeds(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false, decided: false },
      }),
    )
  })

  it('lets an applicant create an application with decided omitted', async () => {
    const db = as(UIDS.undecided, 'student')
    await assertSucceeds(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false },
      }),
    )
  })

  it('refuses an applicant creating an application with decided: true', async () => {
    const db = as(UIDS.undecided, 'student')
    await assertFails(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false, decided: true },
      }),
    )
  })

  it('lets an admin create an application with decided: true', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false, decided: true },
      }),
    )
  })

  it('lets a reviewer create an application with decided: true', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(
      setDoc(doc(db, applications, UIDS.undecided), {
        personal: { firstName: 'Grace', email: 'grace@example.com' },
        meta: { uid: UIDS.undecided, submitted: false, decided: true },
      }),
    )
  })

  it('lets an applicant delete their own application', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(deleteDoc(doc(db, applications, UIDS.student)))
  })

  it("refuses an applicant deleting another applicant's application", async () => {
    const db = as(UIDS.otherStudent, 'student')
    await assertFails(deleteDoc(doc(db, applications, UIDS.student)))
  })

  it('lets an admin delete an application', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(deleteDoc(doc(db, applications, UIDS.student)))
  })

  it('lets a reviewer delete an application', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(deleteDoc(doc(db, applications, UIDS.student)))
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

  it('lets a student create their own registration', async () => {
    const db = as(UIDS.undecided, 'student')
    await assertSucceeds(
      setDoc(doc(db, registrations, UIDS.undecided), {
        personal: { studentFirstName: 'Grace' },
      }),
    )
  })

  it('lets a student create a secondary child registration by uid prefix', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
      setDoc(doc(db, registrations, `${UIDS.student}-2`), {
        personal: { studentFirstName: 'Charles' },
      }),
    )
  })

  it('lets a student update their own registration', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
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
    // Reviewers have read access via isAdminOrReviewer(), but write is restricted to isOwnerOrAdmin()
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(
      updateDoc(doc(db, registrations, UIDS.student), {
        'personal.studentFirstName': 'Reviewer',
      }),
    )
  })

  it('lets an admin write a registration', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(
      updateDoc(doc(db, registrations, UIDS.student), {
        'personal.studentFirstName': 'AdminModified',
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

describe('classes - teaching requires having been accepted to teach', () => {
  it('lets an accepted instructor create a class under their own uid', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertSucceeds(
      setDoc(doc(db, classes, `${UIDS.accepted}-2`), { course: 'Python 1' }),
    )
  })

  it('refuses a class create by an instructor awaiting an interview', async () => {
    const db = as(UIDS.interviewing, 'instructor')
    await assertFails(
      setDoc(doc(db, classes, `${UIDS.interviewing}-1`), {
        course: 'Python 1',
      }),
    )
  })

  it("refuses a class create under another instructor's uid", async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(
      setDoc(doc(db, classes, `${UIDS.substitute}-1`), { course: 'Python 1' }),
    )
  })

  it('refuses a class create with a bare uid (no class number suffix)', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(
      setDoc(doc(db, classes, UIDS.accepted), { course: 'Python 1' }),
    )
  })

  it('refuses a class create with an invalid or non-numeric class id suffix', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(
      setDoc(doc(db, classes, `${UIDS.accepted}-abc`), { course: 'Python 1' }),
    )
    await assertFails(
      setDoc(doc(db, classes, `${UIDS.accepted}_1`), { course: 'Python 1' }),
    )
    await assertFails(
      setDoc(doc(db, classes, `${UIDS.accepted}-0`), { course: 'Python 1' }),
    )
  })

  it('lets an accepted instructor update their own class', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertSucceeds(
      updateDoc(doc(db, classes, `${UIDS.accepted}-1`), {
        meetingLink: 'https://teams.example/join',
      }),
    )
  })

  it("refuses an update to a class the caller doesn't teach", async () => {
    const db = as(UIDS.substitute, 'instructor')
    await assertFails(
      updateDoc(doc(db, classes, `${UIDS.accepted}-1`), {
        meetingLink: 'https://evil.example/join',
      }),
    )
  })

  it('lets a co-instructor update the class', async () => {
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
    await assertSucceeds(
      updateDoc(doc(db, classes, `${UIDS.accepted}-1`), {
        meetingLink: 'https://teams.example/join',
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

  it('lets an admin delete a class', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(deleteDoc(doc(db, classes, `${UIDS.accepted}-1`)))
  })

  it('lets a reviewer delete a class', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(deleteDoc(doc(db, classes, `${UIDS.accepted}-1`)))
  })

  it('refuses an instructor deleting their own class', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(deleteDoc(doc(db, classes, `${UIDS.accepted}-1`)))
  })
})

describe('classes - legacy documents', () => {
  it('lets the owner update a class that predates otherInstructorUids', async () => {
    // 44 classes from Spring24/Fall24 carry no otherInstructorUids field, and
    // rules error rather than return null when a map key is missing - so
    // isInstructorOfClass()'s null guards are load-bearing. Adding the
    // acceptance check to this rule must not have changed that.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), classes, `${UIDS.accepted}-9`), {
        course: 'Python 1',
        instructorUid: UIDS.accepted,
      })
    })
    const db = as(UIDS.accepted, 'instructor')
    await assertSucceeds(
      updateDoc(doc(db, classes, `${UIDS.accepted}-9`), {
        meetingLink: 'https://teams.example/join',
      }),
    )
  })
})

describe('mail - the trigger-email queue is server-only', () => {
  it('refuses a signed-in user queueing an email', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      setDoc(doc(db, 'mail/spam-1'), {
        to: 'victim@example.com',
        message: { subject: 'Hello', html: '<p>Hi</p>' },
      }),
    )
  })
})

describe('instructorInterviewTimes - instructors only update booking fields; admins/reviewers can update all', () => {
  it('lets an instructor book a slot by updating allowed booking fields', async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertSucceeds(
      updateDoc(doc(db, interviewTimes, 'slot-1'), {
        interviewSlotStatus: 'pending',
        intervieweeFirstName: 'Grace',
        intervieweeLastName: 'Hopper',
        intervieweeEmail: 'grace@example.com',
        intervieweeId: UIDS.undecided,
      }),
    )
  })

  it('refuses an instructor updating meetingLink or date', async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      updateDoc(doc(db, interviewTimes, 'slot-1'), {
        meetingLink: 'https://attacker.example/zoom',
      }),
    )
  })

  it('refuses an instructor smuggling meetingLink alongside allowed booking fields', async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      updateDoc(doc(db, interviewTimes, 'slot-1'), {
        interviewSlotStatus: 'pending',
        intervieweeFirstName: 'Grace',
        meetingLink: 'https://attacker.example/zoom',
      }),
    )
  })

  it('lets an admin update any field including meetingLink', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(
      updateDoc(doc(db, interviewTimes, 'slot-1'), {
        meetingLink: 'https://zoom.example/new-link',
      }),
    )
  })

  it('lets a reviewer update any field including meetingLink', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(
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

  it('lets an admin create an interview slot', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(
      setDoc(doc(db, interviewTimes, 'slot-admin-new'), {
        date: '2026-10-02T10:00:00.000Z',
        meetingLink: 'https://zoom.example/new',
      }),
    )
  })

  it('lets a reviewer create an interview slot', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(
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

  it('lets an admin delete an interview slot', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(deleteDoc(doc(db, interviewTimes, 'slot-1')))
  })

  it('lets a reviewer delete an interview slot', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(deleteDoc(doc(db, interviewTimes, 'slot-1')))
  })

  it('refuses an instructor deleting an interview slot', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(deleteDoc(doc(db, interviewTimes, 'slot-1')))
  })
})

describe('classFeedback and instructorFeedback - role-enforced creation', () => {
  it('lets a student create classFeedback', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
      setDoc(doc(db, classFeedback, 'cf-2'), {
        rating: 5,
        comment: 'Loved the lesson',
      }),
    )
  })

  it('refuses an instructor creating classFeedback', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(
      setDoc(doc(db, classFeedback, 'cf-2'), {
        rating: 5,
        comment: 'Should be rejected',
      }),
    )
  })

  it('refuses an unauthenticated user creating classFeedback', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      setDoc(doc(db, classFeedback, 'cf-2'), {
        rating: 5,
      }),
    )
  })

  it('lets an admin read classFeedback', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(getDoc(doc(db, classFeedback, 'cf-1')))
  })

  it('refuses a student reading classFeedback', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(getDoc(doc(db, classFeedback, 'cf-1')))
  })

  it('lets an instructor create instructorFeedback', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertSucceeds(
      setDoc(doc(db, instructorFeedback, 'if-2'), {
        sessionNotes: 'Completed module 3',
      }),
    )
  })

  it('refuses a student creating instructorFeedback', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(
      setDoc(doc(db, instructorFeedback, 'if-2'), {
        sessionNotes: 'Students cannot submit instructor feedback',
      }),
    )
  })

  it('refuses an unauthenticated user creating instructorFeedback', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      setDoc(doc(db, instructorFeedback, 'if-2'), {
        sessionNotes: 'Anonymous note',
      }),
    )
  })

  it('lets an admin read instructorFeedback', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(getDoc(doc(db, instructorFeedback, 'if-1')))
  })

  it('refuses an instructor reading instructorFeedback directly', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertFails(getDoc(doc(db, instructorFeedback, 'if-1')))
  })
})

describe('tokens - account creation tokens are admin-only', () => {
  it('lets an admin read and write tokens', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(
      setDoc(doc(db, 'tokens/tok-1'), { role: 'instructor' }),
    )
    await assertSucceeds(getDoc(doc(db, 'tokens/tok-1')))
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

describe('decisions - applicant read access; admin/reviewer write access', () => {
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

  it('lets an admin read and write decisions', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(getDoc(doc(db, decisions, UIDS.accepted)))
    await assertSucceeds(
      setDoc(doc(db, decisions, UIDS.undecided), { type: 'accepted' }),
    )
  })

  it('lets a reviewer read and write decisions', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(getDoc(doc(db, decisions, UIDS.accepted)))
    await assertSucceeds(
      setDoc(doc(db, decisions, UIDS.undecided), { type: 'interview' }),
    )
  })

  it('refuses an unauthenticated user', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, decisions, UIDS.accepted)))
  })
})

describe('instructorClasses - instructor and admin mapping', () => {
  it('lets an instructor read and write instructorClasses', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertSucceeds(
      setDoc(doc(db, 'instructorClasses/class-1'), {
        instructorUid: UIDS.accepted,
      }),
    )
    await assertSucceeds(getDoc(doc(db, 'instructorClasses/class-1')))
  })

  it('lets an admin read and write instructorClasses', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(
      setDoc(doc(db, 'instructorClasses/class-2'), {
        instructorUid: UIDS.accepted,
      }),
    )
    await assertSucceeds(getDoc(doc(db, 'instructorClasses/class-2')))
  })

  it('refuses a student reading or writing instructorClasses', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(getDoc(doc(db, 'instructorClasses/class-1')))
    await assertFails(
      setDoc(doc(db, 'instructorClasses/class-3'), {
        instructorUid: UIDS.student,
      }),
    )
  })

  it('refuses a reviewer reading or writing instructorClasses', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertFails(getDoc(doc(db, 'instructorClasses/class-1')))
    await assertFails(
      setDoc(doc(db, 'instructorClasses/class-3'), {
        instructorUid: UIDS.reviewer,
      }),
    )
  })

  it('refuses an unauthenticated user', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'instructorClasses/class-1')))
  })
})

describe('interviewTimeRequests - applicants create; admins/reviewers manage', () => {
  it('lets an instructor applicant read and create interviewTimeRequests', async () => {
    const db = as(UIDS.undecided, 'instructor')
    await assertSucceeds(
      setDoc(doc(db, 'interviewTimeRequests/req-1'), {
        date: '2026-10-05T14:00:00.000Z',
        uid: UIDS.undecided,
      }),
    )
    await assertSucceeds(getDoc(doc(db, 'interviewTimeRequests/req-1')))
  })

  it('refuses an instructor applicant updating or deleting interviewTimeRequests', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'interviewTimeRequests/req-1'), {
        date: '2026-10-05T14:00:00.000Z',
      })
    })
    const db = as(UIDS.undecided, 'instructor')
    await assertFails(
      updateDoc(doc(db, 'interviewTimeRequests/req-1'), {
        date: '2026-10-06T14:00:00.000Z',
      }),
    )
    await assertFails(deleteDoc(doc(db, 'interviewTimeRequests/req-1')))
  })

  it('lets an admin update and delete interviewTimeRequests', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'interviewTimeRequests/req-1'), {
        date: '2026-10-05T14:00:00.000Z',
      })
    })
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(
      updateDoc(doc(db, 'interviewTimeRequests/req-1'), {
        date: '2026-10-06T14:00:00.000Z',
      }),
    )
    await assertSucceeds(deleteDoc(doc(db, 'interviewTimeRequests/req-1')))
  })

  it('lets a reviewer update and delete interviewTimeRequests', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'interviewTimeRequests/req-1'), {
        date: '2026-10-05T14:00:00.000Z',
      })
    })
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(
      updateDoc(doc(db, 'interviewTimeRequests/req-1'), {
        date: '2026-10-06T14:00:00.000Z',
      }),
    )
    await assertSucceeds(deleteDoc(doc(db, 'interviewTimeRequests/req-1')))
  })

  it('refuses a student reading or creating interviewTimeRequests', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(getDoc(doc(db, 'interviewTimeRequests/req-1')))
    await assertFails(
      setDoc(doc(db, 'interviewTimeRequests/req-2'), {
        date: '2026-10-05T14:00:00.000Z',
      }),
    )
  })

  it('refuses an unauthenticated user', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'interviewTimeRequests/req-1')))
  })
})

describe('subRequests - staff read; instructors create; instructors and admins manage', () => {
  it('lets an instructor read, create, update, and delete subRequests', async () => {
    const db = as(UIDS.accepted, 'instructor')
    await assertSucceeds(
      setDoc(doc(db, 'subRequests/sub-1'), {
        course: 'Python 1',
        instructorUid: UIDS.accepted,
      }),
    )
    await assertSucceeds(getDoc(doc(db, 'subRequests/sub-1')))
    await assertSucceeds(
      updateDoc(doc(db, 'subRequests/sub-1'), {
        status: 'claimed',
      }),
    )
    await assertSucceeds(deleteDoc(doc(db, 'subRequests/sub-1')))
  })

  it('lets a reviewer read subRequests, but not create, update, or delete', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'subRequests/sub-1'), {
        course: 'Python 1',
      })
    })
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(getDoc(doc(db, 'subRequests/sub-1')))
    await assertFails(
      setDoc(doc(db, 'subRequests/sub-rev'), {
        course: 'Math',
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'subRequests/sub-1'), {
        status: 'claimed',
      }),
    )
    await assertFails(deleteDoc(doc(db, 'subRequests/sub-1')))
  })

  it('refuses a student reading or creating subRequests', async () => {
    const db = as(UIDS.student, 'student')
    await assertFails(getDoc(doc(db, 'subRequests/sub-1')))
    await assertFails(
      setDoc(doc(db, 'subRequests/sub-stu'), {
        course: 'Art',
      }),
    )
  })

  it('refuses an unauthenticated user', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'subRequests/sub-1')))
  })
})

describe('confirmations - parent/guardian confirmations', () => {
  it('lets a user read and write their own confirmation', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
      setDoc(doc(db, `confirmations/${UIDS.student}`), {
        confirmed: true,
      }),
    )
    await assertSucceeds(getDoc(doc(db, `confirmations/${UIDS.student}`)))
  })

  it("refuses a user reading or writing another user's confirmation", async () => {
    const db = as(UIDS.otherStudent, 'student')
    await assertFails(getDoc(doc(db, `confirmations/${UIDS.student}`)))
    await assertFails(
      setDoc(doc(db, `confirmations/${UIDS.student}`), {
        confirmed: true,
      }),
    )
  })

  it('lets an admin read and write any confirmation', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(getDoc(doc(db, `confirmations/${UIDS.student}`)))
    await assertSucceeds(
      setDoc(doc(db, `confirmations/${UIDS.student}`), {
        confirmed: true,
      }),
    )
  })

  it('lets a reviewer read but not write a confirmation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `confirmations/${UIDS.student}`), {
        confirmed: true,
      })
    })
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(getDoc(doc(db, `confirmations/${UIDS.student}`)))
    await assertFails(
      setDoc(doc(db, `confirmations/${UIDS.student}`), {
        confirmed: false,
      }),
    )
  })

  it('refuses an unauthenticated user', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, `confirmations/${UIDS.student}`)))
  })
})

describe('checkIns - real-time program check-ins and meal checkouts', () => {
  it('lets an owner read and write their own checkIn', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
      setDoc(doc(db, `checkIns/${UIDS.student}`), {
        checkedIn: true,
      }),
    )
    await assertSucceeds(getDoc(doc(db, `checkIns/${UIDS.student}`)))
  })

  it('lets an owner read and write a secondary child checkIn by uid prefix', async () => {
    const db = as(UIDS.student, 'student')
    await assertSucceeds(
      setDoc(doc(db, `checkIns/${UIDS.student}-2`), {
        checkedIn: true,
      }),
    )
    await assertSucceeds(getDoc(doc(db, `checkIns/${UIDS.student}-2`)))
  })

  it("refuses a user reading or writing another user's checkIn", async () => {
    const db = as(UIDS.otherStudent, 'student')
    await assertFails(getDoc(doc(db, `checkIns/${UIDS.student}`)))
    await assertFails(
      setDoc(doc(db, `checkIns/${UIDS.student}`), {
        checkedIn: true,
      }),
    )
  })

  it('lets an admin read and write any checkIn', async () => {
    const db = as(UIDS.admin, 'admin')
    await assertSucceeds(getDoc(doc(db, `checkIns/${UIDS.student}`)))
    await assertSucceeds(
      setDoc(doc(db, `checkIns/${UIDS.student}`), {
        checkedIn: true,
      }),
    )
  })

  it('lets a reviewer read and write any checkIn', async () => {
    const db = as(UIDS.reviewer, 'reviewer')
    await assertSucceeds(getDoc(doc(db, `checkIns/${UIDS.student}`)))
    await assertSucceeds(
      setDoc(doc(db, `checkIns/${UIDS.student}`), {
        checkedIn: true,
      }),
    )
  })

  it('refuses an unauthenticated user', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, `checkIns/${UIDS.student}`)))
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
