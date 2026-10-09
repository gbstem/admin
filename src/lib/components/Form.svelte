<script lang="ts">
  import { cn } from '#lib/utils.js'

  interface Props {
    class: string
    onSubmit?: (data: SubmitData) => void
    children?: import('svelte').Snippet
    [key: string]: any
  }

  let { class: className, onSubmit, children, ...rest }: Props = $props()

  let formEl: HTMLFormElement | undefined = $state()

  function handleSubmit(e: SubmitEvent) {
    if (!formEl) return
    const state = [
      ...Array.from(formEl.querySelectorAll('input')),
      ...Array.from(formEl.querySelectorAll('textarea')),
    ].find((el) => !el.checkValidity())
    onSubmit?.({
      event: e,
      error: state === undefined ? null : state.validationMessage,
    })
  }
</script>

<form
  class={cn('w-full', className)}
  novalidate
  bind:this={formEl}
  onsubmit={(e) => {
    e.preventDefault()
    handleSubmit(e)
  }}
  {...rest}
>
  {@render children?.()}
</form>
