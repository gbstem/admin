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
<div class="mb-8">
  <a
    href="/announcements"
    class="inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
      class="h-5 w-5"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
    View Announcements
  </a>
</div>
-->

<div class="relative w-full">
  {#if loading}
    <div
      class="absolute top-0 right-0 left-0 flex h-[calc(100vh-216px-80px)] items-center justify-center rounded-lg bg-gray-200 opacity-60 md:h-[calc(100vh-216px)]"
      transition:fade
    >
      <div role="status">
        <svg
          aria-hidden="true"
          class="inline h-10 w-10 animate-spin fill-gray-700 text-white"
          viewBox="0 0 100 101"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
            fill="currentColor"
          />
          <path
            d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
            fill="currentFill"
          />
        </svg>
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
                          instructorEmail: classToday.class.instructorEmail,
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
