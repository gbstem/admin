<script lang="ts">
  import InterviewerAvailability from '#lib/components/InterviewerAvailability.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()

  let interviewWindow = $derived({
    opens: new Date(data.interviewWindow.opens),
    closes: new Date(data.interviewWindow.closes),
  })
</script>

<svelte:head>
  <title>Set Your Availability</title>
</svelte:head>

<h1 class="mb-2 text-5xl font-bold md:text-6xl">Set Your Availability</h1>
<p class="mb-8">
  <a class="text-blue-600 hover:underline" href="/interviews"
    >← Back to interview timeslots</a
  >
</p>

<div class="relative w-full">
  <InterviewerAvailability window={interviewWindow} />
</div>
