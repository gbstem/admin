// The component derives its signed-in state from `$lib/client/firebase`'s
// `user` store. Driving that store for real would mean faking a chain of
// Firebase SDK calls (getApps/initializeApp/getAuth/onAuthStateChanged)
// that's timing-sensitive and, since `user` is a
// module-level singleton, leaks state across tests in this file if not
// handled carefully. The component only ever reads the store's emitted
// {object, profile} shape via `user.subscribe(...)`, so mock that shape
// directly instead.
//
// This mock must be declared BEFORE the imports below: unlike ordinary
// `.test.ts` files, `.svelte.test.ts` files run through
// jest-transform-svelte-module.cjs, which does plain `ts.transpileModule`
// compilation with no jest-hoist step - so `jest.mock()` calls here are NOT
// hoisted above imports the way they are elsewhere in this repo (see the
// comment at the top of that file). Placed after the imports, this would
// register too late: '$lib/client/firebase' would already have been
// `require()`d (transitively, via the component and interviewService
// imports) using the real module.
jest.mock('$lib/client/firebase', () => {
  const { writable } = require('svelte/store')
  return {
    user: writable(undefined),
    auth: {},
    db: {},
    storage: {},
  }
})

import { mount, unmount, flushSync } from 'svelte'
import { fireEvent, waitFor, within } from '@testing-library/dom'
import { page } from '$app/state'
import { user as mockUserStore } from '$lib/client/firebase'
import SetInterviewTimesForm from '$lib/components/forms/SetInterviewTimesForm.svelte'
import { interviewService } from '$lib/services/interviewService'

const authUser = {
  object: {
    uid: 'user-1',
    email: 'interviewer@example.com',
    displayName: 'Jane Interviewer',
  },
  profile: {
    uid: 'user-1',
  },
  role: 'admin',
}

const reviewerAuthUser = {
  object: {
    uid: 'user-2',
    email: 'reviewer@example.com',
    displayName: 'Rita Reviewer',
  },
  profile: {
    uid: 'user-2',
  },
  role: 'reviewer',
}

// An admin who owns none of the slots below - what only the role lets through.
const otherAdminAuthUser = {
  object: {
    uid: 'user-3',
    email: 'other-admin@example.com',
    displayName: 'Ada Admin',
  },
  profile: {
    uid: 'user-3',
  },
  role: 'admin',
}

const futureSlot: Data.InterviewSlot = {
  id: 'slot-1',
  date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  interviewerName: 'Jane Interviewer',
  interviewerEmail: 'interviewer@example.com',
  // Fallback to email when uid is missing (e.g. if an account is deleted).
  interviewerUid: '',
  intervieweeFirstName: '',
  intervieweeLastName: '',
  intervieweeEmail: '',
  intervieweeId: '',
  interviewSlotStatus: 'available',
  meetingLink: 'https://meet.example.com/slot-1',
}

// Mirrors the production bug: `authUser` created this slot, then changed
// their account's email. The slot's `interviewerEmail` is still the old
// address, but `interviewerUid` - stamped at creation and never touched
// again - still points at them.
const staleEmailOwnSlot: Data.InterviewSlot = {
  ...futureSlot,
  id: 'slot-2',
  interviewerEmail: 'old-interviewer@example.com',
  interviewerUid: authUser.object.uid,
  meetingLink: 'https://meet.example.com/slot-2',
}

describe('SetInterviewTimesForm Component', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    ;(mockUserStore as any).set(undefined)

    jest.spyOn(interviewService, 'fetchInterviewSlots').mockResolvedValue([])
    jest.spyOn(interviewService, 'fetchSlotRequests').mockResolvedValue([])
    jest
      .spyOn(interviewService, 'fetchEligibleInterviewees')
      .mockResolvedValue({ names: [], options: [] })
    jest
      .spyOn(interviewService, 'createOrAssignInterviewSlot')
      .mockImplementation(async (slot) => ({ ...slot, id: 'new-slot' }))
    jest.spyOn(interviewService, 'deleteInterviewSlot').mockResolvedValue()
    jest.spyOn(interviewService, 'updateInterviewSlot').mockResolvedValue()
  })

  afterEach(() => {
    document.body.removeChild(container)
    jest.restoreAllMocks()
    delete (page.data as any).user
  })

  // Mounts with the store still unresolved (undefined), then resolves it to
  // `user` - mirroring the real timing where onMount subscribes before
  // Firebase's auth-state listener has fired. The role is the one the
  // signed-in layout provides from the server, there before the component is.
  async function mountAuthenticated(user: any = authUser) {
    ;(page.data as any).user = {
      uid: user.object.uid,
      email: user.object.email,
      emailVerified: true,
      role: user.role,
    }
    const app = mount(SetInterviewTimesForm, { target: container })
    flushSync()
    ;(mockUserStore as any).set(user)
    flushSync()
    await waitFor(() => {
      expect(within(container).getByText('Add A Time Slot')).toBeInTheDocument()
    })
    return app
  }

  it('shows a loading indicator before the signed-in user resolves', () => {
    const app = mount(SetInterviewTimesForm, { target: container })
    flushSync()

    expect(within(container).getByRole('status')).toBeInTheDocument()

    unmount(app)
  })

  it('renders the main form sections once the user and data have loaded', async () => {
    const app = await mountAuthenticated()

    expect(interviewService.fetchInterviewSlots).toHaveBeenCalled()
    expect(interviewService.fetchSlotRequests).toHaveBeenCalled()
    expect(interviewService.fetchEligibleInterviewees).toHaveBeenCalled()
    expect(
      within(container).getByText('Interview Time Requests'),
    ).toBeInTheDocument()
    // TextInput always renders a trailing (CSS-hidden when not required) "*"
    // span inside the <label>, so its accessible text content is literally
    // "Interview Meeting Link*" - match loosely rather than depending on
    // that implementation detail.
    expect(
      within(container).getByLabelText('Interview Meeting Link', {
        exact: false,
      }),
    ).toBeInTheDocument()
    expect(
      within(container).getByLabelText('Only include my interviews'),
    ).toBeInTheDocument()
    expect(
      within(container).getByLabelText('Only show future interview slots'),
    ).toBeInTheDocument()

    unmount(app)
  })

  it('renders an existing interview slot belonging to the signed-in user', async () => {
    ;(interviewService.fetchInterviewSlots as jest.Mock).mockResolvedValue([
      futureSlot,
    ])
    const app = await mountAuthenticated()

    await waitFor(() => {
      expect(
        within(container).getByText(futureSlot.meetingLink),
      ).toBeInTheDocument()
    })
    expect(within(container).getByText('available')).toBeInTheDocument()
    expect(within(container).getByText('Edit')).toBeInTheDocument()

    unmount(app)
  })

  // The add card's submit path is deliberately NOT covered here.
  //
  // It went through superforms in this change, so exercising it means firing a
  // real form submission - and jsdom implements neither implicit submission
  // from a submit button's click nor the constraint validation superforms
  // relies on, so a jsdom test of it asserts the harness rather than the form.
  // Cypress covers it against a real browser instead: interviews.cy.ts Test
  // Case 16b (a filled slot reaches Firestore with every field) and 16c (an
  // empty one is refused). The test that used to live here asserted the
  // opposite - that an empty card wrote a slot - which is the behaviour this
  // change removed.

  it('deletes a timeslot the signed-in user owns', async () => {
    ;(interviewService.fetchInterviewSlots as jest.Mock)
      .mockResolvedValueOnce([futureSlot])
      .mockResolvedValue([])
    const app = await mountAuthenticated()

    await waitFor(() => {
      expect(within(container).getByText('Edit')).toBeInTheDocument()
    })
    await fireEvent.click(within(container).getByText('Edit'))
    flushSync()

    await waitFor(() => {
      expect(within(container).getByText('Delete')).toBeInTheDocument()
    })
    await fireEvent.click(within(container).getByText('Delete'))
    flushSync()

    await waitFor(() => {
      expect(interviewService.deleteInterviewSlot).toHaveBeenCalledWith(
        futureSlot.id,
      )
    })

    // The deleted slot's card must actually leave the DOM, not just have
    // triggered the delete call -- this is what a slow/stale refetch would miss.
    await waitFor(() => {
      expect(
        within(container).queryByText(futureSlot.meetingLink),
      ).not.toBeInTheDocument()
    })

    unmount(app)
  })

  it('hides the Edit control for a slot the signed-in reviewer does not own', async () => {
    ;(interviewService.fetchInterviewSlots as jest.Mock).mockResolvedValue([
      futureSlot,
    ])
    const app = await mountAuthenticated(reviewerAuthUser)

    // The card itself is filtered out by "Only include my interviews" until
    // that box is unchecked, since the slot belongs to a different user.
    await fireEvent.click(
      within(container).getByLabelText('Only include my interviews'),
    )
    flushSync()

    await waitFor(() => {
      expect(
        within(container).getByText(futureSlot.meetingLink),
      ).toBeInTheDocument()
    })
    expect(within(container).queryByText('Edit')).toBeNull()

    unmount(app)
  })

  it('shows the Edit control to an admin for a slot someone else owns', async () => {
    ;(interviewService.fetchInterviewSlots as jest.Mock).mockResolvedValue([
      futureSlot,
    ])
    const app = await mountAuthenticated(otherAdminAuthUser)

    await fireEvent.click(
      within(container).getByLabelText('Only include my interviews'),
    )
    flushSync()

    await waitFor(() => {
      expect(
        within(container).getByText(futureSlot.meetingLink),
      ).toBeInTheDocument()
    })
    expect(within(container).getByText('Edit')).toBeInTheDocument()

    unmount(app)
  })

  it('still shows an owned slot, with Edit available, after the owner changes email', async () => {
    // Regression test for a production bug: an admin whose account email had
    // changed found her own slot missing under "Only include my interviews"
    // until she unchecked it. `staleEmailOwnSlot`'s `interviewerEmail` no
    // longer matches `authUser`, but its `interviewerUid` does.
    ;(interviewService.fetchInterviewSlots as jest.Mock).mockResolvedValue([
      staleEmailOwnSlot,
    ])
    const app = await mountAuthenticated(authUser)

    // "Only include my interviews" is checked by default - the slot must
    // still surface without unchecking it.
    await waitFor(() => {
      expect(
        within(container).getByText(staleEmailOwnSlot.meetingLink),
      ).toBeInTheDocument()
    })
    expect(within(container).getByText('Edit')).toBeInTheDocument()

    unmount(app)
  })
})
