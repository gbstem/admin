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
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.course).toBe('Introduction to Python')
        expect(result.data.classCap).toBe(15)
      }
    })

    it('supplies defaults for optional fields', () => {
      const minimalClass = {
        course: 'Intro to Math',
        classCap: 10,
        classDay1: 'Tuesday',
        classTime1: '5:00 PM',
      }
      const result = classSchema.safeParse(minimalClass)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.gradeRecommendation).toBe('')
        expect(result.data.meetingLink).toBe('')
        expect(result.data.classDay2).toBe('')
        expect(result.data.classTime2).toBe('')
        expect(result.data.online).toBe(true) // default value
      }
    })

    it('denies empty course name', () => {
      const result = classSchema.safeParse({
        ...validClass,
        course: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.issues
        expect(issues).toHaveLength(1)
        expect(issues[0].path).toEqual(['course'])
        expect(issues[0].message).toBe('Course is required')
      }
    })

    it('denies negative capacity', () => {
      const result = classSchema.safeParse({
        ...validClass,
        classCap: -5,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.issues
        expect(issues[0].path).toEqual(['classCap'])
        expect(issues[0].message).toBe('Capacity must be at least 0')
      }
    })

    it('coerces string capacity to number', () => {
      const result = classSchema.safeParse({
        ...validClass,
        classCap: '25',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.classCap).toBe(25)
      }
    })

    it('denies missing required day/time', () => {
      const result1 = classSchema.safeParse({
        ...validClass,
        classDay1: '',
      })
      expect(result1.success).toBe(false)
      if (!result1.success) {
        expect(result1.error.issues[0].path).toEqual(['classDay1'])
        expect(result1.error.issues[0].message).toBe('Day 1 is required')
      }

      const result2 = classSchema.safeParse({
        ...validClass,
        classTime1: '',
      })
      expect(result2.success).toBe(false)
      if (!result2.success) {
        expect(result2.error.issues[0].path).toEqual(['classTime1'])
        expect(result2.error.issues[0].message).toBe('Time 1 is required')
      }
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
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['role'])
      }
    })

    it('denies out-of-range expiry hours', () => {
      // Under min (0)
      const resultMin = tokenSchema.safeParse({
        role: 'reviewer',
        consumable: true,
        expires: 0,
      })
      expect(resultMin.success).toBe(false)
      if (!resultMin.success) {
        expect(resultMin.error.issues[0].path).toEqual(['expires'])
        expect(resultMin.error.issues[0].message).toBe('Minimum is 1 hour')
      }

      // Over max (49)
      const resultMax = tokenSchema.safeParse({
        role: 'reviewer',
        consumable: true,
        expires: 49,
      })
      expect(resultMax.success).toBe(false)
      if (!resultMax.success) {
        expect(resultMax.error.issues[0].path).toEqual(['expires'])
        expect(resultMax.error.issues[0].message).toBe('Maximum is 48 hours')
      }
    })

    it('denies non-integer expiry', () => {
      const result = tokenSchema.safeParse({
        role: 'reviewer',
        consumable: true,
        expires: 12.5,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['expires'])
      }
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
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toEqual([
            'personal',
            'phoneNumber',
          ])
          expect(result.error.issues[0].message).toBe(
            'Invalid phone number format',
          )
        }
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
      expect(resultPast.success).toBe(false)
      if (!resultPast.success) {
        expect(resultPast.error.issues[0].path).toEqual([
          'academic',
          'graduationYear',
        ])
        expect(resultPast.error.issues[0].message).toBe('Invalid year')
      }

      // Far future year
      const resultFuture = applicationSchema.safeParse({
        ...validApplication,
        academic: {
          ...validApplication.academic,
          graduationYear: currentYear + 21,
        },
      })
      expect(resultFuture.success).toBe(false)
      if (!resultFuture.success) {
        expect(resultFuture.error.issues[0].path).toEqual([
          'academic',
          'graduationYear',
        ])
        expect(resultFuture.error.issues[0].message).toBe('Invalid year')
      }
    })

    it('denies empty required program fields', () => {
      const resultNoCourses = applicationSchema.safeParse({
        ...validApplication,
        program: {
          ...validApplication.program,
          courses: [],
        },
      })
      expect(resultNoCourses.success).toBe(false)
      if (!resultNoCourses.success) {
        expect(resultNoCourses.error.issues[0].path).toEqual([
          'program',
          'courses',
        ])
        expect(resultNoCourses.error.issues[0].message).toBe(
          'Select at least one course',
        )
      }
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
      expect(resultTooLong.success).toBe(false)
      if (!resultTooLong.success) {
        expect(resultTooLong.error.issues[0].path).toEqual([
          'essay',
          'academicBackground',
        ])
        expect(resultTooLong.error.issues[0].message).toBe('Max 500 characters')
      }
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

      expect(result.success).toBe(true)
      if (result.success) {
        expect(Object.keys(result.data)).toEqual([
          'personal',
          'academic',
          'program',
          'essay',
          'agreements',
        ])
        expect(result.data.personal).not.toHaveProperty('firstName')
        expect(result.data.personal).not.toHaveProperty('lastName')
        expect(result.data.personal).not.toHaveProperty('email')
        expect(result.data.program).not.toHaveProperty('numClasses')
      }
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
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.personal).not.toHaveProperty('email')
      }
    })

    it('denies missing required personal info fields', () => {
      const fields = [
        { field: 'studentFirstName', path: ['personal', 'studentFirstName'] },
        { field: 'studentLastName', path: ['personal', 'studentLastName'] },
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
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toEqual(path)
          if (msg) {
            expect(result.error.issues[0].message).toBe(msg)
          }
        }
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

      expect(result.success).toBe(true)
      if (result.success) {
        expect(Object.keys(result.data)).toEqual([
          'personal',
          'academic',
          'program',
          'inPerson',
          'agreements',
        ])
        expect(result.data.personal).not.toHaveProperty('parentFirstName')
        expect(result.data.personal).not.toHaveProperty('parentLastName')
      }
    })
  })

  describe('passwordSchema', () => {
    it('passes for a valid password within 6 to 64 characters with a non-alphabet character', () => {
      expect(passwordSchema.safeParse('123456').success).toBe(true)
      expect(passwordSchema.safeParse('a'.repeat(63) + '1').success).toBe(true)
    })

    it('denies a password shorter than 6 characters', () => {
      const result = passwordSchema.safeParse('12345')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Password must be at least 6 characters',
        )
      }
    })

    it('denies a password longer than 64 characters', () => {
      const result = passwordSchema.safeParse('a'.repeat(64) + '1')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Password must be at most 64 characters',
        )
      }
    })

    it('denies a password with only alphabet characters', () => {
      const result = passwordSchema.safeParse('abcdefg')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Password must contain at least one non-alphabet character',
        )
      }
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
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.interviewSlotStatus).toBe('available')
      }
    })

    it('denies missing required fields', () => {
      const result = interviewSlotSchema.safeParse({
        date: '',
        meetingLink: '',
        interviewerName: '',
        interviewerEmail: 'invalid-email',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(3)
      }
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
