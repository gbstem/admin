<script lang="ts">
  import { user } from '$lib/client/firebase'
  import Button from '$lib/components/Button.svelte'
  import Card from '$lib/components/Card.svelte'
  import sendClassReminder from '$lib/data/helpers/sendClassReminders'
  import { ClassStatus } from '$lib/data/types/ClassStatus'
  import {
    dashboardService,
    type ClassToday,
    type DashboardData,
  } from '$lib/services/dashboardService'
  import { alert } from '$lib/stores'
  import { formatDate, timestampToDate, copyEmails } from '$lib/utils'
  import { fade } from 'svelte/transition'
  import type { PageData } from './$types'
  import SpinnerIcon from '$lib/components/icons/SpinnerIcon.svelte'

  interface Props {
    data: PageData
  }

  let { data: pageData }: Props = $props()

  let classesToday: ClassToday[] = $state([])

  let loading = $state(true)
  let uncompletedRegistrationsEmails: string[] = $state([])
  let uncompletedApplicationsEmails: string[] = $state([])

  let dashboardData: DashboardData = $state({
    applications: {
      total: 0,
      submitted: 0,
      decided: 0,
      registered: 0,
      totalRegistrationsStarted: 0,
      enrolled: 0,
    },
    users: {
      total: 0,
    },
  })

  let isReviewer = $derived(pageData.user.role === 'reviewer')

  function getClassStatusBg(status: string) {
    switch (status) {
      case ClassStatus.ClassUpcomingSoon:
        return 'bg-blue-100'
      case ClassStatus.ClassNotHeld:
        return 'bg-red-100'
      case ClassStatus.FeedbackIncomplete:
        return 'bg-yellow-100'
      case ClassStatus.EverythingComplete:
        return 'bg-green-100'
      default:
        return 'bg-gray-100'
    }
  }

  async function loadDashboardData() {
    loading = true
    try {
      const result = await dashboardService.fetchDashboardData(isReviewer)
      dashboardData = result.dashboardData
      classesToday = result.classesToday
      uncompletedRegistrationsEmails = result.uncompletedRegistrationsEmails
      uncompletedApplicationsEmails = result.uncompletedApplicationsEmails
    } catch (err: any) {
      console.error('Error loading dashboard data:', err)
      alert.trigger(
        'error',
        `Failed to load dashboard data: ${err.message || err}`,
      )
    } finally {
      loading = false
    }
  }

  user.subscribe((u) => {
    if (u) {
      loadDashboardData()
    }
  })
</script>

<svelte:head>
  <title>Dashboard</title>
</svelte:head>
<h1 class="mb-4 text-5xl font-bold md:text-6xl">Dashboard</h1>

<!--
  View Announcements link is temporarily hidden since gbSTEM has no UI implementation to write/create announcements.
  The announcements page code currently only exists for displaying announcements, not creating them.
  This link can be re-enabled here in the future if announcement creation is added.
  Re-enabling it also means importing `Icon` from '@steeze-ui/svelte-icon' and `Bell` from '@steeze-ui/heroicons'.
<div class="mb-8">
  <a
    href="/announcements"
    class="inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
  >
    <Icon src={Bell} class="h-5 w-5" stroke-width="2" />
    View Announcements
  </a>
</div>
-->

<div class="relative w-full">
  {#if loading}
    <div
      class="absolute inset-x-0 top-0 flex h-[calc(100vh-216px-80px)] items-center justify-center rounded-lg bg-gray-200 opacity-60 md:h-[calc(100vh-216px)]"
      transition:fade
    >
      <div role="status">
        <SpinnerIcon class="size-10 fill-gray-700" />
        <span class="sr-only">Loading...</span>
      </div>
    </div>
  {:else}
    <div
      class="space-y-6"
      transition:fade={{
        duration: 500,
      }}
    >
      <Card class="space-y-2">
        <h2 class="text-xl font-bold">Applications</h2>
        <ol class="space-y-1">
          <li>
            {dashboardData.applications.total} total instructor applications created.
          </li>
          <li>
            {dashboardData.applications.submitted} instructor apps submitted.
          </li>
          <li>
            {dashboardData.applications.decided} instructor apps decided.
          </li>
          {#if !isReviewer}
            <li>
              {dashboardData.applications.registered} students pre-registered.
            </li>
            <li>
              {dashboardData.applications.totalRegistrationsStarted} pre-registrations
              started.
            </li>
            <li>
              {dashboardData.applications.enrolled} students enrolled.
            </li>
          {/if}
        </ol>
        {#if !isReviewer}
          <Button onclick={() => copyEmails(uncompletedRegistrationsEmails)}
            >Copy Emails for Uncompleted Registrations</Button
          >
        {/if}
        <Button onclick={() => copyEmails(uncompletedApplicationsEmails)}
          >Copy Emails for Uncompleted Applications</Button
        >
      </Card>
      {#if !isReviewer}
        <Card class="space-y-2">
          <h2 class="text-xl font-bold">Users</h2>
          <ol class="space-y-1">
            <li>{dashboardData.users.total} total.</li>
          </ol>
        </Card>
        <Card class="space-y-2">
          <h2 class="text-xl font-bold">Classes Today</h2>
          {#if classesToday.length === 0}
            <p class="p-2 text-sm text-gray-500 italic">
              No classes scheduled for today.
            </p>
          {:else}
            <div
              class="hidden grid-cols-12 gap-4 border-b border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500 sm:grid"
            >
              <span class="col-span-3">Course</span>
              <span class="col-span-3">Instructor</span>
              <span class="col-span-4">Action</span>
              <span class="col-span-2 text-right">Time</span>
            </div>
            <ul class="list-none space-y-2">
              {#each classesToday as classToday (classToday.id + '-' + classToday.classNumber)}
                {@const status =
                  classToday.class.classStatuses[classToday.classNumber]}
                <li
                  class="grid grid-cols-1 items-center gap-4 rounded-lg p-4 sm:grid-cols-12 {getClassStatusBg(
                    status,
                  )}"
                >
                  <p class="font-semibold sm:col-span-3 sm:font-normal">
                    {classToday.class.course}
                  </p>
                  <p class="sm:col-span-3">
                    {classToday.class.instructorFirstName +
                      ' ' +
                      classToday.class.instructorLastName}
                  </p>
                  <div class="sm:col-span-4">
                    <Button
                      color="gray"
                      onclick={() =>
                        sendClassReminder({
                          instructorName: classToday.class.instructorFirstName,
                          instructorUid: classToday.class.instructorUid,
                          otherInstructorUids:
                            classToday.class.otherInstructorUids ?? [],
                          className: classToday.class.course,
                          nextMeetingTime: formatDate(
                            timestampToDate(
                              classToday.class.meetingTimes[
                                classToday.classNumber
                              ],
                            ),
                          ),
                        })}
                    >
                      Send Instructor Reminder
                    </Button>
                  </div>
                  <p class="sm:col-span-2 sm:text-right">
                    {formatDate(
                      timestampToDate(
                        classToday.class.meetingTimes[classToday.classNumber],
                      ),
                    )}
                  </p>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
      {/if}
    </div>
  {/if}
</div>
