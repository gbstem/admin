import type {} from '../../data.d.ts'
import type ClassData from '$lib/data/types/ClassData'
import type Student from '$lib/data/types/Student'
import type { EnrollRequestBody } from '../../routes/api/enroll/+server'

/**
 * Formats a human-readable display string for a class option.
 */
export function formatClassName(data: ClassData): string {
  return `${data.course} taught by ${data.instructorFirstName} ${data.instructorLastName} at ${data.classTime1} ${data.classDay1} and ${data.classTime2} ${data.classDay2}`.trim()
}

/**
 * Normalizes raw registration document data from Firestore into a Student
 * profile object. `email` is left empty: the caller fills it with the parent
 * account's current address, because the one stored on the registration is
 * only an audit record.
 */
export function parseStudentProfileData(id: string, data: any): Student {
  if (!data || !data.personal) {
    return {
      id,
      name: '',
      email: '',
      secondaryEmail: '',
      phone: '',
      grade: 0,
      school: '',
      parentName: '',
    }
  }

  return {
    id,
    name: `${data.personal.studentFirstName ?? ''} ${data.personal.studentLastName ?? ''}`.trim(),
    email: '',
    secondaryEmail: data.personal.secondaryEmail ?? '',
    phone: data.personal.phoneNumber ?? '',
    grade: data.academic?.grade ?? 0,
    school: data.academic?.school ?? '',
    parentName:
      `${data.personal.parentFirstName ?? ''} ${data.personal.parentLastName ?? ''}`.trim(),
  }
}

/**
 * Constructs request payload for /api/enroll endpoint.
 */
export function buildEnrollApiPayload(
  studentData: Student,
  classSelected: ClassData,
): EnrollRequestBody {
  const parentFirstName = (studentData.parentName || '').split(' ')[0]
  return {
    // The registration, not an address: the server mails the parent account
    // behind it at that account's current address.
    registrationId: studentData.id,
    firstName: parentFirstName,
    instructor: `${classSelected.instructorFirstName} ${classSelected.instructorLastName}`,
    // The uid only: the server resolves the instructor's current address from
    // Auth.
    instructorUid: classSelected.instructorUid,
    classTimes: [classSelected.classTime1, classSelected.classTime2],
    classDays: [classSelected.classDay1, classSelected.classDay2],
    course: classSelected.course,
    meetingLink: classSelected.meetingLink,
    online: classSelected.online,
    studentName: studentData.name,
  }
}

/**
 * Normalizes and sorts instructor feedback documents by class number.
 */
export function parseAttendanceRecords(
  docs: any[],
): ClientInstructorFeedback[] {
  const attendance: ClientInstructorFeedback[] = []
  docs.forEach((doc) => {
    const data = typeof doc.data === 'function' ? doc.data() : doc
    if (data) {
      attendance.push({
        courseName: data.courseName ?? '',
        date: data.date ?? '',
        attendanceList: data.attendanceList ?? {},
        feedback: data.feedback ?? '',
        id: doc.id ?? data.id ?? '',
        classNumber: data.classNumber ?? 0,
        instructorName: data.instructorName ?? '',
        students: data.students ?? [],
      })
    }
  })
  return attendance.sort((a, b) => a.classNumber - b.classNumber)
}
