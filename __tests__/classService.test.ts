import { classService } from '$lib/services/classService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
}))

describe('admin classService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchClassData', () => {
    it('fetches and formats class data from Firestore', async () => {
      const mockData = {
        course: 'Python 1',
        meetingTimes: [{ seconds: 1779900600 }],
        students: ['s1'],
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData,
      })

      const res = await classService.fetchClassData('c1')
      expect(res).not.toBeNull()
      expect(res?.course).toBe('Python 1')
    })

    it('returns null if class does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const res = await classService.fetchClassData('c1')
      expect(res).toBeNull()
    })

    it('defaults meetingTimes to an empty array when absent', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ course: 'Python 1' }),
      })

      const res = await classService.fetchClassData('c1')
      expect(res?.meetingTimes).toEqual([])
    })
  })

  describe('refreshClassStatuses', () => {
    it('asks /api/classStatuses for the class and returns its statuses', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ classStatuses: ['ClassNotHeld'] }),
      })

      await expect(classService.refreshClassStatuses('c1')).resolves.toEqual([
        'ClassNotHeld',
      ])

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/classStatuses')
      expect(init.method).toBe('POST')
      // Only the class is named: the statuses are the server's to work out.
      expect(JSON.parse(init.body)).toEqual({ classId: 'c1' })
    })

    it("throws the server's message when the refresh is refused", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'Class not found.' }),
      })

      await expect(classService.refreshClassStatuses('c1')).rejects.toThrow(
        'Class not found.',
      )
    })
  })

  describe('fetchStudentList', () => {
    it('fetches student details for array of student UIDs', async () => {
      const mockStudent = {
        personal: {
          studentFirstName: 'alice',
          studentLastName: 'smith',
          email: 'alice@example.com',
        },
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockStudent,
      })

      const list = await classService.fetchStudentList(['s1'])
      expect(list.length).toBe(1)
      expect(list[0].name).toBe('Alice Smith')
    })

    // `email` is the parent account's current address, resolved from the
    // registration id in one request for the whole list - never the address
    // stored on the registration.
    it("fills each student's email from their parent account", async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          personal: {
            studentFirstName: 'alice',
            studentLastName: 'smith',
            email: 'stale@example.com',
          },
        }),
      })
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ emails: { 'parent-uid': 'current@example.com' } }),
      })

      const [student] = await classService.fetchStudentList(['parent-uid-1'])

      expect(student).toMatchObject({
        id: 'parent-uid-1',
        email: 'current@example.com',
      })
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/resolveEmails')
      expect(JSON.parse(init.body)).toEqual({
        intent: 'registrationParents',
        uids: ['parent-uid'],
        context: { registrationIds: ['parent-uid-1'] },
      })
    })

    it('leaves the email empty when the lookup fails', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          personal: { studentFirstName: 'a', email: 'stale@example.com' },
        }),
      })
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })
      jest.spyOn(console, 'error').mockImplementation(() => {})

      const [student] = await classService.fetchStudentList(['parent-uid-1'])

      expect(student.email).toBe('')
    })

    it('skips student UIDs whose document does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const list = await classService.fetchStudentList(['missing'])
      expect(list).toEqual([])
    })

    it('includes academic grade/school when present on the record', async () => {
      const mockStudent = {
        personal: {
          studentFirstName: 'alice',
          studentLastName: 'smith',
          email: 'alice@example.com',
        },
        academic: { grade: '5', school: 'Example Elementary' },
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockStudent,
      })

      const list = await classService.fetchStudentList(['s1'])
      expect(list[0].grade).toBe('5')
      expect(list[0].school).toBe('Example Elementary')
    })
  })

  describe('fetchInstructorFeedback', () => {
    it('returns feedback data when the document exists', async () => {
      const mockFeedback = {
        courseName: 'Python 1',
        instructorName: 'Alice',
        feedback: 'Great class',
        date: '2026-01-01',
        classNumber: 1,
        attendanceList: {},
        id: 'f1',
        students: [],
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockFeedback,
      })

      const res = await classService.fetchInstructorFeedback('f1')
      expect(res).toEqual(mockFeedback)
    })

    it('returns null if the feedback document does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const res = await classService.fetchInstructorFeedback('f1')
      expect(res).toBeNull()
    })

    it('propagates errors from getDoc', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('network error'),
      )

      await expect(classService.fetchInstructorFeedback('f1')).rejects.toThrow(
        'network error',
      )
    })
  })
})
