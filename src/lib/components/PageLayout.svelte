<script lang="ts">
  import { cn } from '#lib/utils.js'
  interface Props {
    cols?: 2 | 3
    title?: import('svelte').Snippet
    children?: import('svelte').Snippet
  }

  let { cols = 3, title, children }: Props = $props()
</script>

<div
  class={cn(
    'grid',
    cols === 2 && 'md:grid-cols-2',
    cols === 3 && 'md:grid-cols-3',
  )}
>
  <h1 class="mb-8 text-5xl font-bold md:text-6xl">
    {@render title?.()}
  </h1>
  <div class={cn('flex flex-col items-center', cols === 3 && 'md:col-span-2')}>
    {@render children?.()}
  </div>
</div>
