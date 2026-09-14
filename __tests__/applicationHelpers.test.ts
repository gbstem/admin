import type {} from '../src/data.d.ts'

import {
  resolveViewedSemester,
  resolveDecisionsCollectionPath,
  createDefaultApplicationValues,
  createDefaultInterviewValues,
  normalizeInterviewData,
  buildNotesPayload,
  buildLikelyDecisionPayload,
  buildFullDecisionPayload,
  calculateInterviewDeadline,
  buildScheduleInterviewPayload,
  buildDecisionApiPayload,
} from '$lib/helpers/application'
import { currentSemester, semesterCollectionPath } from '$lib/data/collections'

describe('Application Helper Functions', () => {
  describe('Semester Resolvers', () => {
    test('resolveViewedSemester resolves semester from collection path', () => {
      expect(resolveViewedSemester('semesters/spring2025/applications')).toBe(
        'spring2025',
      )
    })

    test('resolveViewedSemester falls back to currentSemester when no collection or non-matching path is passed', () => {
      expect(resolveViewedSemester(undefined)).toBe(currentSemester)
      expect(resolveViewedSemester('applications')).toBe(currentSemester)
    })

    test('resolveDecisionsCollectionPath returns correct decisions collection path', () => {
      expect(resolveDecisionsCollectionPath('spring2025')).toBe(
        semesterCollectionPath('spring2025', 'decisions'),
      )
    })
  })

  describe('Default Value Creators', () => {
    test('createDefaultApplicationValues produces expected empty application structure', () => {
      const app = createDefaultApplicationValues()
      expect(app.personal.email).toBe('')
      expect(app.personal.firstName).toBe('')
      expect(app.academic.school).toBe('')
      expect(app.program.courses).toEqual([])
      expect(app.essay.taughtBefore).toBe(false)
      expect(app.agreements.entireProgram).toBe(false)
      expect(app.meta.decided).toBe(false)
    })

    test('createDefaultInterviewValues produces expected default interview object', () => {
      const interview = createDefaultInterviewValues()
      expect(interview.type).toBe('interview')
      expect(interview.likelyDecision).toBe('likely no')
      expect(interview.attendance).toBe('Null')
      expect(interview.conversation).toBe(0)
      expect(interview.interviewer).toBe('')
    })
  })

  describe('normalizeInterviewData', () => {
    test('returns null decision and default interview when input is undefined or null', () => {
      const resNull = normalizeInterviewData(null)
      expect(resNull.decision).toBeNull()
      expect(resNull.interview.likelyDecision).toBeNull()
      expect(resNull.interview.type).toBe('interview')

      const resUndef = normalizeInterviewData(undefined)
      expect(resUndef.decision).toBeNull()
      expect(resUndef.interview.likelyDecision).toBeNull()
    })

    test('correctly normalizes snapshot data with missing/partial fields', () => {
      const snapshot: Partial<Data.Interview> = {
        type: 'accepted',
        interviewer: 'Jane Doe',
        conversation: 4,
        date: '2025-09-10T14:30:00Z',
      }
      const { decision, interview } = normalizeInterviewData(snapshot)

      expect(decision).toBe('accepted')
      expect(interview.type).toBe('accepted')
      expect(interview.interviewer).toBe('Jane Doe')
      expect(interview.conversation).toBe(4)
      expect(interview.conversationNotes).toBe('')
      expect(interview.mockLessonExplanations).toBe(0)
      expect(interview.date).toContain('2025-09-10')
    })

    test('handles invalid date strings gracefully without throwing', () => {
      const snapshot: Partial<Data.Interview> = {
        type: 'interview',
        date: 'invalid-date-string',
      }
      const { interview } = normalizeInterviewData(snapshot)
      expect(interview.date).toBe('')
    })
  })

  describe('Payload Builders', () => {
    test('buildNotesPayload correctly extracts interview notes fields', () => {
      const interview = createDefaultInterviewValues()
      interview.notes = 'Great candidate'
      interview.interviewer = 'Alex'
      interview.conversation = 5

      const payload = buildNotesPayload(interview)
      expect(payload.notes).toBe('Great candidate')
      expect(payload.interviewer).toBe('Alex')
      expect(payload.conversation).toBe(5)
      expect(payload).not.toHaveProperty('type')
      expect(payload).not.toHaveProperty('likelyDecision')
    })

    test('buildLikelyDecisionPayload returns expected object', () => {
      expect(buildLikelyDecisionPayload('likely yes', 'interview')).toEqual({
        likelyDecision: 'likely yes',
        type: 'interview',
      })
      expect(buildLikelyDecisionPayload(null, null)).toEqual({
        likelyDecision: null,
        type: null,
      })
    })

    test('buildFullDecisionPayload returns complete decision object', () => {
      const interview = createDefaultInterviewValues()
      interview.type = 'accepted'
      interview.likelyDecision = 'likely yes'
      interview.notes = 'Approved for teaching'

      const payload = buildFullDecisionPayload(interview)
      expect(payload.type).toBe('accepted')
      expect(payload.likelyDecision).toBe('likely yes')
      expect(payload.notes).toBe('Approved for teaching')
    })
  })

  describe('API & Deadline Helpers', () => {
    test('calculateInterviewDeadline chooses earlier of 7 days or orientation date', () => {
      const today = new Date('2025-09-01T12:00:00Z')

      // Case 1: Orientation is far away (e.g. Sept 30) -> deadline is 7 days from today (Sept 8)
      const orientationFar = new Date('2025-09-30T12:00:00Z')
      const deadlineFar = calculateInterviewDeadline(today, orientationFar)
      expect(deadlineFar).toContain('Sep 8')

      // Case 2: Orientation is close (e.g. Sept 3) -> deadline is orientation date (Sept 3)
      const orientationClose = new Date('2025-09-03T12:00:00Z')
      const deadlineClose = calculateInterviewDeadline(today, orientationClose)
      expect(deadlineClose).toContain('Sep 3')
    })

    test('buildScheduleInterviewPayload sends the applicant uid and no address', () => {
      const payload = buildScheduleInterviewPayload(
        'applicant-uid-1',
        'John',
        'Sep 8',
      )
      // The uid is the application document's id, so the server resolves the
      // applicant's *current* address rather than the one they typed on the
      // form.
      expect(payload).toEqual({
        applicantUid: 'applicant-uid-1',
        name: 'John',
        deadline: 'Sep 8',
      })
    })

    test('buildDecisionApiPayload sends the applicant uid and no address', () => {
      const payload = buildDecisionApiPayload(
        'accepted',
        'applicant-uid-1',
        'John',
      )
      expect(payload).toEqual({
        decision: 'accepted',
        applicantUid: 'applicant-uid-1',
        name: 'John',
      })
    })
  })
})
