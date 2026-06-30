// OAuth callback page — handles the redirect from Google OAuth
// The server redirects here with tokens as query params
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../store/authStore'

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  useEffect(() => {
    const accessToken  = searchParams.get('accessToken')
    const refreshToken = searchParams.get('refreshToken')
    const userId       = searchParams.get('userId')
    const name         = searchParams.get('name')
    const email        = searchParams.get('email')
    const role         = searchParams.get('role')
    const avatar       = searchParams.get('avatar')
    const error        = searchParams.get('error')

    if (error) {
      navigate('/login?error=oauth_failed')
      return
    }

    if (accessToken && userId) {
      setAuth({ id: userId, name, email, role, avatar }, accessToken, refreshToken)
      navigate('/dashboard')
    } else {
      navigate('/login')
    }
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0f1e', color: 'white', fontFamily: 'Outfit,sans-serif', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: 'rgba(255,255,255,0.5)' }}>Completing sign in…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
