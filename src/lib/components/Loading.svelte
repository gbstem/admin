<script lang="ts">
  import { cn } from '$lib/utils'
  import { fade } from 'svelte/transition'
  import SpinnerIcon from '$lib/components/icons/SpinnerIcon.svelte'

  interface Props {
    class?: string
  }

  let { class: className = '' }: Props = $props()
</script>

<div
  class={cn(
    'flex items-center justify-center rounded-lg bg-gray-200 opacity-60',
    className,
  )}
  transition:fade
>
  <div role="status">
    <SpinnerIcon class="h-10 w-10 fill-gray-700" />
    <span class="sr-only">Loading...</span>
  </div>
</div>
