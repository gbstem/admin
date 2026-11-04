// Declared before the imports: `.svelte.test.ts` files get no jest-hoist
// step (see SetInterviewTimesForm.svelte.test.ts).
jest.mock('#lib/client/firebase.js', () => {
  const { writable } = require('svelte/store')
  return { user: writable(undefined), auth: {}, db: {}, storage: {} }
})

import { flushSync, mount, unmount } from 'svelte'
import { fireEvent, waitFor, within } from '@testing-library/dom'
import { user as mockUserStore } from '#lib/client/firebase.js'
import InterviewerAvailability from '#lib/components/InterviewerAvailability.svelte'
import { interviewService } from '#lib/services/interviewService.js'
import {
  addWeeks,
  cellInstant,
  weekStart,
} from '#lib/shared/availabilityGrid.js'
import { toLocalISOString } from '#lib/utils.js'

const authUser = {
  object: { uid: 'rev-1', email: 'r@example.com', displayName: 'Rita' },
  profile: { uid: 'rev-1' },
}
const LINK = 'https://zoom.us/j/1234'

// Interviews open from next Sunday for three weeks.
const firstWeek = addWeeks(weekStart(new Date()), 1)
const interviewWindow = { opens: firstWeek, closes: addWeeks(firstWeek, 3) }

describe('InterviewerAvailability', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    ;(mockUserStore as any).set(undefined)
    jest.spyOn(interviewService, 'fetchInterviewSlots').mockResolvedValue([])
    jest.spyOn(interviewService, 'createOpenInterviewSlots').mockResolvedValue({
      created: 6,
      replaced: 0,
      skippedBooked: 0,
      skippedOverlap: 0,
      skippedOutside: 0,
    })
    jest.spyOn(interviewService, 'deleteOpenInterviewSlots').mockResolvedValue({
      deleted: 1,
      skippedBooked: 0,
      skippedNotOwn: 0,
    })
  })

  afterEach(() => {
    document.body.removeChild(container)
    jest.restoreAllMocks()
  })

  async function mountSignedIn() {
    const app = mount(InterviewerAvailability, {
      target: container,
      props: { window: interviewWindow },
    })
    flushSync()
    ;(mockUserStore as any).set(authUser)
    await waitFor(() => {
      expect(
        within(container).getByText('Paint your weekly availability'),
      ).toBeInTheDocument()
    })
    return app
  }

  const patternGrid = () =>
    within(container).getByRole('group', { name: 'Your weekly availability' })
  const reviewGrid = () =>
    within(container).getByRole('group', { name: /^Your slots for the/ })
  const cellIn = (grid: HTMLElement, key: string) =>
    // eslint-disable-next-line testing-library/no-node-access -- cells are addressed by their grid key, the coordinate the component draws them by
    grid.querySelector<HTMLElement>(`[data-cell="${key}"]`)!
  // A keyboard toggle: a click carrying no pointer (detail 0).
  const toggle = (grid: HTMLElement, key: string) => {
    fireEvent.click(cellIn(grid, key), { detail: 0 })
    flushSync()
  }

  it('previews the slots a pattern makes over the weeks, and creates them', async () => {
    ;(interviewService.fetchInterviewSlots as jest.Mock).mockResolvedValue([
      {
        id: 'old',
        date: toLocalISOString(cellInstant(firstWeek, '1:600')),
        meetingLink: LINK,
        interviewerUid: 'rev-1',
        interviewSlotStatus: 'available',
        intervieweeId: '',
      },
    ])
    const app = await mountSignedIn()

    // The link from the interviewer's latest slot is offered again.
    expect(
      within(container).getByLabelText('Your meeting link', { exact: false }),
    ).toHaveValue(LINK)

    toggle(patternGrid(), '1:930')
    toggle(patternGrid(), '3:930')
    expect(
      within(container).getByTestId('pattern-preview').textContent,
    ).toMatch(/2 interview slots per week over\s+3 weeks — 6 slots total/)

    fireEvent.click(within(container).getByText('Create 6 slots'))
    await waitFor(() => {
      expect(interviewService.createOpenInterviewSlots).toHaveBeenCalled()
    })
    const [dates, link] = (
      interviewService.createOpenInterviewSlots as jest.Mock
    ).mock.calls[0]
    expect(link).toBe(LINK)
    expect(dates).toEqual(
      [0, 1, 2].flatMap((w) => [
        cellInstant(addWeeks(firstWeek, w), '1:930'),
        cellInstant(addWeeks(firstWeek, w), '3:930'),
      ]),
    )

    unmount(app)
  })

  it('repeats through the end of the window by default, and never shows a blank "Through"', async () => {
    const app = await mountSignedIn()
    const from = within(container).getByTestId(
      'repeat-from',
    ) as HTMLSelectElement
    const through = within(container).getByTestId(
      'repeat-through',
    ) as HTMLSelectElement

    expect(from.value).toBe('0')
    expect(through.value).toBe('2')

    // Moving "Repeat from" past the chosen week carries "Through" with it.
    fireEvent.change(through, { target: { value: '0' } })
    flushSync()
    expect(through.value).toBe('0')
    fireEvent.change(from, { target: { value: '1' } })
    flushSync()
    expect(through.value).toBe('1')
    expect(through.selectedIndex).not.toBe(-1)

    unmount(app)
  })

  it('refuses to create slots without a valid meeting link', async () => {
    const app = await mountSignedIn()

    toggle(patternGrid(), '1:930')
    fireEvent.click(within(container).getByText('Create 3 slots'))
    flushSync()

    expect(interviewService.createOpenInterviewSlots).not.toHaveBeenCalled()

    unmount(app)
  })

  it('deletes an un-painted open slot from a week, and never a booked one', async () => {
    const open = cellInstant(firstWeek, '2:600')
    const taken = cellInstant(firstWeek, '2:615')
    ;(interviewService.fetchInterviewSlots as jest.Mock).mockResolvedValue([
      {
        id: 'open-1',
        date: toLocalISOString(open),
        meetingLink: LINK,
        interviewerUid: 'rev-1',
        interviewSlotStatus: 'available',
        intervieweeId: '',
      },
      {
        id: 'booked-1',
        date: toLocalISOString(taken),
        meetingLink: LINK,
        interviewerUid: 'rev-1',
        interviewSlotStatus: 'pending',
        intervieweeId: 'ada',
        intervieweeFirstName: 'Ada',
        intervieweeLastName: 'Lovelace',
      },
    ])
    const app = await mountSignedIn()

    // The window's first week is the first on show.
    expect(cellIn(reviewGrid(), '2:615')).toHaveTextContent('Ada')
    toggle(reviewGrid(), '2:600')
    toggle(reviewGrid(), '2:615')
    expect(within(container).getByTestId('week-preview').textContent).toMatch(
      /adds 0 slots and deletes\s+1 open slot/,
    )

    fireEvent.click(within(container).getByText('Save this week'))
    await waitFor(() => {
      expect(interviewService.deleteOpenInterviewSlots).toHaveBeenCalledWith([
        'open-1',
      ])
    })
    expect(interviewService.createOpenInterviewSlots).not.toHaveBeenCalled()

    unmount(app)
  })
})
