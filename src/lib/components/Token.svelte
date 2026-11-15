<script lang="ts">
  import Dialog from './Dialog.svelte'
  import CreateTokenForm from './forms/CreateTokenForm.svelte'

  interface Props {
    onExit?: () => void
  }

  let { onExit }: Props = $props()

  function handleExit() {
    onExit?.()
  }
</script>

<Dialog open={true} alert onCancel={handleExit}>
  {#snippet title()}
    New signup token
  {/snippet}
  {#snippet description()}
    <div>
      <CreateTokenForm onExit={handleExit} />
    </div>
  {/snippet}
</Dialog>
