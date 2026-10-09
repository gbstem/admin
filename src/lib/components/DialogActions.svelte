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
    'flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-4',
    className,
  )}
>
  {@render children?.()}
</div>
