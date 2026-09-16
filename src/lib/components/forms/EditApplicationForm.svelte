<script lang="ts">
  import { alert } from '$lib/stores'
  import { invalidate } from '$app/navigation'
  import Card from '$lib/components/Card.svelte'
  import { coursesJson, gendersJson, raceJson, reasonsJson } from '$lib/data'
  import {
    applicationsCollection,
    currentSemester,
    semesterIdFromPath,
  } from '$lib/data/collections'
  import { applicationService } from '$lib/services/applicationService'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { applicationSchema } from './schemas'
  import {
    applicationDisplayValues,
    applicationEditedFields,
    toApplicationFormValues as toFormValues,
  } from '$lib/helpers/editApplicationForm'
  import { cloneDeep } from 'lodash-es'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import FormCheckbox from '../FormCheckbox.svelte'
  import FormTextarea from '../FormTextarea.svelte'

  interface Props {
    id: string | undefined
    values: Data.Application<'client'>
    dbValues?: Data.Application<'client'> | undefined
    disabled?: boolean
    loading?: boolean
    formEl?: HTMLFormElement | undefined
    collection?: string
    semesterStartDate?: string
    semesterEndDate?: string
    seedVersion?: number
    /** False while the parent is still fetching - see `loaded` below. */
    loaded?: boolean
  }

  let {
    id,
    values = $bindable(),
    dbValues = $bindable(),
    disabled = $bindable(true),
    loading = $bindable(false),
    formEl = $bindable(undefined),
    collection = applicationsCollection,
    semesterStartDate = '',
    semesterEndDate = '',
    seedVersion = 0,
    // Defaults to true so a parent that doesn't track loading is unaffected.
    // The parents that do pass it keep the form uneditable until the fetch
    // lands, because the seed that arrives with it replaces the whole store -
    // anything typed before then would be silently discarded.
    loaded = true,
  }: Props = $props()

  const schema = applicationSchema

  // The applicant account's current address. The application's own
  // `personal.email` is an audit record of what was submitted and is never
  // shown.
  let applicantEmail = $state('')
  $effect(() => {
    const applicationId = id
    const semesterId = semesterIdFromPath(collection) ?? currentSemester
    applicantEmail = ''
    if (!applicationId) return
    applicationService
      .fetchApplicantEmails([applicationId], semesterId)
      .then((emails) => {
        // A late reply for an application the dialog has since moved on from.
        if (id === applicationId) applicantEmail = emails[applicationId] ?? ''
      })
      .catch((err) =>
        console.error('Could not resolve the applicant address:', err),
      )
  })

  const formResult = superForm(
    defaults(toFormValues(values) as any, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      resetForm: false,
      dataType: 'json',
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        loading = true
        if (id !== undefined) {
          const updatedValues = applicationDisplayValues(values, formVal.data)
          try {
            // Send the validated form data rather than `updatedValues`: the latter
            // re-merges `values`, the snapshot taken when the dialog opened, so it
            // would rewrite fields this form only displays (name, email).
            await applicationService.saveApplicationDetails(
              collection,
              id,
              applicationEditedFields(formVal.data),
              semesterIdFromPath(collection) ?? currentSemester,
            )
            values = updatedValues
            dbValues = cloneDeep(updatedValues)
            disabled = true
            await invalidate('app:applications')
            alert.trigger('success', 'Changes were saved successfully.')
          } catch (err: any) {
            console.error('Applications save changes error:', err)
            alert.trigger('error', err.code || err.message, true)
          } finally {
            loading = false
          }
        }
      },
    },
  )

  const { form, enhance, submitting } = formResult

  // Seeding the form is an event, not a derivation - the parent bumps
  // `seedVersion` when the document finishes loading and when "Delete changes"
  // is pressed. Reacting to `values` itself let the parent's async load land
  // mid-edit and replace the whole store, silently discarding what had been
  // typed. See the fuller note in EditRegistrationForm.svelte.
  let lastSeed = -1
  $effect(() => {
    if (seedVersion === lastSeed) return
    lastSeed = seedVersion
    form.set(toFormValues(values))
  })
</script>

<form bind:this={formEl} use:enhance class="w-full">
  <fieldset class="space-y-14" disabled={disabled || $submitting || !loaded}>
    <div class="grid gap-1">
      <span class="font-bold">Personal</span>
      <Card class="my-2 grid gap-3">
        <div class="rounded-md bg-gray-100 px-3 py-2 shadow-xs">
          {`Name: ${values.personal.firstName} ${values.personal.lastName}`}
        </div>
        <div class="rounded-md bg-gray-100 px-3 py-2 shadow-xs">
          {`Email: ${applicantEmail}`}
        </div>
        <div class="text-sm">
          Wrong name or email? Go to your <a class="link" href="/profile"
            >profile</a
          > to update your information.
        </div>
      </Card>

      <div class="mt-2 flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="personal.phoneNumber"
          label="Phone number"
          type="tel"
          bind:value={$form.personal.phoneNumber}
        />
      </div>

      <div class="mt-2 flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="personal.dateOfBirth"
          label="Date of birth"
          type="date"
          bind:value={$form.personal.dateOfBirth}
        />
      </div>

      <div class="mt-2 flex flex-col gap-1.5">
        <FormSelect
          form={formResult}
          name="personal.gender"
          label="Gender"
          options={gendersJson}
          bind:value={$form.personal.gender}
        />
      </div>

      <div class="mt-4 grid gap-1">
        <span class="text-sm font-semibold"
          >Race / ethnicity (check all that apply)</span
        >
        <div class="grid grid-cols-2 gap-2">
          {#each raceJson as race (race.name)}
            <div class="flex items-center">
              <input
                type="checkbox"
                value={race.name}
                bind:group={$form.personal.race}
                id={`app-race-${race.name}`}
                class="peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:outline-hidden"
              />
              <label
                for={`app-race-${race.name}`}
                class="ml-2 cursor-pointer text-sm peer-disabled:text-gray-400"
              >
                {race.name}
              </label>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="grid gap-1">
      <span class="font-bold">Academic</span>
      <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
        <div class="flex flex-col gap-1.5 sm:col-span-2">
          <FormInput
            form={formResult}
            name="academic.school"
            label="Current school"
            bind:value={$form.academic.school}
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="academic.graduationYear"
            label="Graduation year"
            type="number"
            bind:value={$form.academic.graduationYear}
          />
        </div>
      </div>
    </div>

    <div class="grid gap-1">
      <div class="mt-3 grid gap-1">
        <span class="text-sm font-bold text-gray-700"
          >Which of the following courses are you comfortable teaching? Check
          all that apply. Course descriptions are on our website.</span
        >
        <div class="mt-2 grid grid-cols-2 gap-2">
          {#each coursesJson as course (course.name)}
            <div class="flex items-center">
              <input
                type="checkbox"
                value={course.name}
                bind:group={$form.program.courses}
                id={`app-course-${course.name}`}
                class="peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:outline-hidden"
              />
              <label
                for={`app-course-${course.name}`}
                class="ml-2 cursor-pointer text-sm peer-disabled:text-gray-400"
              >
                {course.name}
              </label>
            </div>
          {/each}
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="program.preferences"
          label="If you have any preferences for the courses you teach, please list them here."
          placeholder="Preferences"
          bind:value={$form.program.preferences}
        />
      </div>

      <div class="mt-4 flex flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="program.timeSlots"
          label="Please describe your weekly availability. For example, 'weekdays after 4pm' or 'weekends anytime'."
          bind:value={$form.program.timeSlots}
        />
      </div>

      <div class="mt-4 flex flex-col gap-1.5">
        <FormTextarea
          form={formResult}
          name="program.notAvailable"
          label="When will you not be available to teach classes during the semester? Include potential conflicts such as medical absences, vacations, and athletic events."
          bind:value={$form.program.notAvailable}
        />
      </div>

      <div class="mt-4 flex flex-col gap-1.5">
        <FormCheckbox
          form={formResult}
          name="program.inPerson"
          label="For our in-person offering in the fall, gbSTEM is holding a new Lego Robotics competition program for students grade 5 and up. The program will meet weekly in-person at the Cambridge Public Library on Saturdays 1:00-3:00pm; parents are encouraged to help coach the robotics team. There are 10 slots available this year and will be more in the future. You may apply for this program on top of two courses, but if you are selected you will only be able to enroll in one additional course. Would you like to apply for the robotics program?"
          bind:checked={$form.program.inPerson}
        />
      </div>

      <div class="mt-4 flex flex-col gap-1.5">
        <FormSelect
          form={formResult}
          name="program.reason"
          label="How did you learn about gbSTEM?"
          options={reasonsJson}
          bind:value={$form.program.reason}
        />
      </div>

      <div class="mt-8">
        <span class="text-sm font-bold text-gray-700">Essays</span>
        <div class="mt-2 flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="essay.taughtBefore"
            label="Have you taught for gbSTEM before?"
            bind:checked={$form.essay.taughtBefore}
          />
        </div>

        <div class="mt-4 flex flex-col gap-1.5">
          <FormTextarea
            form={formResult}
            name="essay.academicBackground"
            label="Describe your academic background in any of the classes you said you were comfortable teaching. List any relevant coursework, projects, or extracurriculars. (500 char limit)"
            bind:value={$form.essay.academicBackground}
          />
        </div>

        {#if !$form.essay.taughtBefore}
          <div class="mt-4 flex flex-col gap-1.5">
            <FormTextarea
              form={formResult}
              name="essay.teachingScenario"
              label="Suppose your students are not engaging in the class. What would you do? (500 char limit)"
              required={!$form.essay.taughtBefore}
              bind:value={$form.essay.teachingScenario}
            />
          </div>

          <div class="mt-4 flex flex-col gap-1.5">
            <FormTextarea
              form={formResult}
              name="essay.why"
              label="Why do you want to teach for gbSTEM? (500 char limit)"
              required={!$form.essay.taughtBefore}
              bind:value={$form.essay.why}
            />
          </div>
        {/if}
      </div>

      <div class="mt-8 grid gap-1">
        <span class="text-sm font-bold text-gray-700">Agreements</span>
        <div class="mt-2 grid gap-4">
          <div class="flex flex-col gap-1.5">
            <FormCheckbox
              form={formResult}
              name="agreements.entireProgram"
              label={`gbSTEM will run from ${semesterStartDate} to ${semesterEndDate}. Do you confirm that you will be able to teach for the entirety of the program?`}
              required
              bind:checked={$form.agreements.entireProgram}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <FormCheckbox
              form={formResult}
              name="agreements.timeCommitment"
              label="Do you hereby confirm that if you are selected as an instructor, that you will be able to make the weekly time commitment of 2 hours a week for each class you teach?"
              required
              bind:checked={$form.agreements.timeCommitment}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <FormCheckbox
              form={formResult}
              name="agreements.submitting"
              label="I understand submitting means I can no longer make changes to my application. Don't check this box until you are sure that you are ready to submit."
              required
              bind:checked={$form.agreements.submitting}
            />
          </div>
        </div>
      </div>
    </div>
  </fieldset>
</form>
