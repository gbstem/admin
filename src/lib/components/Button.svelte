<script lang="ts">
  import { cn } from '#lib/utils.js'

  type ButtonColor = 'red' | 'blue' | 'gray' | 'green' | 'yellow' | 'purple'
  type ButtonType = 'button' | 'submit' | 'reset'

  interface Props {
    class?: string
    color?: ButtonColor
    type?: ButtonType
    href?: string | undefined
    children?: import('svelte').Snippet
    [key: string]: any
  }

  let {
    class: className = '',
    color = 'gray',
    type = 'button',
    href = undefined,
    children,
    ...rest
  }: Props = $props()
</script>

<svelte:element
  this={href ? 'a' : 'button'}
  class={cn(
    'inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold shadow-xs transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
    'hover:shadow-md active:shadow-sm',
    'disabled:cursor-not-allowed',
    color === 'red' &&
      'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400 disabled:bg-red-300 disabled:text-white',
    color === 'blue' &&
      'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-400 disabled:bg-blue-300 disabled:text-white',
    color === 'gray' &&
      'bg-gray-900 text-white hover:bg-gray-700 focus-visible:ring-gray-400 disabled:bg-gray-300 disabled:text-white',
    color === 'green' &&
      'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-400 disabled:bg-green-300 disabled:text-white',
    color === 'yellow' &&
      'bg-yellow-500 text-white hover:bg-yellow-600 focus-visible:ring-yellow-300 disabled:bg-yellow-200 disabled:text-white',
    color === 'purple' &&
      'bg-purple-900 text-white hover:bg-purple-700 focus-visible:ring-purple-400 disabled:bg-purple-200 disabled:text-white',
    className,
  )}
  {href}
  type={href ? undefined : type}
  role={href ? 'button' : undefined}
  {...rest}
>
  {@render children?.()}
</svelte:element>
