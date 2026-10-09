<script lang="ts">
  import { cn } from '#lib/utils.js'

  interface Props {
    class?: string
    children?: import('svelte').Snippet
  }

  let { class: className = '', children }: Props = $props()
</script>

<div class={cn('rounded-md bg-gray-100 px-3 py-2 shadow-xs', className)}>
  {@render children?.()}
</div>
