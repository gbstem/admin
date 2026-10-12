const mockResolveAccountEmail = jest.fn()
const mockSendEmail = jest.fn()

jest.mock('#lib/server/accountEmail.js', () => ({
  resolveAccountEmail: (...args: any[]) => mockResolveAccountEmail(...args),
}))
jest.mock('#lib/server/email.js', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

import { semesterDates } from '#lib/data/collections.js'
import { sendDecisionEmail } from '#lib/server/decisionEmails.js'
import { parseGbstemDateTime } from '#lib/shared/gbstemTime.js'
import { GBSTEM_TIME_ZONE, formatDateShort } from '#lib/utils.js'

const applicant = { applicationId: 'uid-1', firstName: 'Ada' }

beforeEach(() => {
  jest.clearAllMocks()
  mockResolveAccountEmail.mockResolvedValue('ada@test.com')
  mockSendEmail.mockResolvedValue(undefined)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('sendDecisionEmail', () => {
  it("invites an 'interview' applicant to schedule, at their account's current address", async () => {
    await expect(sendDecisionEmail(applicant, 'interview')).resolves.toBe(true)

    // The application id is the applicant's uid.
    expect(mockResolveAccountEmail).toHaveBeenCalledWith(
      'uid-1',
      'Applicant',
      '/api/decision',
    )
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@test.com',
        subject: 'Please schedule your gbSTEM instructor interview',
      }),
    )
    expect(mockSendEmail.mock.calls[0][0].html).toContain('Ada')
  })

  it('asks for scheduling by the last interview day when that is within a week', async () => {
    // Late on the second-to-last day, in gbSTEM time: a week out is past the
    // window, so the deadline is its last day - read in gbSTEM's zone, not
    // the server's.
    const now = parseGbstemDateTime(semesterDates.interviewsEnd, '23:00', -1)
    await sendDecisionEmail(applicant, 'interview', now)

    const lastDay = formatDateShort(
      parseGbstemDateTime(semesterDates.interviewsEnd, '12:00'),
      GBSTEM_TIME_ZONE,
    )
    expect(mockSendEmail.mock.calls[0][0].html).toContain(lastDay)
  })

  it('asks for scheduling within a week when the window runs longer', async () => {
    const now = parseGbstemDateTime(semesterDates.interviewsEnd, '12:00', -30)
    await sendDecisionEmail(applicant, 'interview', now)

    const weekOut = formatDateShort(
      parseGbstemDateTime(semesterDates.interviewsEnd, '12:00', -23),
      GBSTEM_TIME_ZONE,
    )
    expect(mockSendEmail.mock.calls[0][0].html).toContain(weekOut)
  })

  it.each(['accepted', 'substitute', 'waitlisted', 'rejected'] as const)(
    'sends the %s outcome',
    async (decision) => {
      await expect(sendDecisionEmail(applicant, decision)).resolves.toBe(true)

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ada@test.com',
          subject: 'gbSTEM Instructor Decision',
        }),
      )
    },
  )

  it('sends a different email for each outcome', async () => {
    const bodies = new Set<string>()
    for (const decision of [
      'interview',
      'accepted',
      'substitute',
      'waitlisted',
      'rejected',
    ] as const) {
      await sendDecisionEmail(applicant, decision)
      bodies.add(mockSendEmail.mock.calls.at(-1)[0].html)
    }
    expect(bodies.size).toBe(5)
  })

  it.each([
    [
      'the account is gone',
      () => mockResolveAccountEmail.mockRejectedValue(new Error('gone')),
      applicant,
    ],
    [
      'sending fails',
      () => mockSendEmail.mockRejectedValue(new Error('smtp')),
      applicant,
    ],
    [
      'the application has no first name',
      () => {},
      { ...applicant, firstName: '' },
    ],
  ])('reports false rather than throwing when %s', async (_, arrange, who) => {
    arrange()

    await expect(sendDecisionEmail(who, 'accepted')).resolves.toBe(false)
  })
})
