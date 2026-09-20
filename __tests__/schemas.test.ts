import { z } from 'zod'
import {
  applicationSchema,
  classSchema,
  getApplyFormDefaults,
  getClassDataDefaults,
  getInterviewSlotDefaults,
  getRegistrationFormDefaults,
  interviewSlotSchema,
  passwordSchema,
  registrationSchema,
  tokenSchema,
} from '../src/lib/components/forms/schemas'

/**
 * Asserts a safeParse() call succeeded and returns its data, narrowed - so
 * callers get real type safety without a runtime `if (result.success)` guard
 * wrapping their own assertions on the parsed data.
 */
function expectParseSuccess<T>(result: z.SafeParseReturnType<unknown, T>): T {
  expect(result.success).toBe(true)
  if (!result.success) throw new Error('expected safeParse to succeed')
  return result.data
}

/**
 * The failure-side counterpart to expectParseSuccess: asserts safeParse()
 * failed and returns the ZodError, narrowed.
 */
function expectParseFailure<T>(result: z.SafeParseReturnType<unknown, T>) {
  expect(result.success).toBe(false)
  if (result.success) throw new Error('expected safeParse to fail')
  return result.error
}

describe('Zod Validation Schemas', () => {
  describe('classSchema', () => {
    const validClass = {
      course: 'Introduction to Python',
      gradeRecommendation: 'Grades 6-8',
      classCap: 15,
      meetingLink: 'https://zoom.us/j/123456',
      classDay1: 'Monday',
      classTime1: '4:00 PM',
      classDay2: 'Wednesday',
      classTime2: '4:00 PM',
      online: true,
    }

    it('passes for a valid class object', () => {
      const result = classSchema.safeParse(validClass)
      const data = expectParseSuccess(result)
      expect(data.course).toBe('Introduction to Python')
      expect(data.classCap).toBe(15)
    })

    it('supplies defaults for optional fields', () => {
      const minimalClass = {
        course: 'Intro to Math',
        classCap: 10,
        classDay1: 'Tuesday',
        classTime1: '5:00 PM',
      }
      const result = classSchema.safeParse(minimalClass)
      const data = expectParseSuccess(result)
      expect(data.gradeRecommendation).toBe('')
      expect(data.meetingLink).toBe('')
      expect(data.classDay2).toBe('')
      expect(data.classTime2).toBe('')
      expect(data.online).toBe(true) // default value
    })

    it('denies empty course name', () => {
      const result = classSchema.safeParse({
        ...validClass,
        course: '',
      })
      const issues = expectParseFailure(result).issues
      expect(issues).toHaveLength(1)
      expect(issues[0].path).toEqual(['course'])
      expect(issues[0].message).toBe('Course is required')
    })

    it('denies negative capacity', () => {
      const result = classSchema.safeParse({
        ...validClass,
        classCap: -5,
      })
      const issues = expectParseFailure(result).issues
      expect(issues[0].path).toEqual(['classCap'])
      expect(issues[0].message).toBe('Capacity must be at least 0')
    })

    it('coerces string capacity to number', () => {
      const result = classSchema.safeParse({
        ...validClass,
        classCap: '25',
      })
      const data = expectParseSuccess(result)
      expect(data.classCap).toBe(25)
    })

    it('denies missing required day/time', () => {
      const result1 = classSchema.safeParse({
        ...validClass,
        classDay1: '',
      })
      const issues1 = expectParseFailure(result1).issues
      expect(issues1[0].path).toEqual(['classDay1'])
      expect(issues1[0].message).toBe('Day 1 is required')

      const result2 = classSchema.safeParse({
        ...validClass,
        classTime1: '',
      })
      const issues2 = expectParseFailure(result2).issues
      expect(issues2[0].path).toEqual(['classTime1'])
      expect(issues2[0].message).toBe('Time 1 is required')
    })
  })

  describe('tokenSchema', () => {
    it('passes for valid reviewer token', () => {
      const result = tokenSchema.safeParse({
        role: 'reviewer',
        consumable: true,
        expires: 24,
      })
      expect(result.success).toBe(true)
    })

    it('passes for valid admin token', () => {
      const result = tokenSchema.safeParse({
        role: 'admin',
        consumable: false,
        expires: 48,
      })
      expect(result.success).toBe(true)
    })

    it('denies invalid roles', () => {
      const result = tokenSchema.safeParse({
        role: 'superadmin',
        consumable: true,
        expires: 24,
      })
      const issues = expectParseFailure(result).issues
      expect(issues[0].path).toEqual(['role'])
    })

    it('denies out-of-range expiry hours', () => {
      // Under min (0)
      const resultMin = tokenSchema.safeParse({
        role: 'reviewer',
        consumable: true,
        expires: 0,
      })
      const issuesMin = expectParseFailure(resultMin).issues
      expect(issuesMin[0].path).toEqual(['expires'])
      expect(issuesMin[0].message).toBe('Minimum is 1 hour')

      // Over max (49)
      const resultMax = tokenSchema.safeParse({
        role: 'reviewer',
        consumable: true,
        expires: 49,
      })
      const issuesMax = expectParseFailure(resultMax).issues
      expect(issuesMax[0].path).toEqual(['expires'])
      expect(issuesMax[0].message).toBe('Maximum is 48 hours')
    })

    it('denies non-integer expiry', () => {
      const result = tokenSchema.safeParse({
        role: 'reviewer',
        consumable: true,
        expires: 12.5,
      })
      const issues = expectParseFailure(result).issues
      expect(issues[0].path).toEqual(['expires'])
    })
  })

  describe('applicationSchema', () => {
    const currentYear = new Date().getFullYear()
    const validApplication = {
      personal: {
        phoneNumber: '+1 555-123-4567',
        dateOfBirth: '2008-05-15',
        gender: 'Female',
        race: ['Asian'],
      },
      academic: {
        school: 'High School East',
        graduationYear: currentYear + 2,
      },
      program: {
        courses: ['Python-1', 'Scratch-2'],
        preferences: 'Prefer Python',
        timeSlots: 'Tues/Thurs 4-6 PM',
        notAvailable: 'None',
        inPerson: false,
        reason: 'Love teaching kids computer science.',
      },
      essay: {
        taughtBefore: true,
        academicBackground: 'Took AP Computer Science A last year.',
        teachingScenario: 'I would break it down into smaller components.',
        why: 'I want to give back to the community.',
      },
      agreements: {
        entireProgram: true,
        timeCommitment: true,
        submitting: true,
      },
    }

    it('passes for a fully valid application object', () => {
      const result = applicationSchema.safeParse(validApplication)
      expect(result.success).toBe(true)
    })

    it('denies invalid phone number formats', () => {
      const invalidPhones = ['123-abc-4567', '555!1234', 'phone123']
      invalidPhones.forEach((phone) => {
        const result = applicationSchema.safeParse({
          ...validApplication,
          personal: {
            ...validApplication.personal,
            phoneNumber: phone,
          },
        })
        const issues = expectParseFailure(result).issues
        expect(issues[0].path).toEqual(['personal', 'phoneNumber'])
        expect(issues[0].message).toBe('Invalid phone number format')
      })
    })

    it('denies out-of-range graduation years', () => {
      // Past year
      const resultPast = applicationSchema.safeParse({
        ...validApplication,
        academic: {
          ...validApplication.academic,
          graduationYear: currentYear - 1,
        },
      })
      const issuesPast = expectParseFailure(resultPast).issues
      expect(issuesPast[0].path).toEqual(['academic', 'graduationYear'])
      expect(issuesPast[0].message).toBe('Invalid year')

      // Far future year
      const resultFuture = applicationSchema.safeParse({
        ...validApplication,
        academic: {
          ...validApplication.academic,
          graduationYear: currentYear + 21,
        },
      })
      const issuesFuture = expectParseFailure(resultFuture).issues
      expect(issuesFuture[0].path).toEqual(['academic', 'graduationYear'])
      expect(issuesFuture[0].message).toBe('Invalid year')
    })

    it('denies empty required program fields', () => {
      const resultNoCourses = applicationSchema.safeParse({
        ...validApplication,
        program: {
          ...validApplication.program,
          courses: [],
        },
      })
      const issues = expectParseFailure(resultNoCourses).issues
      expect(issues[0].path).toEqual(['program', 'courses'])
      expect(issues[0].message).toBe('Select at least one course')
    })

    it('denies essay fields exceeding maximum length', () => {
      const longText = 'a'.repeat(501)
      const resultTooLong = applicationSchema.safeParse({
        ...validApplication,
        essay: {
          ...validApplication.essay,
          academicBackground: longText,
        },
      })
      const issues = expectParseFailure(resultTooLong).issues
      expect(issues[0].path).toEqual(['essay', 'academicBackground'])
      expect(issues[0].message).toBe('Max 500 characters')
    })

    // The admin edit dialog sends this schema's output straight to Firestore as a
    // merge write, so anything zod fails to strip here would clobber a field the
    // form doesn't own - see applicationService's ApplicationEditableFields.
    it('strips fields the edit form does not own so a merge write cannot clobber them', () => {
      const result = applicationSchema.safeParse({
        ...validApplication,
        personal: {
          ...validApplication.personal,
          firstName: 'Stale',
          lastName: 'Snapshot',
          email: 'stale@example.com',
        },
        program: { ...validApplication.program, numClasses: '2' },
        meta: {
          uid: 'user-1',
          interview: true,
          submitted: true,
          decided: true,
        },
        timestamps: { created: 'then', updated: 'then' },
      })

      const data = expectParseSuccess(result)
      expect(Object.keys(data)).toEqual([
        'personal',
        'academic',
        'program',
        'essay',
        'agreements',
      ])
      expect(data.personal).not.toHaveProperty('firstName')
      expect(data.personal).not.toHaveProperty('lastName')
      expect(data.personal).not.toHaveProperty('email')
      expect(data.program).not.toHaveProperty('numClasses')
    })
  })

  describe('registrationSchema', () => {
    const validRegistration = {
      personal: {
        studentFirstName: 'John',
        studentLastName: 'Doe',
        email: 'john.doe@example.com',
        secondaryEmail: 'parent@example.com',
        phoneNumber: '123-456-7890',
        dateOfBirth: '2012-10-10',
        gender: 'Male',
        race: ['White'],
        frlp: 'No',
        parentEducation: 'College Degree',
      },
      academic: {
        school: 'Middle School West',
        grade: '7',
      },
      program: {
        csCourse: 'Scratch-1',
        mathCourse: 'Pre-Algebra',
        engineeringCourse: 'None',
        scienceCourse: 'None',
        inPerson: true,
        reason: 'Interested in learning scratch programming.',
      },
      inPerson: {
        allergies: 'Peanuts',
        parentPickup: 'Jane Doe',
      },
      agreements: {
        mediaRelease: true,
        bypassAgeLimits: false,
        entireProgram: true,
        timeCommitment: true,
        submitting: true,
      },
    }

    it('passes for a fully valid registration object', () => {
      const result = registrationSchema.safeParse(validRegistration)
      expect(result.success).toBe(true)
    })

    // The address stored on a registration is an audit record of what was
    // submitted, so the admin form neither shows nor validates one.
    it('does not carry the parent account address', () => {
      const result = registrationSchema.safeParse({
        ...validRegistration,
        personal: { ...validRegistration.personal, email: 'not-an-address' },
      })
      const data = expectParseSuccess(result)
      expect(data.personal).not.toHaveProperty('email')
    })

    it('denies missing required personal info fields', () => {
      const fields = [
        {
          field: 'studentFirstName',
          path: ['personal', 'studentFirstName'],
          msg: 'First name is required',
        },
        {
          field: 'studentLastName',
          path: ['personal', 'studentLastName'],
          msg: 'Last name is required',
        },
        {
          field: 'frlp',
          path: ['personal', 'frlp'],
          msg: 'Federal Free or Reduced Lunch Program status is required',
        },
        {
          field: 'parentEducation',
          path: ['personal', 'parentEducation'],
          msg: 'Parent education is required',
        },
      ]

      fields.forEach(({ field, path, msg }) => {
        const result = registrationSchema.safeParse({
          ...validRegistration,
          personal: {
            ...validRegistration.personal,
            [field]: '',
          },
        })
        const issues = expectParseFailure(result).issues
        expect(issues[0].path).toEqual(path)
        expect(issues[0].message).toBe(msg)
      })
    })

    // The admin edit dialog sends this schema's output straight to Firestore as a
    // merge write, so anything zod fails to strip here would clobber a field the
    // form doesn't own - see registrationService's RegistrationEditableFields.
    it('strips fields the edit form does not own so a merge write cannot clobber them', () => {
      const result = registrationSchema.safeParse({
        ...validRegistration,
        personal: {
          ...validRegistration.personal,
          parentFirstName: 'Stale',
          parentLastName: 'Snapshot',
        },
        meta: { uid: 'user-1', submitted: true },
        timestamps: { created: 'then', updated: 'then' },
      })

      const data = expectParseSuccess(result)
      expect(Object.keys(data)).toEqual([
        'personal',
        'academic',
        'program',
        'inPerson',
        'agreements',
      ])
      expect(data.personal).not.toHaveProperty('parentFirstName')
      expect(data.personal).not.toHaveProperty('parentLastName')
    })
  })

  describe('passwordSchema', () => {
    it('passes for a valid password within 6 to 64 characters with a non-alphabet character', () => {
      expect(passwordSchema.safeParse('123456').success).toBe(true)
      expect(passwordSchema.safeParse('a'.repeat(63) + '1').success).toBe(true)
    })

    it('denies a password shorter than 6 characters', () => {
      const result = passwordSchema.safeParse('12345')
      const issues = expectParseFailure(result).issues
      expect(issues[0].message).toBe('Password must be at least 6 characters')
    })

    it('denies a password longer than 64 characters', () => {
      const result = passwordSchema.safeParse('a'.repeat(64) + '1')
      const issues = expectParseFailure(result).issues
      expect(issues[0].message).toBe('Password must be at most 64 characters')
    })

    it('denies a password with only alphabet characters', () => {
      const result = passwordSchema.safeParse('abcdefg')
      const issues = expectParseFailure(result).issues
      expect(issues[0].message).toBe(
        'Password must contain at least one non-alphabet character',
      )
    })
  })

  describe('interviewSlotSchema', () => {
    it('passes for a valid interview slot', () => {
      const result = interviewSlotSchema.safeParse({
        date: '2026-08-01T15:00:00.000Z',
        meetingLink: 'https://zoom.us/j/999888777',
        interviewerName: 'Jane Doe',
        interviewerEmail: 'jane@example.com',
      })
      const data = expectParseSuccess(result)
      expect(data.interviewSlotStatus).toBe('available')
    })

    it('denies missing required fields', () => {
      const result = interviewSlotSchema.safeParse({
        date: '',
        meetingLink: '',
        interviewerName: '',
        interviewerEmail: 'invalid-email',
      })
      const issues = expectParseFailure(result).issues
      expect(issues.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Form Defaults Factories', () => {
    it('returns valid initial defaults for ApplyForm', () => {
      const defaults = getApplyFormDefaults()
      expect(defaults.personal.race).toEqual([])
      expect(defaults.academic.graduationYear).toBeGreaterThan(2020)
    })

    it('returns valid initial defaults for RegistrationForm', () => {
      const defaults = getRegistrationFormDefaults()
      expect(defaults.personal.studentFirstName).toBe('')
      expect(defaults.agreements.mediaRelease).toBe(false)
    })

    it('returns valid initial defaults for InterviewSlot', () => {
      const defaults = getInterviewSlotDefaults(
        'Interviewer Name',
        'interviewer-uid',
      )
      expect(defaults.interviewerName).toBe('Interviewer Name')
      expect(defaults.interviewerUid).toBe('interviewer-uid')
      // A slot identifies both people by uid and stores no address.
      expect(defaults).not.toHaveProperty('interviewerEmail')
      expect(defaults).not.toHaveProperty('intervieweeEmail')
      expect(defaults.interviewSlotStatus).toBe('available')
    })

    it('returns valid initial defaults for ClassData', () => {
      const defaults = getClassDataDefaults()
      expect(defaults.course).toBe('')
      expect(defaults.instructorUid).toBe('')
      expect(defaults.otherInstructorUids).toEqual([])
      expect(defaults.students).toEqual([])
      expect(defaults.online).toBe(true)
    })
  })
})
