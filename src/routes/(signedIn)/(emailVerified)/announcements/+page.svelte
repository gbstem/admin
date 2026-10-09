<script lang="ts">
  import { page } from '$app/state'
  import Button from '#lib/components/Button.svelte'
  import Table from '#lib/components/Table.svelte'
  import PerPageControl from '#lib/components/PerPageControl.svelte'
  import { format } from 'date-fns'
  import type { PageData } from './$types'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

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
      if (data.announcements.length < currentLimit) return ''
      const base = new URLSearchParams(page.url.search)
      base.set('page', String(currentPage + 1))
      return `?${base.toString()}`
    })(),
  )
</script>

<svelte:head>
  <title>Announcements</title>
</svelte:head>

<h1 class="mb-8 text-5xl font-bold md:text-6xl">Announcements</h1>

<div class="mb-4 flex flex-wrap items-center gap-4">
  <PerPageControl />
</div>

<Table>
  {#snippet head()}
    <th scope="col" class="px-6 py-3">Date</th>
    <th scope="col" class="px-6 py-3">Title</th>
    <th scope="col" class="px-6 py-3">Content</th>
  {/snippet}
  {#snippet body()}
    {#each data.announcements as announcement (announcement.timestamp.getTime() + announcement.title)}
      <tr class="border-b bg-white hover:bg-gray-50">
        <td class="px-6 py-4 whitespace-nowrap text-gray-400">
          {format(announcement.timestamp, 'yyyy.MM.dd')}
        </td>
        <td class="px-6 py-4 font-semibold text-gray-900">
          {announcement.title}
        </td>
        <td class="px-6 py-4 text-gray-600">
          {announcement.content}
        </td>
      </tr>
    {/each}
  {/snippet}
</Table>

{#if data.announcements}
  <div class="mt-4 flex justify-end gap-2">
    {#if currentPage > 1}
      <Button href={prevHref}>Previous</Button>
    {/if}
    {#if data.announcements.length >= currentLimit}
      <Button href={nextHref}>Next</Button>
    {/if}
  </div>
{/if}
