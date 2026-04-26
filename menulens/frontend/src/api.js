// src/api.js
const BASE = import.meta.env.VITE_API_URL ?? ''

export function apiUrl(path) {
  return `${BASE}${path}`
}