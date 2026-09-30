// Zod schemas that we use for input validation across all of our forms, and
// also in seed.ts for ensuring our test data is valid.
import { z } from 'zod'
import {
  isAllowedMeetingLink,
  MEETING_LINK_ERROR,
} from '$lib/helpers/meetingLink'

const phoneRegex = /^[\d\s\-+]+$/
const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const classSchema = z.object({
  course: z.string().min(1, 'Course is required'),
  gradeRecommendation: z.string().optional().default(''),
  classCap: z.coerce.number().min(0, 'Capacity must be at least 0'),
  // Empty means "none yet": the form books a Teams link on save, and an
  // in-person class has none. See $lib/helpers/meetingLink.
  meetingLink: z
    .string()
    .trim()
    .refine((link) => link === '' || isAllowedMeetingLink(link), {
      message: MEETING_LINK_ERROR,
    })
    .optional()
    .default(''),
  classDay1: z.enum(
    [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
    {
      errorMap: () => ({ message: 'Day 1 is required' }),
    },
  ),
  classTime1: z.string().min(1, 'Time 1 is required'),
  classDay2: z
    .enum([
      '',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
    .optional()
    .default(''),
  classTime2: z.string().optional().default(''),
  online: z.boolean().default(true),
})

/**
 * What EditClassForm validates: `classSchema`, plus the fields an online class
 * has to have when an admin edits it - a meeting link and a second meeting
 * day. These were enforced only by the inputs' HTML `required` attribute,
 * which the form's `novalidate` now turns off. Kept apart from `classSchema`
 * because the seed and portal parse classes with it, and there an empty link
 * means "none booked yet".
 */
export const editClassFormSchema = classSchema.superRefine((cls, ctx) => {
  if (!cls.online) return
  if (!cls.meetingLink) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['meetingLink'],
      message: 'Meeting link is required for an online class',
    })
  }
  if (!cls.classDay2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['classDay2'],
      message: 'Day 2 is required for an online class',
    })
  }
})

export const tokenSchema = z.object({
  role: z.enum(['reviewer', 'admin']),
  consumable: z.boolean(),
  expires: z
    .number()
    .int()
    .min(1, 'Minimum is 1 hour')
    .max(48, 'Maximum is 48 hours'),
})

/**
 * Upper bounds on every free-text and list field of the application. They are
 * far above anything a real answer needs; they exist so a hand-crafted request
 * can't store an arbitrarily large document for admin to load and render.
 * Kept identical to portal's. `schemas.test.ts` fails if a string or array
 * field goes without one.
 */
const MAX_TEXT = 2000
const MAX_LIST_ITEMS = 50
const MAX_LIST_ITEM = 200
const textCap = [MAX_TEXT, `Max ${MAX_TEXT} characters`] as const
const boundedList = () =>
  z.array(z.string().max(MAX_LIST_ITEM)).max(MAX_LIST_ITEMS)

/**
 * A checkbox the applicant or parent has to tick before submitting. These
 * used to be plain booleans that only the input's HTML `required` attribute
 * enforced, which showed as a browser popup rather than the inline message
 * every other field shows. Kept identical to portal's.
 */
const agreementSchema = z
  .boolean()
  .default(false)
  .refine((checked) => checked, { message: 'Please check this box to submit' })

export const applicationSchema = z.object({
  personal: z.object({
    phoneNumber: z
      .string()
      .min(1, 'Phone number is required')
      .max(...textCap)
      .regex(phoneRegex, 'Invalid phone number format'),
    dateOfBirth: z
      .string()
      .min(1, 'Date of birth is required')
      .max(...textCap)
      .regex(dateRegex, 'Invalid date format (YYYY-MM-DD)'),
    gender: z
      .string()
      .min(1, 'Gender is required')
      .max(...textCap),
    race: boundedList().default([]),
  }),
  academic: z.object({
    school: z
      .string()
      .min(1, 'School is required')
      .max(...textCap),
    graduationYear: z.coerce
      .number()
      .int()
      .min(new Date().getFullYear(), 'Invalid year')
      .max(new Date().getFullYear() + 20, 'Invalid year'),
  }),
  program: z.object({
    courses: boundedList().min(1, 'Select at least one course'),
    preferences: z
      .string()
      .max(...textCap)
      .optional()
      .default(''),
    timeSlots: z
      .string()
      .min(1, 'Timeslots description is required')
      .max(...textCap),
    notAvailable: z
      .string()
      .min(1, 'Conflict description is required')
      .max(...textCap),
    inPerson: z.boolean().default(false),
    reason: z
      .string()
      .min(1, 'Reason is required')
      .max(...textCap),
  }),
  essay: z
    .object({
      taughtBefore: z.boolean().default(false),
      academicBackground: z
        .string()
        .min(1, 'Academic background is required')
        .max(500, 'Max 500 characters'),
      teachingScenario: z
        .string()
        .max(500, 'Max 500 characters')
        .optional()
        .default(''),
      why: z.string().max(500, 'Max 500 characters').optional().default(''),
    })
    // The two newcomer essays are required only of someone who hasn't taught
    // for gbSTEM before, which a per-field rule can't express. Refined here
    // rather than on the whole application so the messages don't wait for
    // every other section to be valid - zod skips an object's refinements
    // while any of its fields fail.
    .superRefine((essay, ctx) => {
      if (essay.taughtBefore) return
      for (const field of ['teachingScenario', 'why'] as const) {
        if (!essay[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'Please answer this question',
          })
        }
      }
    }),
  agreements: z.object({
    entireProgram: agreementSchema,
    timeCommitment: agreementSchema,
    submitting: agreementSchema,
  }),
})

export const registrationSchema = z.object({
  personal: z.object({
    studentFirstName: z.string().min(1, 'First name is required'),
    studentLastName: z.string().min(1, 'Last name is required'),
    // No `email`: the parent account's address stored on a registration is an
    // audit record of what was submitted, not something admin edits.
    secondaryEmail: z.string().optional().default(''),
    phoneNumber: z
      .string()
      .min(1, 'Phone number is required')
      .regex(phoneRegex, 'Invalid phone number format'),
    dateOfBirth: z
      .string()
      .min(1, 'Date of birth is required')
      .regex(dateRegex, 'Invalid date format (YYYY-MM-DD)'),
    gender: z.string().min(1, 'Gender is required'),
    race: z.array(z.string()).default([]),
    frlp: z
      .string()
      .min(1, 'Federal Free or Reduced Lunch Program status is required'),
    parentEducation: z.string().min(1, 'Parent education is required'),
  }),
  academic: z.object({
    school: z.string().min(1, 'School is required'),
    grade: z.string().min(1, 'Grade is required'),
  }),
  // During student registration in the portal website, these aren't specified yet.
  program: z.object({
    csCourse: z.string().optional().default(''),
    mathCourse: z.string().optional().default(''),
    engineeringCourse: z.string().optional().default(''),
    scienceCourse: z.string().optional().default(''),
    inPerson: z.boolean().default(false),
    reason: z.string().optional().default(''),
  }),
  inPerson: z.object({
    allergies: z.string().optional().default(''),
    parentPickup: z.string().optional().default(''),
  }),
  agreements: z.object({
    mediaRelease: z.boolean().default(false),
    bypassAgeLimits: z.boolean().default(false),
    entireProgram: agreementSchema,
    timeCommitment: agreementSchema,
    submitting: agreementSchema,
  }),
})

export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_MAX_LENGTH = 64

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  )
  .regex(
    /.*[^a-zA-Z].*/,
    'Password must contain at least one non-alphabet character',
  )

export const interviewSlotSchema = z.object({
  date: z.string().min(1, 'Date and time is required'),
  meetingLink: z
    .string()
    .trim()
    .min(1, 'Meeting link is required')
    .refine(isAllowedMeetingLink, {
      message: MEETING_LINK_ERROR,
    }),
  interviewerName: z.string().min(1, 'Interviewer name is required'),
  // Both people are named by uid alone. A slot stores no address: whoever
  // needs one resolves it from the uid, so it can't go stale when either
  // changes their account email.
  interviewerUid: z.string().optional().default(''),
  intervieweeFirstName: z.string().optional().default(''),
  intervieweeLastName: z.string().optional().default(''),
  intervieweeId: z.string().optional().default(''),
  interviewSlotStatus: z
    .enum(['available', 'pending', 'confirmed', 'completed', 'canceled'])
    .default('available'),
})

/**
 * Initial values for CreateTokenForm.
 *
 * Exported rather than inlined in the component so `formFieldParity.test.ts`
 * can check it against `tokenSchema`. A create-only form has no stored
 * document to fall back on, so a schema field missing from here starts out
 * `undefined` and is written that way.
 */
export function getCreateTokenFormDefaults() {
  return {
    role: 'reviewer' as const,
    consumable: false,
    expires: 24,
  }
}

export function getApplyFormDefaults() {
  return {
    personal: {
      phoneNumber: '',
      dateOfBirth: '',
      gender: '',
      race: [],
    },
    academic: {
      school: '',
      graduationYear: new Date().getFullYear(),
    },
    program: {
      courses: [],
      preferences: '',
      timeSlots: '',
      notAvailable: '',
      inPerson: false,
      reason: '',
    },
    essay: {
      taughtBefore: false,
      academicBackground: '',
      teachingScenario: '',
      why: '',
    },
    agreements: {
      entireProgram: false,
      timeCommitment: false,
      submitting: false,
    },
  }
}

export function getRegistrationFormDefaults() {
  return {
    personal: {
      studentFirstName: '',
      studentLastName: '',
      secondaryEmail: '',
      phoneNumber: '',
      dateOfBirth: '',
      gender: '',
      frlp: '',
      parentEducation: '',
      race: [],
    },
    academic: {
      school: '',
      grade: '',
    },
    program: {
      csCourse: '',
      mathCourse: '',
      engineeringCourse: '',
      scienceCourse: '',
      inPerson: false,
      reason: '',
    },
    inPerson: {
      allergies: '',
      parentPickup: '',
    },
    agreements: {
      mediaRelease: false,
      bypassAgeLimits: false,
      entireProgram: false,
      timeCommitment: false,
      submitting: false,
    },
  }
}

export function getInterviewSlotDefaults(
  interviewerName = '',
  interviewerUid = '',
) {
  return {
    id: '',
    date: '',
    interviewerName,
    interviewerUid,
    intervieweeFirstName: '',
    intervieweeLastName: '',
    intervieweeId: '',
    meetingLink: '',
    interviewSlotStatus: 'available' as const,
  }
}

export function getClassDataDefaults() {
  return {
    id: '',
    course: '',
    instructorFirstName: '',
    instructorLastName: '',
    instructorUid: '',
    otherInstructorUids: [] as string[],
    classDay1: '',
    classTime1: '',
    classDay2: '',
    classTime2: '',
    meetingLink: '',
    gradeRecommendation: '',
    meetingTimes: [],
    completedClassDates: [],
    feedbackCompleted: [],
    classStatuses: [],
    classCap: 0,
    students: [],
    online: true,
  }
}
