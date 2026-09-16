<script lang="ts">
  import { alert } from '$lib/stores'
  import { invalidate } from '$app/navigation'
  import {
    currentSemester,
    registrationsCollection,
    semesterIdFromPath,
  } from '$lib/data/collections'
  import { registrationService } from '$lib/services/registrationService'
  import { studentService } from '$lib/services/studentService'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { registrationSchema } from './schemas'
  import {
    registrationDisplayValues,
    registrationEditedFields,
    toRegistrationFormValues as toFormValues,
  } from '$lib/helpers/editRegistrationForm'
  import { cloneDeep } from 'lodash-es'
  import {
    gendersJson,
    reasonsJson,
    raceJson,
    mathCoursesJson,
    frlpJson,
    parentEducationJson,
    csCoursesJson,
    engineeringCoursesJson,
    scienceCoursesJson,
    gradesJson,
  } from '$lib/data'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import FormCheckbox from '../FormCheckbox.svelte'

  interface Props {
    id: string | undefined
    values: Data.Registration<'client'>
    dbValues?: Data.Registration<'client'> | undefined
    disabled?: boolean
    formEl?: HTMLFormElement | undefined
    collection?: string
    seedVersion?: number
    /** False while the parent is still fetching - see `loaded` below. */
    loaded?: boolean
  }

  let {
    id,
    values = $bindable(),
    dbValues = $bindable(),
    disabled = $bindable(true),
    formEl = $bindable(undefined),
    collection = registrationsCollection,
    seedVersion = 0,
    // Defaults to true so a parent that doesn't track loading is unaffected.
    // The parents that do pass it keep the form uneditable until the fetch
    // lands, because the seed that arrives with it replaces the whole store -
    // anything typed before then would be silently discarded.
    loaded = true,
  }: Props = $props()

  const schema = registrationSchema

  // The parent account's current address, shown read-only. The registration's
  // own `personal.email` is an audit record of what was submitted: never shown,
  // and not editable here.
  let parentEmail = $state('')
  $effect(() => {
    const registrationId = id
    const semesterId = semesterIdFromPath(collection) ?? currentSemester
    parentEmail = ''
    if (!registrationId) return
    studentService
      .fetchParentEmails([registrationId], semesterId)
      .then((emails) => {
        // A late reply for a registration the dialog has since moved on from.
        if (id === registrationId) parentEmail = emails[registrationId] ?? ''
      })
      .catch((err) =>
        console.error('Could not resolve the parent address:', err),
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
        if (id !== undefined) {
          const updatedValues = registrationDisplayValues(values, formVal.data)
          try {
            // Send the validated form data rather than `updatedValues`: the latter
            // re-merges `values`, the snapshot taken when the dialog opened, so it
            // would rewrite fields this form doesn't render (the parent's name).
            await registrationService.saveRegistration(
              collection,
              id,
              registrationEditedFields(formVal.data),
            )
            values = updatedValues
            dbValues = cloneDeep(updatedValues)
            disabled = true
            await invalidate('app:registrations')
            alert.trigger('success', 'Changes were saved successfully.')
          } catch (err: any) {
            console.error('Registration save changes error:', err)
            const isPermissionDenied =
              err.code === 'permission-denied' ||
              String(err).includes('permission') ||
              String(err).includes('Permission')
            const msg = isPermissionDenied
              ? 'You do not have permission to modify this registration.'
              : err.code || err.message
            alert.trigger('error', msg, !isPermissionDenied)
          }
        }
      },
    },
  )

  const { form, enhance, submitting } = formResult

  // Seeding the form is an event, not a derivation. The parent bumps
  // `seedVersion` at the two moments a reseed is correct - the document
  // finished loading, and "Delete changes" was pressed - and this effect
  // reacts to that alone.
  //
  // Reacting to `values` itself (which this did) meant *any* reassignment
  // replaced the whole store: the parent's fetch resolves asynchronously, so
  // an admin who hit Edit and started typing before it landed had those edits
  // silently reverted, with no error and the save then writing the stale
  // values back. It was reproducible in Cypress as an intermittent failure in
  // registrations.cy.ts Test Case 15c, where only the first few fields typed
  // came back with their old values and everything after the load landed
  // stuck. See CLAUDE.md on not using $effect to copy state.
  let lastSeed = -1
  $effect(() => {
    if (seedVersion === lastSeed) return
    lastSeed = seedVersion
    form.set(toFormValues(values))
  })
</script>

<form bind:this={formEl} use:enhance class="w-full max-w-2xl">
  <fieldset class="space-y-14" disabled={disabled || $submitting || !loaded}>
    <div class="grid gap-1">
      <span class="font-bold">Personal</span>
      <div class="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <div class="mt-2 flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="personal.studentFirstName"
            label="Student first name"
            bind:value={$form.personal.studentFirstName}
          />
        </div>

        <div class="mt-2 flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="personal.studentLastName"
            label="Student last name"
            bind:value={$form.personal.studentLastName}
          />
        </div>
      </div>

      <div class="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <div class="mt-2 flex flex-col gap-1.5">
          <span class="text-sm font-medium">Parent account email</span>
          <div
            class="rounded-md bg-gray-100 px-3 py-2 shadow-xs"
            data-testid="parent-account-email"
          >
            {parentEmail}
          </div>
        </div>

        <div class="mt-2 flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="personal.secondaryEmail"
            label="Secondary email"
            type="email"
            bind:value={$form.personal.secondaryEmail}
          />
        </div>
      </div>

      <div class="grid gap-1 sm:grid-cols-2 sm:gap-3">
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
      </div>

      <div class="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <div class="mt-2 flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="personal.gender"
            label="Gender"
            options={gendersJson}
            bind:value={$form.personal.gender}
          />
        </div>

        <div class="mt-2 flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="personal.frlp"
            label="Eligible for federal free or reduced lunch program?"
            options={frlpJson}
            bind:value={$form.personal.frlp}
          />
        </div>
      </div>

      <div class="mt-2 flex flex-col gap-1.5">
        <FormSelect
          form={formResult}
          name="personal.parentEducation"
          label="Highest level of education completed"
          options={parentEducationJson}
          bind:value={$form.personal.parentEducation}
        />
      </div>

      <div class="mt-4 grid gap-1">
        <span class="text-sm font-semibold"
          >Race / ethnicity (check all that apply)</span
        >
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each raceJson as race (race.name)}
            <div class="flex items-center">
              <input
                type="checkbox"
                value={race.name}
                bind:group={$form.personal.race}
                id={`race-${race.name}`}
                class="peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:outline-hidden"
              />
              <label
                for={`race-${race.name}`}
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
        <div class="mt-2 flex flex-col gap-1.5 sm:col-span-2">
          <FormInput
            form={formResult}
            name="academic.school"
            label="School"
            bind:value={$form.academic.school}
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="academic.grade"
            inputName="student-grade"
            label="Grade"
            options={gradesJson}
            bind:value={$form.academic.grade}
          />
        </div>
      </div>
    </div>

    <div class="grid gap-1">
      <span class="font-bold">Program Details</span>
      <div class="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <div class="mt-2 flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="program.csCourse"
            label="CS course"
            options={csCoursesJson}
            bind:value={$form.program.csCourse}
          />
        </div>

        <div class="mt-2 flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="program.mathCourse"
            label="Math course"
            options={mathCoursesJson}
            bind:value={$form.program.mathCourse}
          />
        </div>
      </div>

      <div class="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <div class="mt-2 flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="program.engineeringCourse"
            label="Engineering course"
            options={engineeringCoursesJson}
            bind:value={$form.program.engineeringCourse}
          />
        </div>

        <div class="mt-2 flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="program.scienceCourse"
            label="Science course"
            options={scienceCoursesJson}
            bind:value={$form.program.scienceCourse}
          />
        </div>
      </div>

      <div class="mt-2 flex flex-col gap-1.5">
        <FormSelect
          form={formResult}
          name="program.reason"
          label="Why are you enrolling your child?"
          options={reasonsJson}
          bind:value={$form.program.reason}
        />
      </div>

      <div class="flex flex-col gap-1.5 pt-4">
        <FormCheckbox
          form={formResult}
          name="program.inPerson"
          label="Is your child interested in hybrid (in-person and online) learning?"
          bind:checked={$form.program.inPerson}
        />
      </div>
    </div>

    {#if $form.program.inPerson}
      <div class="grid gap-1">
        <span class="text-lg font-bold">In Person</span>
        <span class="mb-2 text-sm leading-tight text-gray-500"
          >Hybrid classes meet once a week on weekend afternoons at the
          Cambridge Public Library.</span
        >
        <div class="grid gap-1 sm:grid-cols-2 sm:gap-3">
          <div class="mt-2 flex flex-col gap-1.5">
            <FormInput
              form={formResult}
              name="inPerson.allergies"
              label="Student allergies / medical conditions"
              placeholder="Leave blank if none"
              bind:value={$form.inPerson.allergies}
            />
          </div>

          <div class="mt-2 flex flex-col gap-1.5">
            <FormInput
              form={formResult}
              name="inPerson.parentPickup"
              label="Names of adults authorized for pickup"
              placeholder="e.g. Jane Doe"
              bind:value={$form.inPerson.parentPickup}
            />
          </div>
        </div>
      </div>
    {/if}

    <div class="grid gap-2">
      <span class="font-bold">Agreements</span>
      <div class="space-y-4">
        <div class="flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="agreements.mediaRelease"
            label="I grant gbSTEM permission to take and use photos/videos of my child for promotional purposes."
            bind:checked={$form.agreements.mediaRelease}
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="agreements.bypassAgeLimits"
            label="I request to bypass grade limitations for classes my child is interested in."
            bind:checked={$form.agreements.bypassAgeLimits}
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="agreements.entireProgram"
            label="I agree to enroll my child for the entire duration of the program."
            bind:checked={$form.agreements.entireProgram}
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="agreements.timeCommitment"
            label="I confirm my child can meet the required weekly time commitment."
            bind:checked={$form.agreements.timeCommitment}
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="agreements.submitting"
            label="I authorize the submission of this registration form."
            bind:checked={$form.agreements.submitting}
          />
        </div>
      </div>
    </div>
  </fieldset>
</form>
