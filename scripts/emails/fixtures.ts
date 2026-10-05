/**
 * Fixture corpus for the email golden-output harness.
 *
 * Every template is rendered once per case listed here, both by the legacy
 * string-substitution path and (after the migration) by the MJML path, so the
 * two can be compared field-for-field. `typical` values are copied from the
 * real call sites in `src/routes/api/*` so the goldens show what recipients
 * actually receive; `adversarial` and `edge` exist so the comparison also
 * covers escaping and empty-value behaviour, which is where this system has
 * gone wrong before.
 */

export type TemplateData = { data: Record<string, unknown> }

/**
 * The footer's copyright year is injected by the render layer. Pinning it here
 * keeps goldens stable across new years instead of failing every January.
 */
export const FIXTURE_YEAR = 2026

/** Probes that escape their surrounding context if interpolation is unsafe. */
const XSS_TEXT = `</p><script>alert('xss')</script><p x="`
const XSS_ATTR = `" onmouseover="alert('xss')" x="`
const XSS_URL = `javascript:alert('xss')`

/** Values that are legal but stress layout: long, unicode, entity-bearing. */
const LONG = 'Bartholomew-Wentworth Fitzgerald-Montgomery III'.repeat(3)
const UNICODE = 'Zoë Ñuñez 田中 🎓 <3 & "quoted"'
const QUERY_URL = 'https://portal.gbstem.org/dashboard?tab=classes&id=7#top'

/**
 * Named fields each template interpolates, so a fixture that forgets one is a
 * loud failure in the report rather than a silently empty paragraph.
 */
export const TEMPLATE_FIELDS: Record<string, string[]> = {
  acceptEmailTemplate: [
    'app.firstName',
    'app.link',
    'app.name',
    'app.orientation',
    'app.orientationLink',
  ],
  actionEmailTemplate: [
    'action.description',
    'action.link',
    'action.name',
    'app.link',
    'app.name',
  ],
  classReminderEmailTemplate: [
    'app.link',
    'app.class',
    'app.classTime',
    'app.firstName',
    'app.instructor',
    'app.name',
  ],
  inPersonClassEnrolledEmailTemplate: [
    'app.class1Time',
    'app.course',
    'app.firstName',
    'app.instructor',
    'app.instructorEmail',
    'app.link',
    'app.name',
    'app.studentName',
  ],
  interviewCanceledEmailTemplate: [
    'app.link',
    'app.name',
    'interview.date',
    'interview.interviewee',
    'interview.name',
  ],
  interviewMissedEmailTemplate: [
    'app.link',
    'app.name',
    'interview.date',
    'interview.interviewee',
    'interview.interviewerMissed',
    'interview.name',
  ],
  interviewRescheduledEmailTemplate: [
    'app.link',
    'app.name',
    'interview.date',
    'interview.interviewee',
    'interview.link',
    'interview.name',
    'interview.previousDate',
  ],
  interviewScheduledEmailTemplate: [
    'app.link',
    'app.name',
    'interview.date',
    'interview.interviewee',
    'interview.link',
    'interview.name',
  ],
  onlineClassEnrolledEmailTemplate: [
    'app.class1Time',
    'app.class2Time',
    'app.course',
    'app.firstName',
    'app.instructor',
    'app.instructorEmail',
    'app.link',
    'app.meetingLink',
    'app.name',
    'app.studentName',
  ],
  rejectionEmailTemplate: ['app.firstName', 'app.link', 'app.name'],
  scheduleInterviewEmailTemplate: [
    'app.deadline',
    'app.firstName',
    'app.link',
    'app.name',
  ],
  subEmailTemplate: [
    'app.firstName',
    'app.link',
    'app.name',
    'app.orientation',
    'app.orientationLink',
  ],
  teachingReminderEmailTemplate: [
    'app.link',
    'app.class',
    'app.classTime',
    'app.firstName',
    'app.name',
  ],
  waitlistEmailTemplate: ['app.firstName', 'app.link', 'app.name'],
}

/** Production-shaped values, mirroring the `+server.ts` route handlers. */
const typical: Record<string, TemplateData> = {
  acceptEmailTemplate: {
    data: {
      app: {
        firstName: 'Ada',
        name: 'Portal',
        link: 'https://portal.gbstem.org',
        orientation: 'Thursday, March 5th at 7:00 PM EST',
        orientationLink: 'https://mit.zoom.us/j/95024505441',
      },
    },
  },
  actionEmailTemplate: {
    data: {
      action: {
        name: 'Verify Email',
        description: 'Please verify your email address to finish signing up.',
        link: 'https://admin.gbstem.org/action?mode=verifyEmail&oobCode=abc123',
      },
      app: { name: 'Admin', link: 'https://admin.gbstem.org' },
    },
  },
  classReminderEmailTemplate: {
    data: {
      app: {
        firstName: 'Ada',
        name: 'Portal',
        link: 'https://portal.gbstem.org',
        class: 'Intro to Python',
        classTime: 'Saturdays at 10:00 AM',
        instructor: 'Grace Hopper',
      },
    },
  },
  inPersonClassEnrolledEmailTemplate: {
    data: {
      app: {
        name: 'Portal',
        link: 'https://portal.gbstem.org',
        firstName: 'Ada',
        studentName: 'Lin',
        instructor: 'Grace Hopper',
        instructorEmail: 'grace@gbstem.org',
        course: 'Intro to Python',
        class1Time: 'Saturdays at 10:00 AM',
      },
    },
  },
  interviewCanceledEmailTemplate: {
    data: {
      app: { name: 'Portal', link: 'https://portal.gbstem.org' },
      interview: {
        interviewee: 'Ada',
        name: 'Grace Hopper',
        date: 'Monday, March 2nd at 6:30 PM EST',
      },
    },
  },
  // The adversarial and edge cases fill `interviewerMissed` with a string, so
  // they render the interviewer branch; this one renders the applicant's.
  interviewMissedEmailTemplate: {
    data: {
      app: { name: 'Portal', link: 'https://portal.gbstem.org' },
      interview: {
        interviewee: 'Ada',
        name: 'Grace Hopper',
        date: 'Monday, March 2nd at 6:30 PM EST',
        interviewerMissed: false,
      },
    },
  },
  // As with the missed email, `typical` renders the moved-time branch and
  // `missing` the link-only one.
  interviewRescheduledEmailTemplate: {
    data: {
      app: { name: 'Portal', link: 'https://portal.gbstem.org' },
      interview: {
        interviewee: 'Ada',
        name: 'Grace Hopper',
        previousDate: 'Monday, March 2nd at 6:30 PM EST',
        date: 'Tuesday, March 3rd at 7:00 PM EST',
        link: 'https://mit.zoom.us/j/95024505441',
      },
    },
  },
  interviewScheduledEmailTemplate: {
    data: {
      app: { name: 'Portal', link: 'https://portal.gbstem.org' },
      interview: {
        interviewee: 'Ada',
        name: 'Grace Hopper',
        date: 'Monday, March 2nd at 6:30 PM EST',
        link: 'https://mit.zoom.us/j/95024505441',
      },
    },
  },
  onlineClassEnrolledEmailTemplate: {
    data: {
      app: {
        name: 'Portal',
        link: 'https://portal.gbstem.org',
        firstName: 'Ada',
        studentName: 'Lin',
        instructor: 'Grace Hopper',
        instructorEmail: 'grace@gbstem.org',
        course: 'Intro to Python',
        class1Time: 'Saturdays at 10:00 AM',
        class2Time: 'Wednesdays at 5:00 PM',
        meetingLink: 'https://mit.zoom.us/j/95024505441',
      },
    },
  },
  rejectionEmailTemplate: {
    data: {
      app: {
        firstName: 'Ada',
        name: 'Portal',
        link: 'https://portal.gbstem.org',
      },
    },
  },
  scheduleInterviewEmailTemplate: {
    data: {
      app: {
        firstName: 'Ada',
        name: 'Portal',
        link: 'https://portal.gbstem.org',
        deadline: 'Friday, February 28th',
      },
    },
  },
  subEmailTemplate: {
    data: {
      app: {
        firstName: 'Ada',
        name: 'Portal',
        link: 'https://portal.gbstem.org',
        orientation: 'Thursday, March 5th at 7:00 PM EST',
        orientationLink: 'https://mit.zoom.us/j/95024505441',
      },
    },
  },
  teachingReminderEmailTemplate: {
    data: {
      app: {
        firstName: 'Ada',
        name: 'Portal',
        link: 'https://portal.gbstem.org',
        class: 'Intro to Python',
        classTime: 'Saturdays at 10:00 AM',
      },
    },
  },
  waitlistEmailTemplate: {
    data: {
      app: {
        firstName: 'Ada',
        name: 'Portal',
        link: 'https://portal.gbstem.org',
      },
    },
  },
}

/** Builds a fixture by setting every field a template uses to `value`. */
function fill(
  template: string,
  value: (field: string) => unknown,
): TemplateData {
  const data: Record<string, Record<string, unknown>> = {}
  for (const field of TEMPLATE_FIELDS[template]) {
    const [root, leaf] = field.split('.')
    data[root] ??= {}
    data[root][leaf] = value(field)
  }
  return { data }
}

const isUrlField = (field: string) => /link|Link|Email$/.test(field)

export const CASES = ['typical', 'adversarial', 'edge', 'missing'] as const
export type Case = (typeof CASES)[number]

export const TEMPLATES = Object.keys(TEMPLATE_FIELDS).sort()

export function fixtureFor(template: string, testCase: Case): TemplateData {
  switch (testCase) {
    case 'typical':
      return typical[template]
    case 'adversarial':
      // Every field carries a break-out payload: text fields try to close the
      // surrounding tag, URL fields try both a `javascript:` scheme and an
      // attribute break-out.
      return fill(template, (field) =>
        isUrlField(field) ? `${XSS_URL}${XSS_ATTR}` : XSS_TEXT,
      )
    case 'edge':
      return fill(template, (field) =>
        isUrlField(field) ? QUERY_URL : `${UNICODE} ${LONG}`,
      )
    case 'missing':
      // Nothing supplied at all - exercises the "unknown key renders empty"
      // path that both the legacy substituter and Handlebars must agree on.
      return { data: {} }
  }
}
