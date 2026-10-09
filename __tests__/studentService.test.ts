import { studentService } from '#lib/services/studentService.js'
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

  describe('fetchParentEmails', () => {
    it('asks for the parent account behind each registration', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ emails: { 'parent-uid': 'parent@example.com' } }),
      })

      await expect(
        studentService.fetchParentEmails(
          ['parent-uid-1', 'parent-uid-2'],
          'Spring26',
        ),
      ).resolves.toEqual({
        'parent-uid-1': 'parent@example.com',
        'parent-uid-2': 'parent@example.com',
      })
      const [, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(JSON.parse(init.body)).toEqual({
        intent: 'registrationParents',
        uids: ['parent-uid'],
        context: {
          registrationIds: ['parent-uid-1', 'parent-uid-2'],
          semesterId: 'Spring26',
        },
      })
    })
  })

  describe('fetchClassInstructorEmail', () => {
    it('asks for the instructor under the class-instructors intent', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ emails: { 'inst-uid': 'inst@example.com' } }),
      })

      await expect(
        studentService.fetchClassInstructorEmail('class-1', 'inst-uid'),
      ).resolves.toBe('inst@example.com')
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/resolveEmails')
      expect(JSON.parse(init.body)).toEqual({
        intent: 'classInstructors',
        uids: ['inst-uid'],
        context: { classId: 'class-1' },
      })
    })

    it('returns null when the uid names no account', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ emails: { 'inst-uid': null } }),
      })

      await expect(
        studentService.fetchClassInstructorEmail('class-1', 'inst-uid'),
      ).resolves.toBeNull()
    })

    // Must throw rather than return null: null means "no such account", and a
    // refused or failed lookup must not reach the view looking like one.
    it("throws the server's message when the lookup is refused", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Not allowed' }),
      })

      await expect(
        studentService.fetchClassInstructorEmail('class-1', 'inst-uid'),
      ).rejects.toThrow('Not allowed')
    })
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

    it('converts a checkedInAt stored as a string to a Date', async () => {
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

      expect(res.checkedInAt).toEqual(new Date('2026-01-01'))
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
    it('asks /api/enroll to enroll the registration in the class, by id alone', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ emailSent: true }),
      })

      await expect(studentService.enrollStudent('c-1', 's-1')).resolves.toEqual(
        { emailSent: true },
      )

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/enroll')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({
        classId: 'c-1',
        registrationId: 's-1',
      })
      expect(firestore.writeBatch).not.toHaveBeenCalled()
    })

    it("throws the route's refusal", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'That class no longer exists.' }),
      })

      await expect(studentService.enrollStudent('c-1', 's-1')).rejects.toThrow(
        'That class no longer exists.',
      )
    })
  })

  describe('dropStudentFromClass', () => {
    it('asks /api/enroll to drop the registration from the class', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await studentService.dropStudentFromClass('c-1', 's-1')

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/enroll')
      expect(init.method).toBe('DELETE')
      expect(JSON.parse(init.body)).toEqual({
        classId: 'c-1',
        registrationId: 's-1',
      })
      expect(firestore.runTransaction).not.toHaveBeenCalled()
    })

    it("throws the route's refusal, falling back to the status text", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: async () => {
          throw new Error('not json')
        },
      })

      await expect(
        studentService.dropStudentFromClass('c-1', 's-1'),
      ).rejects.toThrow('Forbidden')
    })
  })
  describe('checkInStudent', () => {
    it('checks the student in through /api/checkIn, naming only the student', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          checkedInAt: '2026-10-20T12:00:00.000Z',
          food: { '2026-10-20': { dinner: false } },
        }),
      })

      const checkIn = await studentService.checkInStudent('s-1')

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/checkIn')
      expect(init.method).toBe('POST')
      // No time and no meals: both are the server's to decide.
      expect(JSON.parse(init.body)).toEqual({ registrationId: 's-1' })
      expect(checkIn).toEqual({
        checkedInAt: new Date('2026-10-20T12:00:00.000Z'),
        food: { '2026-10-20': { dinner: false } },
      })
    })

    it("throws the server's message when the check-in is refused", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'That student has no registration.' }),
      })

      await expect(studentService.checkInStudent('s-1')).rejects.toThrow(
        'That student has no registration.',
      )
    })
  })

  describe('updateStudentMeal', () => {
    it('records the meal through /api/checkIn', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await studentService.updateStudentMeal(
        's-1',
        '2026-10-20',
        'dinner',
        true,
      )

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/checkIn')
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body)).toEqual({
        registrationId: 's-1',
        date: '2026-10-20',
        meal: 'dinner',
        served: true,
      })
    })

    it("throws the server's message when the update is refused", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'That student is not checked in.' }),
      })

      await expect(
        studentService.updateStudentMeal('s-1', '2026-10-20', 'dinner', true),
      ).rejects.toThrow('That student is not checked in.')
    })
  })
})
