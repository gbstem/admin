import {
  applicationsCollection,
  classFeedbackCollection,
  classesCollection,
  currentSemester,
  decisionsCollection,
  instructorFeedbackCollection,
  interviewTimesCollection,
  registrationsCollection,
  resolveSemester,
  semesterCollectionPath,
  semesterDates,
  semesterIdFromPath,
  subRequestsCollection,
  interviewTimeRequestsCollection,
  withSemester,
} from '../src/lib/data/collections'

describe('collections.ts', () => {
  // Guards the assumption the rest of this file's assertions are built on: that
  // currentSemester is a `{Spring,Fall}{2-digit year}` id (e.g. "Spring26"), not some other
  // format. Assertions below are parameterized off currentSemester (rather than hardcoding
  // e.g. "Spring26") so they don't need editing every time a new semester rolls in — this
  // check is what keeps that parameterization honest instead of silently matching anything.
  it('currentSemester matches the expected (Spring|Fall)\\d\\d format', () => {
    expect(currentSemester).toMatch(/^(Spring|Fall)\d\d$/)
  })

  it('exports semester-scoped subcollection paths for the current semester', () => {
    expect(applicationsCollection).toBe(
      `semesters/${currentSemester}/applications`,
    )
    expect(classFeedbackCollection).toBe(
      `semesters/${currentSemester}/classFeedback`,
    )
    expect(classesCollection).toBe(`semesters/${currentSemester}/classes`)
    expect(decisionsCollection).toBe(`semesters/${currentSemester}/decisions`)
    expect(instructorFeedbackCollection).toBe(
      `semesters/${currentSemester}/instructorFeedback`,
    )
    expect(interviewTimesCollection).toBe(
      `semesters/${currentSemester}/instructorInterviewTimes`,
    )
    expect(registrationsCollection).toBe(
      `semesters/${currentSemester}/registrations`,
    )
  })

  it('leaves non-semesterized collections unchanged', () => {
    expect(subRequestsCollection).toBe('subRequests')
    expect(interviewTimeRequestsCollection).toBe('interviewTimeRequests')
  })

  // semesterDates.json is hand-edited each semester rollover (no more Firestore document -
  // see § "Adding a New Semester" in README.md), so it's worth validating its shape here
  // rather than only discovering a typo/wrong-year mistake at runtime.
  describe('semesterDates', () => {
    const expectedYear = currentSemester.match(/\d\d$/)?.[0] as string

    it('has exactly the expected fields', () => {
      expect(Object.keys(semesterDates).sort()).toEqual(
        [
          'classesEnd',
          'classesStart',
          'instructorOrientation',
          'instructorOrientationLink',
          'newInstructorAppsDue',
          'newInstructorAppsOpen',
          'parentOrientation',
          'registrationsDue',
          'registrationsOpen',
          'returningInstructorAppsDue',
          'returningInstructorAppsOpen',
          'studentOrientation',
        ].sort(),
      )
    })

    // Object.entries() on a plain (non-index-signature) object type falls back to a
    // less-precise overload that types values as `unknown` - cast once here rather than at
    // every destructured usage below.
    const semesterDateEntries = (
      Object.entries(semesterDates) as Array<[string, string]>
    ).filter(([field]) => field !== 'instructorOrientationLink')

    it.each(semesterDateEntries)(
      '%s is a valid MM/DD/YY date whose year matches currentSemester',
      (_field, value) => {
        expect(value).toMatch(/^\d{2}\/\d{2}\/\d{2}$/)
        expect(new Date(value).toString()).not.toBe('Invalid Date')
        expect(value.slice(-2)).toBe(expectedYear)
      },
    )

    it('instructorOrientationLink is a valid URL', () => {
      expect(semesterDates.instructorOrientationLink).toMatch(/^https:\/\//)
      expect(
        () => new URL(semesterDates.instructorOrientationLink),
      ).not.toThrow()
    })
  })

  describe('semesterCollectionPath', () => {
    it('builds a semesters/{semesterId}/{name} path', () => {
      expect(semesterCollectionPath('Fall25', 'registrations')).toBe(
        'semesters/Fall25/registrations',
      )
    })
  })

  describe('resolveSemester', () => {
    it('returns the given id when it is a known semester', () => {
      expect(resolveSemester('Fall25')).toBe('Fall25')
    })

    it('falls back to the current semester for an unknown id', () => {
      expect(resolveSemester('NotASemester')).toBe(currentSemester)
    })

    it('falls back to the current semester for null/undefined', () => {
      expect(resolveSemester(null)).toBe(currentSemester)
      expect(resolveSemester(undefined)).toBe(currentSemester)
    })
  })

  describe('semesterIdFromPath', () => {
    it('extracts the semester id from a semester-scoped path', () => {
      expect(semesterIdFromPath('semesters/Fall25/registrations')).toBe(
        'Fall25',
      )
    })

    it('returns null for a non-semester-scoped collection', () => {
      expect(semesterIdFromPath('subRequests')).toBeNull()
    })
  })

  describe('withSemester', () => {
    it('stamps the current semester by default', () => {
      expect(withSemester({ foo: 'bar' })).toEqual({
        foo: 'bar',
        semester: currentSemester,
      })
    })

    it('stamps an explicit semester when given one', () => {
      expect(withSemester({ foo: 'bar' }, 'Fall25')).toEqual({
        foo: 'bar',
        semester: 'Fall25',
      })
    })

    it('does not mutate the original object', () => {
      const original = { foo: 'bar' }
      withSemester(original, 'Fall25')
      expect(original).toEqual({ foo: 'bar' })
    })
  })
})
