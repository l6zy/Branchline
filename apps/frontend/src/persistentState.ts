import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

export type PersistentStateValidator<T> = (value: unknown) => value is T

export function parsePersistentState<T>(rawValue: string | null, fallback: T, isValid: PersistentStateValidator<T>) {
  if (!rawValue) return fallback
  try {
    const value: unknown = JSON.parse(rawValue)
    return isValid(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'boolean')
}

export function usePersistentState<T>(key: string, fallback: T, isValid: PersistentStateValidator<T>): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return fallback
    return parsePersistentState(window.localStorage.getItem(key), fallback, isValid)
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
  }, [key, value])

  return [value, setValue]
}
