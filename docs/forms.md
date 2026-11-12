# Forms

Forms that write Firestore post to a form action; see [firestore.md](firestore.md#how-a-write-is-shaped).

The forms that don't write Firestore (sign-in, password, email, the name change) are SPA Superforms that call Firebase Auth or a service from `onUpdate`; `(signedOut)/signup` uses a real SvelteKit form `action`. The SPA pattern (see `ChangeNameForm.svelte`):

```js
superForm(defaults(initialValues, zod(schema)), {
  SPA: true,
  validators: zod(schema),
  resetForm: false,
  applyAction: false,
  async onUpdate({ form }) {
    /* call the service, then alert.trigger(...) on failure */
  },
})
```

## Schemas and field constraints

Schemas live in `src/lib/components/forms/schemas.ts` (also reused by `scripts/seed.ts`). Field wrapper components (`FormInput`, `FormNativeSelect`, `FormCheckbox`) take `form`, `name`, `label`, `bind:value`. They read the schema's constraints (`required`, `maxlength`, `pattern`, ...) from the superForm's constraints **store** via `#lib/components/fieldConstraints` (identical to portal's); reading `form.constraints` as a plain object is the bug that once kept every constraint off every input.

Every Superforms `<form>` is `novalidate`, so zod reports every error inline rather than some as browser popups — which means a rule only an input's `required` attribute enforces is not enforced at all. Put it in the schema (see `agreementSchema`, the `essay` refinement, `editClassFormSchema`).
