// src/api.js
const BASE = import.meta.env.VITE_API_URL ?? ''

export function apiUrl(path) {
  return `${BASE}${path}`
}

export async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData
  return fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers: isFormData
      ? (options.headers || {})
      : { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
}