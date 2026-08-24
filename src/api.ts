export async function api<T>(path:string, options?:RequestInit):Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials:'include',
    headers: { 'content-type':'application/json', ...(options?.headers || {}) },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'İşlem tamamlanamadı.')
  return data
}
