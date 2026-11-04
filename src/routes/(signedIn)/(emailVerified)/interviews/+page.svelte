<script lang="ts">
  import SetInterviewTimesForm from '#lib/components/forms/SetInterviewTimesForm.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()

  let interviewWindow = $derived({
    opens: new Date(data.interviewWindow.opens),
    closes: new Date(data.interviewWindow.closes),
  })
</script>

<svelte:head>
  <title>Interview Timeslots</title>
</svelte:head>

<h1 class="mb-8 text-5xl font-bold md:text-6xl">Set Interview Timeslots</h1>

<div class="relative w-full">
  <SetInterviewTimesForm {interviewWindow} />
</div>
