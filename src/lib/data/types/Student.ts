interface Student {
  /** The registration id: `${parentUid}-${n}`, or `${parentUid}`. */
  id: string
  name: string
  /**
   * The parent account's current address, resolved from `id` by the DAL that
   * built this - never the address stored on the registration.
   */
  email: string
  /** A second guardian's address as typed on the form; see Data.Registration. */
  secondaryEmail: string
  phone: string
  grade: number
  school: string
  parentName?: string
}

export type { Student as default }
