import { semesterCollectionPath } from '$lib/data/collections'
import { adminDb, toDateSafe } from '$lib/server/firebase'
import { searchIndex } from '$lib/server/search'
import type {
  DocumentSnapshot,
  Query,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'

/** The decision doc attached to an application once `meta.decided` is true. */
export interface AdminDecision {
  type: Data.Decision
  likelyDecision: string
  notes: string
}

/** An application as the admin applications page shows it. */
export interface AdminApplicationRow {
  id: string
  values: {
    personal: Data.Application<'pojo'>['personal']
    academic: Data.Application<'pojo'>['academic']
    program: Data.Application<'pojo'>['program']
    essay: Data.Application<'pojo'>['essay']
    agreements: Data.Application<'pojo'>['agreements']
    meta: Data.Application<'pojo'>['meta'] & { decision: AdminDecision | null }
    timestamps: Data.Application<'pojo'>['timestamps']
  }
}

export interface FetchApplicationsOptions {
  semesterId: string
  /** `'undecided' | 'inPerson' | 'incomplete' | 'complete'`; anything else (including null) shows submitted applications. */
  filter?: string | null
  limit: number
  offset: number
}

type ApplicationSearchHit = Omit<
  Data.Application<'server'>,
  'meta' | 'timestamps'
> & {
  meta: {
    id: string
    uid: string
    interview: boolean
    submitted: boolean
    decided: boolean
  }
  timestamps: {
    updated: Date
    created: Date
  }
}

function toApplicationRow(
  id: string,
  data: Omit<AdminApplicationRow['values'], 'meta'> & {
    meta: Data.Application<'pojo'>['meta']
  },
  decision: AdminDecision | null,
): AdminApplicationRow {
  return {
    id,
    values: {
      personal: data.personal,
      academic: data.academic,
      program: data.program,
      essay: data.essay,
      agreements: data.agreements,
      meta: { ...data.meta, decision },
      timestamps: data.timestamps,
    },
  }
}

/**
 * Decision docs are always keyed by the application's own id, so the path is
 * derived rather than trusted from a stored reference field on the
 * application - see collections.ts's `withSemester` writeup for why that
 * stored-reference shape was unsafe.
 */
async function fetchDecisions(
  decisionsCollectionName: string,
  entries: Array<{ id: string; decided: boolean }>,
): Promise<Array<AdminDecision | null>> {
  const snapshots = await Promise.all(
    entries.map((entry) =>
      entry.decided
        ? adminDb.collection(decisionsCollectionName).doc(entry.id).get()
        : null,
    ),
  )
  return snapshots.map((snap: DocumentSnapshot | null) =>
    snap ? (snap.data() as AdminDecision) : null,
  )
}

/**
 * Service providing the server-side Data Access Layer for the admin
 * Applications page.
 */
export const applicationService = {
  /** One page of a semester's applications, optionally narrowed by `filter`. */
  async fetchApplications({
    semesterId,
    filter,
    limit,
    offset,
  }: FetchApplicationsOptions): Promise<AdminApplicationRow[]> {
    const collectionName = semesterCollectionPath(semesterId, 'applications')
    const decisionsCollectionName = semesterCollectionPath(
      semesterId,
      'decisions',
    )

    let dbQuery: Query = adminDb.collection(collectionName)
    if (filter === 'undecided') {
      dbQuery = dbQuery
        .where('meta.submitted', '==', true)
        .where('meta.decided', '==', false)
    } else if (filter === 'inPerson') {
      dbQuery = dbQuery.where('program.inPerson', '==', true)
    } else if (filter === 'incomplete') {
      dbQuery = dbQuery.where('meta.submitted', '==', false)
    } else {
      // 'complete', no filter, and any unrecognized filter all show submitted applications.
      dbQuery = dbQuery.where('meta.submitted', '==', true)
    }
    dbQuery = dbQuery
      .orderBy('timestamps.updated', 'desc')
      .limit(limit)
      .offset(offset)

    const snapshot = await dbQuery.get()
    const docsData = snapshot.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as Data.Application<'server'>,
    )
    const decisions = await fetchDecisions(
      decisionsCollectionName,
      docsData.map((data, i) => ({
        id: snapshot.docs[i].id,
        decided: data.meta.decided,
      })),
    )

    return snapshot.docs.map((doc: QueryDocumentSnapshot, i: number) => {
      const data = docsData[i]
      return toApplicationRow(
        doc.id,
        {
          personal: data.personal,
          academic: data.academic,
          program: data.program,
          essay: data.essay,
          agreements: data.agreements,
          meta: data.meta,
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
        decisions[i],
      )
    })
  },

  /** Full-text search over a semester's applications. */
  async searchApplications(
    semesterId: string,
    query: string,
  ): Promise<AdminApplicationRow[]> {
    const collectionName = semesterCollectionPath(semesterId, 'applications')
    const decisionsCollectionName = semesterCollectionPath(
      semesterId,
      'decisions',
    )

    const hits = await searchIndex<ApplicationSearchHit>(collectionName, query)
    const decisions = await fetchDecisions(
      decisionsCollectionName,
      hits.map((hit) => ({ id: hit.objectID, decided: hit.meta.decided })),
    )

    return hits.map((hit, i) =>
      toApplicationRow(
        hit.objectID,
        {
          personal: hit.personal,
          academic: hit.academic,
          program: hit.program,
          essay: hit.essay,
          agreements: hit.agreements,
          meta: hit.meta,
          timestamps: hit.timestamps,
        },
        decisions[i],
      ),
    )
  },
}
