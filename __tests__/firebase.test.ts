import { jest } from '@jest/globals'

jest.mock('#lib/utils.js', () => ({
  cleanEnvVar: (val: any) => (typeof val === 'string' ? val.trim() : val),
}))

const mockDocGet = jest.fn<(...args: any[]) => any>()
const mockDocSet = jest.fn<(...args: any[]) => any>()
const mockDocUpdate = jest.fn<(...args: any[]) => any>()
const mockDocDelete = jest.fn<(...args: any[]) => any>()
const mockDocCreate = jest.fn<(...args: any[]) => any>()
const mockCollectionAdd = jest.fn<(...args: any[]) => any>()

// Define Firestore classes with prototype methods so the wrapper can hook into them
class DocumentReference {
  get(...args: any[]) {
    return mockDocGet(...args)
  }
  set(...args: any[]) {
    return mockDocSet(...args)
  }
  update(...args: any[]) {
    return mockDocUpdate(...args)
  }
  delete(...args: any[]) {
    return mockDocDelete(...args)
  }
  create(...args: any[]) {
    return mockDocCreate(...args)
  }
}

class Query {
  get(...args: any[]) {
    return mockDocGet(...args)
  }
}

class CollectionReference {
  add(...args: any[]) {
    return mockCollectionAdd(...args)
  }
}

const mockDocRefInstance = new DocumentReference()
const mockCollectionInstance = {
  doc: jest.fn(() => mockDocRefInstance),
  add: (...args: any[]) => mockCollectionAdd(...args),
}
const mockDbInstance = {
  collection: jest.fn(() => mockCollectionInstance),
}

jest.mock('firebase-admin/firestore', () => {
  return {
    DocumentReference,
    Query,
    CollectionReference,
    getFirestore: jest.fn(() => mockDbInstance),
    FieldValue: {
      arrayUnion: jest.fn((...val: any[]) => val),
    },
  }
})

// Mock firebase-admin
const mockInitializeApp = jest.fn()
const mockCert = jest.fn()
jest.mock('firebase-admin', () => ({
  initializeApp: (...args: any[]) => mockInitializeApp(...args),
  credential: {
    cert: (...args: any[]) => mockCert(...args),
  },
}))

// Import the module under test for static tests
import { toDateSafe, verifyToken } from '../src/lib/server/firebase'

describe('firebase.ts server setup', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('wrapPrototypePromise Firestore Wrappers', () => {
    it('resolves successfully when operation resolves quickly', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ foo: 'bar' }),
      })
      const res = await mockDocRefInstance.get()
      expect(res.exists).toBe(true)
    })

    it('returns immediately if the method does not return a Promise', async () => {
      mockDocGet.mockReturnValueOnce('non-promise-val')
      const res = await mockDocRefInstance.get()
      expect(res).toBe('non-promise-val')
    })

    it('rejects with timeout error when operation takes too long', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      jest.useFakeTimers()
      mockDocGet.mockImplementationOnce(() => new Promise(() => {})) // hangs

      const promise = mockDocRefInstance.get()
      jest.advanceTimersByTime(11000)

      await expect(promise).rejects.toThrow(
        'Firestore operation timed out on DocumentReference.get',
      )
      jest.useRealTimers()
      consoleErrorSpy.mockRestore()
    })

    it('logs error and rethrows when operation fails', async () => {
      const dbError = new Error('Firestore read error')
      mockDocGet.mockRejectedValueOnce(dbError)

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      await expect(mockDocRefInstance.get()).rejects.toThrow(
        'Firestore read error',
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Firestore Error] DocumentReference.get:',
        dbError,
      )
      consoleErrorSpy.mockRestore()
    })
  })

  describe('verifyToken', () => {
    it('resolves with token data when valid and not expired', async () => {
      const mockToken = {
        expires: { toDate: () => new Date(Date.now() + 100000) },
        consumable: false,
        consumers: [],
      }
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockToken,
      })

      const res = await verifyToken('valid-token')
      expect(res).toEqual(mockToken)
    })

    it('rejects with expired when token is expired', async () => {
      const mockToken = {
        expires: { toDate: () => new Date(Date.now() - 100000) },
        consumable: false,
        consumers: [],
      }
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockToken,
      })

      await expect(verifyToken('expired-token')).rejects.toBe('expired')
    })

    it('rejects with consumed when consumable token is already consumed', async () => {
      const mockToken = {
        expires: { toDate: () => new Date(Date.now() + 100000) },
        consumable: true,
        consumers: ['user1'],
      }
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockToken,
      })

      await expect(verifyToken('consumed-token')).rejects.toBe('consumed')
    })

    it('rejects with fake when token does not exist', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: false,
      })

      await expect(verifyToken('fake-token')).rejects.toBe('fake')
    })

    it('rejects with unknown when database call fails', async () => {
      mockDocGet.mockRejectedValueOnce(new Error('DB Fail'))
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      await expect(verifyToken('error-token')).rejects.toBe('unknown')
      consoleErrorSpy.mockRestore()
    })
  })

  describe('toDateSafe', () => {
    it('converts a valid Firestore Timestamp to a Date', () => {
      const date = new Date('2026-01-01T00:00:00Z')
      const timestamp = { toDate: () => date }
      expect(toDateSafe(timestamp as any, 'doc1', 'timestamps.created')).toBe(
        date,
      )
    })

    it('falls back to epoch and logs when the timestamp is null', () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const res = toDateSafe(null, 'doc1', 'timestamps.created')
      expect(res).toEqual(new Date(0))
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'doc doc1 has a null/missing "timestamps.created" timestamp',
        ),
      )
      consoleErrorSpy.mockRestore()
    })

    it('falls back to epoch and logs when the timestamp is missing', () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const res = toDateSafe(undefined, 'doc2', 'timestamps.updated')
      expect(res).toEqual(new Date(0))
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'doc doc2 has a null/missing "timestamps.updated" timestamp',
        ),
      )
      consoleErrorSpy.mockRestore()
    })
  })

  describe('initialization branches', () => {
    it('sets emulator environment variables', () => {
      jest.resetModules()
      jest.mock('$app/env/private', () => ({
        FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
        FIRESTORE_EMULATOR_HOST: 'localhost:8080',
        STORAGE_EMULATOR_HOST: 'localhost:9199',
      }))

      require('../src/lib/server/firebase')
      expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('localhost:9099')
      expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('localhost:8080')
      expect(process.env.STORAGE_EMULATOR_HOST).toBe('localhost:9199')
    })

    it('initializes with a valid private key certificate', () => {
      jest.resetModules()
      jest.mock('$app/env/private', () => ({
        FIREBASE_PROJECT_ID: 'proj123',
        FIREBASE_CLIENT_EMAIL: 'email123',
        FIREBASE_PRIVATE_KEY:
          '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
      }))

      mockCert.mockReturnValueOnce({ cert: 'valid-cert' })

      require('../src/lib/server/firebase')
      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          credential: { cert: 'valid-cert' },
        }),
      )
    })

    it('handles initialization error "already exists" silently', () => {
      jest.resetModules()
      jest.mock('$app/env/private', () => ({
        FIREBASE_PROJECT_ID: 'proj123',
        FIREBASE_CLIENT_EMAIL: 'email123',
        FIREBASE_PRIVATE_KEY:
          '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
      }))
      mockInitializeApp.mockImplementationOnce(() => {
        throw new Error('already exists')
      })
      const consoleLogSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {})

      require('../src/lib/server/firebase')
      expect(consoleLogSpy).not.toHaveBeenCalled()
      consoleLogSpy.mockRestore()
    })

    it('logs other initialization errors', () => {
      jest.resetModules()
      jest.mock('$app/env/private', () => ({
        FIREBASE_PROJECT_ID: 'proj123',
        FIREBASE_CLIENT_EMAIL: 'email123',
        FIREBASE_PRIVATE_KEY:
          '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
      }))
      mockInitializeApp.mockImplementationOnce(() => {
        throw new Error('some other error')
      })
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      require('../src/lib/server/firebase')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firebase Admin init error:',
        expect.any(Error),
      )
      consoleErrorSpy.mockRestore()
    })

    it('does not initialize app when building is true', () => {
      jest.resetModules()
      jest.mock('$app/env', () => ({
        building: true,
      }))

      const { adminAuth, adminDb } = require('../src/lib/server/firebase')
      expect(mockInitializeApp).not.toHaveBeenCalled()
      expect(adminAuth).toEqual({})
      expect(adminDb).toEqual({})
    })
  })
})
