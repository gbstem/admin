// seedLib.ts - Library form of the Firebase emulator seed, so it can be
// invoked both from the CLI (scripts/seed.ts, for manual `yarn seed` runs)
// and in-process from a Cypress `seed` task (cypress.config.ts) - avoiding a
// `cy.exec()`/subprocess round trip on every e2e run. Seeds mock data for
// testing both the admin and portal sites in development, validated against
// our Zod schemas to ensure all required data is specified and all fields
// match the required types and format.
import admin from 'firebase-admin'
import { z } from 'zod'
import {
  applicationSchema,
  classSchema,
  registrationSchema,
} from '../src/lib/components/forms/schemas'
import semesterDates from '../src/lib/data/semesterDates.json'
import {
  applicationsCollection,
  classesCollection,
  classFeedbackCollection,
  currentSemester,
  decisionsCollection,
  instructorFeedbackCollection,
  interviewTimesCollection,
  registrationsCollection,
  subRequestsCollection,
} from '../src/lib/data/collections'
import collectionsList from '../src/lib/data/collectionsList.json'
import courses from '../src/lib/data/courses.json'

/**
 * A course this semester actually offers, by track and position in the
 * catalog.
 *
 * The seed used to hardcode `Mathematics 1b` and `Environmental Science B` -
 * spring names, while `currentSemester` has said `Fall26` all along - so the
 * registrations it wrote named courses that neither site listed as an option,
 * and the edit form had nothing to select. Reading the catalog keeps the seed
 * honest through the next rollover instead of hardcoding the other half's
 * mistake.
 */
const offeredCourses = courses.filter(
  (course) =>
    course.semester ===
    (currentSemester.startsWith('Fall') ? 'fall' : 'spring'),
)
export const seededCourse = (track: string, index = 0): string => {
  const name = offeredCourses.filter((course) => course.track === track)[index]
    ?.name
  if (!name) {
    throw new Error(`No course #${index} on the ${track} track this semester`)
  }
  return name
}

function validateClass(data: any, id: string) {
  try {
    classSchema.parse(data)
  } catch (err: any) {
    console.error(`\nValidation failed for class "${id}":`, err.errors || err)
    throw err
  }
}

function validateToken(data: any, id: string) {
  try {
    z.object({
      role: z.enum(['reviewer', 'admin']),
      consumable: z.boolean(),
    }).parse(data)
  } catch (err: any) {
    console.error(`\nValidation failed for token "${id}":`, err.errors || err)
    throw err
  }
}

function validateApplication(data: any, id: string) {
  try {
    applicationSchema.parse(data)
  } catch (err: any) {
    console.error(
      `\nValidation failed for application "${id}":`,
      err.errors || err,
    )
    throw err
  }
}

function validateRegistration(data: any, id: string) {
  try {
    registrationSchema.parse(data)
  } catch (err: any) {
    console.error(
      `\nValidation failed for registration "${id}":`,
      err.errors || err,
    )
    throw err
  }
}

// The display name (e.g. "Spring 2026") for the current semester, used in seeded content -
// derived so seed data doesn't go stale/misleading when the semester rolls over.
const currentSemesterName =
  collectionsList.find((sem) => sem.id === currentSemester)?.name ??
  currentSemester

// Set by seedEmulator() once the Admin SDK is confirmed initialized - shared
// by it and the helpers below.
let auth: admin.auth.Auth
let db: admin.firestore.Firestore

async function createOrUpdateUser(
  uid: string | null,
  email: string,
  password: string,
  displayName: string,
  role: string,
) {
  let user
  try {
    console.log(`Checking if user ${email} already exists...`)
    user = await auth.getUserByEmail(email)
    console.log(
      `User already exists (UID: ${user.uid}). Updating password and details...`,
    )
    user = await auth.updateUser(user.uid, {
      password: password,
      displayName: displayName,
      emailVerified: true,
    })
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      console.log(`User does not exist. Creating new user ${email}...`)
      const options: admin.auth.CreateRequest = {
        email: email,
        password: password,
        displayName: displayName,
        emailVerified: true,
      }
      if (uid) {
        options.uid = uid
      }
      user = await auth.createUser(options)
    } else {
      throw err
    }
  }

  console.log(
    `Setting custom user claims: { role: '${role}' } for UID: ${user.uid}...`,
  )
  await auth.setCustomUserClaims(user.uid, { role: role })
  console.log(`Custom user claims successfully set for ${email}.`)
  return user
}

async function deleteCollection(collectionPath: string) {
  const collectionRef = db.collection(collectionPath)
  const snapshot = await collectionRef.get()
  const batch = db.batch()
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref)
  })
  await batch.commit()
}

export async function seedEmulator(): Promise<void> {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: 'demo-gbstem',
    })
  }
  auth = admin.auth()
  db = admin.firestore()

  console.log('Clearing old accounts from emulator Auth...')
  try {
    const res = await fetch(
      'http://127.0.0.1:9099/emulator/v1/projects/demo-gbstem/accounts',
      { method: 'DELETE' },
    )
    if (res.ok) {
      console.log('Successfully cleared Auth Emulator accounts.')
    } else {
      console.error('Failed to clear Auth Emulator accounts:', await res.text())
    }
  } catch (err) {
    console.error('Error clearing Auth Emulator accounts:', err)
  }

  console.log('Clearing old documents from emulator Firestore...')
  const collectionsToClear = [
    classesCollection,
    registrationsCollection,
    decisionsCollection,
    applicationsCollection,
    subRequestsCollection,
    interviewTimesCollection,
    classFeedbackCollection,
    instructorFeedbackCollection,
    'announcements',
    'tokens',
    'confirmations',
    'checkIns',
    'users',
    'instructorClasses',
    'interviewTimeRequests',
    'mail',
    'semesterDates',
  ]
  for (const collectionName of collectionsToClear) {
    await deleteCollection(collectionName)
  }

  // Create/Update Seed Users
  const adminUser = await createOrUpdateUser(
    null,
    'demo@gbstem.org',
    'penguin',
    'Demo Admin',
    'admin',
  )
  await createOrUpdateUser(
    'instructor-demo-uid',
    'instructor@gbstem.org',
    'penguin',
    'Demo Instructor',
    'instructor',
  )
  await createOrUpdateUser(
    'instructor-rejected-uid',
    'instructor-rejected@gbstem.org',
    'penguin',
    'Rejected Instructor',
    'instructor',
  )
  await createOrUpdateUser(
    'instructor-interview-uid',
    'instructor-interview@gbstem.org',
    'penguin',
    'Interview Instructor',
    'instructor',
  )
  await createOrUpdateUser(
    'instructor-cohost-uid',
    'cohost@gbstem.org',
    'penguin',
    'Cohost Instructor',
    'instructor',
  )
  await createOrUpdateUser(
    'instructor-substitute-uid',
    'substitute@gbstem.org',
    'penguin',
    'Substitute Instructor',
    'instructor',
  )
  await createOrUpdateUser(
    'student-demo-uid',
    'student@gbstem.org',
    'penguin',
    'Demo Student',
    'student',
  )
  await createOrUpdateUser(
    'reviewer-demo-uid',
    'reviewer@gbstem.org',
    'penguin',
    'Demo Reviewer',
    'reviewer',
  )

  console.log('Seeding mock profiles in the "users" collection...')
  await db.collection('users').doc('instructor-demo-uid').set({
    role: 'instructor',
    firstName: 'Demo',
    lastName: 'Instructor',
  })

  await db.collection('users').doc('instructor-rejected-uid').set({
    role: 'instructor',
    firstName: 'Rejected',
    lastName: 'Instructor',
  })

  await db.collection('users').doc('instructor-interview-uid').set({
    role: 'instructor',
    firstName: 'Interview',
    lastName: 'Instructor',
  })

  await db.collection('users').doc('instructor-cohost-uid').set({
    role: 'instructor',
    firstName: 'Cohost',
    lastName: 'Instructor',
  })

  await db.collection('users').doc('instructor-substitute-uid').set({
    role: 'instructor',
    firstName: 'Substitute',
    lastName: 'Instructor',
  })

  await db.collection('users').doc('student-demo-uid').set({
    role: 'student',
    firstName: 'Demo',
    lastName: 'Student',
  })

  await db.collection('users').doc('reviewer-demo-uid').set({
    role: 'reviewer',
    firstName: 'Demo',
    lastName: 'Reviewer',
  })

  await db.collection('users').doc(adminUser.uid).set({
    role: 'admin',
    firstName: 'Demo',
    lastName: 'Admin',
  })

  // Create Signup Tokens
  console.log('Creating demo signup tokens in "tokens" collection...')
  for (const role of ['admin', 'reviewer']) {
    const demoToken = {
      consumable: false,
      consumers: [],
      expires: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      ),
      role: role,
    }
    validateToken(demoToken, 'demo-' + role + '-token')
    await db
      .collection('tokens')
      .doc('demo-' + role + '-token')
      .set(demoToken)
  }

  // Semester dates are no longer a Firestore document - they're static data in
  // src/lib/data/semesterDates.json (imported as `semesterDates` above), so there's
  // nothing to seed here.

  // Create Mock Classes
  console.log(`Seeding mock classes in "${classesCollection}"...`)
  const classPython1 = {
    classCap: 15,
    classDay1: 'Monday',
    classDay2: 'Wednesday',
    classTime1: '16:00',
    classTime2: '16:00',
    course: 'Python 1',
    instructorEmail: 'instructor@gbstem.org',
    // Every production class carries an instructorUid - the backfill stamped
    // the historical ones and new class ids are `${instructorUid}-${n}` - and
    // firestore.rules now grants class writes on uid alone, having dropped its
    // instructorEmail fallback. A seeded class without one is therefore not a
    // shape production has any more, and would leave its own instructor unable
    // to edit it in the emulator.
    instructorUid: 'instructor-demo-uid',
    instructorFirstName: 'Demo',
    instructorLastName: 'Instructor',
    meetingLink: 'https://zoom.us/j/123456789',
    meetingTimes: [
      admin.firestore.Timestamp.fromDate(new Date()),
      admin.firestore.Timestamp.fromDate(
        new Date(
          new Date(semesterDates.classesStart).getTime() +
            7 * 24 * 60 * 60 * 1000,
        ),
      ),
    ],
    completedClassDates: [],
    classStatuses: ['ClassUpcomingSoon', 'ClassInFuture'],
    feedbackCompleted: [false, false],
    online: true,
    students: ['student-demo-uid-1', 'student1', 'student2'],
  }
  validateClass(classPython1, 'class-python1')
  await db.collection(classesCollection).doc('class-python1').set(classPython1)

  const classScratch = {
    classCap: 12,
    classDay1: 'Tuesday',
    classDay2: 'Thursday',
    classTime1: '17:00',
    classTime2: '17:00',
    course: 'Scratch 1',
    instructorEmail: 'instructor2@gbstem.org',
    otherInstructorUids: ['instructor-cohost-uid'],
    instructorFirstName: 'Bob',
    instructorLastName: 'Jones',
    meetingLink: 'https://zoom.us/j/987654321',
    meetingTimes: [
      admin.firestore.Timestamp.fromDate(new Date()),
      admin.firestore.Timestamp.fromDate(
        new Date(
          new Date(semesterDates.classesStart).getTime() +
            8 * 24 * 60 * 60 * 1000,
        ),
      ),
    ],
    completedClassDates: [],
    classStatuses: ['FeedbackIncomplete', 'ClassInFuture'],
    feedbackCompleted: [false, false],
    online: true,
    students: ['student3'],
  }
  validateClass(classScratch, 'class-scratch')
  await db.collection(classesCollection).doc('class-scratch').set(classScratch)

  // Create Mock Registrations
  console.log(`Seeding mock registrations in "${registrationsCollection}"...`)
  const regCharlie = {
    personal: {
      email: 'parent1@gmail.com',
      studentFirstName: 'Charlie',
      studentLastName: 'Brown',
      parentFirstName: 'Lucy',
      parentLastName: 'Brown',
      secondaryEmail: 'parent1_sec@gmail.com',
      dateOfBirth: '2016-05-15',
      gender: 'Male',
      race: ['White'],
      phoneNumber: '555-0199',
      frlp: 'No',
      parentEducation: "Bachelor's degree",
    },
    academic: {
      school: 'Pinecrest Elementary',
      grade: '4',
    },
    program: {
      csCourse: 'Scratch 1',
      mathCourse: seededCourse('math'),
      engineeringCourse: 'Engineering 1',
      scienceCourse: seededCourse('science'),
      reason: 'Loves computers and building things.',
      inPerson: false,
    },
    inPerson: {
      allergies: 'None',
      parentPickup: 'Lucy Brown',
    },
    agreements: {
      entireProgram: true,
      timeCommitment: true,
      submitting: true,
      mediaRelease: true,
      bypassAgeLimits: false,
    },
    meta: {
      uid: 'user1',
      submitted: true,
    },
    timestamps: {
      created: admin.firestore.FieldValue.serverTimestamp(),
      updated: admin.firestore.FieldValue.serverTimestamp(),
    },
  }
  validateRegistration(regCharlie, 'reg-charlie')
  await db
    .collection(registrationsCollection)
    .doc('reg-charlie')
    .set(regCharlie)

  const regSally = {
    personal: {
      email: 'parent2@gmail.com',
      studentFirstName: 'Sally',
      studentLastName: 'Brown',
      parentFirstName: 'Lucy',
      parentLastName: 'Brown',
      secondaryEmail: 'parent2_sec@gmail.com',
      dateOfBirth: '2018-07-20',
      gender: 'Female',
      race: ['White'],
      phoneNumber: '555-0199',
      frlp: 'No',
      parentEducation: "Bachelor's degree",
    },
    academic: {
      school: 'Pinecrest Elementary',
      grade: '2',
    },
    program: {
      csCourse: 'Python 1',
      mathCourse: seededCourse('math'),
      engineeringCourse: 'Engineering 1',
      scienceCourse: seededCourse('science'),
      reason: 'Excited to learn programming.',
      inPerson: false,
    },
    inPerson: {
      allergies: 'None',
      parentPickup: 'Lucy Brown',
    },
    agreements: {
      entireProgram: true,
      timeCommitment: true,
      submitting: true,
      mediaRelease: true,
      bypassAgeLimits: false,
    },
    meta: {
      uid: 'user2',
      submitted: true,
    },
    enrolled: true,
    timestamps: {
      created: admin.firestore.FieldValue.serverTimestamp(),
      updated: admin.firestore.FieldValue.serverTimestamp(),
    },
  }
  validateRegistration(regSally, 'reg-sally')
  await db.collection(registrationsCollection).doc('reg-sally').set(regSally)

  console.log(`Seeding mock registration for student-demo-uid...`)
  const regStudentDemo = {
    personal: {
      email: 'student@gbstem.org',
      studentFirstName: 'Demo Student',
      studentLastName: 'One',
      parentFirstName: 'Parent',
      parentLastName: 'Demo',
      secondaryEmail: '',
      dateOfBirth: '2016-01-01',
      gender: 'Female',
      race: ['Asian'],
      phoneNumber: '555-1111',
      frlp: 'No',
      parentEducation: "Bachelor's degree",
    },
    academic: {
      school: 'Pinecrest Elementary',
      grade: '3',
    },
    program: {
      csCourse: 'Python 1',
      mathCourse: 'None',
      engineeringCourse: 'None',
      scienceCourse: 'None',
      reason: 'Excited to learn python.',
      inPerson: false,
    },
    inPerson: {
      allergies: 'None',
      parentPickup: 'Parent Demo',
    },
    agreements: {
      entireProgram: true,
      timeCommitment: true,
      submitting: true,
      mediaRelease: true,
      bypassAgeLimits: false,
    },
    meta: {
      uid: 'student-demo-uid',
      submitted: true,
    },
    enrolled: true,
    classes: ['class-python1'],
    timestamps: {
      created: admin.firestore.FieldValue.serverTimestamp(),
      updated: admin.firestore.FieldValue.serverTimestamp(),
    },
  }
  validateRegistration(regStudentDemo, 'student-demo-uid-1')
  await db
    .collection(registrationsCollection)
    .doc('student-demo-uid-1')
    .set(regStudentDemo)

  console.log('Seeding mock confirmation form for student-demo-uid...')
  await db.collection('confirmations').doc('student-demo-uid').set({
    submitted: true,
  })

  // Seeding 30 additional mock students/registrations
  console.log('Seeding 30 additional mock students/registrations...')
  const firstNames = [
    'James',
    'Mary',
    'John',
    'Patricia',
    'Robert',
    'Jennifer',
    'Michael',
    'Linda',
    'William',
    'Elizabeth',
    'David',
    'Barbara',
    'Richard',
    'Susan',
    'Joseph',
    'Jessica',
    'Thomas',
    'Sarah',
    'Charles',
    'Karen',
    'Christopher',
    'Nancy',
    'Daniel',
    'Lisa',
    'Matthew',
    'Betty',
    'Anthony',
    'Margaret',
    'Mark',
    'Sandra',
  ]
  const lastNames = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Rodriguez',
    'Martinez',
    'Hernandez',
    'Lopez',
    'Gonzalez',
    'Wilson',
    'Anderson',
    'Thomas',
    'Taylor',
    'Moore',
    'Jackson',
    'Martin',
    'Lee',
    'Perez',
    'Thompson',
    'White',
    'Harris',
    'Sanchez',
    'Clark',
    'Ramirez',
    'Lewis',
    'Robinson',
  ]
  const schools = [
    'Pinecrest Elementary',
    'Oakridge Elementary',
    'Brookside School',
    'Maple Valley Academy',
    'Riverdale Charter',
  ]
  const grades = ['1', '2', '3', '4', '5', '6']
  const courses = [
    'Scratch 1',
    'Python 1',
    'Python 2',
    'Web Development',
    'Mathematics 2a',
  ]

  for (let i = 0; i < 30; i++) {
    const id = `reg-fake-${i}`
    const studentFirstName = firstNames[i % firstNames.length]
    const studentLastName = lastNames[i % lastNames.length]
    const email = `student-${i}@gmail.com`
    const isEnrolled = i % 2 === 0 // 15 enrolled, 15 only submitted
    const inPerson = i % 5 === 0 // 6 inPerson = true
    const submitted = i % 7 !== 0 // 26 submitted = true, 4 incomplete/submitted = false

    // Vary the timestamp slightly so ordering/pagination is predictable
    const createdDate = new Date(Date.now() - (30 - i) * 60 * 60 * 1000)

    const regData: any = {
      personal: {
        email: email,
        studentFirstName: studentFirstName,
        studentLastName: studentLastName,
        parentFirstName: 'Parent',
        parentLastName: studentLastName,
        secondaryEmail: '',
        dateOfBirth: '2016-01-01',
        gender: i % 2 === 0 ? 'Male' : 'Female',
        race: ['White'],
        phoneNumber: `555-${String(i).padStart(4, '0')}`,
        frlp: i % 3 === 0 ? 'Yes' : 'No',
        parentEducation: "Bachelor's degree",
      },
      academic: {
        school: schools[i % schools.length],
        grade: grades[i % grades.length],
      },
      program: {
        csCourse: courses[i % courses.length],
        mathCourse: seededCourse('math'),
        engineeringCourse: 'Engineering 1',
        scienceCourse: seededCourse('science'),
        reason: 'Interest in STEM fields.',
        inPerson: inPerson,
      },
      inPerson: {
        allergies: 'None',
        parentPickup: 'Parent Name',
      },
      agreements: {
        entireProgram: true,
        timeCommitment: true,
        submitting: true,
        mediaRelease: true,
        bypassAgeLimits: false,
      },
      meta: {
        uid: `user-fake-${i}`,
        submitted: submitted,
      },
      timestamps: {
        created: admin.firestore.Timestamp.fromDate(createdDate),
        updated: admin.firestore.Timestamp.fromDate(createdDate),
      },
    }

    if (isEnrolled && submitted) {
      regData.enrolled = true
    } else {
      regData.enrolled = false
    }

    validateRegistration(regData, id)
    await db.collection(registrationsCollection).doc(id).set(regData)
  }

  // Create Mock Applications
  console.log(`Seeding mock applications in "${applicationsCollection}"...`)
  const appDavid = {
    personal: {
      email: 'applicant1@gmail.com',
      firstName: 'David',
      lastName: 'Miller',
      dateOfBirth: '2008-11-22',
      gender: 'Male',
      race: ['Asian'],
      phoneNumber: '555-0244',
    },
    academic: {
      school: 'Central High School',
      graduationYear: 2027,
    },
    program: {
      courses: ['Python 1', 'Scratch 1'],
      preferences: 'Prefers Python teaching.',
      numClasses: '2',
      timeSlots: 'Monday/Wednesday',
      notAvailable: 'Friday',
      inPerson: false,
      reason: 'Wants to share coding passion with younger kids.',
    },
    essay: {
      taughtBefore: true,
      academicBackground: 'Taken AP Computer Science.',
      teachingScenario: 'Would use interactive examples and visual puzzles.',
      why: 'Believes STEM education is crucial.',
    },
    agreements: {
      entireProgram: true,
      timeCommitment: true,
      submitting: true,
    },
    meta: {
      uid: 'user_app1',
      interview: false,
      submitted: true,
      decided: false,
    },
    timestamps: {
      created: admin.firestore.FieldValue.serverTimestamp(),
      updated: admin.firestore.FieldValue.serverTimestamp(),
    },
  }
  validateApplication(appDavid, 'app-david')
  await db.collection(applicationsCollection).doc('app-david').set(appDavid)

  console.log(`Seeding mock application for instructor-demo-uid...`)
  const appInstructorDemo = {
    personal: {
      email: 'instructor@gbstem.org',
      firstName: 'Demo',
      lastName: 'Instructor',
      dateOfBirth: '2000-01-01',
      gender: 'Non-binary',
      race: ['Other'],
      phoneNumber: '555-0000',
    },
    academic: {
      school: 'gbSTEM University',
      graduationYear: 2028,
    },
    program: {
      courses: ['Python 1'],
      preferences: 'None',
      numClasses: '1',
      timeSlots: 'Monday/Wednesday',
      notAvailable: 'None',
      inPerson: false,
      reason: 'Love teaching',
    },
    essay: {
      taughtBefore: true,
      academicBackground: 'CS Major',
      teachingScenario: 'Coding exercises',
      why: 'To help kids',
    },
    agreements: {
      entireProgram: true,
      timeCommitment: true,
      submitting: true,
    },
    meta: {
      uid: 'instructor-demo-uid',
      interview: true,
      submitted: true,
      decided: true,
    },
    timestamps: {
      created: admin.firestore.FieldValue.serverTimestamp(),
      updated: admin.firestore.FieldValue.serverTimestamp(),
    },
  }
  validateApplication(appInstructorDemo, 'instructor-demo-uid')
  await db
    .collection(applicationsCollection)
    .doc('instructor-demo-uid')
    .set(appInstructorDemo)

  console.log(`Seeding mock decision for instructor-demo-uid...`)
  await db.collection(decisionsCollection).doc('instructor-demo-uid').set({
    type: 'accepted',
    likelyDecision: 'likely yes',
    course: 'Python 1',
    time: 'Monday/Wednesday 16:00',
    notes: 'Welcome to the team!',
  })

  console.log(`Seeding instructor-to-class mapping...`)
  // Keyed by uid, not email - see classService.ts's fetchInstructorClasses.
  await db
    .collection('instructorClasses')
    .doc('instructor-demo-uid')
    .set({
      classIds: ['class-python1'],
    })

  console.log(`Seeding mock application for instructor-rejected-uid...`)
  const appInstructorRejected = {
    ...appInstructorDemo,
    personal: {
      ...appInstructorDemo.personal,
      email: 'instructor-rejected@gbstem.org',
      firstName: 'Rejected',
      lastName: 'Instructor',
    },
    meta: {
      uid: 'instructor-rejected-uid',
      interview: true,
      submitted: true,
      decided: true,
    },
  }
  validateApplication(appInstructorRejected, 'instructor-rejected-uid')
  await db
    .collection(applicationsCollection)
    .doc('instructor-rejected-uid')
    .set(appInstructorRejected)

  console.log(`Seeding mock decision for instructor-rejected-uid...`)
  await db.collection(decisionsCollection).doc('instructor-rejected-uid').set({
    type: 'rejected',
    notes: 'We are unable to offer you a position.',
  })

  console.log(`Seeding mock application for instructor-interview-uid...`)
  const appInstructorInterview = {
    ...appInstructorDemo,
    personal: {
      ...appInstructorDemo.personal,
      email: 'instructor-interview@gbstem.org',
      firstName: 'Interview',
      lastName: 'Instructor',
    },
    meta: {
      uid: 'instructor-interview-uid',
      interview: true,
      submitted: true,
      decided: true,
    },
  }
  validateApplication(appInstructorInterview, 'instructor-interview-uid')
  await db
    .collection(applicationsCollection)
    .doc('instructor-interview-uid')
    .set(appInstructorInterview)

  console.log(`Seeding mock decision for instructor-interview-uid...`)
  await db.collection(decisionsCollection).doc('instructor-interview-uid').set({
    type: 'interview',
    notes: 'Please schedule your interview.',
  })

  // Interviewed and accepted, but not assigned to own a class - the positive
  // fixture for co-instructor uid resolution (portal's e2e tests cc this
  // account onto a class it doesn't own; see instructorDirectory.ts).
  console.log(`Seeding mock application for instructor-cohost-uid...`)
  const appInstructorCohost = {
    ...appInstructorDemo,
    personal: {
      ...appInstructorDemo.personal,
      email: 'cohost@gbstem.org',
      firstName: 'Cohost',
      lastName: 'Instructor',
    },
    meta: {
      uid: 'instructor-cohost-uid',
      interview: true,
      submitted: true,
      decided: true,
    },
  }
  validateApplication(appInstructorCohost, 'instructor-cohost-uid')
  await db
    .collection(applicationsCollection)
    .doc('instructor-cohost-uid')
    .set(appInstructorCohost)

  console.log(`Seeding mock decision for instructor-cohost-uid...`)
  await db.collection(decisionsCollection).doc('instructor-cohost-uid').set({
    type: 'accepted',
    likelyDecision: 'likely yes',
    course: 'Python 1',
    time: 'Monday/Wednesday 16:00',
    notes: 'Welcome to the team!',
  })

  // Interviewed, and accepted as a *substitute* rather than to teach a class
  // of their own. That decision gives a different dashboard - the "Substitute
  // Classes" card, with no class schedule and no sub requests of their own -
  // which nothing could exercise while every seeded instructor was either
  // accepted, rejected or still awaiting an interview. See portal's
  // substitute.cy.ts.
  console.log(`Seeding mock application for instructor-substitute-uid...`)
  const appInstructorSubstitute = {
    ...appInstructorDemo,
    personal: {
      ...appInstructorDemo.personal,
      email: 'substitute@gbstem.org',
      firstName: 'Substitute',
      lastName: 'Instructor',
    },
    meta: {
      uid: 'instructor-substitute-uid',
      interview: true,
      submitted: true,
      decided: true,
    },
  }
  validateApplication(appInstructorSubstitute, 'instructor-substitute-uid')
  await db
    .collection(applicationsCollection)
    .doc('instructor-substitute-uid')
    .set(appInstructorSubstitute)

  console.log(`Seeding mock decision for instructor-substitute-uid...`)
  await db
    .collection(decisionsCollection)
    .doc('instructor-substitute-uid')
    .set({
      type: 'substitute',
      likelyDecision: 'likely yes',
      course: 'Python 1',
      time: 'Flexible',
      notes: 'Welcome! We will send substitute openings your way.',
    })

  // Seeding 30 applications
  console.log('Seeding 30 additional mock applications...')
  for (let i = 0; i < 30; i++) {
    const id = `app-fake-${i}`
    const submitted = i % 3 !== 0 // 20 submitted, 10 incomplete
    const inPerson = i % 5 === 0 // 6 inPerson
    const isDecided = i % 6 === 0 // 5 decided

    const createdDate = new Date(Date.now() - (30 - i) * 60 * 60 * 1000)

    const appData: any = {
      personal: {
        email: `applicant-${i}@gmail.com`,
        firstName: firstNames[i % firstNames.length],
        lastName: lastNames[i % lastNames.length],
        dateOfBirth: '2008-01-01',
        gender: i % 2 === 0 ? 'Male' : 'Female',
        race: ['White'],
        phoneNumber: `555-${String(i).padStart(4, '0')}`,
      },
      academic: {
        school: schools[i % schools.length],
        graduationYear: 2028,
      },
      program: {
        courses: [courses[i % courses.length]],
        preferences: 'None',
        numClasses: '1',
        timeSlots: 'Monday/Wednesday',
        notAvailable: 'None',
        inPerson: inPerson,
        reason: 'Wants to teach.',
      },
      essay: {
        taughtBefore: i % 2 === 0,
        academicBackground: 'Taken CS classes.',
        teachingScenario: 'Scenario detail.',
        why: 'Why detail.',
      },
      agreements: {
        entireProgram: true,
        timeCommitment: true,
        submitting: true,
      },
      meta: {
        uid: `user-fake-app-${i}`,
        interview: true,
        submitted: submitted,
        decided: isDecided,
      },
      timestamps: {
        created: admin.firestore.Timestamp.fromDate(createdDate),
        updated: admin.firestore.Timestamp.fromDate(createdDate),
      },
    }

    validateApplication(appData, id)
    await db.collection(applicationsCollection).doc(id).set(appData)

    if (isDecided) {
      await db
        .collection(decisionsCollection)
        .doc(id)
        .set({
          type: i % 12 === 0 ? 'accepted' : 'waitlisted',
          likelyDecision: i % 12 === 0 ? 'likely yes' : 'likely waitlist',
          course: courses[i % courses.length],
          time: 'Monday/Wednesday 16:00',
          notes: 'Feedback decision notes.',
        })
    }
  }

  // Seeding 30 classes
  console.log('Seeding 30 additional mock classes...')
  for (let i = 0; i < 30; i++) {
    const id = `class-fake-${i}`
    const course = courses[i % courses.length]

    let meetingTimes = [
      admin.firestore.Timestamp.fromDate(new Date('2026-03-02T16:00:00Z')),
      admin.firestore.Timestamp.fromDate(new Date('2026-03-04T16:00:00Z')),
    ]
    let classStatuses = ['scheduled', 'scheduled']

    if (i === 0) {
      meetingTimes = [
        admin.firestore.Timestamp.fromDate(new Date()),
        admin.firestore.Timestamp.fromDate(
          new Date(
            new Date(semesterDates.classesStart).getTime() +
              7 * 24 * 60 * 60 * 1000,
          ),
        ),
      ]
      classStatuses = ['ClassNotHeld', 'ClassInFuture']
    } else if (i === 1) {
      meetingTimes = [
        admin.firestore.Timestamp.fromDate(new Date()),
        admin.firestore.Timestamp.fromDate(
          new Date(
            new Date(semesterDates.classesStart).getTime() +
              7 * 24 * 60 * 60 * 1000,
          ),
        ),
      ]
      classStatuses = ['EverythingComplete', 'ClassInFuture']
    }

    const classData = {
      classCap: 15,
      classDay1: 'Monday',
      classDay2: 'Wednesday',
      classTime1: '16:00',
      classTime2: '16:00',
      course: course,
      instructorEmail: `instructor-fake-${i}@gbstem.org`,
      // No Auth account backs these, so the server's uid lookup falls back to
      // the address above - which is the point: it exercises the
      // `[legacy-email-fallback]` path the Phase 4 gate watches.
      instructorUid: `instructor-fake-${i}`,
      instructorFirstName: firstNames[i % firstNames.length],
      instructorLastName: lastNames[i % lastNames.length],
      meetingLink: 'https://zoom.us/j/123456789',
      meetingTimes: meetingTimes,
      completedClassDates: [],
      classStatuses: classStatuses,
      feedbackCompleted: [false, false],
      online: true,
      students: [`student-fake-${i}`],
    }

    validateClass(classData, id)
    await db.collection(classesCollection).doc(id).set(classData)
  }

  // Seeding 30 tokens
  console.log('Seeding 30 additional mock tokens...')
  for (let i = 0; i < 30; i++) {
    const id = `token-fake-${i}`
    const role = i % 2 === 0 ? 'admin' : 'reviewer'
    const tokenData = {
      consumable: i % 3 === 0,
      consumers: [],
      expires: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
      ),
      role: role,
    }
    validateToken(tokenData, id)
    await db.collection('tokens').doc(id).set(tokenData)
  }

  // Create Mock Sub-Requests (30 records)
  console.log(`Seeding 30 mock sub-requests in "${subRequestsCollection}"...`)
  for (let i = 0; i < 30; i++) {
    const id = `sub-req-fake-${i}`
    const status = i % 3 === 0 ? 'open' : i % 3 === 1 ? 'accepted' : 'completed'
    await db
      .collection(subRequestsCollection)
      .doc(id)
      .set({
        classNumber: (i % 4) + 1,
        course: courses[i % courses.length],
        dateOfClass: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000),
        ),
        originalInstructorEmail: `instructor-fake-${i}@gbstem.org`,
        subInstructorId: i % 3 !== 0 ? `sub-inst-id-${i}` : '',
        subInstructorFirstName:
          i % 3 !== 0 ? firstNames[(i + 2) % firstNames.length] : '',
        subInstructorEmail: i % 3 !== 0 ? `sub-${i}@gbstem.org` : '',
        subRequestStatus: status,
        link: 'https://zoom.us/j/123456789',
        notes: `Dentist appointment fake #${i}.`,
      })
  }

  // Create Mock Interview Slots
  console.log(
    `Seeding mock interview slots in "${interviewTimesCollection}"...`,
  )
  const dynamicFutureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  await db
    .collection(interviewTimesCollection)
    .doc('slot-1')
    .set({
      date: admin.firestore.Timestamp.fromDate(dynamicFutureDate),
      id: 'slot-1',
      interviewerName: 'Demo Admin',
      intervieweeFirstName: 'David',
      intervieweeLastName: 'Miller',
      intervieweeEmail: 'applicant1@gmail.com',
      intervieweeId: 'user_app1',
      interviewerEmail: 'demo@gbstem.org',
      // Keyed primarily by uid. Stored email is unreliable because the interviewer
      // could change it later, so code should avoid using it; it is retained as a
      // permanent record if an account is deleted, though fallback is rare.
      interviewerUid: adminUser.uid,
      interviewSlotStatus: 'available',
      meetingLink: 'https://zoom.us/j/555555555',
    })

  // Create Announcements (30 records)
  console.log('Seeding 30 mock announcements...')
  for (let i = 0; i < 30; i++) {
    await db.collection('announcements').add({
      title: `Welcome to gbSTEM ${currentSemesterName}! (Update #${i})`,
      content: `Our semester begins soon. Make sure to verify your schedules and log in. Announcement #${i}.`,
      timestamp: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000),
      ),
    })
  }

  // Create Mock Student Feedback (30 records)
  console.log(
    `Seeding 30 mock student feedback in "${classFeedbackCollection}"...`,
  )
  for (let i = 0; i < 30; i++) {
    await db
      .collection(classFeedbackCollection)
      .doc(`feedback-fake-${i}`)
      .set({
        instructor: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
        date: `2026-03-${10 + (i % 20)}`,
        feedback: `The class was very fun and I learned Python! (#${i})`,
        studentName: `${firstNames[(i + 1) % firstNames.length]} ${lastNames[(i + 1) % lastNames.length]}`,
        course: courses[i % courses.length],
        rating: (i % 5) + 1,
      })
  }

  // Create Mock Instructor Feedback (30 records)
  console.log(
    `Seeding 30 mock instructor feedback in "${instructorFeedbackCollection}"...`,
  )
  for (let i = 0; i < 30; i++) {
    await db
      .collection(instructorFeedbackCollection)
      .doc(`instructor-feedback-fake-${i}`)
      .set({
        instructorName: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
        courseName: courses[i % courses.length],
        students: [`Student A #${i}`, `Student B #${i}`],
        feedback: `Both students participated actively today. Class #${i}.`,
        date: `2026-03-${10 + (i % 20)}`,
        attendanceList: [{ present: true }, { present: i % 3 !== 0 }],
        classNumber: (i % 4) + 1,
      })
  }

  console.log('\nSeeding completed successfully!')
  console.log('--------------------------------------------------')
  console.log('Seeded Users (Password: penguin):')
  console.log('- Admin:      demo@gbstem.org')
  console.log('- Reviewer:   reviewer@gbstem.org')
  console.log('- Instructor: instructor@gbstem.org')
  console.log('- Student:    student@gbstem.org')
  console.log('Sign-up Token:  demo-admin-token')
  console.log('--------------------------------------------------')
}
