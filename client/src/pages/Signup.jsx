import { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import useAuthStore from '../store/authStore'
import TermsModal from '../components/TermsModal'

export default function Signup() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', company: '' })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [agreed, setAgreed] = useState(false)
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
        console.error('Google signup error:', err);
        toast.error('Google signup failed');
      }
    },
    onError: () => toast.error('Google signup failed'),
  });

  const handleGoogleClick = () => {
    if (!agreed) {
      toast.error('Please agree to the Terms of Service and Privacy Policy');
      return;
    }
    googleLogin();
  };

  const openTerms = (tab) => {
    setTermsTab(tab)
    setTermsOpen(true)
  }

  const getPasswordStrength = (p) => {
    if (!p) return { label: '', color: '#e5e7eb', width: '0%' }
    if (p.length < 6) return { label: 'Weak', color: '#ef4444', width: '25%' }
    if (p.length < 10) return { label: 'Fair', color: '#f59e0b', width: '50%' }
    if (!/[A-Z]/.test(p) || !/[0-9]/.test(p)) return { label: 'Good', color: '#3b82f6', width: '75%' }
    return { label: 'Strong', color: '#10b981', width: '100%' }
  }

  const strength = getPasswordStrength(form.password)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match')
    if (!agreed) return toast.error('Please agree to Terms of Service')
    setLoading(true)
    try {
      const { data } = await axios.post('/api/auth/signup', {
        name: `${form.firstName} ${form.lastName}`,
        email: form.email,
        password: form.password
      })
      setAuth(data.user, data.accessToken, data.refreshToken)
      toast.success('Account created!')
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Signup failed')
    } finally {
      setLoading(false)
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
        .feature-card { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
        .feature-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
        .input-field { width: 100%; padding: 12px 16px 12px 44px; border: 1.5px solid #e5e7eb; border-radius: 10px; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s, box-shadow 0.2s; background: #fafafa; color: #111; }
        .input-field:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); background: #fff; }
        .input-wrapper { position: relative; }
        .input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 15px; }
        .sign-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .sign-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(79,70,229,0.4); }
        .sign-btn:disabled { opacity: 0.7; transform: none; }
        .mockup { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 16px; backdrop-filter: blur(10px); }
        .video-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .video-tile { background: linear-gradient(135deg, #1e293b, #334155); border-radius: 10px; height: 65px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
        .ai-badge { background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 8px; padding: 8px 12px; font-size: 11px; color: white; }
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
      <div className="left-panel" style={{ flex: 1, padding: '40px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🤖</div>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, color: 'white' }}>IntellMeet</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Enterprise Meeting & Collaboration Platform</div>
          </div>
        </div>

        {/* Hero */}
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 42, fontWeight: 800, color: 'white', lineHeight: 1.1, marginBottom: 16 }}>
            Smarter Meetings.<br />
            <span style={{ background: 'linear-gradient(135deg, #6366f1, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Better Outcomes.</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7, marginBottom: 36, maxWidth: 380 }}>
            AI-powered meetings, real-time collaboration, and actionable insights — all in one secure platform for modern teams.
          </p>

          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(99,102,241,0.2)' }}>✨</div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, marginBottom: 3 }}>AI Meeting Intelligence</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Real-time transcription, smart summaries, and action item extraction.</div>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(59,130,246,0.2)' }}>📹</div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, marginBottom: 3 }}>Crystal-Clear Meetings</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>High-quality video, screen sharing, and interactive sessions.</div>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(16,185,129,0.2)' }}>💬</div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, marginBottom: 3 }}>Team Collaboration</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Chat, tasks, notes, and projects in one unified workspace.</div>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'rgba(245,158,11,0.2)' }}>🛡️</div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, marginBottom: 3 }}>Enterprise-Grade Security</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>End-to-end encryption, role-based access, and compliance built-in.</div>
            </div>
          </div>
        </div>

        {/* Mockup */}
        <div className="mockup">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>📅 Planning Meeting</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Live</span>
          </div>
          <div className="video-grid">
            <div className="video-tile">👨‍💼</div>
            <div className="video-tile">👩‍💼</div>
            <div className="video-tile">👨‍💻</div>
            <div className="video-tile">👩‍💻</div>
          </div>
          <div className="ai-badge">🤖 AI Summary • Action items extracted automatically</div>
        </div>

        {/* Trust badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px' }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>Trusted by 10,000+ Teams</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>From fast-growing startups to global enterprises</div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="right-panel" style={{ width: '520px', background: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <span style={{ color: '#6b7280', fontSize: 14 }}>Already have an account? <Link to="/login" style={{ color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link></span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: '#111', marginBottom: 8 }}>Create your account ✨</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Join IntellMeet and get started in seconds.</p>
          <div style={{ width: 48, height: 3, background: 'linear-gradient(135deg, #4f46e5, #6366f1)', borderRadius: 2, margin: '14px auto 0' }}></div>
        </div>

        <form onSubmit={handleSubmit}>
          <button
            type="button"
            onClick={handleGoogleClick}
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
              marginBottom: '20px'
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

          {/* ── Email signup ─────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>or sign up with email</span>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>
          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>First name</label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input type="text" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} className="input-field" placeholder="Enter your first name" required />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Last name</label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input type="text" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} className="input-field" placeholder="Enter your last name" required />
              </div>
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Work email</label>
            <div className="input-wrapper">
              <span className="input-icon">✉️</span>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input-field" placeholder="you@company.com" required />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Password</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="input-field" placeholder="Create a strong password" required style={{ paddingRight: 44 }} />
              <span onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#9ca3af' }}>{showPassword ? '🙈' : '👁️'}</span>
            </div>
            {form.password && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 3, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: strength.width, background: strength.color, borderRadius: 2, transition: 'all 0.3s' }}></div>
                </div>
                <span style={{ fontSize: 12, color: strength.color, fontWeight: 500 }}>Password strength: {strength.label}</span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Confirm password</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} onChange={e => setForm({...form, confirmPassword: e.target.value})} className="input-field" placeholder="Confirm your password" required style={{ paddingRight: 44 }} />
              <span onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#9ca3af' }}>{showConfirm ? '🙈' : '👁️'}</span>
            </div>
          </div>

          {/* Company */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Company name <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
            <div className="input-wrapper">
              <span className="input-icon">🏢</span>
              <input type="text" value={form.company} onChange={e => setForm({...form, company: e.target.value})} className="input-field" placeholder="Enter your company name" />
            </div>
          </div>

          {/* Terms */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <input type="checkbox" id="terms" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#4f46e5' }} />
            <label htmlFor="terms" style={{ fontSize: 13, color: '#6b7280' }}>
              I agree to the <span onClick={() => openTerms('terms')} style={{ color: '#4f46e5', cursor: 'pointer' }}>Terms of Service</span> and <span onClick={() => openTerms('privacy')} style={{ color: '#4f46e5', cursor: 'pointer' }}>Privacy Policy</span>
            </label>
          </div>

          <button type="submit" className="sign-btn" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'} {!loading && '→'}
          </button>
        </form>
      </div>
      <TermsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} initialTab={termsTab} />
    </div>
  )
}