<script lang="ts">
  import { page } from '$app/state'
  import Button from '#lib/components/Button.svelte'
  import ClassFeedbackDetails from '#lib/components/ClassFeedbackDetails.svelte'
  import CourseFilter from '#lib/components/CourseFilter.svelte'
  import PerPageControl from '#lib/components/PerPageControl.svelte'
  import SearchBox from '#lib/components/SearchBox.svelte'
  import Table from '#lib/components/Table.svelte'
  import { objectUrl } from '#lib/objectUrl.svelte.js'
  import { generateCSV } from '#lib/utils.js'
  import type { PageData } from './$types'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()
  let showFeedbackDialog = $state(false)
  let selectedFeedbackId: string | undefined = $state(undefined)

  function getAttendancePercent(value: boolean[]) {
    if (!value || value.length === 0) return '0%'
    const attended = value.filter(
      (attended: boolean) => attended === true,
    ).length
    const total = value.length
    return `${Math.round((attended / total) * 100)}%`
  }

  let currentPage = $derived(data.page ?? 1)
  let currentLimit = $derived(data.limit ?? 25)

  let prevHref = $derived(
    (() => {
      if (currentPage <= 1) return ''
      const base = new URLSearchParams(page.url.search)
      base.set('page', String(currentPage - 1))
      return `?${base.toString()}`
    })(),
  )

  let nextHref = $derived(
    (() => {
      if (data.feedback.length < currentLimit) return ''
      const base = new URLSearchParams(page.url.search)
      base.set('page', String(currentPage + 1))
      return `?${base.toString()}`
    })(),
  )

  const csvHeaders = [
    'id',
    'instructorName',
    'courseName',
    'classNumber',
    'date',
    'feedback',
  ]
  let csvWithHeaders = $derived(
    generateCSV(
      csvHeaders,
      data.feedback.map((item) => [
        item.id,
        item.instructorName,
        item.courseName,
        item.classNumber,
        item.date,
        item.feedback || '',
      ]),
    ),
  )
  let blob = $derived(new Blob([csvWithHeaders], { type: 'text/csv' }))
  let url = objectUrl(() => blob)
</script>

<svelte:head>
  <title>Class Feedback</title>
</svelte:head>

<ClassFeedbackDetails bind:open={showFeedbackDialog} id={selectedFeedbackId} />

<div class="mb-4 flex flex-wrap items-end gap-4">
  <SearchBox basePath="/instructor-feedback" />
  <CourseFilter paramName="course" />
  <PerPageControl />
  <Button
    class="flex h-12 items-center"
    href={url.current}
    download="instructor-feedback.csv">Download</Button
  >
</div>

<Table>
  {#snippet head()}
    <th scope="col" class="px-6 py-3">Instructor Name</th>
    <th scope="col" class="px-6 py-3">Course</th>
    <th scope="col" class="px-6 py-3">Class Number</th>
    <th scope="col" class="px-6 py-3">Date</th>
    <th scope="col" class="px-6 py-3">Attendance Percent</th>
    <th scope="col" class="px-6 py-3">Feedback</th>
  {/snippet}
  {#snippet body()}
    {#each data.feedback as value (value.id)}
      <tr
        class="border-b bg-white hover:cursor-pointer hover:bg-gray-50"
        onclick={() => {
          selectedFeedbackId = value.id
          showFeedbackDialog = true
        }}
      >
        <td class="px-6 py-4">
          {`${value.instructorName}`}
        </td>
        <td class="px-6 py-4">
          {value.courseName}
        </td>
        <td class="px-6 py-4">
          {value.classNumber}
        </td>
        <td class="px-6 py-4">{value.date}</td>
        <td class="px-6 py-4">{getAttendancePercent(value.attendanceList)}</td>
        <td class="px-6 py-4">
          {value.feedback}
        </td>
      </tr>
    {/each}
  {/snippet}
</Table>

{#if !data.query && data.feedback}
  <div class="mt-4 flex justify-end gap-2">
    {#if currentPage > 1}
      <Button href={prevHref}>Previous</Button>
    {/if}
    {#if data.feedback.length >= currentLimit}
      <Button href={nextHref}>Next</Button>
    {/if}
  </div>
{/if}
