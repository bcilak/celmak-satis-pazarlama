export async function api<T>(path:string, options?:RequestInit):Promise<T> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    credentials:'include',
    headers: { 'content-type':'application/json', ...(options?.headers || {}) },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'İşlem tamamlanamadı.')
  return data
}
