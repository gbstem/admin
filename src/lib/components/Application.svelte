<script lang="ts">
  import { invalidate } from '$app/navigation'
  import Card from '$lib/components/Card.svelte'
  import CheckboxInput from '$lib/components/CheckboxInput.svelte'
  import DateTimeInput from '$lib/components/DateTimeInput.svelte'
  import Form from '$lib/components/Form.svelte'
  import NumberInput from '$lib/components/NumberInput.svelte'
  import Select from '$lib/components/Select.svelte'
  import Textarea from '$lib/components/Textarea.svelte'
  import TextInput from '$lib/components/TextInput.svelte'
  import { interviewAttendanceJson } from '$lib/data'
  import { applicationsCollection, semesterDates } from '$lib/data/collections'
  import {
    createDefaultApplicationValues,
    createDefaultInterviewValues,
    resolveViewedSemester,
  } from '$lib/helpers/application'
  import { applicationService } from '$lib/services/applicationService'
  import { alert } from '$lib/stores'
  import { formatDateShort } from '$lib/utils'
  import { cloneDeep } from 'lodash-es'
  import Button from './Button.svelte'
  import Dialog from './Dialog.svelte'
  import EditApplicationForm from './forms/EditApplicationForm.svelte'
  import { Icon } from '@steeze-ui/svelte-icon'
  import {
    CheckCircle,
    ExclamationCircle,
    PlusCircle,
    XCircle,
  } from '@steeze-ui/heroicons'
  import PersonIcon from '$lib/components/icons/PersonIcon.svelte'

  interface Props {
    open?: boolean
    id: string | undefined
    collection?: string
  }

  let {
    open = $bindable(false),
    id,
    collection = applicationsCollection,
  }: Props = $props()

  // `collection` may point at a past semester (browsed via CollectionFilter), so decision
  // writes must target that same semester's `decisions` subcollection, not always the
  // current one — mirrors semesterIdFromPath(collection) ?? currentSemester in
  // EditApplicationForm/EditRegistrationForm.
  const viewedSemester = () => resolveViewedSemester(collection)

  let loading = $state(true)
  let disabled = $state(true)
  let showInterviewForm = $state(true)
  const semesterStartDate = formatDateShort(
    new Date(semesterDates.classesStart),
  )
  const semesterEndDate = formatDateShort(new Date(semesterDates.classesEnd))
  const defaultValues = createDefaultApplicationValues()
  const defaultInterview = createDefaultInterviewValues()

  let dbValues: Data.Application<'client'> | undefined = $state()
  let interview: Data.Interview = $state(cloneDeep(defaultInterview))
  let values: Data.Application<'client'> = $state(cloneDeep(defaultValues))
  let decision: Data.Decision | null | undefined = $state()
  let formEl: HTMLFormElement | undefined = $state()
  // Keeps the form uneditable until the fetch lands. Distinct from `loading`,
  // which the save path also raises - this one is only about the initial read.
  let loaded = $state(false)
  // Bumped only when the form should be reseeded from `values` - see the note
  // on the $effect in EditRegistrationForm.svelte.
  let seedVersion = $state(0)

  $effect(() => {
    const currentId = id
    if (!open || currentId === undefined) return
    let cancelled = false
    values = cloneDeep(defaultValues)
    dbValues = undefined
    decision = undefined
    interview = cloneDeep(defaultInterview)
    loading = true
    loaded = false
    disabled = true
    ;(async () => {
      try {
        const res = await applicationService.loadApplicationDetails(
          collection,
          currentId,
        )
        if (cancelled) return
        values = cloneDeep(res.values)
        dbValues = cloneDeep(res.values)
        decision = res.decision
        interview = res.interview
        seedVersion++
        loaded = true
      } catch (err: any) {
        if (!cancelled) {
          console.error('Failed to load application:', err)
          alert.trigger('error', err.message || 'Failed to load application.')
        }
      } finally {
        if (!cancelled) loading = false
      }
    })()
    return () => {
      cancelled = true
    }
  })

  async function saveNotes() {
    const frozenId = id
    if (frozenId === undefined) return
    loading = true
    try {
      await applicationService.saveNotes(
        collection,
        frozenId,
        interview,
        viewedSemester(),
      )
      await invalidate('app:applications')
      alert.trigger('success', 'Notes updated successfully.')
    } catch (err: any) {
      alert.trigger('error', 'Something went wrong. Please try again.')
      console.error('Decisions update error:', err)
    } finally {
      loading = false
    }
  }

  async function handleLikelyDecision(
    newDecision: 'likely yes' | 'likely no' | 'likely waitlist' | null,
  ) {
    const frozenId = id
    if (frozenId === undefined) return
    loading = true
    try {
      await applicationService.saveLikelyDecision(
        collection,
        frozenId,
        newDecision,
        decision ?? null,
        viewedSemester(),
      )
      await invalidate('app:applications')
      alert.trigger('success', 'Decision updated successfully.')
      interview.likelyDecision = newDecision
    } catch (err: any) {
      alert.trigger('error', 'Something went wrong. Please try again.')
      console.error('Decision likely decision update error:', err)
    } finally {
      loading = false
    }
  }

  async function handleDecision(newDecision: Data.Decision) {
    const confirmation = confirm(
      'Are you sure you want to update the decision? An email will be sent to the applicant, and you should not be changing the decision after this.',
    )
    if (!confirmation) {
      return
    }
    const frozenId = id
    if (frozenId === undefined) return
    loading = true
    try {
      await applicationService.submitOfficialDecision(
        collection,
        frozenId,
        newDecision,
        interview,
        values.personal.firstName,
        semesterDates.instructorOrientation,
        viewedSemester(),
      )
      await invalidate('app:applications')
      alert.trigger('success', 'Decision updated successfully.')
      decision = newDecision
    } catch (err: any) {
      alert.trigger('error', 'Something went wrong. Please try again.')
      console.error('Decision update error:', err)
    } finally {
      loading = false
    }
  }

  function handleEdit() {
    disabled = false
  }
  function handleSaveChanges() {
    if (formEl) {
      formEl.requestSubmit()
    }
  }
  function handleDeleteChanges() {
    disabled = true
    if (dbValues) values = cloneDeep(dbValues)
    seedVersion++
  }
</script>

<Dialog bind:open size="full" alert>
  {#snippet title()}
    Application
  {/snippet}
  {#snippet description()}
    <div class="w-full min-w-0">
      <Card>
        <div
          class="sticky top-2 z-50 flex flex-wrap items-center justify-between gap-3 p-3 md:p-3"
        >
          <fieldset
            class="flex flex-wrap items-center gap-2"
            disabled={loading}
          >
            {#if disabled}
              <Button
                color={!loading &&
                (interview.likelyDecision === null ||
                  interview.likelyDecision === 'likely yes')
                  ? 'green'
                  : 'gray'}
                class="flex items-center gap-1"
                onclick={() => handleLikelyDecision('likely yes')}
              >
                <Icon src={CheckCircle} theme="mini" class="h-5 w-5" />
                <span>Likely Yes</span></Button
              >
              <Button
                color={!loading &&
                (interview.likelyDecision === null ||
                  interview.likelyDecision === 'likely waitlist')
                  ? 'yellow'
                  : 'gray'}
                class="flex items-center gap-1"
                onclick={() => handleLikelyDecision('likely waitlist')}
              >
                <Icon src={ExclamationCircle} theme="mini" class="h-5 w-5" />
                <span>Likely Waitlist</span></Button
              >
              <Button
                color={!loading &&
                (interview.likelyDecision === null ||
                  interview.likelyDecision === 'likely no')
                  ? 'red'
                  : 'gray'}
                class="flex items-center gap-1"
                onclick={() => handleLikelyDecision('likely no')}
              >
                <Icon src={XCircle} theme="mini" class="h-5 w-5" />
                <span>Likely No</span></Button
              >
              <Button
                color="gray"
                class="flex items-center gap-1"
                onclick={() => handleLikelyDecision(null)}
              >
                <Icon src={XCircle} theme="mini" class="h-5 w-5" />
                <span>Clear Likely Decision</span></Button
              >
              <Button
                color={!loading &&
                (decision === null || decision === 'interview')
                  ? 'blue'
                  : 'gray'}
                class="flex items-center gap-1"
                onclick={() => handleDecision('interview')}
              >
                <PersonIcon class="text-black" />
                <span>Interview</span></Button
              >
              <Button
                color={!loading &&
                (decision === null || decision === 'accepted')
                  ? 'green'
                  : 'gray'}
                class="flex items-center gap-1"
                onclick={() => handleDecision('accepted')}
              >
                <Icon src={CheckCircle} theme="mini" class="h-5 w-5" />
                <span>Accept</span></Button
              >
              <Button
                color={!loading &&
                (decision === null || decision === 'substitute')
                  ? 'purple'
                  : 'gray'}
                class="flex items-center gap-1"
                onclick={() => handleDecision('substitute')}
                ><Icon
                  src={PlusCircle}
                  theme="mini"
                  class="h-5 w-5 text-purple-300"
                />
                <span>Substitute</span></Button
              >
              <Button
                color={!loading &&
                (decision === null || decision === 'waitlisted')
                  ? 'yellow'
                  : 'gray'}
                class="flex items-center gap-1"
                onclick={() => handleDecision('waitlisted')}
              >
                <Icon src={ExclamationCircle} theme="mini" class="h-5 w-5" />
                <span>Waitlist</span></Button
              >

              <Button
                color={!loading &&
                (decision === null || decision === 'rejected')
                  ? 'red'
                  : 'gray'}
                class="flex items-center gap-1"
                onclick={() => handleDecision('rejected')}
              >
                <Icon src={XCircle} theme="mini" class="h-5 w-5" />
                <span>Reject</span></Button
              >
            {:else}
              <Button color="green" onclick={handleSaveChanges}
                >Save changes</Button
              >
              <Button color="red" onclick={handleDeleteChanges}
                >Cancel changes</Button
              >
            {/if}
          </fieldset>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              color="green"
              onclick={() => (showInterviewForm = !showInterviewForm)}
              >{showInterviewForm
                ? 'Close Interview Form'
                : 'Show Interview Form'}</Button
            >
            {#if disabled && !showInterviewForm}
              <!-- Gated on the load: editing stale values would have them
                   overwritten when the fetch lands. -->
              <Button onclick={handleEdit} disabled={!loaded}>Edit</Button>
            {/if}
            <Button onclick={() => (open = false)}>Close</Button>
          </div>
        </div>
      </Card>
      <div class="mt-4 flex flex-wrap justify-center gap-4">
        <Card class="w-full min-w-75 flex-1 md:min-w-112.5">
          <h2 class="my-4 text-2xl font-bold">Application Details</h2>
          <EditApplicationForm
            bind:formEl
            bind:disabled
            bind:loading
            bind:values
            bind:dbValues
            {id}
            {collection}
            {semesterStartDate}
            {semesterEndDate}
            {seedVersion}
            {loaded}
          />
        </Card>
        {#if showInterviewForm}
          <Card class="w-full min-w-75 flex-1 md:min-w-112.5">
            <Form class="w-full">
              <!-- Disabled until the fetch in the id/open $effect above settles:
                   interview starts this component's lifetime as
                   cloneDeep(defaultInterview) and is replaced wholesale by
                   the fetched value when that promise resolves, so typing
                   into these fields before then is silently overwritten
                   rather than merged - see saveNotes/buildNotesPayload. -->
              <fieldset class="min-w-0" disabled={loading}>
                <h2 class="my-4 text-2xl font-bold">
                  Interview Guide & Evaluation Form
                </h2>
                <div class="mt-2 text-xs text-gray-500">
                  Autosave is enabled for this browser
                </div>
                <DateTimeInput
                  bind:value={interview.date}
                  label="Interview Date"
                  required
                />
                <TextInput
                  bind:value={interview.interviewer}
                  label="Interviewer"
                  required
                />
                <Select
                  type="text"
                  bind:value={interview.attendance}
                  options={interviewAttendanceJson}
                  label="Attendance"
                  required
                />
                <ul class="my-4 list-disc rounded-lg bg-gray-100 p-4 px-8">
                  <li>
                    Greet the candidate when they arrive & ask them how they
                    are, general conversational beginning. Try to be personable
                    and make them comfortable!
                  </li>
                  <li>
                    Introduce yourself: name, grade, school, and role at
                    gbSTEM.”
                  </li>
                  <li>
                    If they are a new candidate: ask them to introduce
                    themselves. Ask them some questions about their interests.
                    In addition to getting to know them, we want to get a good
                    idea of how they interact!
                  </li>
                </ul>
                <NumberInput
                  bind:value={interview.conversation}
                  min="0"
                  max="5"
                  label="Please rate the candidate's friendliness and how well you think they would work with children on a 0 to 5 scale, 0 being the worst and 5 being the best. An average candidate should get a 2."
                  required
                />
                <Textarea
                  bind:value={interview.conversationNotes}
                  label="Conversation Notes"
                  optional
                />
                <div class="my-4 rounded-lg bg-gray-100 p-4">
                  Clarify the subject they are applying to teach for (plus the
                  level), clarify if there are other subjects that they could be
                  considered for. Ask them to state their preferences, such as
                  top 3.
                </div>
                <Textarea
                  bind:value={interview.teachingPreferences}
                  label="What courses does the candidate want to teach?"
                  required
                />
                <CheckboxInput
                  bind:value={values.essay.taughtBefore}
                  label="Have they taught for gbSTEM before? (This should be pre-set to the correct value, but if not simply check/uncheck the box as needed)."
                />
                {#if values.essay.taughtBefore}
                  <div class="my-4 rounded-lg bg-gray-100 p-4">
                    <div>
                      Ask them about their experience as an instructor. For
                      example, “You're a returning instructor, correct? I would
                      like to take some time to talk about your experience last
                      semester. Could you give me an overview of the good, the
                      bad, anything that can be improved?”
                    </div>
                    <div class="font-bold">
                      Followup questions about their experience, as needed:
                    </div>
                    <ul class="list-disc px-8">
                      <li>
                        How did you find the curriculum? Were there any parts
                        that were too fast, too slow?
                      </li>
                      <li>
                        Did your students enjoy the class? Were they engaged,
                        and do you feel like they learned the content well?
                      </li>
                      <li>How was student attendance?</li>
                      <li>
                        Did you have any issues with technology, such as the
                        Free Zoom limit, WiFi, anything?
                      </li>
                      <li>
                        Did you feel supported by your track leadership if you
                        had questions, and informed about events?
                      </li>
                      <li>
                        How do you think you can improve as an instructor this
                        semester?
                      </li>
                    </ul>
                  </div>
                  <Textarea
                    bind:value={interview.lastSemesterNotes}
                    label="Last semester notes"
                    required
                  />
                {:else}
                  <div class="my-4 rounded-lg bg-gray-100 p-4">
                    <div class="font-bold">
                      Talk a little about the logistics of being an instructor.
                    </div>
                    <ul class="list-disc px-8">
                      <li>Classes meet twice a week; 60 min</li>
                      <li>
                        Most classes will take place through Microsoft Teams
                        (link will be provided for you). This is something new
                        we are trying this year, so we may fall back on
                        Zoom/Google Meet if needed.
                      </li>
                      <li>
                        Class sizes are usually between 5-15 students, but keep
                        in mind that not every student will be able to attend
                        every class session.
                      </li>
                      <li>
                        The curriculum for your classes will be provided to you
                        and accessible on the portal.
                      </li>
                      <li>
                        You'll be able to check in with the curriculum developer
                        and director for your course regularly to give feedback
                        & ask questions
                      </li>
                      <li>Do you have any questions?</li>
                    </ul>
                  </div>
                {/if}
                <div class="my-4 rounded-lg bg-gray-100 p-4">
                  <div>
                    Continue onto the mock lessons. Send the link for the
                    candidate’s top subject to teach. Allow each candidate 3
                    minutes to familiarize themselves with the lesson before
                    having them share their screen to present it to you. Note
                    their delivery, audience engagement, ability to speak slowly
                    and clearly, quality of explanations, as well as their
                    attitude.
                  </div>
                  <div class="mt-8 font-bold">Mock Lesson Materials</div>
                  <div class="flex flex-wrap gap-4">
                    <Button
                      class="bg-gray-200"
                      href="https://docs.google.com/presentation/d/1dtv0qWFLNg3pjnlPCkm8nKEkEU_m5-dcLVMNEJmwFjk/edit#slide=id.g11b679f5bf6_0_9"
                      target="_blank">Math</Button
                    >
                    <Button
                      color="green"
                      href="https://docs.google.com/presentation/d/15aI-M8eEPKsFGpodmZ_oi4MWQKzTJ8Jrup4C7oFgSls/edit#slide=id.g2085bab7786_0_0"
                      target="_blank">Environmental Science</Button
                    >
                    <Button
                      color="yellow"
                      href="https://docs.google.com/presentation/d/1yf3ZOVCFgwILyihaG_sJonevv3cIiUMNvDlwJVarCto/edit#slide=id.g2085d4bbb38_0_4125"
                      target="_blank">Engineering</Button
                    >
                  </div>
                  <div class="mt-4 flex flex-wrap gap-4">
                    <Button
                      color="blue"
                      href="https://docs.google.com/document/d/1ruPmF-SRdWQ_LlilQz0PBFX1p7gDpfGZ1jVBmSpdgyI/edit#"
                      target="_blank">Scratch</Button
                    >
                    <Button
                      color="blue"
                      href="https://docs.google.com/document/d/1-Q40jjtKjt1dvX09qndC1ZEA7amiieAQgXF8qPDEvOE/edit"
                      target="_blank">Python 1</Button
                    >
                    <Button
                      color="blue"
                      href="https://docs.google.com/document/d/1LonFfZTQOwjz_QeZbRHb_RFVq_EntkVu64BBca2TVGw/edit"
                      target="_blank">Web Dev</Button
                    >
                  </div>
                </div>
                <NumberInput
                  bind:value={interview.mockLessonExplanations}
                  min="0"
                  max="5"
                  label="Please rate the clarity of the candidate's explanations of material in the mock lesson on a 0 to 5 scale, 0 being the worst and 5 being the best. An average candidate should get a 2."
                  required
                />
                <NumberInput
                  bind:value={interview.mockLessonEngagement}
                  min="0"
                  max="5"
                  label="Please rate the candidate's engagement with the audience (asking questions, relating to students, etc.) in the mock lesson on a 0 to 5 scale, 0 being the worst and 5 being the best. An average candidate should get a 2."
                  required
                />
                <NumberInput
                  bind:value={interview.mockLessonPace}
                  min="0"
                  max="5"
                  label="Please rate the pace of the mock lesson on a 0 to 5 scale, 0 being the worst and 5 being the best. An average candidate should get a 2."
                  required
                />
                <NumberInput
                  bind:value={interview.mockLessonOverall}
                  min="0"
                  max="5"
                  label="Please rate the overall quality of the mock lesson on a 0 to 5 scale, 0 being the worst and 5 being the best. An average candidate should get a 2."
                  required
                />
                <Textarea
                  bind:value={interview.mockLessonNotes}
                  label="Mock lesson notes. What went well? What could be improved? If there was a low pacing score, why -- too fast or too slow?"
                  required
                />
                <Textarea
                  bind:value={interview.techNotes}
                  label="Any tech or other issues that could hinder their ability to be a good instructor?"
                  required
                />
                <div class="my-4 rounded-lg bg-gray-100 p-4">
                  <div class="font-bold">Continue:</div>
                  <ul class="list-disc px-8">
                    <li>
                      Outline that classes meet twice a week from {semesterStartDate}
                      to {semesterEndDate}. Ask if they have any known
                      scheduling conflicts, days they will have to miss, or days
                      of the week they can't make.
                    </li>
                    <li>
                      Remind them that, as the teacher, they are obviously
                      required to go to all classes and show up on time, and
                      they should also prepare for the class before the class
                      happens by looking through the curriculum.
                    </li>
                    <li>
                      Additionally, emphasize that we expect them to respond to
                      emails and slack messages within 24 hours.
                    </li>
                    <li>
                      Ask if they are meet all of the above expectations, and if
                      there is anything we can help them with to make sure they
                      are able to do all this.”
                    </li>
                  </ul>
                </div>
                <Textarea
                  bind:value={interview.availabilityNotes}
                  label="Availability notes. When is the candidate not available? Are there any potential concerns with the candidate's availability?"
                  required
                />
                <div class="my-4 rounded-lg bg-gray-100 p-4">
                  <div>
                    Thank them for speaking with you, and let them know that
                    they can reach us at contact@gbstem.org. Additionally, tell
                    them that if they are accepted, instructor orientation will
                    be on Sept. 20th, so they should mark their calendars for
                    that.
                  </div>
                  <div>
                    Mark <strong>Likely Yes</strong> or
                    <strong>Likely No</strong>
                    depending on your decision recommendation. Be careful NOT to click
                    "Interview", "Accept", "Waitlist", or "Reject".
                  </div>
                </div>
                <Textarea
                  bind:value={interview.notes}
                  label="Please briefly summarize the reasoning behind your recommendation."
                  required
                />
                <div class="my-2 mt-4 font-bold">
                  Once you have completed this form, click "Save Notes" to
                  submit it!
                </div>
                <div class="flex flex-wrap justify-start gap-4">
                  <Button color="green" onclick={saveNotes}>Save Notes</Button>
                  <Button
                    color="red"
                    onclick={() => (showInterviewForm = false)}
                    >Close Interview Form</Button
                  >
                </div>
              </fieldset>
            </Form>
          </Card>
        {/if}
      </div>
    </div>
  {/snippet}
</Dialog>
