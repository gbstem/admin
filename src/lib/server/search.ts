import {
  USE_LOCAL_SEARCH,
  VITE_USE_LOCAL_SEARCH,
  ALGOLIA_APP_ID,
  ALGOLIA_PRIVATE_KEY,
} from '$app/env/private'
import { semesterIdFromPath } from '#lib/data/collections.js'
import { adminDb } from '#lib/server/firebase.js'
import { algoliasearch } from 'algoliasearch'

// Use only a local search instead of Algolia if:
// 1. Credentials are not set or are default placeholder values
// 2. Running in test environment (Jest/Playwright/Cypress/etc)
// 3. Explicitly requested via USE_LOCAL_SEARCH or VITE_USE_LOCAL_SEARCH env var
const isTest =
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NODE_ENV === 'test'
const isLocalForced =
  USE_LOCAL_SEARCH === 'true' ||
  VITE_USE_LOCAL_SEARCH === 'true' ||
  (typeof process !== 'undefined' &&
    process.env &&
    process.env.VITE_USE_LOCAL_SEARCH === 'true')

const isPlainObject = (obj: any): boolean => {
  if (obj === null || typeof obj !== 'object') return false
  const proto = Object.getPrototypeOf(obj)
  return proto === null || proto === Object.prototype
}

const useLocalSearch =
  !ALGOLIA_APP_ID ||
  !ALGOLIA_PRIVATE_KEY ||
  ALGOLIA_APP_ID === 'XY123AB456' ||
  ALGOLIA_APP_ID === 'algoliaApp' ||
  isTest ||
  isLocalForced

// In-memory cache for local fallback search results to minimize Firestore reads on the free tier
const localCache = new Map<string, { timestamp: number; data: any[] }>()
const CACHE_TTL_MS = 15000 // Cache for 15 seconds

export async function searchIndex<T>(
  collectionPath: string,
  query: string,
): Promise<Array<T & { objectID: string }>> {
  // The Algolia index is keyed by collection ID, not full path, and is now
  // shared across every semester (semesters/{semesterId}/{name}), so the
  // filter below scopes results back down to the requested semester.
  const indexName = collectionPath.split('/').pop() as string
  const semesterId = semesterIdFromPath(collectionPath)

  let shouldRunLocal = useLocalSearch

  if (!shouldRunLocal) {
    // Try using Algolia, falling back to local search if that fails.
    try {
      const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_PRIVATE_KEY)
      const { hits } = await client.searchSingleIndex<T>({
        indexName,
        searchParams: {
          query,
          ...(semesterId ? { filters: `semester:${semesterId}` } : {}),
        },
      })
      // objectID is the full document path (semesters/{id}/{name}/{docId}),
      // set that way so records from every semester coexist in one index
      // without colliding. Normalize it back to the bare doc ID so callers
      // (which do `id: hit.objectID`) don't need to know that.
      return hits.map((hit: any) => ({
        ...hit,
        objectID: hit.objectID.split('/').pop(),
      })) as Array<T & { objectID: string }>
    } catch (err) {
      console.warn(
        `[Search] Algolia search failed for query "${query}" on index "${indexName}". Falling back to local search. Error:`,
        err,
      )
      shouldRunLocal = true
    }
  }

  if (shouldRunLocal) {
    console.log(
      `[Search] Using local fallback search for query "${query}" on collection "${collectionPath}"`,
    )
    let allDocs: any[] = []

    // Keyed by the full collection path (not indexName) so each semester's
    // subcollection gets its own cache entry instead of colliding.
    const cached = isTest ? null : localCache.get(collectionPath)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      allDocs = cached.data
    } else {
      const snapshot = await adminDb.collection(collectionPath).get()

      // Helper to sanitize Firestore Timestamps into standard Date objects
      const sanitize = (val: any): any => {
        if (val && typeof val === 'object') {
          if (typeof val.toDate === 'function') {
            return val.toDate()
          }
          if (Array.isArray(val)) {
            return val.map(sanitize)
          }
          if (!isPlainObject(val)) {
            return val
          }
          const res: any = {}
          for (const key of Object.keys(val)) {
            res[key] = sanitize(val[key])
          }
          return res
        }
        return val
      }

      allDocs = snapshot.docs.map((doc) => {
        const data = sanitize(doc.data())
        return {
          objectID: doc.id,
          ...data,
        }
      })

      if (!isTest) {
        localCache.set(collectionPath, {
          timestamp: Date.now(),
          data: allDocs,
        })
      }
    }

    const lowerQuery = query.toLowerCase()

    const matchesQuery = (val: any): boolean => {
      if (typeof val === 'string') {
        return val.toLowerCase().includes(lowerQuery)
      }
      if (typeof val === 'number' || typeof val === 'boolean') {
        return String(val).toLowerCase().includes(lowerQuery)
      }
      if (typeof val === 'object' && val !== null) {
        if (val instanceof Date) {
          return val.toISOString().toLowerCase().includes(lowerQuery)
        }
        if (!isPlainObject(val)) {
          return false
        }
        return Object.values(val).some(matchesQuery)
      }
      return false
    }

    return allDocs.filter((doc) => matchesQuery(doc)) as Array<
      T & { objectID: string }
    >
  }

  return []
}
