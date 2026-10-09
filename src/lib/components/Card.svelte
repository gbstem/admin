<script lang="ts">
  import { cn } from '#lib/utils.js'

  interface Props {
    class?: string
    children?: import('svelte').Snippet
  }

  let { class: className = '', children }: Props = $props()
</script>

<div
  class={cn(
    'w-full rounded-md border border-gray-200 bg-white p-4 shadow-sm md:p-6',
    className,
  )}
>
  {@render children?.()}
</div>
