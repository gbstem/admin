<script lang="ts">
  import { cn } from '#lib/utils.js'

  interface Props {
    class?: string
    href?: string
    children?: import('svelte').Snippet
    [key: string]: any
  }

  let { class: className = '', href = '', children, ...rest }: Props = $props()
</script>

<a
  class={cn(
    'inline-block border-b border-black text-black transition-colors duration-300 hover:border-gray-600 hover:text-gray-600',
    className,
  )}
  {href}
  {...rest}
>
  {@render children?.()}
</a>
