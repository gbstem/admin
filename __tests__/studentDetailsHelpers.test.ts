import type {} from '../src/data.d.ts'
import {
  formatClassName,
  parseStudentProfileData,
  buildEnrollApiPayload,
  parseAttendanceRecords,
} from '$lib/helpers/studentDetails'
import type ClassData from '$lib/data/types/ClassData'
import type Student from '$lib/data/types/Student'

describe('StudentDetails Helpers', () => {
  describe('formatClassName', () => {
    test('formats human-readable class description string', () => {
      const mockClass: Partial<ClassData> = {
        course: 'Python 1',
        instructorFirstName: 'Jane',
        instructorLastName: 'Doe',
        classTime1: '4:00 PM',
        classDay1: 'Monday',
        classTime2: '4:00 PM',
        classDay2: 'Wednesday',
      }

      const formatted = formatClassName(mockClass as ClassData)
      expect(formatted).toBe(
        'Python 1 taught by Jane Doe at 4:00 PM Monday and 4:00 PM Wednesday',
      )
    })
  })

  describe('parseStudentProfileData', () => {
    test('returns empty student structure when input is null or missing personal field', () => {
      const empty = parseStudentProfileData('parent-uid-1', null)
      expect(empty.id).toBe('parent-uid-1')
      expect(empty.name).toBe('')
      expect(empty.parentName).toBe('')
    })

    test('extracts student and parent details correctly', () => {
      const data = {
        personal: {
          studentFirstName: 'Bobby',
          studentLastName: 'Tables',
          email: 'bobby@example.com',
          secondaryEmail: 'parent@example.com',
          phoneNumber: '555-1234',
          parentFirstName: 'Sarah',
          parentLastName: 'Tables',
        },
        academic: {
          grade: 6,
          school: 'Lincoln Middle',
        },
      }

      const profile = parseStudentProfileData('parent-uid-1', data)
      // The stored address is left out: callers fill `email` with the parent
      // account's current address.
      expect(profile).toEqual({
        id: 'parent-uid-1',
        name: 'Bobby Tables',
        email: '',
        secondaryEmail: 'parent@example.com',
        phone: '555-1234',
        grade: 6,
        school: 'Lincoln Middle',
        parentName: 'Sarah Tables',
      })
    })
  })

  describe('buildEnrollApiPayload', () => {
    test('constructs API payload for student enrollment', () => {
      const student: Student = {
        id: 'parent-uid-1',
        name: 'Bobby Tables',
        email: 'bobby@example.com',
        secondaryEmail: 'parent@example.com',
        phone: '555-1234',
        grade: 6,
        school: 'Lincoln Middle',
        parentName: 'Sarah Tables',
      }

      const classSelected: Partial<ClassData> = {
        instructorFirstName: 'Jane',
        instructorLastName: 'Doe',
        instructorUid: 'inst-123',
        classTime1: '4:00 PM',
        classTime2: '4:00 PM',
        classDay1: 'Monday',
        classDay2: 'Wednesday',
        course: 'Python 1',
        meetingLink: 'https://teams.microsoft.com/...',
        online: true,
      }

      const payload = buildEnrollApiPayload(student, classSelected as ClassData)

      // No addresses: the server resolves the parent account's from the
      // registration id, and the instructor's from instructorUid.
      expect(payload).toEqual({
        registrationId: 'parent-uid-1',
        firstName: 'Sarah',
        instructor: 'Jane Doe',
        instructorUid: 'inst-123',
        classTimes: ['4:00 PM', '4:00 PM'],
        classDays: ['Monday', 'Wednesday'],
        course: 'Python 1',
        meetingLink: 'https://teams.microsoft.com/...',
        online: true,
        studentName: 'Bobby Tables',
      })
    })

    test('sends an empty instructorUid for a class with none, for the server to refuse', () => {
      const student: Student = {
        id: 'parent-uid-1',
        name: 'Bobby Tables',
        email: 'bobby@example.com',
        secondaryEmail: '',
        phone: '555-1234',
        grade: 6,
        school: 'Lincoln Middle',
        parentName: 'Sarah Tables',
      }

      const classSelected: Partial<ClassData> = {
        instructorFirstName: 'Jane',
        instructorLastName: 'Doe',
        instructorUid: '',
        classTime1: '4:00 PM',
        classTime2: '4:00 PM',
        classDay1: 'Monday',
        classDay2: 'Wednesday',
        course: 'Python 1',
        meetingLink: '',
        online: true,
      }

      const payload = buildEnrollApiPayload(student, classSelected as ClassData)
      expect(payload.instructorUid).toBe('')
      expect(payload).not.toHaveProperty('instructorEmail')
    })
  })

  describe('parseAttendanceRecords', () => {
    test('sorts feedback records chronologically by classNumber', () => {
      const rawDocs = [
        {
          id: 'feedback-2',
          data: () => ({
            courseName: 'Python 1',
            classNumber: 2,
            instructorName: 'Jane',
          }),
        },
        {
          id: 'feedback-1',
          data: () => ({
            courseName: 'Python 1',
            classNumber: 1,
            instructorName: 'Jane',
          }),
        },
      ]

      const sorted = parseAttendanceRecords(rawDocs)
      expect(sorted[0].classNumber).toBe(1)
      expect(sorted[1].classNumber).toBe(2)
    })
  })
})
