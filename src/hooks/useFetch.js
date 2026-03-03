import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../contexts/ApiContext'

export const useFetch = (url, options = {}) => {
  const { get } = useApi()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await get(url)
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [url, get])

  useEffect(() => {
    if (url) {
      fetchData()
    }
  }, [url, fetchData])

  const refetch = useCallback(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch }
}
