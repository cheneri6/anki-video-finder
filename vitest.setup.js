import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock firebase module as requested to stay offline
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}))
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
}))

// Mock global Worker class since jsdom/Node doesn't have it.
// This prevents "Worker is not defined" when instantiating Vite worker wrappers.
global.Worker = class MockWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
  }
  postMessage(_data) {
    // No-op or mock logic
  }
  terminate() {
    // No-op
  }
  addEventListener(_type, _listener) {
    // No-op
  }
  removeEventListener(_type, _listener) {
    // No-op
  }
}
