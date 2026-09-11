<script lang="ts">
  import { alert } from '$lib/stores'
  import { invalidate } from '$app/navigation'
  import { coursesJson, daysOfWeekJson } from '$lib/data'
  import type ClassData from '$lib/data/types/ClassData'
  import { classService } from '$lib/services/classService'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { classSchema } from './schemas'
  import {
    classEditedFields,
    toClassFormValues as toFormValues,
  } from '$lib/helpers/editClassForm'
  import FormInput from '../FormInput.svelte'
  import FormNativeSelect from '../FormNativeSelect.svelte'
  import FormCheckbox from '../FormCheckbox.svelte'

  interface Props {
    id: string | undefined
    values: ClassData
    disabled?: boolean
    formEl?: HTMLFormElement | undefined
    seedVersion?: number
    /** False while the parent is still fetching - see `loaded` below. */
    loaded?: boolean
  }

  let {
    id,
    values = $bindable(),
    disabled = $bindable(true),
    formEl = $bindable(undefined),
    seedVersion = 0,
    // Defaults to true so a parent that doesn't track loading is unaffected.
    // The parents that do pass it keep the form uneditable until the fetch
    // lands, because the seed that arrives with it replaces the whole store -
    // anything typed before then would be silently discarded.
    loaded = true,
  }: Props = $props()

  const schema = classSchema

  const formResult = superForm(
    defaults(toFormValues(values), zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      resetForm: false,
      applyAction: false,
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        if (id !== undefined) {
          const editedFields = classEditedFields(formVal.data)
          try {
            await classService.saveClassDetails(id, editedFields)
            values = { ...values, ...editedFields }
            disabled = true
            await invalidate('app:registrations')
            alert.trigger('success', 'Changes were saved successfully.')
          } catch (err: any) {
            console.error('Class save changes error:', err)
            alert.trigger('error', err.code || err.message, true)
          }
        }
      },
    },
  )

  const { form, enhance, submitting } = formResult

  // Seeding the form is an event, not a derivation - the parent bumps
  // `seedVersion` when the class finishes loading and when "Delete changes"
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

<form bind:this={formEl} use:enhance class="w-full max-w-4xl">
  <fieldset
    class="mt-4 space-y-4"
    disabled={disabled || $submitting || !loaded}
  >
    <div class="grid gap-1 sm:grid-cols-3 sm:gap-3">
      <div class="flex flex-col gap-1">
        <FormNativeSelect
          form={formResult}
          name="course"
          label="Course"
          bind:value={$form.course}
        >
          <option value="" disabled>Select a course</option>
          {#each coursesJson as course (course.name)}
            <option value={course.name}>{course.name}</option>
          {/each}
        </FormNativeSelect>
      </div>

      <div class="flex flex-col gap-1">
        <FormInput
          form={formResult}
          name="gradeRecommendation"
          label="Grade recommendation"
          placeholder="e.g. 3-5 or 6-8"
          bind:value={$form.gradeRecommendation}
        />
      </div>

      <div class="flex flex-col gap-1">
        <FormInput
          form={formResult}
          name="classCap"
          label="Class capacity"
          type="number"
          inputName="class-capacity"
          bind:value={$form.classCap}
        />
      </div>
    </div>

    {#if $form.online}
      <div class="flex flex-col gap-1">
        <FormInput
          form={formResult}
          name="meetingLink"
          label="Meeting link"
          required
          bind:value={$form.meetingLink}
        />
      </div>
    {/if}

    <div class="grid gap-1">
      <span class="text-sm font-bold text-gray-700"
        >Online classes meet twice weekly at consistent days and times
        throughout the semester and run for 45-60 minutes each. In-person
        classes meet once a week on a weekend afternoon at the Cambridge Public
        Library.
      </span>

      <div class="mt-2 grid gap-1 sm:grid-cols-3 sm:gap-3">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <FormNativeSelect
            form={formResult}
            name="classDay1"
            label="Meeting day 1"
            bind:value={$form.classDay1}
          >
            <option value="" disabled>Select a day</option>
            {#each daysOfWeekJson as day (day.name)}
              <option value={day.name}>{day.name}</option>
            {/each}
          </FormNativeSelect>
        </div>

        <div class="flex flex-col gap-1">
          <FormInput
            form={formResult}
            name="classTime1"
            label="Meeting time 1"
            type="time"
            bind:value={$form.classTime1}
          />
        </div>
      </div>

      {#if $form.online}
        <div class="mt-2 grid gap-1 sm:grid-cols-3 sm:gap-3">
          <div class="flex flex-col gap-1 sm:col-span-2">
            <FormNativeSelect
              form={formResult}
              name="classDay2"
              label="Meeting day 2"
              required
              bind:value={$form.classDay2}
            >
              <option value="" disabled>Select a day</option>
              {#each daysOfWeekJson as day (day.name)}
                <option value={day.name}>{day.name}</option>
              {/each}
            </FormNativeSelect>
          </div>

          <div class="flex flex-col gap-1">
            <FormInput
              form={formResult}
              name="classTime2"
              label="Meeting time 2"
              type="time"
              bind:value={$form.classTime2}
            />
          </div>
        </div>
      {/if}
    </div>

    <div class="flex flex-col gap-1.5 pt-2">
      <FormCheckbox
        form={formResult}
        name="online"
        label="Class taught online?"
        bind:checked={$form.online}
      />
    </div>
  </fieldset>
</form>
