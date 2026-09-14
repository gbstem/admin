import {
  currentSemester,
  semesterCollectionPath,
  semesterIdFromPath,
} from '$lib/data/collections'
import { formatDateShort, toLocalISOString } from '$lib/utils'
import type { Timestamp } from 'firebase/firestore'
import { serverTimestamp } from 'firebase/firestore'
import type { DecisionRequestBody } from '../../routes/api/decision/+server'
import type { ScheduleInterviewRequestBody } from '../../routes/api/scheduleInterview/+server'

/**
 * Resolves the semester ID from a Firestore collection path, falling back to currentSemester.
 */
export function resolveViewedSemester(collection?: string): string {
  if (!collection) return currentSemester
  return semesterIdFromPath(collection) ?? currentSemester
}

/**
 * Resolves the Firestore collection path for decisions of a viewed semester.
 */
export function resolveDecisionsCollectionPath(viewedSemester: string): string {
  return semesterCollectionPath(viewedSemester, 'decisions')
}

/**
 * Creates a default Data.Application object for client usage.
 */
export function createDefaultApplicationValues(): Data.Application<'client'> {
  return {
    personal: {
      email: '',
      firstName: '',
      lastName: '',
      gender: '',
      race: [],
      phoneNumber: '',
      dateOfBirth: '',
    },
    academic: {
      school: '',
      graduationYear: '',
    },
    program: {
      courses: [],
      preferences: '',
      timeSlots: '',
      notAvailable: '',
      inPerson: false,
      numClasses: '',
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
    meta: {
      uid: '',
      decided: false,
      submitted: false,
      interview: false,
    },
    timestamps: {
      created: serverTimestamp() as Timestamp,
      updated: serverTimestamp() as Timestamp,
    },
  }
}

/**
 * Creates a default Data.Interview object.
 */
export function createDefaultInterviewValues(): Data.Interview {
  return {
    date: '',
    interviewer: '',
    notes: '',
    type: 'interview',
    likelyDecision: 'likely no',
    attendance: 'Null',
    conversation: 0,
    conversationNotes: '',
    lastSemesterNotes: '',
    mockLessonExplanations: 0,
    mockLessonEngagement: 0,
    mockLessonPace: 0,
    mockLessonOverall: 0,
    mockLessonNotes: '',
    techNotes: '',
    teachingPreferences: '',
    availabilityNotes: '',
  }
}

/**
 * Normalizes Firestore decision/interview snapshot data into a complete Data.Interview object.
 */
export function normalizeInterviewData(
  dData?: Partial<Data.Interview> | null,
): { decision: Data.Decision | null; interview: Data.Interview } {
  if (!dData) {
    const defaultInterview = createDefaultInterviewValues()
    return {
      decision: null,
      interview: {
        ...defaultInterview,
        likelyDecision: null,
      },
    }
  }

  let formattedDate = ''
  if (dData.date) {
    try {
      const dateObj = new Date(dData.date)
      if (!isNaN(dateObj.getTime())) {
        formattedDate = toLocalISOString(dateObj) ?? ''
      }
    } catch {
      formattedDate = ''
    }
  }

  const interview: Data.Interview = {
    type: (dData.type ?? '') as Data.Decision,
    likelyDecision: dData.likelyDecision ?? null,
    notes: dData.notes ?? '',
    interviewer: dData.interviewer ?? '',
    attendance: (dData.attendance ?? '') as Data.Interview['attendance'],
    conversation: dData.conversation ?? 0,
    conversationNotes: dData.conversationNotes ?? '',
    lastSemesterNotes: dData.lastSemesterNotes ?? '',
    mockLessonExplanations: dData.mockLessonExplanations ?? 0,
    mockLessonNotes: dData.mockLessonNotes ?? '',
    techNotes: dData.techNotes ?? '',
    mockLessonPace: dData.mockLessonPace ?? 0,
    mockLessonOverall: dData.mockLessonOverall ?? 0,
    teachingPreferences: dData.teachingPreferences ?? '',
    mockLessonEngagement: dData.mockLessonEngagement ?? 0,
    availabilityNotes: dData.availabilityNotes ?? '',
    date: formattedDate,
  }

  return {
    decision: (dData.type as Data.Decision) ?? null,
    interview,
  }
}

/**
 * Extracts notes and evaluation fields from interview data for saving.
 */
export function buildNotesPayload(interview: Data.Interview) {
  const {
    conversation,
    conversationNotes,
    mockLessonExplanations,
    mockLessonEngagement,
    mockLessonPace,
    mockLessonOverall,
    mockLessonNotes,
    teachingPreferences,
    availabilityNotes,
    notes,
    lastSemesterNotes,
    techNotes,
    date,
    interviewer,
    attendance,
  } = interview

  return {
    conversation,
    conversationNotes,
    mockLessonExplanations,
    mockLessonEngagement,
    mockLessonPace,
    mockLessonOverall,
    mockLessonNotes,
    teachingPreferences,
    availabilityNotes,
    notes,
    techNotes,
    lastSemesterNotes,
    date,
    interviewer,
    attendance,
  }
}

/**
 * Builds payload for updating likely decision.
 */
export function buildLikelyDecisionPayload(
  newDecision: 'likely yes' | 'likely no' | 'likely waitlist' | null,
  currentDecisionType?: Data.Decision | null,
) {
  return {
    likelyDecision: newDecision,
    type: currentDecisionType ?? null,
  }
}

/**
 * Builds payload for saving a full decision update.
 */
export function buildFullDecisionPayload(interview: Data.Interview) {
  const {
    type,
    notes,
    interviewer,
    attendance,
    conversation,
    conversationNotes,
    lastSemesterNotes,
    mockLessonEngagement,
    mockLessonExplanations,
    mockLessonNotes,
    mockLessonPace,
    mockLessonOverall,
    teachingPreferences,
    availabilityNotes,
    techNotes,
    date,
    likelyDecision,
  } = interview

  return {
    type,
    likelyDecision,
    notes,
    interviewer,
    attendance,
    conversation,
    conversationNotes,
    lastSemesterNotes,
    mockLessonEngagement,
    mockLessonExplanations,
    mockLessonNotes,
    mockLessonPace,
    mockLessonOverall,
    teachingPreferences,
    techNotes,
    availabilityNotes,
    date,
  }
}

/**
 * Computes the interview scheduling deadline date string.
 */
export function calculateInterviewDeadline(
  today: Date,
  instructorOrientationDate: string | Date,
): string {
  const weekDeadline = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const orientationTime = new Date(instructorOrientationDate).getTime()

  const targetTime = Math.min(weekDeadline.getTime(), orientationTime)
  return formatDateShort(new Date(targetTime))
}

/**
 * Constructs request payload for /api/scheduleInterview endpoint.
 *
 * `applicantUid` is the application document's id. The server resolves the
 * applicant's current address from Auth, so a `personal.email` that has gone
 * stale since they filed the application can't misdirect the mail. No address
 * is sent at all.
 */
export function buildScheduleInterviewPayload(
  applicantUid: string,
  firstName: string,
  deadline: string,
): ScheduleInterviewRequestBody {
  return {
    applicantUid,
    name: firstName,
    deadline,
  }
}

/**
 * Constructs request payload for /api/decision endpoint.
 *
 * See buildScheduleInterviewPayload for why this sends only `applicantUid`.
 */
export function buildDecisionApiPayload(
  newDecision: Data.Decision,
  applicantUid: string,
  firstName: string,
): DecisionRequestBody {
  return {
    decision: newDecision as
      'rejected' | 'waitlisted' | 'substitute' | 'accepted',
    applicantUid,
    name: firstName,
  }
}
