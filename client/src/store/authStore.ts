// TypeScript version of authStore — converted from authStore.js
// This is the first migrated file demonstrating the TS migration path
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  avatar?: string
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  refreshToken: string | null
  setAuth: (user: AuthUser, token: string, refreshToken: string) => void
  logout: () => void
}

const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      setAuth: (user, token, refreshToken) => set({ user, token, refreshToken }),
      logout: () => set({ user: null, token: null, refreshToken: null }),
    }),
    { name: 'intellmeet-auth' }
  )
)

export default useAuthStore
