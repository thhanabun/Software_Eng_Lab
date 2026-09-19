import type { AuthUser } from '../src/api'

// Shared fixture for Lab 2 regression tests: pages read the session user via
// useAuth (mocked per-file); AuthProvider/guards themselves are covered by
// tests/lab-03/Guards.test.tsx with the real provider.
export const TEST_USER: AuthUser = {
  id: 1,
  name: 'Alice Carter',
  email: 'alice.carter@student.example',
  role: 'REQUESTER',
  active: true,
  mustChangePassword: false,
}

export function mockUseAuth() {
  return {
    user: TEST_USER,
    loading: false,
    login: async () => TEST_USER,
    logout: async () => {},
    refresh: async () => {},
  }
}
