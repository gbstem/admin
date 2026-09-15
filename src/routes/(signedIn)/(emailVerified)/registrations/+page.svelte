<script lang="ts">
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import Button from '$lib/components/Button.svelte'
  import CollectionFilter from '$lib/components/CollectionFilter.svelte'
  import PerPageControl from '$lib/components/PerPageControl.svelte'
  import Registration from '$lib/components/Registration.svelte'
  import SearchBox from '$lib/components/SearchBox.svelte'
  import StatusFilter from '$lib/components/StatusFilter.svelte'
  import Table from '$lib/components/Table.svelte'
  import {
    resolveSemester,
    semesterCollectionPath,
  } from '$lib/data/collections'
  import { objectUrl } from '$lib/objectUrl.svelte'
  import { registrationService } from '$lib/services/registrationService'
  import { studentService } from '$lib/services/studentService'
  import { alert } from '$lib/stores'
  import { generateCSV, normalizeCapitals } from '$lib/utils'
  import { format } from 'date-fns'
  import { kebabCase } from 'lodash-es'
  import type { PageData } from './$types'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { XMark } from '@steeze-ui/heroicons'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()
  let showRegistrationDialog = $state(false)
  let current: number | undefined = $state()
  let checked: Array<number> = $state([])
  let selectedCollection = $derived(
    semesterCollectionPath(
      resolveSemester(page.url.searchParams.get('semester')),
      'registrations',
    ),
  )

  const csvHeaders = [
    'id',
    'studentFirstName',
    'studentLastName',
    'parentFirstName',
    'parentLastName',
    'email',
    'secondaryEmail',
    'school',
    'grade',
    'csCourse',
    'engineeringCourse',
    'mathCourse',
    'scienceCourse',
    'In-person',
  ]
  let rows = $derived(
    data.registrations.map((registration) => {
      const {
        id,
        values: {
          personal: {
            studentFirstName,
            studentLastName,
            parentFirstName,
            parentLastName,
            email,
            secondaryEmail,
          },
          academic: { school, grade },
          program: {
            csCourse,
            engineeringCourse,
            mathCourse,
            scienceCourse,
            inPerson,
          },
        },
      } = registration
      return [
        id,
        normalizeCapitals(studentFirstName),
        normalizeCapitals(studentLastName),
        normalizeCapitals(parentFirstName),
        normalizeCapitals(parentLastName),
        email,
        secondaryEmail,
        school,
        grade,
        (csCourse ?? '').toLowerCase().replace(/ /g, '-'),
        (engineeringCourse ?? '').toLowerCase().replace(/ /g, '-'),
        kebabCase(mathCourse ?? ''),
        (scienceCourse ?? '').toLowerCase().replace(/ /g, '-'),
        inPerson ? 'Yes' : 'No',
      ]
    }),
  )

  let csvWithHeaders = $derived(generateCSV(csvHeaders, rows))

  let blob = $derived(new Blob([csvWithHeaders], { type: 'text/csv' }))
  let url = objectUrl(() => blob)

  let schools = $derived(
    data.registrations
      .map((registration) =>
        registration.values.academic.school.trim().toLocaleLowerCase(),
      )
      .sort(),
  )
  let uniqueSchools = $derived(Array.from(new Set(schools)))
  let schoolsBlob = $derived(
    new Blob([uniqueSchools.join('\n')], { type: 'text/csv' }),
  )
  let schoolsUrl = objectUrl(() => schoolsBlob)

  let registration = $derived(
    data.registrations.length === 0
      ? undefined
      : current === undefined
        ? undefined
        : data.registrations[current],
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
      if (data.registrations.length < currentLimit) return ''
      const base = new URLSearchParams(page.url.searchParams)
      base.set('page', String(currentPage + 1))
      return `?${base.toString()}`
    })(),
  )

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
      checked = Array.from({ length: data.registrations.length }, (_, i) => i)
    } else {
      checked = []
    }
  }
  function bypassAgeLimits(id: string) {
    registrationService
      .toggleBypassAgeLimits(id)
      .then(() => {
        alert.trigger('success', 'Bypass age limits updated successfully.')
      })
      .catch((err) => {
        console.error('Failed to update bypass age limits:', err)
        const isPermissionDenied =
          err.code === 'permission-denied' ||
          String(err).includes('permission') ||
          String(err).includes('Permission')
        const msg = isPermissionDenied
          ? 'You do not have permission to modify this registration.'
          : `Failed to update bypass age limits: ${err.message || err}`
        alert.trigger('error', msg)
      })
  }
  function getInterestedClasses(registration: any) {
    let interestedClasses = ''
    if (registration) {
      interestedClasses += (
        registration.values.program.csCourse ?? ''
      ).includes('I am not interested')
        ? ''
        : registration.values.program.csCourse + ', '
      interestedClasses += (
        registration.values.program.engineeringCourse ?? ''
      ).includes('I am not interested')
        ? ''
        : registration.values.program.engineeringCourse + ', '
      interestedClasses += (
        registration.values.program.mathCourse ?? ''
      ).includes('I am not interested')
        ? ''
        : registration.values.program.mathCourse + ', '
      interestedClasses += (
        registration.values.program.scienceCourse ?? ''
      ).includes('I am not interested')
        ? ''
        : registration.values.program.scienceCourse
    }
    return interestedClasses
  }

  let studentCoursesMapPromise = $derived.by(() => {
    if (!browser) return Promise.resolve(new Map<string, string[]>())
    return studentService.fetchStudentCoursesMap()
  })

  async function getCourses(id: string) {
    if (!browser) return 'Loading...'
    try {
      const studentCoursesMap = await studentCoursesMapPromise
      const courses = studentCoursesMap.get(id) || []
      return courses.length > 0 ? courses : 'NO CLASS ENROLLMENT FOUND'
    } catch (err: any) {
      console.error(`Error fetching courses for student ${id}:`, err)
      return 'ERROR LOADING ENROLLMENT'
    }
  }
</script>

<svelte:head>
  <title>Registrations</title>
</svelte:head>

<div class="flex flex-wrap items-end gap-4">
  <SearchBox basePath="/registrations" />
  <CollectionFilter />
  <StatusFilter type="registrations" />
  <PerPageControl />
  <Button
    class="flex h-12 items-center"
    href={url.current}
    download="registrations.csv">Download</Button
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
          checked={checked.length === data.registrations.length &&
            checked.length > 0}
          oninput={handleCheckAll}
        />
        <label for="check-all" class="sr-only">checkbox</label>
      </div>
    </th>
    <th scope="col" class="px-6 py-3">Submitted</th>
    <th scope="col" class="px-6 py-3">Name</th>
    <th scope="col" class="px-6 py-3">Email</th>
    <th scope="col" class="px-6 py-3">School</th>
    <th scope="col" class="px-6 py-3">Grade</th>
    <th scope="col" class="px-6 py-3">Parent</th>
    <th scope="col" class="px-6 py-3">Course Interest</th>
    <th scope="col" class="px-6 py-3">Bypass Age Limits?</th>
    <th scope="col" class="px-6 py-3">Course Enrollment</th>
    <!-- <th scope="col" class="px-6 py-3">Taught before</th> -->
  {/snippet}
  {#snippet body()}
    {#each data.registrations as registration, i (registration.id)}
      <tr
        class="border-b bg-white hover:cursor-pointer hover:bg-gray-50"
        onclick={(e) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') return
          current = i
          showRegistrationDialog = true
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
            />
            <label for="check-all" class="sr-only">checkbox</label>
          </div>
        </td>
        <td class="px-6 py-4">
          {#if registration.values.meta.submitted}
            {format(registration.values.timestamps.updated, 'yyyy.MM.dd p')}
          {:else}
            <Icon src={XMark} class="h-5 w-5" />
          {/if}
        </td>

        <td class="px-6 py-4">
          {`${normalizeCapitals(registration.values.personal.studentFirstName + ' ' + registration.values.personal.studentLastName)}`}
        </td>
        <td class="px-6 py-4"> {registration.values.personal.email} </td>
        <td class="px-6 py-4">
          {registration.values.academic.school}
        </td>
        <td class="px-6 py-4">
          {registration.values.academic.grade}
        </td>
        <td class="px-6 py-4">
          {normalizeCapitals(
            registration.values.personal.parentFirstName +
              ' ' +
              registration.values.personal.parentLastName,
          )}
        </td><td class="px-6 py-4">{getInterestedClasses(registration)}</td>
        <td class="px-6 py-4">
          <input
            id={`bypass-${i}`}
            class="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:ring-offset-1 focus:outline-hidden disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400"
            type="checkbox"
            checked={registration.values.agreements.bypassAgeLimits}
            onchange={() => bypassAgeLimits(registration.id)}
          />
        </td>
        {#await getCourses(registration.id) then courses}
          <td class="px-6 py-4">{courses}</td>
        {/await}
      </tr>
    {/each}
  {/snippet}
</Table>

<div class="mt-4 flex w-full justify-between">
  <Button href={schoolsUrl.current} download="schools-list.txt"
    >Download Schools List</Button
  >
  {#if !data.query && data.registrations}
    <div class="flex gap-2">
      {#if currentPage > 1}
        <Button href={prevHref}>Previous</Button>
      {/if}
      {#if data.registrations.length >= currentLimit}
        <Button href={nextHref}>Next</Button>
      {/if}
    </div>
  {/if}
</div>

<Registration
  bind:open={showRegistrationDialog}
  id={registration?.id}
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
