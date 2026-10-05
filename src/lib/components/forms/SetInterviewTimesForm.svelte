<script lang="ts">
  import { page } from '$app/state'
  import { user } from '$lib/client/firebase'
  import CheckboxInput from '$lib/components/CheckboxInput.svelte'
  import {
    canMarkSlotMissed,
    canUserModifySlot,
    groupSlotRequests,
    intervieweeLabel,
    isOwnInterviewSlot,
    resetInterviewSlotToAdd,
    toInterviewSlotFormValues,
    type EligibleInterviewee,
  } from '$lib/helpers/setInterviewTimes'
  import { interviewService } from '$lib/services/interviewService'
  import { alert } from '$lib/stores'
  import { cn, formatDate, formatDateLocal, toLocalISOString } from '$lib/utils'
  import { onMount } from 'svelte'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import Button from '../Button.svelte'
  import Card from '../Card.svelte'
  import FormInput from '../FormInput.svelte'
  import Loading from '../Loading.svelte'
  import Select from '../Select.svelte'
  import { openableMeetingLink } from '$lib/helpers/meetingLink'
  import { getInterviewSlotDefaults, interviewSlotSchema } from './schemas'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { Trash } from '@steeze-ui/heroicons'

  interface Props {
    class?: string
  }

  let { class: className = '' }: Props = $props()

  let editSlot = $state('')
  let interviewees: EligibleInterviewee[] = $state([])
  // The picker's text: an applicant's label once one is chosen.
  let interviewee: string = $state('')
  let onlyIncludeMyInterviews = $state(true)
  let onlyShowFutureSlots = $state(true)
  let showValidation = false
  let allInterviewSlots: Data.InterviewSlot[] = $state([])
  let interviewSlotRequests: Data.SlotRequest[] = $state([])
  let interviewSlotToAdd: Data.InterviewSlot = $state(
    getInterviewSlotDefaults(),
  )

  const schema = interviewSlotSchema

  /**
   * The "Add A Time Slot" card.
   *
   * Superforms makes the schema the thing that actually guards the write.
   *
   * `interviewSlotToAdd` is the carrier for the fields the schema doesn't own
   * (`id`) and for the interviewee lookup below, which writes into
   * `$addFormData` so validation sees it.
   */
  const addFormResult = superForm(
    defaults(
      toInterviewSlotFormValues(getInterviewSlotDefaults()),
      zod(schema as any) as any,
    ) as any,
    {
      id: 'add-interview-slot',
      SPA: true,
      validators: zod(schema as any) as any,
      resetForm: false,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        await addTime(formVal.data)
      },
    },
  )
  const {
    form: addFormData,
    enhance: addEnhance,
    delayed: addDelayed,
  } = addFormResult

  /**
   * The per-slot edit card. One superForm rather than one per slot: `editSlot`
   * holds a single id, so only one card is ever open, and its values are set
   * when that card opens.
   */
  const editFormResult = superForm(
    defaults(
      toInterviewSlotFormValues(getInterviewSlotDefaults()),
      zod(schema as any) as any,
    ) as any,
    {
      id: 'edit-interview-slot',
      SPA: true,
      validators: zod(schema as any) as any,
      resetForm: false,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        const slot = allInterviewSlots.find((s) => s.id === editSlot)
        if (!slot) return
        await updateTime({ ...slot, ...formVal.data })
        editSlot = ''
      },
    },
  )
  const {
    form: editFormData,
    enhance: editEnhance,
    delayed: editDelayed,
  } = editFormResult

  function openSlotForEdit(slot: Data.InterviewSlot) {
    editSlot = slot.id
    editFormResult.form.set(toInterviewSlotFormValues(slot))
  }

  let currentUser: Data.User.Store | undefined = $state()
  let loading = $state(true)
  let loadError = $state<string | null>(null)

  async function getData() {
    return interviewService.fetchInterviewSlots()
  }

  // addTime/updateTime/deleteTime each independently refetch and reassign
  // allInterviewSlots after their own write. Since those refetches run
  // concurrently and aren't guaranteed to resolve in the order they started,
  // an older (slower) refetch can resolve after a newer one and clobber it
  // with stale data -- e.g. an edit's refetch overwriting a delete that
  // already completed. Guard with a request counter so only the
  // most-recently-started refetch is ever applied.
  let slotsRequestVersion = 0
  async function refetchSlots() {
    const version = ++slotsRequestVersion
    const data = await getData()
    if (version === slotsRequestVersion) {
      allInterviewSlots = data
    }
  }

  async function getTimeRequests() {
    return interviewService.fetchSlotRequests()
  }

  // requestId -> the applicant's current address, resolved from the uid on
  // the request. Requests store no address: a stored copy went stale as soon
  // as the applicant changed their account email.
  let slotRequestEmails: Record<string, string> = $state({})

  async function loadSlotRequestEmails() {
    try {
      slotRequestEmails = await interviewService.fetchSlotRequestEmails(
        interviewSlotRequests,
      )
    } catch (err) {
      console.error('Failed to resolve slot request addresses:', err)
    }
  }

  async function getInterviewees() {
    return interviewService.fetchEligibleInterviewees()
  }

  // The picker offers labels, so each applicant needs a distinct one: two
  // applicants with the same name are told apart by their application id.
  let intervieweesByLabel = $derived.by(() => {
    const counts = new Map<string, number>()
    for (const e of interviewees) {
      counts.set(
        intervieweeLabel(e),
        (counts.get(intervieweeLabel(e)) ?? 0) + 1,
      )
    }
    return new Map(
      interviewees.map((e) => {
        const name = intervieweeLabel(e)
        const label =
          (counts.get(name) ?? 0) > 1 ? `${name} (${e.applicationId})` : name
        return [label, e] as const
      }),
    )
  })
  let intervieweeOptions = $derived(
    [...intervieweesByLabel.keys()].map((name) => ({ name })),
  )
  let selectedInterviewee = $derived(intervieweesByLabel.get(interviewee))

  function labelOf(target: EligibleInterviewee): string {
    for (const [label, e] of intervieweesByLabel) {
      if (e.applicationId === target.applicationId) return label
    }
    return ''
  }

  let requestGroups = $derived(
    groupSlotRequests(interviewSlotRequests, interviewees),
  )

  /** Fills the Add-a-Slot card from one of an applicant's time requests. */
  function scheduleRequest(
    target: EligibleInterviewee,
    request: Data.SlotRequest,
  ) {
    interviewee = labelOf(target)
    addFormData.update((current: any) => ({
      ...current,
      date: toLocalISOString(request.date),
    }))
  }

  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        try {
          currentUser = user
          await refetchSlots()
          interviewSlotRequests = await getTimeRequests()
          void loadSlotRequestEmails()
          interviewees = await getInterviewees()
          addFormData.update((current: any) => ({
            ...current,
            interviewerName: currentUser?.object.displayName ?? '',
            interviewerUid: currentUser?.object.uid ?? '',
          }))
          loadError = null
        } catch (err: any) {
          console.error('Failed to load interview slots:', err)
          loadError = err.message || 'Failed to load interview data.'
        } finally {
          loading = false
        }
      }
    })
  })

  function isMyInterview(interview: Data.InterviewSlot): boolean {
    return isOwnInterviewSlot(interview, currentUser?.object?.uid)
  }

  const addTime = async (formData: any) => {
    const assignee = selectedInterviewee
    if (assignee) {
      const confirmation = confirm(
        `Are you sure you want to assign ${intervieweeLabel(assignee)} as the interviewee for this slot? An email will be sent to the interviewee confirming the interview has been scheduled.`,
      )
      if (!confirmation) {
        return
      }
    }

    try {
      const { id, emailSent } =
        await interviewService.createOrAssignInterviewSlot(
          formData,
          assignee?.applicationId,
        )
      allInterviewSlots = [
        ...allInterviewSlots,
        {
          ...interviewSlotToAdd,
          ...formData,
          id,
          ...(assignee
            ? {
                intervieweeId: assignee.uid,
                intervieweeFirstName: assignee.firstName,
                intervieweeLastName: assignee.lastName,
                interviewSlotStatus: 'pending',
              }
            : {}),
        },
      ]
      const assigning = Boolean(assignee)
      if (!assigning) {
        alert.trigger('success', 'Timeslot added successfully.')
      } else if (emailSent) {
        alert.trigger('success', 'Interviewee assigned and email sent.')
      } else {
        alert.trigger(
          'error',
          'Interviewee assigned, but their email could not be sent.',
        )
      }
    } catch (err: any) {
      console.error('Add timeslot error:', err)
      alert.trigger('error', `Failed to add timeslot: ${err.message}`)
    }

    interviewSlotToAdd = resetInterviewSlotToAdd(
      currentUser?.object?.displayName ?? '',
      currentUser?.object?.uid ?? '',
    )
    addFormData.set(toInterviewSlotFormValues(interviewSlotToAdd))
    interviewee = ''
    await Promise.all([refetchSlots(), refetchInterviewees()])
  }

  // Assigning, deleting or marking a booked slot missed changes who still
  // needs an interview, and so which time requests list.
  async function refetchInterviewees() {
    try {
      interviewees = await getInterviewees()
    } catch (err) {
      console.error('Failed to reload interviewees:', err)
    }
  }

  function handleClear() {
    interviewee = ''
    addFormData.update((current: any) => ({
      ...current,
      ...toInterviewSlotFormValues(
        resetInterviewSlotToAdd(
          current.interviewerName,
          current.interviewerUid,
        ),
      ),
      // The date and link the interviewer already typed are theirs to keep -
      // this button clears the *interviewee*, which is all it claims to do.
      date: current.date,
      meetingLink: current.meetingLink,
    }))
    alert.trigger('success', 'Interviewee cleared.')
  }

  /**
   * Toasts a finished slot change, and whether its applicant was emailed
   * about it when it emailed anyone (`emailSent` is absent when not).
   */
  function reportChange(done: string, emailSent: boolean | undefined) {
    if (emailSent === undefined) {
      alert.trigger('success', done)
    } else if (emailSent) {
      alert.trigger('success', `${done} The applicant was emailed.`)
    } else {
      alert.trigger(
        'error',
        `${done} But the applicant's email could not be sent.`,
      )
    }
  }

  async function updateTime(interview: Data.InterviewSlot) {
    if (
      !canUserModifySlot(
        interview,
        currentUser?.object?.uid,
        page.data.user?.role,
      )
    ) {
      alert.trigger(
        'error',
        'This interview does not belong to you and you are not an admin!',
      )
      return
    }
    try {
      const { emailSent } =
        await interviewService.updateInterviewSlot(interview)
      reportChange('Timeslot updated successfully.', emailSent)
      await refetchSlots()
    } catch (err: any) {
      console.error('Update timeslot error:', err)
      alert.trigger('error', `Failed to update timeslot: ${err.message}`)
    }
  }

  const deleteTime = async (interview: Data.InterviewSlot) => {
    if (
      !canUserModifySlot(
        interview,
        currentUser?.object?.uid,
        page.data.user?.role,
      )
    ) {
      alert.trigger(
        'error',
        'This interview does not belong to you and you are not an admin!',
      )
      return
    }
    try {
      const { emailSent } =
        await interviewService.deleteInterviewSlot(interview)
      // Remove it from local state immediately rather than waiting on the
      // refetch below, so the card disappears even if that round trip is slow.
      allInterviewSlots = allInterviewSlots.filter(
        (slot) => slot.id !== interview.id,
      )
      reportChange('Timeslot successfully deleted.', emailSent)
      await Promise.all([refetchSlots(), refetchInterviewees()])
    } catch (err: any) {
      console.error('Delete timeslot error:', err)
      alert.trigger('error', `Failed to delete timeslot: ${err.message}`)
    }
  }

  // The slot whose Mark missed choice is open, if any.
  let markingMissed = $state('')

  /**
   * Records that `interview` didn't happen - the interviewer or the
   * applicant may have missed it - which lets its applicant be scheduled
   * again.
   */
  async function markMissed(
    interview: Data.InterviewSlot,
    missedBy: Data.InterviewMissedBy,
  ) {
    markingMissed = ''
    try {
      const { emailSent } = await interviewService.markInterviewSlotMissed(
        interview,
        missedBy,
      )
      reportChange(
        `Marked missed. ${interview.intervieweeFirstName} can now be scheduled again.`,
        emailSent,
      )
      await Promise.all([refetchSlots(), refetchInterviewees()])
    } catch (err: any) {
      console.error('Mark missed error:', err)
      alert.trigger('error', `Failed to mark missed: ${err.message}`)
    }
  }

  const missedByLabel: Record<Data.InterviewMissedBy, string> = {
    interviewer: 'interviewer',
    interviewee: 'applicant',
  }
</script>

<svelte:boundary>
  {#snippet failed(err, reset)}
    <div class="rounded-lg bg-red-100 p-4 text-red-700">
      <p class="font-bold">
        An unexpected error occurred rendering interview timeslots:
      </p>
      <p class="mt-1">{err instanceof Error ? err.message : String(err)}</p>
      <Button color="red" class="mt-3 px-3 py-1" onclick={reset}>Retry</Button>
    </div>
  {/snippet}

  {#if loading}
    <Loading />
  {:else if loadError}
    <div class="rounded-lg bg-red-100 p-4 text-red-700">
      <p class="font-bold">Error loading interview timeslots:</p>
      <p class="mt-1">{loadError}</p>
    </div>
  {:else}
    <div class={cn('w-full', showValidation && 'show-validation', className)}>
      <div class="right-2 items-center">
        <Card class="mb-4">
          <h2 class="font-bold">Interview Time Requests</h2>
          <!-- Only applicants who still need an interview: once one is
               scheduled or decided their requests drop out, and they come
               back if that interview is deleted or marked missed. -->
          {#each requestGroups as group (group.interviewee.uid)}
            <div class="mt-2 rounded-lg border border-gray-200 p-4">
              <p>
                <b>{intervieweeLabel(group.interviewee)}</b>
                <span class="ml-2"
                  >{slotRequestEmails[group.requests[0].id] ?? ''}</span
                >
              </p>
              {#each group.requests as request (request.id)}
                <div
                  class={cn(
                    'mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg p-2',
                    request.date > new Date() ? 'bg-blue-100' : 'bg-red-100',
                  )}
                >
                  <p>{formatDateLocal(request.date)}</p>
                  {#if page.data.user?.role === 'admin'}
                    <Button
                      color="blue"
                      class="px-2 py-1"
                      type="button"
                      onclick={() =>
                        scheduleRequest(group.interviewee, request)}
                      >Schedule this</Button
                    >
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </Card>
        <form novalidate use:addEnhance class="w-full">
          <Card>
            <h2 class="font-bold">Add A Time Slot</h2>
            <FormInput
              form={addFormResult}
              name="date"
              inputName="set-date-your-local-time"
              type="datetime-local"
              label="Set Date (your local time)"
              bind:value={$addFormData.date}
            />
            <FormInput
              form={addFormResult}
              name="meetingLink"
              inputName="interview-meeting-link"
              label="Interview Meeting Link"
              bind:value={$addFormData.meetingLink}
            />
            <div class="flex items-end gap-4">
              <Select
                bind:value={interviewee}
                label="Assign Interviewee (ONLY USE when fulfilling that person's interview time request)"
                options={intervieweeOptions}
              />
              <Button
                color="red"
                class="h-fit"
                onclick={() => {
                  handleClear()
                }}><Icon src={Trash} class="size-6 text-black" /></Button
              >
            </div>
            <div class="right-2 items-center">
              <Button
                color="blue"
                class="my-4 px-2 py-1"
                type="submit"
                disabled={$addDelayed}>Confirm Timeslot</Button
              >
            </div>
          </Card>
        </form>

        <div class="my-5 flex gap-5">
          <CheckboxInput
            bind:value={onlyIncludeMyInterviews}
            label="Only include my interviews"
          />
          <CheckboxInput
            bind:value={onlyShowFutureSlots}
            label="Only show future interview slots"
          />
        </div>
      </div>

      {#each allInterviewSlots as interview (interview.id)}
        {#if editSlot === interview.id}
          {#if ((onlyIncludeMyInterviews && isMyInterview(interview)) || !onlyIncludeMyInterviews) && ((onlyShowFutureSlots && new Date(interview.date) > new Date()) || !onlyShowFutureSlots)}
            <Card>
              <form
                novalidate
                use:editEnhance
                class={cn(
                  'w-full',
                  showValidation && 'show-validation',
                  className,
                )}
              >
                <div style="padding:1rem;">
                  <div>
                    <b>Interviewer: </b>{interview.interviewerName}
                  </div>
                  <FormInput
                    form={editFormResult}
                    name="date"
                    inputName="edit-interview-meeting-time"
                    type="datetime-local"
                    label="Edit Interview Meeting Time"
                    bind:value={$editFormData.date}
                  />
                  <FormInput
                    form={editFormResult}
                    name="meetingLink"
                    inputName="edit-interview-meeting-link"
                    label="Edit Interview Meeting Link"
                    bind:value={$editFormData.meetingLink}
                  />
                  <div class="flex gap-5">
                    <div class="right-2 items-center">
                      <Button
                        color="blue"
                        class="my-4 px-2 py-1"
                        type="submit"
                        disabled={$editDelayed}>Save</Button
                      >
                    </div>
                    <div class="right-2 items-center">
                      <Button
                        color="blue"
                        class="my-4 px-2 py-1"
                        onclick={() => {
                          deleteTime(interview)
                          editSlot = ''
                        }}>Delete</Button
                      >
                    </div>
                    <div class="right-2 items-center">
                      <Button
                        color="gray"
                        class="my-4 px-2 py-1"
                        type="button"
                        onclick={() => {
                          editSlot = ''
                        }}>Close</Button
                      >
                    </div>
                  </div>
                </div>
              </form>
            </Card>
          {/if}
        {:else if ((onlyIncludeMyInterviews && isMyInterview(interview)) || !onlyIncludeMyInterviews) && ((onlyShowFutureSlots && new Date(interview.date) > new Date()) || !onlyShowFutureSlots)}
          <Card>
            <div class="my-1">
              <b>Interviewer:</b>
              {interview.interviewerName}
            </div>
            <div>
              <b>Time:</b>
              {formatDate(new Date(interview.date))}
            </div>
            <div>
              <b>Meeting Link:</b>
              {#if openableMeetingLink(interview.meetingLink)}
                <a
                  href={openableMeetingLink(interview.meetingLink)}
                  target="_blank"
                  rel="noopener"
                  class="break-all text-blue-600 hover:underline"
                >
                  {interview.meetingLink}
                </a>
              {:else if interview.meetingLink}
                <span class="font-medium text-red-600"
                  >Invalid meeting link</span
                >
              {:else}
                <span class="text-gray-500">None</span>
              {/if}
            </div>
            <!-- interview status -->
            <div>
              <b>Interview Status:</b>
              {#if interview.interviewSlotStatus === 'missed'}
                missed{interview.missedBy
                  ? ` (by the ${missedByLabel[interview.missedBy]})`
                  : ''}
              {:else}
                {interview.interviewSlotStatus}
              {/if}
            </div>

            {#if interview.intervieweeId !== ''}
              <div>
                <b>Interviewee:</b>
                {interview.intervieweeFirstName}
                {interview.intervieweeLastName}
              </div>
            {/if}

            {@const canEdit =
              (interview.interviewSlotStatus === 'available' ||
                interview.interviewSlotStatus === 'pending') &&
              (isMyInterview(interview) || page.data.user?.role === 'admin')}
            {@const canMarkMissed =
              canMarkSlotMissed(interview) &&
              canUserModifySlot(
                interview,
                currentUser?.object?.uid,
                page.data.user?.role,
              )}
            {#if canEdit || canMarkMissed}
              <div class="my-4 flex flex-wrap gap-2">
                {#if canEdit}
                  <Button
                    color="blue"
                    class="px-2 py-1"
                    onclick={() => openSlotForEdit(interview)}>Edit</Button
                  >
                {/if}
                {#if canMarkMissed && markingMissed !== interview.id}
                  <Button
                    color="gray"
                    class="px-2 py-1"
                    type="button"
                    onclick={() => (markingMissed = interview.id)}
                    >Mark missed</Button
                  >
                {/if}
              </div>
            {/if}

            {#if canMarkMissed && markingMissed === interview.id}
              <!-- Either side may have missed it; the applicant can be
                   scheduled again whichever it was. -->
              <div class="mb-4 rounded-lg bg-yellow-50 p-3">
                <p>
                  Who missed this interview? {interview.intervieweeFirstName}
                  will be able to schedule again either way.
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <Button
                    color="blue"
                    class="px-2 py-1"
                    type="button"
                    onclick={() => markMissed(interview, 'interviewer')}
                    >The interviewer couldn't make it</Button
                  >
                  <Button
                    color="blue"
                    class="px-2 py-1"
                    type="button"
                    onclick={() => markMissed(interview, 'interviewee')}
                    >The applicant didn't attend</Button
                  >
                  <Button
                    color="gray"
                    class="px-2 py-1"
                    type="button"
                    onclick={() => (markingMissed = '')}>Cancel</Button
                  >
                </div>
              </div>
            {/if}
          </Card>
        {/if}
      {/each}
    </div>
  {/if}
</svelte:boundary>
