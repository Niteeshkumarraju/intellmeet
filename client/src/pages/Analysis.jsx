import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import useAuthStore from '../store/authStore'
import { analyzeMeeting } from '../services/gemini'

export default function Analysis() {
  const [meetings, setMeetings] = useState([])
  const [selectedMeeting, setSelectedMeeting] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
  const { token, user } = useAuthStore()
  const navigate = useNavigate()
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => { fetchMeetings() }, [])

  const fetchMeetings = async () => {
    try {
      const { data } = await axios.get('/api/meetings', { headers })
      setMeetings(data)
      if (data.length > 0) setSelectedMeeting(data[0])
    } catch { toast.error('Failed to load meetings') }
  }

  const analyzeWithAI = async (meeting) => {
  if (loading) return // prevent duplicate clicks
  setLoading(true)
  setAnalysis(null)
  try {
    const messagesRes = await axios.get(`/api/chat/${meeting._id}`, { headers })
    const { analyzeMeeting } = await import('../services/gemini')
    const result = await analyzeMeeting(meeting, messagesRes.data, token)
    setAnalysis(result)
    toast.success('AI Analysis complete!')
  } catch (err) {
    console.error(err)
    if (err.response?.status === 429) {
      toast.error('Rate limit hit — wait 1 minute and try again')
    } else {
      toast.error('Analysis failed — using fallback data')
      setAnalysis({
        meetingScore: 72,
        sentiment: 'neutral',
        sentimentScore: 60,
        keyTopics: ['Team collaboration', 'Project planning', 'Action items'],
        summary: `Meeting "${meeting.title}" was conducted. Participants discussed key topics and established action items.`,
        highlights: ['Meeting completed', 'Action items identified'],
        risks: ['Follow-up required'],
        decisions: ['Continue with current plan'],
        participationRate: 75,
        engagementLevel: 'medium',
        followUpRequired: true,
        nextSteps: ['Review action items', 'Schedule follow-up'],
        meetingEfficiency: 70,
        estimatedROI: 'Medium',
        recommendations: ['Send summary to participants', 'Set deadlines for action items']
      })
    }
  } finally { setLoading(false) }
}

  const getSentimentColor = (s) => s === 'positive' ? '#10b981' : s === 'negative' ? '#ef4444' : '#f59e0b'
  const getScoreColor = (score) => score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'

  const totalMeetings = meetings.length
  const endedMeetings = meetings.filter(m => m.status === 'ended')
  const totalActionItems = meetings.reduce((a, m) => a + (m.actionItems?.length || 0), 0)
  const meetingsWithSummary = meetings.filter(m => m.summary).length

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', fontFamily: "'DM Sans', sans-serif", color: 'white', display: 'flex' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .meeting-card { padding: 12px 14px; border-radius: 10px; cursor: pointer; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.06); margin-bottom: 8px; }
        .meeting-card:hover { background: rgba(255,255,255,0.06); }
        .meeting-card.active { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.4); }
        .section-btn { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; border: none; background: transparent; color: rgba(255,255,255,0.4); font-family: 'DM Sans'; transition: all 0.2s; }
        .section-btn.active { background: rgba(99,102,241,0.2); color: #818cf8; }
        .metric-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 18px; }
        .tag { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; margin: 3px; }
        .list-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; color: rgba(255,255,255,0.75); }
        .analyze-btn { width: 100%; background: linear-gradient(135deg, #4f46e5, #6366f1); border: none; color: white; padding: 11px; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 700; font-family: 'DM Sans'; transition: all 0.2s; margin-top: 12px; }
        .analyze-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(79,70,229,0.4); }
        .analyze-btn:disabled { opacity: 0.6; transform: none; }
        .progress-bar { height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 4px; transition: width 1s ease; }
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>

      {/* LEFT SIDEBAR */}
      <div style={{ width: 280, background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '20px 16px', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans' }}>← Back</button>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 800 }}>AI Analysis</div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.2), rgba(124,58,237,0.2))', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 14, padding: '14px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>📊 Overall Stats</div>
          {[
            { label: 'Total Meetings', value: totalMeetings },
            { label: 'Completed', value: endedMeetings.length },
            { label: 'Action Items', value: totalActionItems },
            { label: 'AI Analyzed', value: meetingsWithSummary },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#818cf8' }}>{s.value}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10, fontWeight: 600 }}>SELECT MEETING TO ANALYZE</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {meetings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📹</div>
              <p style={{ fontSize: 13 }}>No meetings yet</p>
            </div>
          ) : meetings.map((m) => (
            <div key={m._id} className={`meeting-card ${selectedMeeting?._id === m._id ? 'active' : ''}`}
              onClick={() => { setSelectedMeeting(m); setAnalysis(null) }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: m.status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)', color: m.status === 'active' ? '#10b981' : 'rgba(255,255,255,0.4)' }}>{m.status}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{new Date(m.createdAt).toLocaleDateString()}</span>
              </div>
              {m.actionItems?.length > 0 && (
                <div style={{ fontSize: 11, color: '#818cf8', marginTop: 4 }}>✅ {m.actionItems.length} action items</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {!selectedMeeting ? (
          <div style={{ textAlign: 'center', marginTop: 100, color: 'rgba(255,255,255,0.3)' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🤖</div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>AI Meeting Analysis</div>
            <p>Select a meeting from the left to analyze it</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
              <div>
                <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 800, marginBottom: 6 }}>{selectedMeeting.title}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                  <span>📅 {new Date(selectedMeeting.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  <span>•</span>
                  <span>👥 {selectedMeeting.participants?.length || 1} participant(s)</span>
                  <span>•</span>
                  <span style={{ color: selectedMeeting.status === 'active' ? '#10b981' : 'rgba(255,255,255,0.4)' }}>● {selectedMeeting.status}</span>
                </div>
              </div>
              <button className="analyze-btn" style={{ width: 'auto', padding: '10px 24px', marginTop: 0 }}
                onClick={() => analyzeWithAI(selectedMeeting)} disabled={loading}>
                {loading ? '⏳ Analyzing...' : '✨ Analyze with AI'}
              </button>
            </div>

            {!analysis && !loading && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.02)', borderRadius: 20, border: '2px dashed rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🤖</div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'rgba(255,255,255,0.6)' }}>Ready to Analyze</div>
                <p style={{ fontSize: 14, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>Click "Analyze with AI" to get deep insights about this meeting including sentiment analysis, key topics, decisions, and recommendations.</p>
                <button className="analyze-btn" style={{ width: 'auto', padding: '12px 32px', display: 'inline-block' }}
                  onClick={() => analyzeWithAI(selectedMeeting)}>
                  ✨ Start AI Analysis
                </button>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <div style={{ fontSize: 56, marginBottom: 20, animation: 'spin 2s linear infinite' }}>🤖</div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Analyzing Meeting...</div>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Gemini AI is processing conversation, extracting insights, and generating recommendations</p>
                <div style={{ width: 300, margin: '24px auto 0' }}>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '70%', background: 'linear-gradient(90deg, #4f46e5, #818cf8)' }}></div>
                  </div>
                </div>
              </div>
            )}

            {analysis && (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 12 }}>
                  {['overview', 'insights', 'actions', 'recommendations'].map(s => (
                    <button key={s} className={`section-btn ${activeSection === s ? 'active' : ''}`} onClick={() => setActiveSection(s)}>
                      {s === 'overview' ? '📊 Overview' : s === 'insights' ? '💡 Insights' : s === 'actions' ? '✅ Actions' : '🎯 Recommendations'}
                    </button>
                  ))}
                </div>

                {activeSection === 'overview' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                      {[
                        { label: 'Meeting Score', value: `${analysis.meetingScore}%`, color: getScoreColor(analysis.meetingScore), icon: '⭐' },
                        { label: 'Sentiment', value: analysis.sentiment, color: getSentimentColor(analysis.sentiment), icon: analysis.sentiment === 'positive' ? '😊' : analysis.sentiment === 'negative' ? '😟' : '😐' },
                        { label: 'Efficiency', value: `${analysis.meetingEfficiency}%`, color: getScoreColor(analysis.meetingEfficiency), icon: '⚡' },
                        { label: 'ROI Estimate', value: analysis.estimatedROI, color: analysis.estimatedROI === 'High' ? '#10b981' : '#f59e0b', icon: '💰' },
                      ].map((card, i) => (
                        <div key={i} className="metric-card" style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
                          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, color: card.color, marginBottom: 4 }}>{card.value}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{card.label}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                      <div className="metric-card">
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📈 Performance Metrics</div>
                        {[
                          { label: 'Meeting Score', value: analysis.meetingScore, color: getScoreColor(analysis.meetingScore) },
                          { label: 'Sentiment Score', value: analysis.sentimentScore, color: getSentimentColor(analysis.sentiment) },
                          { label: 'Participation Rate', value: analysis.participationRate, color: '#6366f1' },
                          { label: 'Efficiency', value: analysis.meetingEfficiency, color: '#f59e0b' },
                        ].map((m, i) => (
                          <div key={i} style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{m.label}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.value}%</span>
                            </div>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${m.value}%`, background: m.color }}></div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="metric-card">
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>🏷️ Key Topics Discussed</div>
                        <div style={{ marginBottom: 16 }}>
                          {analysis.keyTopics?.map((topic, i) => (
                            <span key={i} className="tag" style={{ background: `hsl(${i * 60 + 220}, 60%, 25%)`, color: `hsl(${i * 60 + 220}, 80%, 75%)`, border: `1px solid hsl(${i * 60 + 220}, 60%, 35%)` }}>
                              {topic}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>💬 Engagement Level</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: analysis.engagementLevel === 'high' ? '90%' : analysis.engagementLevel === 'medium' ? '60%' : '30%', background: 'linear-gradient(90deg, #6366f1, #818cf8)' }}></div>
                            </div>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', textTransform: 'capitalize' }}>{analysis.engagementLevel}</span>
                        </div>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📝 AI Summary</div>
                      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>{analysis.summary}</p>
                    </div>
                  </div>
                )}

                {activeSection === 'insights' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="metric-card">
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#10b981' }}>✨ Meeting Highlights</div>
                      {analysis.highlights?.map((h, i) => (
                        <div key={i} className="list-item">
                          <span style={{ color: '#10b981', flexShrink: 0 }}>→</span> {h}
                        </div>
                      ))}
                    </div>
                    <div className="metric-card">
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#ef4444' }}>⚠️ Risks & Concerns</div>
                      {analysis.risks?.length > 0 ? analysis.risks.map((r, i) => (
                        <div key={i} className="list-item">
                          <span style={{ color: '#ef4444', flexShrink: 0 }}>!</span> {r}
                        </div>
                      )) : <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No risks identified 🎉</div>}
                    </div>
                    <div className="metric-card">
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#6366f1' }}>🎯 Decisions Made</div>
                      {analysis.decisions?.map((d, i) => (
                        <div key={i} className="list-item">
                          <span style={{ color: '#6366f1', flexShrink: 0 }}>✓</span> {d}
                        </div>
                      ))}
                    </div>
                    <div className="metric-card">
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#f59e0b' }}>🔮 Next Steps</div>
                      {analysis.nextSteps?.map((s, i) => (
                        <div key={i} className="list-item">
                          <span style={{ color: '#f59e0b', flexShrink: 0 }}>{i + 1}.</span> {s}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSection === 'actions' && (
                  <div className="metric-card">
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>✅ Action Items</div>
                    {selectedMeeting.actionItems?.length > 0 ? selectedMeeting.actionItems.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, marginBottom: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${item.completed ? '#10b981' : '#6366f1'}`, background: item.completed ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                          {item.completed && <span style={{ color: '#111' }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: item.completed ? 'rgba(255,255,255,0.4)' : 'white', textDecoration: item.completed ? 'line-through' : 'none' }}>{item.task}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>Assigned to: <span style={{ color: '#818cf8' }}>{item.assignee}</span></div>
                        </div>
                        <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: item.completed ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)', color: item.completed ? '#10b981' : '#818cf8', fontWeight: 600 }}>
                          {item.completed ? 'Done' : 'Pending'}
                        </span>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                        <p>No action items yet. Generate AI summary in the meeting to extract action items.</p>
                      </div>
                    )}
                    {analysis.followUpRequired && (
                      <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>⚠️</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>Follow-up Required</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>AI detected that this meeting requires follow-up actions</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeSection === 'recommendations' && (
                  <div>
                    <div className="metric-card" style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>🎯 AI Recommendations</div>
                      {analysis.recommendations?.map((rec, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, marginBottom: 10 }}>
                          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #4f46e5, #6366f1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                            {i + 1}
                          </div>
                          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, paddingTop: 3 }}>{rec}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div className="metric-card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>💰</div>
                        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, color: analysis.estimatedROI === 'High' ? '#10b981' : '#f59e0b', marginBottom: 6 }}>{analysis.estimatedROI}</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Estimated Meeting ROI</div>
                      </div>
                      <div className="metric-card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>{analysis.followUpRequired ? '📬' : '✅'}</div>
                        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, color: analysis.followUpRequired ? '#f59e0b' : '#10b981', marginBottom: 6 }}>
                          {analysis.followUpRequired ? 'Required' : 'Not Required'}
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Follow-up Status</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}