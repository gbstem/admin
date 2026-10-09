import { jest } from '@jest/globals'

// Mock environment variables
jest.mock('$app/env/private', () => ({
  USE_LOCAL_SEARCH: 'false',
  VITE_USE_LOCAL_SEARCH: 'false',
  ALGOLIA_APP_ID: 'real-app-id',
  ALGOLIA_PRIVATE_KEY: 'real-private-key',
}))

// Mock firebase adminDb
type FirestoreDoc = { id: string; data: () => { name: string; email: string } }
const mockGet = jest
  .fn<() => Promise<{ docs: FirestoreDoc[] }>>()
  .mockResolvedValue({
    docs: [
      {
        id: 'doc1',
        data: () => ({
          name: 'Alice Smith',
          email: 'alice@example.com',
        }),
      },
      {
        id: 'doc2',
        data: () => ({
          name: 'Bob Jones',
          email: 'bob@example.com',
        }),
      },
    ],
  })

const mockCollection = {
  get: mockGet,
}

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    collection: jest.fn().mockReturnValue(mockCollection),
  },
}))

// Mock algoliasearch
type AlgoliaHit = { objectID: string; name: string }
const mockSearchSingleIndex = jest.fn<() => Promise<{ hits: AlgoliaHit[] }>>()
jest.mock('algoliasearch', () => {
  return {
    algoliasearch: jest.fn().mockReturnValue({
      searchSingleIndex: mockSearchSingleIndex,
    }),
  }
})

describe('search module', () => {
  let searchIndex: any
  let originalEnv: string

  beforeAll(() => {
    originalEnv = process.env.NODE_ENV || 'test'
    // Force NODE_ENV to not be 'test' so isTest evaluates to false in the imported module
    process.env.NODE_ENV = 'production'
    jest.resetModules()
    // Require the search module dynamically after resetting modules and setting env
    const searchModule = require('../src/lib/server/search')
    searchIndex = searchModule.searchIndex
  })

  afterAll(() => {
    process.env.NODE_ENV = originalEnv
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('tries to use Algolia when configured', async () => {
    mockSearchSingleIndex.mockResolvedValueOnce({
      hits: [{ objectID: 'algolia-1', name: 'Algolia Alice' }],
    })

    const results = await searchIndex('test-collection', 'Alice')
    expect(mockSearchSingleIndex).toHaveBeenCalledWith({
      indexName: 'test-collection',
      searchParams: { query: 'Alice' },
    })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Algolia Alice')
  })

  it('falls back to local search if Algolia fails', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {})
    mockSearchSingleIndex.mockRejectedValueOnce(new Error('Algolia is down'))

    const results = await searchIndex('test-collection', 'Alice')
    expect(mockSearchSingleIndex).toHaveBeenCalled()
    expect(consoleWarnSpy).toHaveBeenCalled()

    // It fell back to local Firestore search and filtered
    expect(mockGet).toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0].objectID).toBe('doc1')
    expect(results[0].name).toBe('Alice Smith')

    consoleWarnSpy.mockRestore()
  })

  it('uses the last path segment as the Algolia index name for a semester-scoped path', async () => {
    mockSearchSingleIndex.mockResolvedValueOnce({ hits: [] })

    await searchIndex('semesters/Spring26/registrations', 'Alice')

    expect(mockSearchSingleIndex).toHaveBeenCalledWith({
      indexName: 'registrations',
      searchParams: {
        query: 'Alice',
        filters: 'semester:Spring26',
      },
    })
  })

  it('normalizes full-path Algolia objectIDs back to the bare doc ID', async () => {
    mockSearchSingleIndex.mockResolvedValueOnce({
      hits: [
        {
          objectID: 'semesters/Spring26/registrations/uid123',
          name: 'Algolia Alice',
        },
      ],
    })

    const results = await searchIndex(
      'semesters/Spring26/registrations',
      'Alice',
    )

    expect(results).toHaveLength(1)
    expect(results[0].objectID).toBe('uid123')
  })

  it('caches local fallback results per collection path so different semesters do not collide', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {})
    mockSearchSingleIndex.mockRejectedValue(new Error('Algolia is down'))

    await searchIndex('semesters/Fall25/registrations', 'Alice')
    const callsAfterFirst = mockGet.mock.calls.length

    // Same query, different semester path: must not reuse Fall25's cache entry.
    await searchIndex('semesters/Spring25/registrations', 'Alice')
    expect(mockGet.mock.calls.length).toBe(callsAfterFirst + 1)

    consoleWarnSpy.mockRestore()
  })
})
