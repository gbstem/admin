<script lang="ts">
  import { cn } from '#lib/utils.js'
  import { uniqueId, kebabCase } from 'lodash-es'
  import { onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'

  interface Props {
    class?: string
    self?: any
    id?: any
    value: string
    label?: string
    name?: any
    required?: boolean
    rows?: number
    [key: string]: any
  }

  let {
    class: className = '',
    self = $bindable(undefined),
    id = uniqueId('textarea-'),
    value = $bindable(),
    label = '',
    name = kebabCase(label),
    required = false,
    rows = 5,
    ...rest
  }: Props = $props()
  let calcHeight = $derived(1.5 + 1.5 * rows)

  let timer: number | undefined
  let visible = $state(false)
  onDestroy(() => {
    clearTimeout(timer)
  })
  function handleInput(
    e: Event & { currentTarget: EventTarget & HTMLTextAreaElement },
  ) {
    clearTimeout(timer)
    if (!visible) {
      visible = true
    }
    value = (e.target as HTMLTextAreaElement).value
  }
  function handleKeyUp() {
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      visible = false
    }, 750)
  }
</script>

<div class="relative mt-2">
  <label for={id} class="text-sm font-bold">
    <span>
      {label}<span class={cn('text-red-500', !required && 'hidden')}>*</span>
    </span>
  </label>
  <textarea
    class={cn(
      'mt-2 block h-min w-full appearance-none rounded-md border border-gray-400 p-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400 disabled:placeholder:text-gray-400',
      className,
    )}
    style={`min-height:${calcHeight}rem;height:${calcHeight}rem`}
    bind:this={self}
    oninput={handleInput}
    onkeyup={handleKeyUp}
    {id}
    {value}
    {name}
    {required}
    {...rest}></textarea>
  {#if rest?.maxlength && visible}
    <div
      class="absolute right-3 bottom-3 rounded-sm border border-gray-100 bg-gray-100 px-1 text-gray-500 shadow-xs"
      transition:fade
    >
      {value?.length || 0}/{rest.maxlength}
    </div>
  {/if}
</div>
