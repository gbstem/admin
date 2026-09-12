import { db } from '$lib/client/firebase'
import {
  checkInsCollection,
  classesCollection,
  instructorFeedbackCollection,
  registrationsCollection,
} from '$lib/data/collections'
import { retreatMealSchedule } from '$lib/data/retreatMealSchedule'
import type ClassData from '$lib/data/types/ClassData'
import type Student from '$lib/data/types/Student'
import {
  buildEnrollApiPayload,
  parseAttendanceRecords,
  parseStudentProfileData,
} from '$lib/helpers/studentDetails'
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { cloneDeep } from 'lodash-es'

/**
 * Service providing Data Access Layer for student details, class enrollment, and attendance.
 */
export const studentService = {
  /**
   * Fetches full student details including check-in status, classes, and attendance.
   */
  async fetchStudentFullDetails(studentId: string) {
    // Start fetching everything in parallel to optimize load times and prevent timeout
    const studentDocRef = doc(db, registrationsCollection, studentId)
    const studentPromise = getDoc(studentDocRef)
    const checkInPromise = getDoc(doc(db, checkInsCollection, studentId)).catch(
      (err) => {
        console.warn(
          'Failed to fetch check-in details (possible permission issue):',
          err,
        )
        return null
      },
    )
    const classesPromise = getDocs(query(collection(db, classesCollection)))
    const attendancePromise = getDocs(
      query(collection(db, instructorFeedbackCollection)),
    ).catch((err) => {
      console.warn(
        'Failed to fetch feedback details (possible permission issue):',
        err,
      )
      return null
    })

    // Wait for the primary student data first
    const studentDoc = await studentPromise
    let studentData: Student | null = null

    if (studentDoc.exists()) {
      const data = studentDoc.data()
      if (data) {
        studentData = parseStudentProfileData(data)
      }
    }

    // Wait for all other parallel promises
    const [checkInDoc, classesSnap, attendanceSnap] = await Promise.all([
      checkInPromise,
      classesPromise,
      attendancePromise,
    ])

    // Process check-in details
    let checkedIn = false
    let checkedInAt: Date | null = null
    let food: Record<string, Record<string, boolean>> = {}

    if (checkInDoc && checkInDoc.exists()) {
      const checkInData = checkInDoc.data()
      if (checkInData) {
        checkedIn = checkInData.checkedIn
        checkedInAt = checkInData.checkedInAt?.toDate
          ? checkInData.checkedInAt.toDate()
          : checkInData.checkedInAt
        food = checkInData.food || {}
      }
    }

    // Process classes
    const enrolledClasses: ClassData[] = []
    const unenrolledClasses: ClassData[] = []

    if (classesSnap) {
      classesSnap.forEach((docSnap) => {
        const data = docSnap.data() as ClassData
        if (data) {
          data.id = docSnap.id
          if (data.students?.includes(studentId)) {
            enrolledClasses.push(data)
          } else {
            unenrolledClasses.push(data)
          }
        }
      })
    }

    // Process attendance
    const attendance = attendanceSnap
      ? parseAttendanceRecords(attendanceSnap.docs)
      : []

    return {
      studentData,
      studentID: studentDoc.id,
      checkedIn,
      checkedInAt,
      food,
      enrolledClasses,
      unenrolledClasses,
      attendance,
    }
  },

  /**
   * Fetches student profile details from registrationsCollection.
   */
  async fetchStudentProfile(studentId: string): Promise<Student | null> {
    const docRef = doc(db, registrationsCollection, studentId)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return parseStudentProfileData(snap.data())
    }
    return null
  },

  /**
   * Fetches all classes and builds a mapping from student UID to array of enrolled course names.
   */
  async fetchStudentCoursesMap(): Promise<Map<string, string[]>> {
    const q = query(collection(db, classesCollection))
    const snapshot = await getDocs(q)
    const map = new Map<string, string[]>()
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as ClassData
      const course = data.course
      const students: string[] = data.students || []
      for (const studentId of students) {
        if (!map.has(studentId)) map.set(studentId, [])
        map.get(studentId)!.push(course)
      }
    }
    return map
  },

  /**
   * Fetches all class offerings.
   */
  async fetchAllClasses(): Promise<{
    classes: ClassData[]
    nameToUid: Record<string, string>
  }> {
    const q = query(collection(db, classesCollection))
    const querySnapshot = await getDocs(q)
    const classes: ClassData[] = []
    const nameToUid: Record<string, string> = {}

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as ClassData
      classes.push(data)
      nameToUid[
        `${data.course} (${data.instructorFirstName} ${data.instructorLastName})`
      ] = docSnap.id
    })

    return { classes, nameToUid }
  },

  /**
   * Enrolls a student into a class, then sends the enrollment email.
   *
   * The class's `students` and the registration's `classes` have to agree -
   * the roster, capacity and reminders read one side, the family's view reads
   * the other - so both are written in one batch. They used to be two
   * sequential updates, and a failure between them (a reviewer, say, who may
   * write classes but not registrations) left the student on one and not the
   * other. Portal's /api/enroll keeps the same pair in a transaction.
   */
  async enrollStudent(
    studentData: Student,
    selectedClass: ClassData,
    studentId: string,
  ): Promise<void> {
    const batch = writeBatch(db)
    batch.update(doc(db, classesCollection, selectedClass.id), {
      students: arrayUnion(studentId),
    })
    batch.update(doc(db, registrationsCollection, studentId), {
      classes: arrayUnion(selectedClass.id),
      enrolled: true,
    })
    await batch.commit()

    const payload = buildEnrollApiPayload(studentData, selectedClass)
    const res = await fetch('/api/enroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error('Failed to send enrollment email notification')
    }
  },

  /**
   * Drops a student from a class: off the class's `students`, and the class
   * off their registration, with `enrolled` saying whether any class is left.
   *
   * One transaction, because `enrolled` is computed from the registration as
   * it stands. This used to be three writes and a read between them, so a
   * concurrent enrollment could land after the read and leave `enrolled`
   * false on a student who is in a class.
   */
  async dropStudentFromClass(
    classId: string,
    studentId: string,
  ): Promise<void> {
    const classDocRef = doc(db, classesCollection, classId)
    const registrationDocRef = doc(db, registrationsCollection, studentId)
    await runTransaction(db, async (transaction) => {
      const registrationSnap = await transaction.get(registrationDocRef)
      const remainingClasses = (
        (registrationSnap.data()?.classes ?? []) as string[]
      ).filter((id) => id !== classId)
      transaction.update(classDocRef, { students: arrayRemove(studentId) })
      transaction.update(registrationDocRef, {
        classes: remainingClasses,
        enrolled: remainingClasses.length > 0,
      })
    })
  },

  /**
   * Marks a student as checked-in in the `checkIns` collection.
   */
  async checkInStudent(studentId: string, now: Date): Promise<void> {
    const checkInRef = doc(db, checkInsCollection, studentId)
    await setDoc(
      checkInRef,
      {
        checkedIn: true,
        checkedInAt: now,
        food: cloneDeep(retreatMealSchedule),
      },
      { merge: true },
    )
  },

  /**
   * Updates meal preferences in the `checkIns` collection.
   */
  async updateStudentMeal(
    studentId: string,
    date: string,
    meal: string,
    newState: boolean,
  ): Promise<void> {
    const checkInRef = doc(db, checkInsCollection, studentId)
    await updateDoc(checkInRef, {
      [`food.${date}.${meal}`]: newState,
    })
  },
}
