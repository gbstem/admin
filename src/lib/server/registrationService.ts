import { semesterCollectionPath } from '$lib/data/collections'
import { resolveRegistrationParentEmails } from '$lib/server/accountEmails'
import { adminDb, toDateSafe } from '$lib/server/firebase'
import { searchIndex } from '$lib/server/search'
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'

/** A registration as the admin registrations page shows it. */
export interface AdminRegistrationRow {
  id: string
  /**
   * The parent account's current address, resolved from the registration id;
   * empty if that account is gone. The address stored on the registration is
   * left out of `values` - it is only an audit record of what was submitted.
   */
  email: string
  values: Omit<Data.Registration<'pojo'>, 'personal'> & {
    personal: Omit<Data.Registration<'pojo'>['personal'], 'email'>
  }
}

export interface FetchRegistrationsOptions {
  semesterId: string
  /** `'submitted' | 'enrolled' | 'not enrolled' | 'inPerson' | 'incomplete'`; defaults to `'submitted'`. */
  filter?: string | null
  limit: number
  offset: number
}

type RegistrationSearchHit = Omit<
  Data.Registration<'server'>,
  'meta' | 'timestamps'
> & {
  meta: {
    uid: string
    submitted: boolean
  }
  timestamps: {
    updated: Date
    created: Date
  }
}

/**
 * `personal` without the address stored on the document, which is only an
 * audit record of what was submitted.
 */
function withoutSubmittedAddress<T extends { email: string }>(
  personal: T | undefined,
): Omit<T, 'email'> {
  const { email: _submittedAddress, ...rest } = personal ?? ({} as T)
  return rest
}

export function toRegistrationRow(
  id: string,
  data: Data.Registration<'pojo'>,
  emails: Map<string, string>,
): AdminRegistrationRow {
  return {
    id,
    email: emails.get(id) ?? '',
    values: {
      personal: withoutSubmittedAddress(data.personal),
      academic: data.academic,
      program: data.program,
      inPerson: data.inPerson,
      agreements: data.agreements,
      meta: data.meta,
      timestamps: data.timestamps,
    },
  }
}

/**
 * Service providing the server-side Data Access Layer for the admin
 * Registrations page.
 */
export const registrationService = {
  /** One page of a semester's registrations, optionally narrowed by `filter`. */
  async fetchRegistrations({
    semesterId,
    filter,
    limit,
    offset,
  }: FetchRegistrationsOptions): Promise<AdminRegistrationRow[]> {
    const collectionName = semesterCollectionPath(semesterId, 'registrations')
    const resolvedFilter = filter ?? 'submitted'

    let dbQuery: Query = adminDb.collection(collectionName)
    if (resolvedFilter === 'submitted') {
      dbQuery = dbQuery.where('meta.submitted', '==', true)
    } else if (resolvedFilter === 'enrolled') {
      dbQuery = dbQuery.where('enrolled', '==', true)
    } else if (resolvedFilter === 'not enrolled') {
      dbQuery = dbQuery
        .where('enrolled', '==', false)
        .where('meta.submitted', '==', true)
    } else if (resolvedFilter === 'inPerson') {
      dbQuery = dbQuery
        .where('program.inPerson', '==', true)
        .where('meta.submitted', '==', true)
    } else if (resolvedFilter === 'incomplete') {
      dbQuery = dbQuery.where('meta.submitted', '==', false)
    }
    dbQuery = dbQuery
      .orderBy('timestamps.updated', 'desc')
      .limit(limit)
      .offset(offset)

    const snapshot = await dbQuery.get()
    const emails = await resolveRegistrationParentEmails(
      snapshot.docs.map((doc: QueryDocumentSnapshot) => doc.id),
    )

    return snapshot.docs.map((doc: QueryDocumentSnapshot) => {
      const data = doc.data() as Data.Registration<'server'>
      return toRegistrationRow(
        doc.id,
        {
          ...data,
          timestamps: {
            updated: toDateSafe(
              data.timestamps.updated,
              doc.id,
              'timestamps.updated',
            ),
            created: toDateSafe(
              data.timestamps.created,
              doc.id,
              'timestamps.created',
            ),
          },
        },
        emails,
      )
    })
  },

  /** Full-text search over a semester's registrations. */
  async searchRegistrations(
    semesterId: string,
    query: string,
  ): Promise<AdminRegistrationRow[]> {
    const collectionName = semesterCollectionPath(semesterId, 'registrations')
    const hits = await searchIndex<RegistrationSearchHit>(collectionName, query)
    const emails = await resolveRegistrationParentEmails(
      hits.map((hit) => hit.objectID),
    )
    return hits.map((hit) =>
      toRegistrationRow(
        hit.objectID,
        {
          personal: hit.personal,
          academic: hit.academic,
          program: hit.program,
          inPerson: hit.inPerson,
          agreements: hit.agreements,
          meta: hit.meta,
          timestamps: hit.timestamps,
        },
        emails,
      ),
    )
  },
}
