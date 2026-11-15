<script lang="ts">
  import Table from '#lib/components/Table.svelte'
  import { format } from 'date-fns'
  import type { PageData } from './$types'
  import Button from '#lib/components/Button.svelte'
  import { tokenService } from '#lib/services/tokenService.js'
  import { alert } from '#lib/stores.js'
  import { actionsState } from '#lib/stores.svelte.js'
  import Token from '#lib/components/Token.svelte'
  import PerPageControl from '#lib/components/PerPageControl.svelte'
  import StatusFilter from '#lib/components/StatusFilter.svelte'
  import { invalidate } from '$app/navigation'
  import { page } from '$app/state'
  import { writeToClipboard } from '#lib/utils.js'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { Plus } from '@steeze-ui/heroicons'

  interface Props {
    data: PageData
  }

  type TokenRow = PageData['tokens'][number]

  let { data }: Props = $props()

  let create = $state(false)
  // Token ids, never row positions: a new token lands on top and shifts every
  // row down, and a checked position would then name a different token.
  let checked: Array<string> = $state([])

  let currentPage = $derived(data.page ?? 1)
  let currentLimit = $derived(data.limit ?? 25)

  let prevHref = $derived(
    (() => {
      if (currentPage <= 1) return ''
      const base = new URLSearchParams(page.url.search)
      base.set('page', String(currentPage - 1))
      return `?${base.toString()}`
    })(),
  )

  let nextHref = $derived(
    (() => {
      if (data.tokens.length < currentLimit) return ''
      const base = new URLSearchParams(page.url.search)
      base.set('page', String(currentPage + 1))
      return `?${base.toString()}`
    })(),
  )

  // A checked id that left the page (filtered out, revoked from another tab)
  // is dropped rather than acted on unseen.
  let checkedTokens = $derived(
    data.tokens.filter((token) => checked.includes(token.id)),
  )

  type TokenStatus = 'active' | 'used' | 'expired' | 'revoked'

  function statusOf(token: TokenRow): TokenStatus {
    if (token.values.revokedAt) return 'revoked'
    if (token.values.expires <= new Date()) return 'expired'
    if (token.values.consumable && token.values.consumers.length > 0) {
      return 'used'
    }
    return 'active'
  }

  const statusClass: Record<TokenStatus, string> = {
    active: 'bg-green-100 text-green-800',
    used: 'bg-gray-100 text-gray-700',
    expired: 'bg-gray-100 text-gray-500',
    revoked: 'bg-red-100 text-red-800',
  }

  function plural(n: number) {
    return `${n} ${n === 1 ? 'token' : 'tokens'}`
  }

  async function run(
    action: (ids: string[]) => Promise<void>,
    ids: string[],
    done: string,
  ) {
    try {
      await action(ids)
      checked = []
      await invalidate('app:tokens')
      alert.trigger('success', done)
    } catch (err: any) {
      alert.trigger('error', err.message, true)
    }
  }

  $effect(() => {
    const ids = checkedTokens.map((token) => token.id)
    if (ids.length === 0) {
      actionsState.current = null
      return
    }
    const revocable = checkedTokens.filter(
      (token) => statusOf(token) === 'active' || statusOf(token) === 'used',
    )
    const deletable = checkedTokens.every(
      (token) => token.values.consumers.length === 0,
    )
    actionsState.current = [
      ...(revocable.length > 0
        ? [
            {
              name: `Revoke ${plural(revocable.length)}`,
              color: 'red' as const,
              callback: () =>
                run(
                  tokenService.revokeTokens,
                  revocable.map((token) => token.id),
                  'Tokens revoked.',
                ),
            },
          ]
        : []),
      // A used token's consumers are the only record of who it signed up.
      ...(deletable
        ? [
            {
              name: `Delete ${plural(ids.length)}`,
              color: 'red' as const,
              callback: () =>
                run(tokenService.deleteTokens, ids, 'Tokens deleted.'),
            },
          ]
        : []),
    ]
  })

  function handleCheck(
    e: Event & { currentTarget: EventTarget & HTMLInputElement },
    id: string,
  ) {
    checked = e.currentTarget.checked
      ? [...checked, id]
      : checked.filter((item) => item !== id)
  }
  function handleCheckAll(
    e: Event & { currentTarget: EventTarget & HTMLInputElement },
  ) {
    checked = e.currentTarget.checked
      ? data.tokens.map((token) => token.id)
      : []
  }
  async function handleCopyAction(token: TokenRow) {
    try {
      await writeToClipboard(`${page.url.origin}/signup?token=${token.id}`)
      alert.trigger('success', 'Token copied.')
    } catch {
      alert.trigger('error', 'Failed to copy token.')
    }
  }
</script>

<svelte:head>
  <title>Tokens</title>
</svelte:head>

<div class="mb-4 flex flex-wrap items-end gap-4">
  <StatusFilter type="tokens" />
  <PerPageControl />
</div>

<Table>
  {#snippet head()}
    <th scope="col" class="p-4">
      <div class="flex items-center">
        <input
          id="check-all"
          class="peer size-5 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:ring-offset-1 focus:outline-hidden disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400"
          type="checkbox"
          checked={checkedTokens.length === data.tokens.length &&
            checkedTokens.length > 0}
          oninput={handleCheckAll}
        />
        <label for="check-all" class="sr-only">Select all tokens</label>
      </div>
    </th>
    <th scope="col" class="px-6 py-3">Created</th>
    <th scope="col" class="px-6 py-3">Purpose</th>
    <th scope="col" class="px-6 py-3">Role</th>
    <th scope="col" class="px-6 py-3">Status</th>
    <th scope="col" class="px-6 py-3">Expires</th>
    <th scope="col" class="px-6 py-3">Signed up</th>
    <th scope="col" class="flex justify-end px-6 py-3">
      <Button
        class="flex size-10 items-center justify-center p-0"
        color="blue"
        aria-label="Create token"
        onclick={() => (create = true)}
      >
        <Icon src={Plus} class="size-5" />
      </Button>
    </th>
  {/snippet}
  {#snippet body()}
    {#each data.tokens as token (token.id)}
      {@const status = statusOf(token)}
      <tr class="border-b bg-white" data-token-id={token.id}>
        <td class="w-4 p-4">
          <div class="flex items-center">
            <input
              id={`check-${token.id}`}
              class="peer size-5 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:ring-offset-1 focus:outline-hidden disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400"
              type="checkbox"
              checked={checked.includes(token.id)}
              oninput={(e) => handleCheck(e, token.id)}
            />
            <label for={`check-${token.id}`} class="sr-only">
              Select token
            </label>
          </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <div>{format(token.values.createdAt, 'yyyy.MM.dd p')}</div>
          <div class="text-xs text-gray-500">
            {token.createdByEmail ??
              (token.values.createdBy ? 'deleted account' : 'unknown')}
          </div>
        </td>
        <th
          scope="row"
          class="max-w-xs truncate px-6 py-4 font-medium text-gray-900"
          title={token.values.purpose}
        >
          {token.values.purpose || '—'}
        </th>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="capitalize">{token.values.role}</span>
          {#if token.values.consumable}
            <span
              class="ml-1 rounded-sm bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800"
              >one-time</span
            >
          {/if}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span
            class={`rounded-sm px-2 py-0.5 text-xs font-semibold capitalize ${statusClass[status]}`}
            data-testid="token-status">{status}</span
          >
          {#if status === 'revoked'}
            <div class="mt-1 text-xs text-gray-500">
              by {token.revokedByEmail ?? 'deleted account'}
            </div>
          {/if}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          {format(token.values.expires, 'yyyy.MM.dd p')}
        </td>
        <td class="px-6 py-4 text-xs">
          {#if token.values.consumers.length === 0}
            <span class="text-gray-500">No one</span>
          {:else}
            <ul>
              {#each token.consumerEmails as email, j (token.values.consumers[j])}
                <li>{email ?? 'deleted account'}</li>
              {/each}
            </ul>
          {/if}
        </td>
        <td class="space-x-2 px-6 py-4 text-right whitespace-nowrap">
          {#if status === 'active'}
            <button
              class="text-gray-700 transition-colors duration-300 hover:text-gray-500"
              type="button"
              onclick={() => handleCopyAction(token)}
            >
              Copy
            </button>
          {/if}
          {#if status === 'active' || status === 'used'}
            <button
              class="text-red-700 transition-colors duration-300 hover:text-red-500"
              type="button"
              onclick={() =>
                run(tokenService.revokeTokens, [token.id], 'Token revoked.')}
            >
              Revoke
            </button>
          {/if}
          {#if token.values.consumers.length === 0}
            <button
              class="text-red-700 transition-colors duration-300 hover:text-red-500"
              type="button"
              onclick={() =>
                run(tokenService.deleteTokens, [token.id], 'Token deleted.')}
            >
              Delete
            </button>
          {/if}
        </td>
      </tr>
    {:else}
      <tr class="bg-white">
        <td colspan="8" class="px-6 py-8 text-center text-gray-500">
          {data.status === 'active'
            ? 'No active tokens. Choose "all" to see expired and revoked ones.'
            : 'No tokens yet.'}
        </td>
      </tr>
    {/each}
  {/snippet}
</Table>

<div class="mt-4 flex justify-end gap-2">
  {#if currentPage > 1}
    <Button href={prevHref}>Previous</Button>
  {/if}
  {#if data.tokens.length >= currentLimit}
    <Button href={nextHref}>Next</Button>
  {/if}
</div>

{#if create}
  <Token
    onExit={() => {
      create = false
    }}
  />
{/if}

<style>
  input:checked {
    background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: center;
  }
</style>
