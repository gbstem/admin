import { retreatMealSchedule } from '$lib/data/retreatMealSchedule'
import type ClassData from '$lib/data/types/ClassData'
import type Student from '$lib/data/types/Student'
import { studentService } from '$lib/services/studentService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

const mockBatch = { update: jest.fn(), commit: jest.fn() }

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  runTransaction: jest.fn(),
  writeBatch: jest.fn(() => mockBatch),
  arrayUnion: jest.fn((val) => val),
  arrayRemove: jest.fn((val) => val),
}))

function mockQuerySnapshot(docs: any[]) {
  return { docs, forEach: (cb: any) => docs.forEach(cb) }
}

describe('studentService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // clearAllMocks() only clears call history, not queued
    // mockResolvedValueOnce/mockReturnValueOnce implementations - reset these
    // explicitly so an unconsumed queued value from one test can't leak into
    // the next (arrayUnion/arrayRemove are stable passthroughs and don't
    // need resetting).
    ;(firestore.getDoc as jest.Mock).mockReset()
    ;(firestore.getDocs as jest.Mock).mockReset()
    ;(firestore.setDoc as jest.Mock).mockReset()
    ;(firestore.updateDoc as jest.Mock).mockReset()
    ;(firestore.runTransaction as jest.Mock).mockReset()
    mockBatch.update.mockReset()
    mockBatch.commit.mockReset().mockResolvedValue(undefined)
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchStudentFullDetails', () => {
    interface BaseMocksOptions {
      studentExists?: boolean
      studentData?: any
      checkInResult?: { exists: () => boolean; data?: () => any }
      classesDocs?: any[]
      attendanceResult?: { docs: any[]; forEach: (cb: any) => void }
    }

    function baseMocks({
      studentExists = true,
      studentData = {
        personal: { studentFirstName: 'Bobby', studentLastName: 'Tables' },
        meta: { uid: 'uid-1' },
      },
      checkInResult = {
        exists: () => true,
        data: () => ({
          checkedIn: true,
          checkedInAt: { toDate: () => new Date('2026-01-01') },
          food: { '2026-01-01': { dinner: true } },
        }),
      },
      classesDocs = [],
      attendanceResult = mockQuerySnapshot([]),
    }: BaseMocksOptions = {}) {
      // getDoc is called for student, then check-in - queue each call's
      // return value in that order.
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => studentExists,
          id: 'student-1',
          data: () => studentData,
        })
        .mockResolvedValueOnce(checkInResult)
      ;(firestore.getDocs as jest.Mock)
        .mockResolvedValueOnce(mockQuerySnapshot(classesDocs))
        .mockResolvedValueOnce(attendanceResult)
    }

    it('assembles full details when everything succeeds', async () => {
      baseMocks({
        classesDocs: [
          {
            id: 'class-1',
            data: () => ({ course: 'Python 1', students: ['student-1'] }),
          },
          {
            id: 'class-2',
            data: () => ({ course: 'Python 2', students: [] }),
          },
        ],
        attendanceResult: mockQuerySnapshot([
          { id: 'fb-1', data: () => ({ courseName: 'Python 1' }) },
        ]),
      })

      const res = await studentService.fetchStudentFullDetails('student-1')

      expect(res.studentData?.name).toBe('Bobby Tables')
      expect(res.checkedIn).toBe(true)
      expect(res.checkedInAt).toEqual(new Date('2026-01-01'))
      expect(res.food).toEqual({ '2026-01-01': { dinner: true } })
      expect(res.enrolledClasses).toHaveLength(1)
      expect(res.enrolledClasses[0].id).toBe('class-1')
      expect(res.unenrolledClasses).toHaveLength(1)
      expect(res.attendance).toHaveLength(1)
    })

    it('returns null studentData when the student document does not exist', async () => {
      baseMocks({ studentExists: false })

      const res = await studentService.fetchStudentFullDetails('student-1')

      expect(res.studentData).toBeNull()
      expect(firestore.getDoc).toHaveBeenCalledTimes(2)
    })

    it('treats a checkedInAt without toDate() as already a plain value', async () => {
      baseMocks({
        checkInResult: {
          exists: () => true,
          data: () => ({
            checkedIn: true,
            checkedInAt: '2026-01-01',
            food: undefined,
          }),
        },
      })

      const res = await studentService.fetchStudentFullDetails('student-1')

      expect(res.checkedInAt).toBe('2026-01-01')
      expect(res.food).toEqual({})
    })

    it('defaults checkedIn to false when the check-in doc does not exist', async () => {
      baseMocks({
        checkInResult: { exists: () => false },
      })

      const res = await studentService.fetchStudentFullDetails('student-1')

      expect(res.checkedIn).toBe(false)
      expect(res.food).toEqual({})
    })

    it('swallows check-in fetch failures (permission issues) and continues with defaults', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          id: 'student-1',
          data: () => ({ personal: {}, meta: {} }),
        })
        .mockRejectedValueOnce(new Error('permission-denied'))
      ;(firestore.getDocs as jest.Mock)
        .mockResolvedValueOnce(mockQuerySnapshot([]))
        .mockResolvedValueOnce(mockQuerySnapshot([]))
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const res = await studentService.fetchStudentFullDetails('student-1')

      expect(res.checkedIn).toBe(false)
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to fetch check-in details (possible permission issue):',
        expect.any(Error),
      )
      warnSpy.mockRestore()
    })

    it('swallows attendance/feedback fetch failures (permission issues) and returns empty attendance', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          id: 'student-1',
          data: () => ({ personal: {}, meta: {} }),
        })
        .mockResolvedValueOnce({ exists: () => false })
      ;(firestore.getDocs as jest.Mock)
        .mockResolvedValueOnce(mockQuerySnapshot([]))
        .mockRejectedValueOnce(new Error('permission-denied'))
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const res = await studentService.fetchStudentFullDetails('student-1')

      expect(res.attendance).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to fetch feedback details (possible permission issue):',
        expect.any(Error),
      )
      warnSpy.mockRestore()
    })

    it('propagates a hard failure fetching classes (not caught, unlike check-in/attendance)', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          id: 'student-1',
          data: () => ({ personal: {}, meta: {} }),
        })
        .mockResolvedValueOnce({ exists: () => false })
      // Deferred by a couple of microtask ticks so the rejection fires after
      // fetchStudentFullDetails's Promise.all has already subscribed to this
      // promise - an eagerly-rejected promise here would trip Node's
      // unhandled-rejection guard before Promise.all attaches its handler,
      // since classesPromise (unlike check-in/attendance) has no inline .catch.
      ;(firestore.getDocs as jest.Mock)
        .mockReturnValueOnce(
          Promise.resolve()
            .then(() => Promise.resolve())
            .then(() => {
              throw new Error('classes query failed')
            }),
        )
        .mockResolvedValueOnce(mockQuerySnapshot([]))

      await expect(
        studentService.fetchStudentFullDetails('student-1'),
      ).rejects.toThrow('classes query failed')
    })
  })

  describe('fetchStudentProfile', () => {
    it('returns student profile if record exists', async () => {
      const mockData = {
        personal: {
          studentFirstName: 'Bobby',
          studentLastName: 'Tables',
          email: 'bobby@example.com',
        },
        academic: { grade: 6, school: 'Lincoln' },
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData,
      })

      const profile = await studentService.fetchStudentProfile('s-1')
      expect(profile).not.toBeNull()
      expect(profile?.name).toBe('Bobby Tables')
    })

    it('returns null if profile doc does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const profile = await studentService.fetchStudentProfile('s-1')
      expect(profile).toBeNull()
    })

    it('propagates errors from getDoc', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(studentService.fetchStudentProfile('s-1')).rejects.toThrow(
        'permission-denied',
      )
    })
  })

  describe('fetchStudentCoursesMap', () => {
    it('maps each enrolled student uid to their course names', async () => {
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnapshot([
          {
            id: 'c-1',
            data: () => ({ course: 'Python 1', students: ['s-1', 's-2'] }),
          },
          {
            id: 'c-2',
            data: () => ({ course: 'Python 2', students: ['s-1'] }),
          },
        ]),
      )

      const map = await studentService.fetchStudentCoursesMap()
      expect(map.get('s-1')).toEqual(['Python 1', 'Python 2'])
      expect(map.get('s-2')).toEqual(['Python 1'])
    })

    it('returns an empty map when no classes have students', async () => {
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnapshot([
          { id: 'c-1', data: () => ({ course: 'Python 1' }) },
        ]),
      )

      const map = await studentService.fetchStudentCoursesMap()
      expect(map.size).toBe(0)
    })

    it('propagates errors from getDocs', async () => {
      ;(firestore.getDocs as jest.Mock).mockRejectedValueOnce(
        new Error('network error'),
      )

      await expect(studentService.fetchStudentCoursesMap()).rejects.toThrow(
        'network error',
      )
    })
  })

  describe('fetchAllClasses', () => {
    it('queries and maps class options', async () => {
      const mockDocs = [
        {
          id: 'c-1',
          data: () => ({
            course: 'Python 1',
            instructorFirstName: 'Jane',
            instructorLastName: 'Doe',
          }),
        },
      ]
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnapshot(mockDocs),
      )

      const res = await studentService.fetchAllClasses()
      expect(res.classes.length).toBe(1)
      expect(res.nameToUid['Python 1 (Jane Doe)']).toBe('c-1')
    })

    it('propagates errors from getDocs', async () => {
      ;(firestore.getDocs as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(studentService.fetchAllClasses()).rejects.toThrow(
        'permission-denied',
      )
    })
  })

  describe('enrollStudent', () => {
    const student: Student = {
      name: 'Bobby Tables',
      email: 'bobby@example.com',
      secondaryEmail: 'parent@example.com',
      phone: '555-0000',
      grade: 6,
      school: 'Lincoln',
      parentName: 'Sarah Tables',
    }

    const classData: ClassData = {
      id: 'c-1',
      instructorFirstName: 'Jane',
      instructorLastName: 'Doe',
      instructorEmail: 'jane@example.com',
      classTime1: '4:00 PM',
      classTime2: '4:00 PM',
      course: 'Python 1',
      online: true,
    } as ClassData

    it('writes the class roster and the registration in one batch, then sends the enrollment email', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await studentService.enrollStudent(student, classData, 's-1')

      expect(firestore.writeBatch).toHaveBeenCalledTimes(1)
      expect(mockBatch.update.mock.calls.map(([, data]) => data)).toEqual([
        { students: 's-1' },
        { classes: 'c-1', enrolled: true },
      ])
      expect(mockBatch.commit).toHaveBeenCalledTimes(1)
      expect(firestore.updateDoc).not.toHaveBeenCalled()
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/enroll',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws if the enrollment email API responds not-ok', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })

      await expect(
        studentService.enrollStudent(student, classData, 's-1'),
      ).rejects.toThrow('Failed to send enrollment email notification')
    })

    it('sends no email when the batch is refused', async () => {
      mockBatch.commit.mockRejectedValueOnce(new Error('permission-denied'))

      await expect(
        studentService.enrollStudent(student, classData, 's-1'),
      ).rejects.toThrow('permission-denied')
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('dropStudentFromClass', () => {
    let transaction: { get: jest.Mock; update: jest.Mock }

    /** Runs the drop's transaction against a registration holding `data`. */
    function withRegistration(data: Record<string, unknown>) {
      transaction = {
        get: jest.fn().mockResolvedValue({ data: () => data }),
        update: jest.fn(),
      }
      ;(firestore.runTransaction as jest.Mock).mockImplementation(
        async (_db: unknown, fn: any) => fn(transaction),
      )
    }

    it('clears the class from both documents in one transaction, staying enrolled while classes remain', async () => {
      withRegistration({ classes: ['c-1', 'c-2'] })

      await studentService.dropStudentFromClass('c-1', 's-1')

      expect(firestore.runTransaction).toHaveBeenCalledTimes(1)
      expect(transaction.update.mock.calls.map(([, data]) => data)).toEqual([
        { students: 's-1' },
        { classes: ['c-2'], enrolled: true },
      ])
      expect(firestore.updateDoc).not.toHaveBeenCalled()
    })

    it('sets enrolled=false when no classes remain', async () => {
      withRegistration({ classes: ['c-1'] })

      await studentService.dropStudentFromClass('c-1', 's-1')

      expect(transaction.update).toHaveBeenLastCalledWith(expect.anything(), {
        classes: [],
        enrolled: false,
      })
    })

    it('defaults to enrolled=false when the registration doc has no classes field', async () => {
      withRegistration({})

      await studentService.dropStudentFromClass('c-1', 's-1')

      expect(transaction.update).toHaveBeenLastCalledWith(expect.anything(), {
        classes: [],
        enrolled: false,
      })
    })

    it('propagates a failed transaction', async () => {
      ;(firestore.runTransaction as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        studentService.dropStudentFromClass('c-1', 's-1'),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('checkInStudent', () => {
    it('sets checked-in status with a default meal schedule, merging into the doc', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      const now = new Date('2026-10-20T12:00:00Z')

      await studentService.checkInStudent('s-1', now)

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
      const [, payload, options] = (firestore.setDoc as jest.Mock).mock.calls[0]
      expect(payload).toEqual(
        expect.objectContaining({ checkedIn: true, checkedInAt: now }),
      )
      expect(options).toEqual({ merge: true })
    })

    it('seeds food from retreatMealSchedule as an independent copy, not a shared reference', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await studentService.checkInStudent('s-1', new Date())

      const [, payload] = (firestore.setDoc as jest.Mock).mock.calls[0]
      expect(payload.food).toEqual(retreatMealSchedule)
      expect(payload.food).not.toBe(retreatMealSchedule)
    })

    it('propagates errors from setDoc', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        studentService.checkInStudent('s-1', new Date()),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('updateStudentMeal', () => {
    it('updates the specific date/meal field', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await studentService.updateStudentMeal(
        's-1',
        '2026-10-20',
        'dinner',
        true,
      )

      expect(firestore.updateDoc).toHaveBeenCalledWith(expect.anything(), {
        'food.2026-10-20.dinner': true,
      })
    })

    it('propagates errors from updateDoc', async () => {
      ;(firestore.updateDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        studentService.updateStudentMeal('s-1', '2026-10-20', 'dinner', true),
      ).rejects.toThrow('permission-denied')
    })
  })
})
