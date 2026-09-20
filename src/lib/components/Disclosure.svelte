<script module lang="ts">
  type DisclosureData = {
    id: string
    close: () => void
  }
  const elements = new Set<DisclosureData>()
</script>

<script lang="ts">
  import { cn } from '$lib/utils'
  import { onMount } from 'svelte'
  import { uniqueId } from 'lodash-es'
  import { slide } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { ChevronDown } from '@steeze-ui/heroicons'

  interface Props {
    class?: string
    title?: import('svelte').Snippet
    content?: import('svelte').Snippet
  }

  let { class: className = '', title, content }: Props = $props()

  let openState = $state(false)
  const id = uniqueId('disclosure-')

  onMount(() => {
    const data: DisclosureData = {
      id,
      close: () => {
        openState = false
      },
    }
    elements.add(data)
    return () => elements.delete(data)
  })
</script>

<div>
  <button
    class={cn(
      'flex w-full items-center rounded-md border border-gray-200 p-4 shadow-sm',
      className,
    )}
    type="button"
    onclick={() => {
      if (!openState) {
        elements.forEach((element) => {
          element.close()
        })
      }
      openState = !openState
    }}
  >
    <div class="grow text-left font-bold">
      {@render title?.()}
    </div>
    <Icon
      src={ChevronDown}
      class={cn(
        'ml-3 size-6 shrink-0 transition-transform',
        openState && 'rotate-180',
      )}
    />
  </button>

  {#if openState}
    <div class="p-4" transition:slide={{ axis: 'y', easing: quintOut }}>
      {@render content?.()}
    </div>
  {/if}
</div>
