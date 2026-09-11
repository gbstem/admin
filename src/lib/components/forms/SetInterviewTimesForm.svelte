<script lang="ts">
  import { page } from '$app/state'
  import { user } from '$lib/client/firebase'
  import CheckboxInput from '$lib/components/CheckboxInput.svelte'
  import {
    canUserModifySlot,
    isOwnInterviewSlot,
    resetInterviewSlotToAdd,
    toInterviewSlotFormValues,
  } from '$lib/helpers/setInterviewTimes'
  import { interviewService } from '$lib/services/interviewService'
  import { alert } from '$lib/stores'
  import { cn, formatDate, formatDateLocal } from '$lib/utils'
  import { onMount } from 'svelte'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import Button from '../Button.svelte'
  import Card from '../Card.svelte'
  import FormInput from '../FormInput.svelte'
  import Loading from '../Loading.svelte'
  import Select from '../Select.svelte'
  import { getInterviewSlotDefaults, interviewSlotSchema } from './schemas'

  interface Props {
    class?: string
  }

  let { class: className = '' }: Props = $props()

  let editSlot = $state('')
  let intervieweeNames: { name: string }[] = $state([])
  let intervieweeOptions: Data.Application<'client'>[] = $state([])
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

  async function getInterviewees() {
    return interviewService.fetchEligibleInterviewees()
  }

  let selectedIntervieweeDocId = $state('')
  $effect(() => {
    if (interviewee) {
      const selectedInterviewee = intervieweeOptions.find(
        (option) =>
          `${option.personal.firstName} ${option.personal.lastName}` ===
          interviewee,
      )
      if (selectedInterviewee) {
        const {
          personal: { email, firstName, lastName },
          meta: { uid },
        } = selectedInterviewee
        selectedIntervieweeDocId = (selectedInterviewee as any).docId || ''
        // Into the form store, not `interviewSlotToAdd`: these are schema
        // fields, so they have to be what validation and the write see.
        addFormData.update((current: any) => ({
          ...current,
          intervieweeId: uid,
          intervieweeEmail: email,
          intervieweeFirstName: firstName,
          intervieweeLastName: lastName,
          interviewSlotStatus: 'pending',
        }))
      }
    }
  })

  onMount(() => {
    return user.subscribe(async (user) => {
      if (user) {
        try {
          currentUser = user
          await refetchSlots()
          interviewSlotRequests = await getTimeRequests()
          const intervieweeInfo = await getInterviewees()
          intervieweeNames = intervieweeInfo.names
          intervieweeOptions = intervieweeInfo.options
          addFormData.update((current: any) => ({
            ...current,
            interviewerName: currentUser?.object.displayName ?? '',
            interviewerEmail: currentUser?.object.email ?? '',
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
    return isOwnInterviewSlot(
      interview,
      currentUser?.object?.email,
      currentUser?.object?.uid,
    )
  }

  const addTime = async (formData: any) => {
    if (formData.intervieweeId != '') {
      const confirmation = confirm(
        `Are you sure you want to assign ${formData.intervieweeFirstName} ${formData.intervieweeLastName} as the interviewee for this slot? An email will be sent to the interviewee confirming the interview has been scheduled.`,
      )
      if (!confirmation) {
        return
      }
    }

    try {
      // `id` comes from `interviewSlotToAdd` rather than the form: the schema
      // doesn't describe it and the service generates the real one anyway.
      const addedSlot = await interviewService.createOrAssignInterviewSlot(
        { ...interviewSlotToAdd, ...formData },
        selectedIntervieweeDocId,
        currentUser?.object?.uid,
      )
      allInterviewSlots = [...allInterviewSlots, addedSlot]
      if (formData.intervieweeId != '') {
        alert.trigger('success', 'Interviewee assigned and email sent.')
      } else {
        alert.trigger('success', 'Timeslot added successfully.')
      }
    } catch (err: any) {
      console.error('Add timeslot error:', err)
      alert.trigger('error', 'Failed to add timeslot.')
    }

    interviewSlotToAdd = resetInterviewSlotToAdd(
      currentUser?.object?.displayName ?? '',
      currentUser?.object?.email ?? '',
      currentUser?.object?.uid ?? '',
    )
    addFormData.set(toInterviewSlotFormValues(interviewSlotToAdd))
    interviewee = ''
    await refetchSlots()
  }

  function handleClear() {
    interviewee = ''
    addFormData.update((current: any) => ({
      ...current,
      ...toInterviewSlotFormValues(
        resetInterviewSlotToAdd(
          current.interviewerName,
          current.interviewerEmail,
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

  async function updateTime(interview: Data.InterviewSlot) {
    if (
      !canUserModifySlot(
        interview,
        currentUser?.object?.email,
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
      await interviewService.updateInterviewSlot(interview)
      alert.trigger('success', 'Timeslot updated successfully.')
      await refetchSlots()
    } catch (err: any) {
      console.error('Update timeslot error:', err)
      alert.trigger('error', 'Failed to update timeslot.')
    }
  }

  const deleteTime = async (interview: Data.InterviewSlot) => {
    if (
      !canUserModifySlot(
        interview,
        currentUser?.object?.email,
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
      await interviewService.deleteInterviewSlot(interview)
      // Remove it from local state immediately rather than waiting on the
      // refetch below, so the card disappears even if that round trip is slow.
      allInterviewSlots = allInterviewSlots.filter(
        (slot) => slot.id !== interview.id,
      )
      alert.trigger('success', 'Timeslot successfully deleted.')
      await refetchSlots()
    } catch (err: any) {
      console.error('Delete timeslot error:', err)
      alert.trigger('error', 'Failed to delete timeslot.')
    }
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
          {#each interviewSlotRequests as request (request.id)}
            {#if intervieweeOptions.find((option) => option.meta.uid === (request.uid || request.id.replace(/-\d{4}-\d{2}-\d{2}.*$/, '')))?.meta.interview === false}
              {#if request.date > new Date()}
                <div
                  class="mt-2 flex items-center justify-between rounded-lg bg-blue-100 p-4"
                >
                  <p>{formatDateLocal(request.date)}</p>
                  <p>{request.firstName} {request.lastName}</p>
                  <p>{request.email}</p>
                </div>
              {:else if request.date > new Date(new Date().setDate(new Date().getDate() - 30))}
                <div
                  class="mt-2 flex items-center justify-between rounded-lg bg-red-100 p-4"
                >
                  <p>{formatDateLocal(request.date)}</p>
                  <p>{request.firstName} {request.lastName}</p>
                  <p>{request.email}</p>
                </div>
              {/if}
            {/if}
          {/each}
        </Card>
        <form use:addEnhance class="w-full">
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
                options={intervieweeNames}
              />
              <Button
                color="red"
                class="h-fit"
                onclick={() => {
                  handleClear()
                }}
                ><svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#000000"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  ><polyline points="3 6 5 6 21 6"></polyline><path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  ></path><line x1="10" y1="11" x2="10" y2="17"></line><line
                    x1="14"
                    y1="11"
                    x2="14"
                    y2="17"
                  ></line></svg
                ></Button
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
              <a href={interview.meetingLink} target="_blank">
                {interview.meetingLink}
              </a>
            </div>
            <!-- interview status -->
            <div>
              <b>Interview Status:</b>
              {interview.interviewSlotStatus}
            </div>

            {#if interview.intervieweeId !== ''}
              <div>
                <b>Interviewee:</b>
                {interview.intervieweeFirstName}
                {interview.intervieweeLastName}
              </div>
            {/if}

            {#if (interview.interviewSlotStatus === 'available' || interview.interviewSlotStatus === 'pending') && (isMyInterview(interview) || page.data.user?.role === 'admin')}
              <div>
                <Button
                  color="blue"
                  class="my-4 px-2 py-1"
                  onclick={() => openSlotForEdit(interview)}>Edit</Button
                >
              </div>
            {/if}
          </Card>
        {/if}
      {/each}
    </div>
  {/if}
</svelte:boundary>
