import { createContext, useEffect, useState } from 'react'

export interface UserInfo {
  username: string
  role: 'user' | 'admin' | 'my admin'
  english_name: string
}

interface AuthCtx {
  user: UserInfo | null
  login: (u: string, p: string, admin?: boolean) => Promise<string | null>
  logout: () => void
  updateUser: (newInfo: Partial<UserInfo>) => void
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  login: async () => null,
  logout: () => {},
  updateUser: () => {}
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('auth')
    if (stored) setUser(JSON.parse(stored))
  }, [])

  const login = async (username: string, password: string, admin = false) => {
    const endpoint = admin ? '/api/login' : '/api/login'
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await r.json()
    if (!r.ok) return data.error || 'Login failed'
    const info = {
      username,
      role: data.role as 'user' | 'admin',
      english_name: data.english_name
    }
    setUser(info)
    localStorage.setItem('auth', JSON.stringify(info))
    if (data.token) {
      localStorage.setItem('token', data.token)
    }
    return null
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('auth')
    localStorage.removeItem('token')
  }

  const updateUser = (newInfo: Partial<UserInfo>) => {
    setUser(prevUser => {
      if (!prevUser) return null
      const updatedUser = { ...prevUser, ...newInfo }
      localStorage.setItem('auth', JSON.stringify(updatedUser))
      return updatedUser
    })
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
