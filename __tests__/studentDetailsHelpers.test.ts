import type {} from '../src/data.d.ts'
import {
  formatClassName,
  parseStudentProfileData,
  parseAttendanceRecords,
} from '$lib/helpers/studentDetails'
import type ClassData from '$lib/data/types/ClassData'

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
