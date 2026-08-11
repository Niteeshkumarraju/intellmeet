import { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import useAuthStore from '../store/authStore'
import TermsModal from '../components/TermsModal'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const [termsTab, setTermsTab] = useState('terms')

  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/dashboard'

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const googleUser = await response.json();
        const res = await axios.post('/api/auth/google', {
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.id
        });
        const { accessToken, refreshToken, user } = res.data;
        setAuth(user, accessToken, refreshToken);
        toast.success(`Welcome ${user.name}!`);
        navigate(from, { replace: true });
      } catch (err) {
        console.error('Google login error:', err);
        toast.error('Google login failed');
      }
    },
    onError: () => toast.error('Google login failed'),
  });

  const openTerms = (tab) => {
    setTermsTab(tab)
    setTermsOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await axios.post('/api/auth/login', form)
      setAuth(data.user, data.accessToken, data.refreshToken)
      toast.success('Welcome back!')
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    if (verificationCode.length !== 6) return toast.error('Please enter a 6-digit code')
    setVerifying(true)
    try {
      const { data } = await axios.post('/api/auth/verify-email', {
        email: verifyingEmail,
        code: verificationCode
      })
      setAuth(data.user, data.accessToken, data.refreshToken)
      toast.success('Email verified successfully! Welcome back!')
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const handleResendCode = async () => {
    if (resendCountdown > 0) return
    try {
      const { data } = await axios.post('/api/auth/resend-verification', { email: verifyingEmail })
      toast.success(data.message || 'New verification code sent!')
      setResendCountdown(60)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resend code')
    }
  }

  return (
    <div className="auth-container" style={{ display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .left-panel { background: linear-gradient(135deg, #0a0f1e 0%, #0d1533 50%, #0a1628 100%); position: relative; overflow: hidden; }
        .left-panel::before { content: ''; position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%); bottom: -100px; left: -100px; }
        .left-panel::after { content: ''; position: absolute; width: 400px; height: 400px; background: radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%); top: -50px; right: -50px; }
        .feature-card { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 28px; }
        .feature-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
        .input-field { width: 100%; padding: 13px 16px 13px 44px; border: 1.5px solid #e5e7eb; border-radius: 10px; font-size: 15px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s, box-shadow 0.2s; background: #fafafa; color: #111; }
        .input-field:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); background: #fff; }
        .input-wrapper { position: relative; }
        .input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 16px; }
        .sign-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .sign-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(79,70,229,0.4); }
        .sign-btn:disabled { opacity: 0.7; transform: none; }
        .mockup { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 16px; backdrop-filter: blur(10px); }
        .mockup-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; }
        .video-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .video-tile { background: linear-gradient(135deg, #1e293b, #334155); border-radius: 10px; height: 70px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
        .ai-badge { background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 8px; padding: 8px 12px; font-size: 11px; color: white; }
        .trust-badge { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; padding: 6px 14px; font-size: 13px; color: rgba(255,255,255,0.8); }
        @media (max-width: 800px) {
          .auth-container {
            flex-direction: column !important;
          }
          .left-panel {
            display: none !important;
          }
          .right-panel {
            width: 100% !important;
            padding: 40px 24px !important;
          }
        }
      `}</style>

      {/* LEFT PANEL */}
      <div className="left-panel" style={{ flex: 1, padding: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
        {/* Logo + Trust badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🤖</div>
            <div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, color: 'white' }}>IntellMeet</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Enterprise Collaboration Platform</div>
            </div>
          </div>
          <div className="trust-badge">
            <span>👥</span> Trusted by 10,000+ Teams
          </div>
        </div>

        {/* Hero text */}
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 48, fontWeight: 800, color: 'white', lineHeight: 1.1, marginBottom: 16 }}>
            Meet Smarter.<br />
            <span style={{ background: 'linear-gradient(135deg, #6366f1, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Work Better.</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, lineHeight: 1.7, marginBottom: 40, maxWidth: 380 }}>
            AI-powered meetings, intelligent summaries, and seamless collaboration for modern teams.
          </p>

          {/* Features */}
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(99,102,241,0.2)' }}>✨</div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, marginBottom: 4 }}>AI Meeting Intelligence</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Real-time transcription, summaries, and smart action items.</div>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(59,130,246,0.2)' }}>📹</div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, marginBottom: 4 }}>Crystal-Clear Meetings</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>High-quality video, screen sharing, and live collaboration.</div>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(16,185,129,0.2)' }}>👥</div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, marginBottom: 4 }}>Team Collaboration</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Chat, tasks, notes, and projects all in one place.</div>
            </div>
          </div>
        </div>

        {/* Mockup */}
        <div className="mockup">
          <div className="mockup-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>📅 Product Strategy Meeting</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>40:32</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div className="dot" style={{ background: '#ef4444' }}></div>
              <div className="dot" style={{ background: '#f59e0b' }}></div>
              <div className="dot" style={{ background: '#10b981' }}></div>
            </div>
          </div>
          <div className="video-grid">
            <div className="video-tile">👨‍💼</div>
            <div className="video-tile">👩‍💼</div>
            <div className="video-tile">👨‍💻</div>
            <div className="video-tile">👩‍💻</div>
          </div>
          <div className="ai-badge">
            🤖 AI Summary • Discussed Q2 product roadmap and user feedback insights
          </div>
        </div>

        {/* Security badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          <span>🛡️</span>
          <span>Enterprise-Grade Security • End-to-end encryption • SOC 2 • GDPR Compliant</span>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="right-panel" style={{ width: '480px', background: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 48px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, color: '#111', marginBottom: 8 }}>Welcome back 👋</h2>
          <p style={{ color: '#6b7280', fontSize: 15 }}>Sign in to your IntellMeet account</p>
          <div style={{ width: 48, height: 3, background: 'linear-gradient(135deg, #4f46e5, #6366f1)', borderRadius: 2, margin: '16px auto 0' }}></div>
        </div>

        <form onSubmit={handleSubmit}>
          <button
            type="button"
            onClick={() => googleLogin()}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#fff',
              border: '1.5px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              color: '#374151',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              marginBottom: '24px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#fff';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.59.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.32 0 2.508.453 3.44 1.346l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500 }}>or sign in with email</span>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Email address</label>
            <div className="input-wrapper">
              <span className="input-icon">✉️</span>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                className="input-field"
                placeholder="you@company.com"
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Password</label>
              <span style={{ fontSize: 14, color: '#4f46e5', cursor: 'pointer', fontWeight: 500 }}>Forgot password?</span>
            </div>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                className="input-field"
                placeholder="Enter your password"
                required
                style={{ paddingRight: 44 }}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}
              >
                {showPassword ? '🙈' : '👁️'}
              </span>
            </div>
          </div>

          <button type="submit" className="sign-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'} {!loading && '→'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, color: '#6b7280', fontSize: 15 }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}>Sign up</Link>
        </p>

        <p style={{ textAlign: 'center', marginTop: 32, color: '#9ca3af', fontSize: 12 }}>
          By signing in, you agree to our{' '}
          <span onClick={() => openTerms('terms')} style={{ color: '#4f46e5', cursor: 'pointer' }}>Terms of Service</span> and{' '}
          <span onClick={() => openTerms('privacy')} style={{ color: '#4f46e5', cursor: 'pointer' }}>Privacy Policy</span>
        </p>
      </div>
      <TermsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} initialTab={termsTab} />
    </div>
  )
}