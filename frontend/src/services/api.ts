import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',   // Vite proxies /api → http://localhost:8000/api
  timeout: 15_000,
})

apiClient.interceptors.request.use(async (config) => {
  try {
    // window.Clerk is populated by ClerkProvider after mount
    const token = await (window as any).Clerk?.session?.getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // Not signed in — request proceeds without token (public routes)
  }
  return config
})

export default apiClient
