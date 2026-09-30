import { MEETING_LINK_ERROR } from '$lib/helpers/meetingLink'
import { z } from 'zod'
import {
  applicationSchema,
  classSchema,
  editClassFormSchema,
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

    it('accepts an empty meeting link', () => {
      const data = expectParseSuccess(
        classSchema.safeParse({ ...validClass, meetingLink: '' }),
      )
      expect(data.meetingLink).toBe('')
    })

    it('trims a meeting link', () => {
      const data = expectParseSuccess(
        classSchema.safeParse({
          ...validClass,
          meetingLink: ' https://mit.zoom.us/j/1 ',
        }),
      )
      expect(data.meetingLink).toBe('https://mit.zoom.us/j/1')
    })

    it.each([
      'javascript:alert(1)',
      'http://zoom.us/j/1',
      'https://evil.example',
    ])('denies the meeting link %s', (meetingLink) => {
      const issues = expectParseFailure(
        classSchema.safeParse({ ...validClass, meetingLink }),
      ).issues
      expect(issues).toHaveLength(1)
      expect(issues[0].path).toEqual(['meetingLink'])
      expect(issues[0].message).toBe(MEETING_LINK_ERROR)
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

    it('trims meetingLink', () => {
      const result = interviewSlotSchema.safeParse({
        date: '2026-08-01T15:00:00.000Z',
        meetingLink: '  https://zoom.us/j/999888777  ',
        interviewerName: 'Jane Doe',
      })
      const data = expectParseSuccess(result)
      expect(data.meetingLink).toBe('https://zoom.us/j/999888777')
    })

    it('denies invalid meeting link', () => {
      const result = interviewSlotSchema.safeParse({
        date: '2026-08-01T15:00:00.000Z',
        meetingLink: 'javascript:alert(1)',
        interviewerName: 'Jane Doe',
      })
      const issues = expectParseFailure(result).issues
      expect(issues[0].message).toContain(
        'Zoom, Microsoft Teams or Google Meet',
      )
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

/**
 * Dotted paths of every string or array in a Zod object schema - including
 * an array's elements, as `path[]` - that has no upper bound.
 */
function unboundedFields(schema: z.ZodTypeAny, path = ''): string[] {
  let node: any = schema
  while (node?._def?.innerType || node?._def?.schema) {
    node = node._def.innerType ?? node._def.schema
  }
  if (node instanceof z.ZodObject) {
    return Object.entries(node.shape as Record<string, z.ZodTypeAny>).flatMap(
      ([key, child]) => unboundedFields(child, path ? `${path}.${key}` : key),
    )
  }
  if (node instanceof z.ZodString) {
    return node.maxLength === null ? [path] : []
  }
  if (node instanceof z.ZodArray) {
    return [
      ...(node._def.maxLength === null ? [path] : []),
      ...unboundedFields(node.element, `${path}[]`),
    ]
  }
  return []
}

describe('application size caps', () => {
  // Without a bound, a hand-crafted request could store a document as large
  // as Firestore allows, which admin then loads and renders.
  it.each([['applicationSchema', applicationSchema]])(
    '%s bounds every string and list',
    (_name, schema) => {
      expect(unboundedFields(schema)).toEqual([])
    },
  )

  it('refuses an oversized submitted answer', () => {
    const defaults = getApplyFormDefaults()
    const error = expectParseFailure(
      applicationSchema.safeParse({
        ...defaults,
        program: { ...defaults.program, timeSlots: 'x'.repeat(2001) },
      }),
    )
    expect(error.issues.map((i) => i.path.join('.'))).toContain(
      'program.timeSlots',
    )
  })
})

describe('application submit rules', () => {
  // Used to be enforced only by the inputs' HTML `required` attribute, so
  // only in the browser and as a browser popup.
  function completeApplication() {
    return {
      personal: {
        phoneNumber: '5559998888',
        dateOfBirth: '2005-10-10',
        gender: 'Female',
        race: [],
      },
      academic: { school: 'MIT', graduationYear: new Date().getFullYear() },
      program: {
        courses: ['Python 1'],
        preferences: '',
        timeSlots: 'Weekends',
        notAvailable: 'None',
        inPerson: false,
        reason: 'School',
      },
      essay: {
        taughtBefore: false,
        academicBackground: 'Coursework',
        teachingScenario: 'Games',
        why: 'Kids',
      },
      agreements: {
        entireProgram: true,
        timeCommitment: true,
        submitting: true,
      },
    }
  }

  it('accepts a complete application', () => {
    expectParseSuccess(applicationSchema.safeParse(completeApplication()))
  })

  it.each(['entireProgram', 'timeCommitment', 'submitting'] as const)(
    'requires the %s agreement, on that field',
    (agreement) => {
      const data = completeApplication()
      data.agreements[agreement] = false
      const error = expectParseFailure(applicationSchema.safeParse(data))
      expect(error.issues.map((i) => i.path.join('.'))).toEqual([
        `agreements.${agreement}`,
      ])
    },
  )

  it.each(['entireProgram', 'timeCommitment', 'submitting'] as const)(
    'lets an admin save a registration with the %s agreement unchecked',
    (agreement) => {
      // Unlike portal, where the parent has to tick these to submit: an admin
      // may need to record that one was withdrawn (registrations.cy.ts 15c).
      const defaults = getRegistrationFormDefaults()
      const result = registrationSchema.safeParse({
        ...defaults,
        agreements: { ...defaults.agreements, [agreement]: false },
      })
      const failedPaths = result.success
        ? []
        : result.error.issues.map((i) => i.path.join('.'))
      expect(failedPaths).not.toContain(`agreements.${agreement}`)
    },
  )

  it('requires the newcomer essays, on those fields, of first-time instructors', () => {
    const data = completeApplication()
    data.essay = { ...data.essay, teachingScenario: '', why: '' }
    const error = expectParseFailure(applicationSchema.safeParse(data))
    expect(error.issues.map((i) => i.path.join('.'))).toEqual([
      'essay.teachingScenario',
      'essay.why',
    ])
  })

  it('reports the essays even while other sections are invalid', () => {
    const data = completeApplication()
    data.essay = { ...data.essay, why: '' }
    data.program.timeSlots = ''
    const error = expectParseFailure(applicationSchema.safeParse(data))
    expect(error.issues.map((i) => i.path.join('.'))).toEqual(
      expect.arrayContaining(['essay.why', 'program.timeSlots']),
    )
  })

  it('does not require the newcomer essays of returning instructors', () => {
    const data = completeApplication()
    data.essay = {
      ...data.essay,
      taughtBefore: true,
      teachingScenario: '',
      why: '',
    }
    expectParseSuccess(applicationSchema.safeParse(data))
  })
})

describe('editClassFormSchema', () => {
  const onlineClass = {
    course: 'Python 1',
    classCap: 10,
    meetingLink: 'https://teams.microsoft.com/l/meetup-join/abc',
    classDay1: 'Monday',
    classTime1: '16:00',
    classDay2: 'Wednesday',
    classTime2: '16:00',
    online: true,
  }

  it('accepts a complete online class', () => {
    expectParseSuccess(editClassFormSchema.safeParse(onlineClass))
  })

  it('requires a meeting link and a second day of an online class', () => {
    const error = expectParseFailure(
      editClassFormSchema.safeParse({
        ...onlineClass,
        meetingLink: '',
        classDay2: '',
      }),
    )
    expect(error.issues.map((i) => i.path.join('.'))).toEqual([
      'meetingLink',
      'classDay2',
    ])
  })

  it('requires neither of an in-person class', () => {
    expectParseSuccess(
      editClassFormSchema.safeParse({
        ...onlineClass,
        online: false,
        meetingLink: '',
        classDay2: '',
      }),
    )
  })

  it('leaves classSchema, which the seed parses with, unchanged', () => {
    expectParseSuccess(
      classSchema.safeParse({ ...onlineClass, meetingLink: '', classDay2: '' }),
    )
  })
})
