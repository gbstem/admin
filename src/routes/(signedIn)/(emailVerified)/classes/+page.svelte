<script lang="ts">
  import { page } from '$app/state'
  import Button from '$lib/components/Button.svelte'
  import ClassDetails from '$lib/components/ClassDetails.svelte'
  import CourseFilter from '$lib/components/CourseFilter.svelte'
  import PerPageControl from '$lib/components/PerPageControl.svelte'
  import SearchBox from '$lib/components/SearchBox.svelte'
  import Table from '$lib/components/Table.svelte'
  import { ClassStatus } from '$lib/data/types/ClassStatus'
  import { objectUrl } from '$lib/objectUrl.svelte'
  import { copyEmails, generateCSV } from '$lib/utils'
  import type { PageData } from './$types'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { DocumentDuplicate } from '@steeze-ui/heroicons'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()
  let selectedClassId: string | undefined = $state(undefined)
  let showClassDetailsDialog = $state(false)
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
      if (data.classes && data.classes.length < currentLimit) return ''
      const base = new URLSearchParams(page.url.searchParams)
      base.set('page', String(currentPage + 1))
      return `?${base.toString()}`
    })(),
  )

  const csvHeaders = [
    'id',
    'name',
    'email',
    'class',
    'students',
    'classes complete',
    'classes missing feedback',
    'classes missed',
    'meeting link',
    'class times',
  ]
  let rows = $derived(
    data.classes.map((classes) => {
      const {
        id,
        name,
        email,
        courses,
        students,
        classStatuses,
        meetingLink,
        classTimes,
      } = classes
      return [
        id,
        name,
        email,
        courses,
        students.join(', '),
        classStatuses.filter(
          (status) => status === ClassStatus.EverythingComplete,
        ).length,
        classStatuses.filter(
          (status) => status === ClassStatus.FeedbackIncomplete,
        ).length,
        classStatuses.filter((status) => status === ClassStatus.ClassNotHeld)
          .length,
        meetingLink,
        classTimes.map((value) => value.toString()).join(', '),
      ]
    }),
  )

  let csvWithHeaders = $derived(generateCSV(csvHeaders, rows))

  let blob = $derived(new Blob([csvWithHeaders], { type: 'text/csv' }))
  let url = objectUrl(() => blob)
</script>

<svelte:head>
  <title>Classes</title>
</svelte:head>

<ClassDetails bind:open={showClassDetailsDialog} id={selectedClassId} />

<div class="flex flex-wrap items-end gap-4">
  <SearchBox basePath="/classes" />
  <CourseFilter />
  <PerPageControl />
  <Button
    color="blue"
    class="flex h-12 items-center"
    href={url.current}
    download="classes.csv">Download</Button
  >
  <Button
    onclick={() =>
      copyEmails(data.classes.map((instructor) => instructor.email))}
    class="flex h-12 items-center gap-1"
  >
    <Icon src={DocumentDuplicate} class="size-5 text-black" />
    <span>Copy Emails</span>
  </Button>
</div>

{#await data then feedback}
  <Table>
    {#snippet head()}
      <th scope="col" class="px-6 py-3">Instructor Name</th>
      <th scope="col" class="px-6 py-3">Instructor Email</th>
      <th scope="col" class="px-6 py-3">Course</th>
      <th scope="col" class="px-6 py-3">Meeting Link</th>
      <th scope="col" class="px-6 py-3">Class Time</th>
      <th scope="col" class="px-6 py-3">Number of students</th>
      <th scope="col" class="px-6 py-3">Classes Missed</th>
      <th scope="col" class="px-6 py-3">Classes Missing Feedback</th>
    {/snippet}
    {#snippet body()}
      {#each feedback.classes as value (value.id)}
        <tr
          class="border-b bg-white hover:cursor-pointer hover:bg-gray-50"
          onclick={() => {
            selectedClassId = value.id
            showClassDetailsDialog = true
          }}
        >
          <td class="px-6 py-4">
            {value.name}
          </td>
          <td class="px-6 py-4">
            {value.email}
          </td>
          <td class="px-6 py-4">
            {value.courses}
          </td>
          <td class="px-6 py-4">
            {value.meetingLink}
          </td>
          <td class="px-6 py-4">
            {value.classTimes.join(', ')}
          </td>
          <td class="px-6 py-4">
            {value.students ? value.students.length : 0}
          </td>
          <td class="px-6 py-4">
            {value.classStatuses.filter(
              (status) => status === ClassStatus.ClassNotHeld,
            ).length}
          </td>
          <td class="px-6 py-4">
            {value.classStatuses.filter(
              (status) => status === ClassStatus.FeedbackIncomplete,
            ).length}
          </td>
        </tr>
      {/each}
    {/snippet}
  </Table>
  {#if !data.query && feedback.classes}
    <div class="mt-4 flex justify-end gap-2">
      {#if currentPage > 1}
        <Button href={prevHref}>Previous</Button>
      {/if}
      {#if feedback.classes.length >= currentLimit}
        <Button href={nextHref}>Next</Button>
      {/if}
    </div>
  {/if}
{/await}
