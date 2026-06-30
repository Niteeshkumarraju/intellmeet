import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function PublicRecording() {
  const { id } = useParams()
  const [recording, setRecording] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchPublicRecording = async () => {
      try {
        setLoading(true)
        const { data } = await axios.get(`/api/meetings/public/recording/${id}`)
        setRecording(data)
        setError(null)
      } catch (err) {
        console.error('Error fetching public recording:', err)
        setError(err.response?.data?.message || 'Recording not found or unavailable.')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchPublicRecording()
    }
  }, [id])

  const copyShareLink = () => {
    const shareUrl = window.location.href
    navigator.clipboard.writeText(shareUrl)
    toast.success('Share link copied to clipboard!')
  }

  // Format elapsed duration
  const getDuration = (start, end) => {
    if (!start || !end) return ''
    const diffMs = new Date(end) - new Date(start)
    const mins = Math.floor(diffMs / 60000)
    return `${mins} min`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0a0f1e', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'white' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .branding-btn { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.2s; display: inline-flex; alignItems: center; gap: 6px; }
        .branding-btn:hover { background: rgba(255,255,255,0.12); color: white; }
        .action-btn { padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: 'Plus Jakarta Sans'; display: inline-flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; text-decoration: none; border: none; }
        .share-btn { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; }
        .share-btn:hover { background: rgba(16, 185, 129, 0.25); transform: translateY(-1px); }
        .download-btn { background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); color: #a5b4fc; }
        .download-btn:hover { background: rgba(99, 102, 241, 0.25); transform: translateY(-1px); }
      `}</style>

      {/* HEADER NAVBAR */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 40px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,15,30,0.8)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 800 }}>IntellMeet</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Smarter Outcomes</div>
          </div>
        </div>

        <div>
          <Link to="/login" className="branding-btn">
            🔑 Log In to IntellMeet
          </Link>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', maxWidth: '1000px', width: '100%', margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: 40, height: 40, border: '4px solid rgba(99,102,241,0.2)', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }} />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Loading meeting recording...</p>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '48px 32px', textAlign: 'center', maxWidth: '480px', width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Playback Unavailable</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.5, marginBottom: 28 }}>{error}</p>
            <Link to="/login" style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>
              Return to IntellMeet
            </Link>
          </div>
        ) : (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Title & Info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, color: 'white', marginBottom: 8 }}>
                  {recording.title}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    📅 {recording.startTime ? new Date(recording.startTime).toLocaleDateString([], { dateStyle: 'long' }) : 'Unknown Date'}
                  </span>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    ⏱️ {recording.startTime && recording.endTime ? getDuration(recording.startTime, recording.endTime) : 'N/A'}
                  </span>
                  <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                    Public Share
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={copyShareLink} className="action-btn share-btn">
                  🔗 Share Link
                </button>
                <a href={recording.recording} download target="_blank" rel="noreferrer" className="action-btn download-btn">
                  ⬇ Download Recording
                </a>
              </div>
            </div>

            {/* Video Player */}
            <div style={{ background: '#000', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 50px rgba(0,0,0,0.8)', width: '100%' }}>
              <video 
                controls 
                autoPlay 
                style={{ width: '100%', display: 'block', maxHeight: '70vh' }}
                src={recording.recording}
              >
                Your browser does not support video playback.
              </video>
            </div>

            {/* Description Card */}
            {recording.description && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
                  About this meeting
                </h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {recording.description}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '20px 40px', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)', background: 'rgba(5,7,15,0.3)' }}>
        <p>© 2026 IntellMeet. All rights reserved. Video recordings are hosted securely.</p>
      </footer>
    </div>
  )
}
