<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { page } from '$app/state'
  import Application from '$lib/components/Application.svelte'
  import Button from '$lib/components/Button.svelte'
  import CollectionFilter from '$lib/components/CollectionFilter.svelte'
  import PerPageControl from '$lib/components/PerPageControl.svelte'
  import SearchBox from '$lib/components/SearchBox.svelte'
  import StatusFilter from '$lib/components/StatusFilter.svelte'
  import Table from '$lib/components/Table.svelte'
  import {
    resolveSemester,
    semesterCollectionPath,
  } from '$lib/data/collections'
  import { objectUrl } from '$lib/objectUrl.svelte'
  import { alert } from '$lib/stores'
  import { actionsState } from '$lib/stores.svelte'
  import { applicationService } from '$lib/services/applicationService'
  import { generateCSV } from '$lib/utils'
  import { format } from 'date-fns'
  import type { PageData } from './$types'
  import { Icon } from '@steeze-ui/svelte-icon'
  import {
    Check,
    CheckCircle,
    ExclamationCircle,
    PlusCircle,
    XCircle,
    XMark,
  } from '@steeze-ui/heroicons'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()
  let showApplicationDialog = $state(false)
  let current: number | undefined = $state()
  let checked: Array<number> = $state([])

  const csvHeaders = [
    'ID',
    'Submitted',
    'Decision',
    'Likely Decision',
    'Notes',
    'First Name',
    'Last Name',
    'Email',
    'School',
    'Graduation Year',
    'Courses',
    'Time Slots',
    'Taught Before',
    'In-person',
  ]

  function createDecisionAction(decision: Data.Decision) {
    let name: 'Accept' | 'Waitlist' | 'Reject' | 'Interview' | 'Substitute'
    let color: 'green' | 'yellow' | 'red' | 'blue' | 'purple'
    switch (decision) {
      case 'accepted': {
        name = 'Accept'
        color = 'green'
        break
      }
      case 'waitlisted': {
        name = 'Waitlist'
        color = 'yellow'
        break
      }
      case 'rejected': {
        name = 'Reject'
        color = 'red'
        break
      }
      case 'interview': {
        name = 'Interview'
        color = 'blue'
        break
      }
      case 'substitute': {
        name = 'Substitute'
        color = 'purple'
        break
      }
    }

    return {
      name: `${name} ${checked.length} ${
        checked.length > 1 ? 'applicants' : 'applicant'
      }`,
      color,
      callback: async () => {
        try {
          const ids = checked.map((i) => data.applications[i].id)
          await applicationService.bulkSetDecision(
            ids,
            selectedCollection,
            semesterCollectionPath(selectedSemester, 'decisions'),
            decision,
            selectedSemester,
          )
          await invalidate('app:applications')
          alert.trigger(
            'success',
            `${checked.length} ${
              checked.length > 1 ? 'applicants' : 'applicant'
            } ${decision}.`,
          )
          checked = []
        } catch (err: any) {
          console.error('Failed to update decisions:', err)
          alert.trigger(
            'error',
            `Failed to update decision: ${err.message || err}`,
          )
          throw err
        }
      },
    }
  }
  function handleCheck(
    e: Event & { currentTarget: EventTarget & HTMLInputElement },
    i: number,
  ) {
    const target = e.target as HTMLInputElement
    if (target.checked) {
      checked = [...checked, i]
    } else {
      checked = checked.filter((item) => item !== i)
    }
  }
  function handleCheckAll(
    e: Event & { currentTarget: EventTarget & HTMLInputElement },
  ) {
    const target = e.target as HTMLInputElement
    if (target.checked) {
      checked = Array.from({ length: data.applications.length }, (_, i) => i)
    } else {
      checked = []
    }
  }

  let rows = $derived(
    data.applications.map((application: PageData['applications'][number]) => {
      const {
        id,
        values: {
          personal: { firstName, lastName, email },
          academic: { school, graduationYear },
          program: { courses, timeSlots, inPerson },
          essay: { taughtBefore },
          meta: { submitted, decision },
        },
      } = application

      return [
        id,
        submitted ? 'Submitted' : 'Not Submitted',
        decision?.type ?? 'Undecided',
        decision?.likelyDecision ?? 'Undecided',
        decision?.notes ?? '',
        firstName,
        lastName,
        email,
        school,
        graduationYear,
        courses.join(';'),
        timeSlots,
        taughtBefore ? 'Yes' : 'No',
        inPerson ? 'Yes' : 'No',
      ]
    }),
  )
  let csvWithHeaders = $derived(generateCSV(csvHeaders, rows))
  let blob = $derived(new Blob([csvWithHeaders], { type: 'text/csv' }))
  let url = objectUrl(() => blob)
  // The Nav "Close" button clears the shared actions bar directly
  // (actionsState.current = null); mirror that back into our local
  // selection so the checkboxes clear too.
  //
  // These two effects are a deliberate cycle, not disjoint: this one reads
  // actionsState.current and writes `checked`; the one below reads `checked`
  // and writes actionsState.current. It terminates because the second hop is
  // always a no-op write - Nav sets current = null, we clear `checked`, the
  // effect below sees length 0 and assigns null over null, and $state skips
  // equal writes so nothing re-fires. Selecting a row settles the same way:
  // the effect below writes a fresh actions array, this one sees a non-null
  // current and writes nothing.
  //
  // Careful: that guarantee rests on the "already null" equality. If the
  // else-branch below is ever changed to assign a fresh empty array (or any
  // new object) instead of null, the two effects will ping-pong forever.
  $effect(() => {
    if (actionsState.current === null) {
      checked = []
    }
  })
  $effect(() => {
    if (checked.length > 0) {
      actionsState.current = [
        createDecisionAction('accepted'),
        createDecisionAction('waitlisted'),
        createDecisionAction('rejected'),
        createDecisionAction('interview'),
        createDecisionAction('substitute'),
      ]
    } else {
      actionsState.current = null
    }
  })
  let application = $derived(
    data.applications.length === 0
      ? undefined
      : current === undefined
        ? undefined
        : data.applications[current],
  )
  let currentPage = $derived(data.page ?? 1)
  let currentLimit = $derived(data.limit ?? 25)
  let prevHref = $derived(
    (() => {
      if (currentPage <= 1) return ''
      const base = new URLSearchParams(page.url.searchParams)
      base.set('page', String(currentPage - 1))
      return `?${base.toString()}`
    })(),
  )
  let nextHref = $derived(
    (() => {
      if (data.applications.length < currentLimit) return ''
      const base = new URLSearchParams(page.url.searchParams)
      base.set('page', String(currentPage + 1))
      return `?${base.toString()}`
    })(),
  )
  let selectedSemester = $derived(
    resolveSemester(page.url.searchParams.get('semester')),
  )
  let selectedCollection = $derived(
    semesterCollectionPath(selectedSemester, 'applications'),
  )
</script>

<svelte:head>
  <title>Applications</title>
</svelte:head>

<div class="flex flex-wrap items-end gap-4">
  <SearchBox basePath="/applications" />
  <CollectionFilter />
  <StatusFilter type="applications" />
  <PerPageControl />
  <Button
    class="flex h-12 items-center"
    href={url.current}
    download="applications.csv">Download</Button
  >
</div>

<Table>
  {#snippet head()}
    <th scope="col" class="p-4">
      <div class="flex items-center">
        <input
          id="check-all"
          class="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:ring-offset-1 focus:outline-hidden disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400"
          type="checkbox"
          checked={checked.length === data.applications.length &&
            checked.length > 0}
          oninput={handleCheckAll}
        />
        <label for="check-all" class="sr-only">checkbox</label>
      </div>
    </th>
    <th scope="col" class="px-6 py-3">Likely decision</th>
    <th scope="col" class="px-6 py-3">Notes</th>
    <th scope="col" class="px-6 py-3">Submitted</th>
    <th scope="col" class="px-6 py-3">Decision</th>
    <th scope="col" class="px-6 py-3">Interview scheduled</th>
    <th scope="col" class="px-6 py-3">Name</th>
    <th scope="col" class="px-6 py-3">Email</th>
    <th scope="col" class="px-6 py-3">School</th>
    <th scope="col" class="px-6 py-3">Year</th>
    <th scope="col" class="px-6 py-3">Courses</th>
    <th scope="col" class="px-6 py-3">Timeslots</th>
    <th scope="col" class="px-6 py-3">Taught before</th>
  {/snippet}
  {#snippet body()}
    {#each data.applications as application, i (application.id)}
      <tr
        class="border-b bg-white hover:cursor-pointer hover:bg-gray-50"
        onclick={() => {
          current = i
          showApplicationDialog = true
        }}
      >
        <td class="w-4 p-4">
          <div class="flex items-center">
            <input
              id={`check-${i}`}
              class="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:ring-offset-1 focus:outline-hidden disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400"
              type="checkbox"
              checked={checked.includes(i)}
              oninput={(e) => handleCheck(e, i)}
              onclick={(e) => e.stopPropagation()}
            />
            <label for="check-all" class="sr-only">checkbox</label>
          </div>
        </td>
        <td class="px-6 py-4">
          {#if application.values.meta.decision?.likelyDecision}
            {#if application.values.meta.decision?.likelyDecision === 'likely yes'}
              <Icon
                src={CheckCircle}
                theme="mini"
                class="h-5 w-5 text-green-300"
              />
            {:else if application.values.meta.decision?.likelyDecision === 'likely no'}
              <Icon src={XCircle} theme="mini" class="h-5 w-5 text-red-300" />
            {:else if application.values.meta.decision?.likelyDecision === 'likely waitlist'}
              <Icon
                src={ExclamationCircle}
                theme="mini"
                class="h-5 w-5 text-yellow-300"
              />
            {/if}
          {:else}
            None
          {/if}
        </td>
        <td class="px-6 py-4">
          {`${application.values.meta.decision?.notes}`}
        </td>
        <td class="px-6 py-4">
          {#if application.values.meta.submitted}
            {format(application.values.timestamps.updated, 'yyyy.MM.dd p')}
          {:else}
            <Icon src={XMark} class="h-5 w-5" />
          {/if}
        </td>
        <td class="px-6 py-4">
          {#if application.values.meta.decision?.type}
            {#if application.values.meta.decision?.type === 'accepted'}
              <Icon
                src={CheckCircle}
                theme="mini"
                class="h-5 w-5 text-green-300"
              />
            {:else if application.values.meta.decision?.type === 'waitlisted'}
              <Icon
                src={ExclamationCircle}
                theme="mini"
                class="h-5 w-5 text-yellow-300"
              />
            {:else if application.values.meta.decision.type === 'rejected'}
              <Icon src={XCircle} theme="mini" class="h-5 w-5 text-red-300" />
            {:else if application.values.meta.decision.type === 'interview'}
              <Icon
                src={ExclamationCircle}
                theme="mini"
                class="h-5 w-5 text-blue-300"
              />
            {:else if application.values.meta.decision.type === 'substitute'}
              <Icon
                src={PlusCircle}
                theme="mini"
                class="h-5 w-5 text-purple-300"
              />
            {/if}
          {:else}
            None
          {/if}
        </td>
        <td class="px-6 py-4">
          {`${application.values.meta.interview ? 'Yes' : 'No'}`}
        </td>
        <td class="px-6 py-4">
          {`${application.values.personal.firstName} ${application.values.personal.lastName}`}
        </td>
        <td class="px-6 py-4"> {application.values.personal.email} </td>
        <td class="px-6 py-4">
          {application.values.academic.school}
        </td>
        <td class="px-6 py-4">
          {application.values.academic.graduationYear}
        </td>
        <td class="px-6 py-4">{application.values.program.courses}</td>
        <td class="px-6 py-4">{application.values.program.timeSlots}</td>

        <td class="px-6 py-4">
          {#if application.values.essay.taughtBefore}
            <Icon src={Check} class="h-5 w-5" />
          {:else}
            <Icon src={XMark} class="h-5 w-5" />
          {/if}
        </td>
      </tr>
    {/each}
  {/snippet}
</Table>

{#if !data.query && data.applications}
  <div class="mt-4 flex justify-end gap-2">
    {#if currentPage > 1}
      <Button href={prevHref}>Previous</Button>
    {/if}
    {#if data.applications.length >= currentLimit}
      <Button href={nextHref}>Next</Button>
    {/if}
  </div>
{/if}

<Application
  bind:open={showApplicationDialog}
  id={application?.id}
  collection={selectedCollection}
/>

<style>
  input:checked {
    background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: center;
  }
</style>
