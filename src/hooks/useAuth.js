import { useState, useEffect } from 'react'
import { useApi } from '../contexts/ApiContext'

export const useAuth = () => {
  const { get, post } = useApi()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('cerebrum_token')
        if (token) {
          const data = await get('/profile')
          setUser(data.user || data)
        }
      } catch (err) {
        console.error('Auth check failed:', err)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [get])

  const login = async (credentials) => {
    try {
      setLoading(true)
      const data = await post('/login', credentials)
      localStorage.setItem('cerebrum_token', data.token)
      setUser(data.user)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await post('/logout', {})
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      localStorage.removeItem('cerebrum_token')
      setUser(null)
    }
  }

  const register = async (userData) => {
    try {
      setLoading(true)
      const data = await post('/register', userData)
      localStorage.setItem('cerebrum_token', data.token)
      setUser(data.user)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    user,
    loading,
    error,
    login,
    logout,
    register,
    isAuthenticated: !!user,
  }
}
