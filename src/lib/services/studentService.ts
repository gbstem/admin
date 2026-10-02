import { errorMessage } from '$lib/shared/apiErrors'
import { toDateOrNull } from '$lib/shared/timestamps'
import { db } from '$lib/client/firebase'
import {
  checkInsCollection,
  classesCollection,
  instructorFeedbackCollection,
  registrationsCollection,
} from '$lib/data/collections'
import type ClassData from '$lib/data/types/ClassData'
import type Student from '$lib/data/types/Student'
import type {
  EnrollRequestBody,
  EnrollResponse,
} from '../../routes/api/enroll/+server'
import type {
  CheckInRequestBody,
  CheckInResponse,
  MealRequestBody,
} from '../../routes/api/checkIn/+server'
import {
  parseAttendanceRecords,
  parseStudentProfileData,
} from '$lib/helpers/studentDetails'
import { registrationParentUid } from '$lib/data/docIds'
import { accountEmailService } from '$lib/services/accountEmailService'
import { collection, doc, getDoc, getDocs, query } from 'firebase/firestore'

/**
 * Service providing Data Access Layer for student details, class enrollment, and attendance.
 */
export const studentService = {
  /**
   * The current address of the parent account behind each registration,
   * keyed by registration id. A registration whose parent account is gone is
   * absent.
   */
  fetchParentEmails(
    registrationIds: string[],
    semesterId?: string,
  ): Promise<Record<string, string>> {
    return accountEmailService.resolveEmailsByDocument(
      registrationIds.map((id) => ({ id, uid: registrationParentUid(id) })),
      ({ ids, uids }) => ({
        intent: 'registrationParents',
        uids,
        context: { registrationIds: ids, semesterId },
      }),
    )
  },

  /**
   * The current address of a class's instructor, for StudentDetails'
   * Instructor Email column. Null if the uid names no account. Throws if the
   * request fails, or is refused because the uid isn't one of the class's
   * instructors.
   */
  async fetchClassInstructorEmail(
    classId: string,
    instructorUid: string,
  ): Promise<string | null> {
    const emails = await accountEmailService.resolveEmails({
      intent: 'classInstructors',
      uids: [instructorUid],
      context: { classId },
    })
    return emails[instructorUid] ?? null
  },

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
        studentData = parseStudentProfileData(studentId, data)
        studentData.email = await studentService
          .fetchParentEmails([studentId])
          .then((emails) => emails[studentId] ?? '')
          .catch((err) => {
            console.error(
              `Could not resolve the parent address for ${studentId}:`,
              err,
            )
            return ''
          })
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
        checkedInAt = toDateOrNull(checkInData.checkedInAt)
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
   * Enrolls a student in a class through `/api/enroll`, which writes the
   * class's roster and the registration's class list together and then
   * emails the family. Resolves to whether that email went out; throws if
   * the enrollment itself was refused.
   */
  async enrollStudent(
    classId: string,
    registrationId: string,
  ): Promise<EnrollResponse> {
    const res = await fetch('/api/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId,
        registrationId,
      } satisfies EnrollRequestBody),
    })
    if (!res.ok) {
      throw new Error(await errorMessage(res))
    }
    return res.json()
  },

  /**
   * Drops a student from a class through `/api/enroll`, off both the class's
   * roster and the registration's class list.
   */
  async dropStudentFromClass(
    classId: string,
    registrationId: string,
  ): Promise<void> {
    const res = await fetch('/api/enroll', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId,
        registrationId,
      } satisfies EnrollRequestBody),
    })
    if (!res.ok) {
      throw new Error(await errorMessage(res))
    }
  },

  /**
   * Checks a student in through `/api/checkIn`, and resolves to the check-in
   * as stored: when (the server's clock) and the meals to track. A student
   * already checked in keeps their original time and meals.
   */
  async checkInStudent(
    studentId: string,
  ): Promise<{ checkedInAt: Date; food: CheckInResponse['food'] }> {
    const res = await fetch('/api/checkIn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId: studentId,
      } satisfies CheckInRequestBody),
    })
    if (!res.ok) {
      throw new Error(await errorMessage(res))
    }
    const { checkedInAt, food }: CheckInResponse = await res.json()
    return { checkedInAt: new Date(checkedInAt), food }
  },

  /**
   * Records, through `/api/checkIn`, whether a checked-in student has been
   * served a meal.
   */
  async updateStudentMeal(
    studentId: string,
    date: string,
    meal: string,
    newState: boolean,
  ): Promise<void> {
    const res = await fetch('/api/checkIn', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId: studentId,
        date,
        meal,
        served: newState,
      } satisfies MealRequestBody),
    })
    if (!res.ok) {
      throw new Error(await errorMessage(res))
    }
  },
}
