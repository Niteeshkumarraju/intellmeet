import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import useAuthStore from '../store/authStore'
import { useCallback } from 'react'

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [seenActionItemCount, setSeenActionItemCount] = useState(() => {
    return parseInt(localStorage.getItem('intellmeet_seen_action_items') || '0', 10)
  })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [scheduleForm, setScheduleForm] = useState({ title: '', description: '', date: '', time: '', duration: '60' })
  const [searchQuery, setSearchQuery] = useState('')
  const [schHour, setSchHour] = useState('12')
  const [schMinute, setSchMinute] = useState('00')
  const [schPeriod, setSchPeriod] = useState('PM')
  const [nowTime, setNowTime] = useState(new Date())
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [activeProfileField, setActiveProfileField] = useState(null)
  const [profileEditVal, setProfileEditVal] = useState('')
  const [currentPasswordVal, setCurrentPasswordVal] = useState('')
  const [teams, setTeams] = useState([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [settingsState, setSettingsState] = useState({
    defaultDuration: '60',
    autoRecord: false,
    aiSummary: true,
    emailAlerts: true,
    meetingReminders: true,
    actionItemUpdates: false
  })
  const { user, token, refreshToken, setAuth, logout } = useAuthStore()
  const navigate = useNavigate()
  const headers = { Authorization: `Bearer ${token}` }

  // Interactive Pinning & Theater states
  const [pinnedRecordings, setPinnedRecordings] = useState(() => JSON.parse(localStorage.getItem('intellmeet_pinned_recordings') || '[]'))
  const [pinnedActionMeetings, setPinnedActionMeetings] = useState(() => JSON.parse(localStorage.getItem('intellmeet_pinned_actions') || '[]'))
  const [activeVideo, setActiveVideo] = useState(null) // { url, title }

  // Notifications states
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('intellmeet_notifications')
    if (saved) return JSON.parse(saved)
    return [
      { id: '1', text: 'Welcome to IntellMeet! Start by creating or scheduling a meeting.', time: new Date(Date.now() - 3600000).toISOString(), read: false, type: 'info' },
      { id: '2', text: 'Tip: Enable meeting recording to capture video and generate action items.', time: new Date(Date.now() - 7200000).toISOString(), read: true, type: 'info' }
    ]
  })
  const [showNotifications, setShowNotifications] = useState(false)

  const handleNotificationClick = (notif) => {
    const updated = notifications.map(n => n.id === notif.id ? { ...n, read: true } : n);
    setNotifications(updated);
    localStorage.setItem('intellmeet_notifications', JSON.stringify(updated));
    if (notif.navTarget) {
      setActiveNav(notif.navTarget);
    }
    setShowNotifications(false);
  }

  const togglePinRecording = (id) => {
    let next
    if (pinnedRecordings.includes(id)) {
      next = pinnedRecordings.filter(x => x !== id)
    } else {
      next = [...pinnedRecordings, id]
    }
    setPinnedRecordings(next)
    localStorage.setItem('intellmeet_pinned_recordings', JSON.stringify(next))
    toast.success(pinnedRecordings.includes(id) ? 'Recording unpinned' : 'Recording pinned to top!')
  }

  const togglePinActions = (id) => {
    let next
    if (pinnedActionMeetings.includes(id)) {
      next = pinnedActionMeetings.filter(x => x !== id)
    } else {
      next = [...pinnedActionMeetings, id]
    }
    setPinnedActionMeetings(next)
    localStorage.setItem('intellmeet_pinned_actions', JSON.stringify(next))
    toast.success(pinnedActionMeetings.includes(id) ? 'Action items unpinned' : 'Action items pinned to top!')
  }

  const handleDeleteRecording = async (meetingId) => {
    const confirmDelete = window.confirm('Are you sure you want to permanently delete this meeting recording? This action cannot be undone.');
    if (!confirmDelete) return;

    const delToast = toast.loading('Deleting recording...');
    try {
      await axios.delete(`/api/meetings/${meetingId}/recording`, { headers });
      toast.success('Recording deleted successfully!', { id: delToast });
      fetchMeetings();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete recording.', { id: delToast });
    }
  }

  const fetchTeams = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/teams', { headers })
      setTeams(data)
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => { fetchMeetings() }, [])
  useEffect(() => { fetchTeams() }, [fetchTeams])
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTime(new Date())
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (meetings.length === 0) return;
    
    let updated = false;
    const nextNotifications = [...notifications];
    
    const processedRecordings = JSON.parse(localStorage.getItem('intellmeet_processed_rec') || '[]');
    const processedMeetings = JSON.parse(localStorage.getItem('intellmeet_processed_meet') || '[]');
    
    meetings.forEach(m => {
      if (!processedMeetings.includes(m._id)) {
        processedMeetings.push(m._id);
        nextNotifications.unshift({
          id: `meet-${m._id}-${Date.now()}`,
          text: `New meeting: "${m.title}"`,
          time: new Date().toISOString(),
          read: false,
          type: 'meeting',
          navTarget: 'Dashboard'
        });
        updated = true;
      }
      
      if (m.recording && m.recording.trim() !== '' && !processedRecordings.includes(m._id)) {
        processedRecordings.push(m._id);
        nextNotifications.unshift({
          id: `rec-${m._id}-${Date.now()}`,
          text: `🎥 New recording for "${m.title}"`,
          time: new Date().toISOString(),
          read: false,
          type: 'recording',
          navTarget: 'Recordings'
        });
        updated = true;
      }
    });
    
    if (updated) {
      const finalNotifications = nextNotifications.slice(0, 20);
      setNotifications(finalNotifications);
      localStorage.setItem('intellmeet_notifications', JSON.stringify(finalNotifications));
      localStorage.setItem('intellmeet_processed_rec', JSON.stringify(processedRecordings));
      localStorage.setItem('intellmeet_processed_meet', JSON.stringify(processedMeetings));
    }
  }, [meetings]);
  const fetchMeetings = async () => {
    try {
      const { data } = await axios.get('/api/meetings', { headers })
      setMeetings(data)
    } catch { toast.error('Failed to load meetings') }
    finally { setLoading(false) }
  }

  const createMeeting = async () => {
    if (!title.trim()) return toast.error('Enter a title')
    try {
      const { data } = await axios.post('/api/meetings', { 
        title, 
        description,
        teamId: selectedTeamId || undefined
      }, { headers })
      toast.success('Meeting created!')
      setShowCreate(false)
      setTitle('')
      setDescription('')
      setSelectedTeamId('')
      navigate(`/meeting/${data._id}`)
    } catch { toast.error('Failed to create meeting') }
  }

  const joinMeeting = async () => {
    if (!joinCode.trim()) return toast.error('Enter a meeting code')
    try {
      const { data } = await axios.post(`/api/meetings/join/${joinCode.toUpperCase()}`, {}, { headers })
      navigate(`/meeting/${data._id}`)
    } catch { toast.error('Meeting not found') }
  }

  const scheduleMeeting = async () => {
    if (!scheduleForm.title.trim()) return toast.error('Enter a title')
    if (!scheduleForm.date) return toast.error('Pick a date')
    
    let hourNum = parseInt(schHour, 10)
    if (schPeriod === 'PM' && hourNum !== 12) hourNum += 12
    if (schPeriod === 'AM' && hourNum === 12) hourNum = 0
    
    const [year, month, day] = scheduleForm.date.split('-')
    const scheduledDateTime = new Date(year, month - 1, day, hourNum, parseInt(schMinute, 10))

    try {
      await axios.post('/api/meetings', {
        title: scheduleForm.title,
        description: `${scheduleForm.description} | Duration: ${scheduleForm.duration} mins`,
        scheduledTime: scheduledDateTime.toISOString(),
        teamId: selectedTeamId || undefined
      }, { headers })
      toast.success('Meeting scheduled!')
      setShowSchedule(false)
      setScheduleForm({ title: '', description: '', date: '', time: '', duration: '60' })
      setSchHour('12')
      setSchMinute('00')
      setSchPeriod('PM')
      setSelectedTeamId('')
      fetchMeetings()
    } catch { toast.error('Failed to schedule') }
  }

  const toggleDashboardActionItem = async (meetingId, itemIndex) => {
    const meeting = meetings.find(m => m._id === meetingId);
    if (!meeting) return;
    const item = meeting.actionItems[itemIndex];
    const confirmToggle = window.confirm(
      item.completed 
        ? `Mark task "${item.task}" as incomplete?` 
        : `Mark task "${item.task}" as completed?`
    );
    if (!confirmToggle) return;

    const updatedActionItems = meeting.actionItems.map((act, idx) => 
      idx === itemIndex ? { ...act, completed: !act.completed } : act
    );

    try {
      await axios.patch(`/api/meetings/${meetingId}/action-items`, { actionItems: updatedActionItems }, { headers });
      setMeetings(prev => prev.map(m => m._id === meetingId ? { ...m, actionItems: updatedActionItems } : m));
      toast.success('Action item status updated!');
    } catch (err) {
      console.error('Failed to update action item:', err);
      toast.error(`Failed to update action item status: ${err.response?.data?.message || err.message}`);
    }
  }

  const handleLogout = () => { logout(); navigate('/login') }

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const totalActionItems = meetings.reduce((a, m) => a + (m.actionItems?.length || 0), 0)
  const unreadActionItems = Math.max(0, totalActionItems - seenActionItemCount)
  const completedActionItems = meetings.reduce((a, m) => a + (m.actionItems?.filter(i => i.completed)?.length || 0), 0)
  const activeMeetings = meetings.filter(m => m.status === 'active').length
  const endedMeetings = meetings.filter(m => m.status === 'ended')
  const totalTime = meetings.reduce((acc, m) => {
    if (m.startTime && m.endTime) {
      const diff = Math.floor((new Date(m.endTime) - new Date(m.startTime)) / 60000);
      return acc + (diff > 0 ? diff : 0);
    }
    return acc;
  }, 0)
  const meetingsWithSummary = meetings.filter(m => m.summary).length
  const efficiencyScore = meetings.length > 0 ? Math.round((meetingsWithSummary / meetings.length) * 100) : 0
  const actionCompletionRate = totalActionItems > 0 ? Math.round((completedActionItems / totalActionItems) * 100) : 0
  const engagementScore = Math.min(100, meetings.length * 15 + meetingsWithSummary * 10)

  const filteredMeetings = meetings.filter(m =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.meetingCode?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Active view content
  const renderMainContent = () => {
    switch (activeNav) {
      case 'Action Items': {
        const meetingsWithActions = meetings.filter(m => m.actionItems && m.actionItems.length > 0);
        const sortedActionMeetings = [...meetingsWithActions].sort((a, b) => {
          const aPinned = pinnedActionMeetings.includes(a._id) ? 1 : 0;
          const bPinned = pinnedActionMeetings.includes(b._id) ? 1 : 0;
          return bPinned - aPinned;
        });

        return (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, display:'flex', alignItems:'center', gap:8, fontFamily:'Outfit,sans-serif' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Action Items
            </h2>
            {sortedActionMeetings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ display:'flex', justifyContent:'center', marginBottom: 12, opacity:0.4 }}><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                <p style={{ fontSize: 16 }}>No action items yet!</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Action items are generated after AI Summary in meetings.</p>
              </div>
            ) : sortedActionMeetings.map(m => (
              <div key={m._id} style={{ marginBottom: 20, background: pinnedActionMeetings.includes(m._id) ? 'rgba(99,102,241,0.03)' : 'transparent', border: pinnedActionMeetings.includes(m._id) ? '1px dashed rgba(99,102,241,0.25)' : 'none', padding: pinnedActionMeetings.includes(m._id) ? '16px' : '0', borderRadius: pinnedActionMeetings.includes(m._id) ? '14px' : '0' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#818cf8', marginBottom: 10, display:'flex', alignItems:'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {pinnedActionMeetings.includes(m._id) && <span style={{ color: '#818cf8', fontSize: 13 }} title="Pinned Action Items">📌</span>}
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                    {m.title}
                  </div>
                  <button onClick={() => togglePinActions(m._id)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }} title={pinnedActionMeetings.includes(m._id) ? "Unpin Action Items" : "Pin Action Items"}>
                    {pinnedActionMeetings.includes(m._id) ? '📌 Pinned' : '📍 Pin'}
                  </button>
                </div>
                {m.actionItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, marginBottom: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div 
                      onClick={() => toggleDashboardActionItem(m._id, i)}
                      style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${item.completed ? '#10b981' : '#6366f1'}`, background: item.completed ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, cursor: 'pointer' }}
                    >
                      {item.completed && '✓'}
                    </div>
                    <div onClick={() => toggleDashboardActionItem(m._id, i)} style={{ flex: 1, cursor: 'pointer' }}>
                      <div style={{ fontSize: 14, textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'rgba(255,255,255,0.4)' : 'white' }}>{item.task}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>→ {item.assignee}</div>
                    </div>
                    <span 
                      onClick={() => toggleDashboardActionItem(m._id, i)}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: item.completed ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)', color: item.completed ? '#10b981' : '#818cf8', cursor: 'pointer' }}
                    >
                      {item.completed ? 'Done' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      }
 
      case 'Recordings': {
        const recordedMeetings = meetings.filter(m => m.recording && m.recording.trim() !== '');
        const sortedRecordings = [...recordedMeetings].sort((a, b) => {
          const aPinned = pinnedRecordings.includes(a._id) ? 1 : 0;
          const bPinned = pinnedRecordings.includes(b._id) ? 1 : 0;
          return bPinned - aPinned;
        });

        return (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, display:'flex', alignItems:'center', gap:8, fontFamily:'Outfit,sans-serif' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
              Recordings
              <span style={{ fontSize: 12, background: 'rgba(99,102,241,0.2)', color: '#818cf8', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{recordedMeetings.length}</span>
            </h2>
            {sortedRecordings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ display:'flex', justifyContent:'center', marginBottom: 12, opacity:0.4 }}><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg></div>
                <p style={{ fontSize: 16 }}>No recordings yet</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>End a meeting with recording enabled to see it here.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                {sortedRecordings.map(m => (
                  <div key={m._id} style={{ background: 'rgba(255,255,255,0.04)', border: pinnedRecordings.includes(m._id) ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: pinnedRecordings.includes(m._id) ? '0 4px 20px rgba(99,102,241,0.1)' : 'none' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.3 }}>
                          {pinnedRecordings.includes(m._id) && <span style={{ color: '#818cf8' }} title="Pinned Recording">📌</span>}
                          {m.title}
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => togglePinRecording(m._id)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 11 }} title={pinnedRecordings.includes(m._id) ? 'Unpin' : 'Pin'}>
                            {pinnedRecordings.includes(m._id) ? '📌' : '📍'}
                          </button>
                          <button onClick={() => handleDeleteRecording(m._id)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 11 }} title="Delete Recording">
                            🗑️
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
                        {m.endTime ? new Date(m.endTime).toLocaleDateString([], { dateStyle: 'medium' }) : 'Unknown date'}
                        {m.startTime && m.endTime && ` • ${Math.floor((new Date(m.endTime) - new Date(m.startTime)) / 60000)} min`}
                      </div>
                    </div>
                    
                    {/* Video Poster Play Area */}
                    <div 
                      onClick={() => setActiveVideo({ id: m._id, url: m.recording, title: m.title })}
                      style={{ height: 160, background: 'linear-gradient(135deg, #0f162a, #1e293b)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(99,102,241,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'white', transition: 'transform 0.2s', boxShadow: '0 4px 12px rgba(99,102,241,0.4)', zIndex: 2 }}>
                        ▶
                      </div>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8, zIndex: 2 }}>Watch in theater mode</span>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button 
                        onClick={() => {
                          const shareUrl = `${window.location.origin}/share/recording/${m._id}`;
                          navigator.clipboard.writeText(shareUrl);
                          toast.success('Share link copied to clipboard!');
                        }}
                        style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'all 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.25)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.15)'}
                      >
                        🔗 Share Video
                      </button>
                      <a href={m.recording} download target="_blank" rel="noreferrer"
                        style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', cursor: 'pointer', fontSize: 11, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'all 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.25)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                      >
                        ⬇ Download Video
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      case 'Analytics': {
        const analyticsIcons = [
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>,
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>,
        ]
        return (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, display:'flex', alignItems:'center', gap:8, fontFamily:'Outfit,sans-serif' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
              Analytics
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'Total Meetings', value: meetings.length, color: '#6366f1' },
                { label: 'Ended Meetings', value: endedMeetings.length, color: '#10b981' },
                { label: 'Action Items', value: totalActionItems, color: '#f59e0b' },
                { label: 'AI Summaries', value: meetingsWithSummary, color: '#8b5cf6' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px' }}>
                  <div style={{ marginBottom: 8, color: s.color }}>{analyticsIcons[i]}</div>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Performance Metrics</h3>
              {[
                { label: 'Meeting Efficiency', value: efficiencyScore, color: '#6366f1' },
                { label: 'Action Completion Rate', value: actionCompletionRate, color: '#10b981' },
                { label: 'Engagement Score', value: engagementScore, color: '#f59e0b' },
              ].map((m, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{m.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.value}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${m.value}%`, background: m.color, borderRadius: 3, transition: 'width 1s ease' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'Settings':
        return (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, display:'flex', alignItems:'center', gap:8, fontFamily:'Outfit,sans-serif' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Settings
            </h2>
            
            {/* Account Settings Section */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display:'flex', alignItems:'center', gap:6 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Account Settings
              </div>
              
              <div onClick={() => { setActiveProfileField('name'); setProfileEditVal(user?.name || ''); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                <div>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'block' }}>Profile Name</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{user?.name}</span>
                </div>
                <span style={{ color: '#818cf8', fontSize: 13, fontWeight: 600 }}>Edit ›</span>
              </div>

              <div onClick={() => { setActiveProfileField('avatar'); setProfileEditVal(user?.avatar || ''); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                <div>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'block' }}>Profile Picture</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{user?.avatar ? 'Custom image set' : 'Default avatar'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {user?.avatar ? (
                    <img src={user.avatar} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }} alt="avatar" />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                      {user?.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <span style={{ color: '#818cf8', fontSize: 13, fontWeight: 600 }}>Edit ›</span>
                </div>
              </div>

              <div onClick={() => { setActiveProfileField('email'); setProfileEditVal(user?.email || ''); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                <div>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'block' }}>Email Address</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{user?.email}</span>
                </div>
                <span style={{ color: '#818cf8', fontSize: 13, fontWeight: 600 }}>Edit ›</span>
              </div>

              <div onClick={() => { setActiveProfileField('password'); setProfileEditVal(''); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', cursor: 'pointer' }}>
                <div>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'block' }}>Password</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>••••••••••••</span>
                </div>
                <span style={{ color: '#818cf8', fontSize: 13, fontWeight: 600 }}>Change ›</span>
              </div>
            </div>

            {/* Meetings Section */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display:'flex', alignItems:'center', gap:6 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                Meeting Settings
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Default duration</span>
                <select 
                  style={{ background: '#0a0f1e', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }} 
                  value={settingsState.defaultDuration} 
                  onChange={e => {
                    setSettingsState({...settingsState, defaultDuration: e.target.value});
                    toast.success(`Default duration set to ${e.target.value} mins`);
                  }}
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">1 hour</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Auto-record meetings</span>
                <input 
                  type="checkbox" 
                  checked={settingsState.autoRecord} 
                  onChange={e => {
                    setSettingsState({...settingsState, autoRecord: e.target.checked});
                    toast.success(e.target.checked ? 'Auto-recording enabled' : 'Auto-recording disabled');
                  }} 
                  style={{ width: 16, height: 16, accentColor: '#4f46e5', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>AI Summary Permission</span>
                <input 
                  type="checkbox" 
                  checked={settingsState.aiSummary} 
                  onChange={e => {
                    setSettingsState({...settingsState, aiSummary: e.target.checked});
                    toast.success(e.target.checked ? 'AI Summarization enabled' : 'AI Summarization disabled');
                  }} 
                  style={{ width: 16, height: 16, accentColor: '#4f46e5', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Notifications Section */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display:'flex', alignItems:'center', gap:6 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                Notifications
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Email alerts</span>
                <input 
                  type="checkbox" 
                  checked={settingsState.emailAlerts} 
                  onChange={e => {
                    setSettingsState({...settingsState, emailAlerts: e.target.checked});
                    toast.success(e.target.checked ? 'Email alerts enabled' : 'Email alerts disabled');
                  }} 
                  style={{ width: 16, height: 16, accentColor: '#4f46e5', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Meeting reminders</span>
                <input 
                  type="checkbox" 
                  checked={settingsState.meetingReminders} 
                  onChange={e => {
                    setSettingsState({...settingsState, meetingReminders: e.target.checked});
                    toast.success(e.target.checked ? 'Reminders enabled' : 'Reminders disabled');
                  }} 
                  style={{ width: 16, height: 16, accentColor: '#4f46e5', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Action item updates</span>
                <input 
                  type="checkbox" 
                  checked={settingsState.actionItemUpdates} 
                  onChange={e => {
                    setSettingsState({...settingsState, actionItemUpdates: e.target.checked});
                    toast.success(e.target.checked ? 'Action item notifications enabled' : 'Action item notifications disabled');
                  }} 
                  style={{ width: 16, height: 16, accentColor: '#4f46e5', cursor: 'pointer' }}
                />
              </div>
            </div>

            <button onClick={() => setShowLogoutConfirm(true)} style={{ width: '100%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '12px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              Sign Out
            </button>
          </div>
        )

      default: // Dashboard
        return (
          <>
            {/* Stats */}
            <div className="stat-cards-container" style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
              {[
                { icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>, value: meetings.length, label: 'Total Meetings', sub: `${activeMeetings} active now`, subColor: '#10b981', iconBg: '#1e3a5f' },
                { icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>, value: totalActionItems, label: 'Action Items', sub: totalActionItems === 0 ? 'All caught up!' : `${completedActionItems} completed`, subColor: '#10b981', iconBg: '#1a3a2a' },
                { icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, value: activeMeetings, label: 'Active Meetings', sub: activeMeetings > 0 ? 'Live right now' : 'None active', subColor: '#f59e0b', iconBg: '#2a1f3a' },
                { icon: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, value: totalTime < 60 ? `${totalTime}m` : `${Math.floor(totalTime / 60)}h ${totalTime % 60}m`, label: 'Total Meeting Time', sub: `${endedMeetings.length} completed`, subColor: '#6366f1', iconBg: '#1a2a3a' },
              ].map((s, i) => (
                <div key={i} className="stat-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 48, height: 48, background: s.iconBg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>{s.icon}</div>
                    <div>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800 }}>{s.value}</div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{s.label}</div>
                      <div style={{ color: s.subColor, fontSize: 12, marginTop: 2 }}>{s.sub}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Meetings */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Outfit, sans-serif' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                      Your Meetings
                    </h2>
                    <span style={{ color: '#6366f1', fontSize: 13, cursor: 'pointer' }} onClick={() => setShowCreate(true)}>+ New Meeting →</span>
                  </div>
                  {loading ? (
                    <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>Loading...</p>
                  ) : filteredMeetings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.3)' }}>
                      <div style={{ color: 'rgba(255,255,255,0.2)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                      </div>
                      <p>{searchQuery ? 'No meetings match your search' : 'No meetings yet. Create your first one!'}</p>
                      {!searchQuery && (
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
                          <button className="join-btn" onClick={() => setShowCreate(true)}>+ New Meeting</button>
                          <button className="view-btn" onClick={() => setShowJoin(true)}>
                             <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                             Join Meeting
                          </button>
                        </div>
                      )}
                    </div>
                  ) : filteredMeetings.map((m, i) => {
                    const isScheduled = m.status === 'scheduled';
                    const scheduledTimeObj = m.scheduledTime ? new Date(m.scheduledTime) : null;
                    const isJoinable = !isScheduled || (scheduledTimeObj && (nowTime >= scheduledTimeObj - 15 * 60 * 1000));
                    
                    return (
                      <div key={m._id} className="meeting-row" onClick={() => {
                        if (isScheduled && !isJoinable) {
                          toast.error(`Meeting starts at ${scheduledTimeObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`);
                        } else {
                          navigate(`/meeting/${m._id}`);
                        }
                      }}>
                        <div style={{ width: 40, height: 40, background: `hsl(${i * 50}, 50%, 20%)`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `hsl(${i * 50}, 80%, 75%)`, flexShrink: 0 }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>
                            {isScheduled ? (
                              <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> Scheduled: {scheduledTimeObj.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                            ) : (
                              <span>Hosted by {m.host?.name || user?.name}</span>
                            )}
                            {' • Code: '}<span style={{ color: '#6366f1', fontFamily: 'monospace' }}>{m.meetingCode}</span>
                            {' • '}<span 
                              onClick={(e) => {
                                e.stopPropagation();
                                const link = `${window.location.origin}/meeting/${m._id}`;
                                navigator.clipboard.writeText(link);
                                toast.success('Meeting link copied to clipboard!');
                              }}
                              style={{ color: '#818cf8', cursor: 'pointer', textDecoration: 'underline' }}
                              title="Copy shareable link"
                            >
                              Copy Link
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', marginRight: 12, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: m.status === 'active' ? 'rgba(16,185,129,0.2)' : isScheduled ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.08)', color: m.status === 'active' ? '#10b981' : isScheduled ? '#818cf8' : 'rgba(255,255,255,0.4)' }}>
                            {m.status}
                          </span>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                            {m.status === 'ended' && m.startTime && m.endTime ? (() => {
                              const mins = Math.floor((new Date(m.endTime) - new Date(m.startTime)) / 60000)
                              if (mins <= 0) return new Date(m.createdAt).toLocaleDateString()
                              return mins < 60 ? `${mins}m duration` : `${Math.floor(mins/60)}h ${mins%60}m duration`
                            })() : m.status === 'active' && m.startTime ? (() => {
                              const mins = Math.floor((nowTime - new Date(m.startTime)) / 60000)
                              return <span style={{ color: '#10b981' }}>{mins <= 0 ? 'Just started' : `${mins}m live`}</span>
                            })() : isScheduled && scheduledTimeObj ? (
                              scheduledTimeObj.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + scheduledTimeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            ) : new Date(m.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        {m.status === 'active' || (isScheduled && isJoinable) ? (
                          <button className="join-btn" onClick={e => { e.stopPropagation(); navigate(`/meeting/${m._id}`) }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                            Join
                          </button>
                        ) : isScheduled ? (
                          <button className="view-btn" style={{ opacity: 0.6, cursor: 'not-allowed' }} disabled onClick={e => { e.stopPropagation(); toast.error(`Starts at ${scheduledTimeObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`) }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            Scheduled
                          </button>
                        ) : (
                          <button className="view-btn" onClick={e => { e.stopPropagation(); navigate(`/meeting/${m._id}`) }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            View
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* AI Insights */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Outfit, sans-serif' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                      AI Insights
                    </h2>
                    <span style={{ fontSize: 11, background: 'rgba(99,102,241,0.2)', color: '#818cf8', padding: '3px 8px', borderRadius: 6 }}>Based on your data</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 20 }}>
                    {meetings.length === 0 ? 'Create your first meeting to see insights!' : `Based on your ${meetings.length} meeting${meetings.length > 1 ? 's' : ''}.`}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    {[
                      { label: 'Meeting Efficiency', value: `${efficiencyScore}%`, note: efficiencyScore >= 70 ? 'Great job! 🎉' : 'Add AI summaries', color: '#6366f1', width: efficiencyScore },
                      { label: 'Engagement Score', value: `${Math.min(engagementScore, 100)}%`, note: engagementScore >= 50 ? 'Very active! 🔥' : 'Keep meeting!', color: '#3b82f6', width: Math.min(engagementScore, 100) },
                      { label: 'Action Items Done', value: `${actionCompletionRate}%`, note: actionCompletionRate >= 70 ? 'Excellent! ✅' : totalActionItems === 0 ? 'No items yet' : 'Keep going!', color: '#10b981', width: actionCompletionRate },
                    ].map((stat, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px' }}>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 }}>{stat.label}</div>
                        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800 }}>{stat.value}</div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, margin: '10px 0 6px' }}>
                          <div style={{ height: '100%', width: `${stat.width}%`, background: stat.color, borderRadius: 2, transition: 'width 1s ease' }}></div>
                        </div>
                        <div style={{ color: stat.color, fontSize: 12 }}>{stat.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Quick Actions */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Outfit, sans-serif' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    Quick Actions
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>, label: 'Start New Meeting', sub: 'Instant video meeting', color: '#1e3a5f', onClick: () => setShowCreate(true) },
                      { icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>, label: 'Schedule Meeting', sub: 'Plan for later', color: '#1a3a2a', onClick: () => setShowSchedule(true) },
                      { icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>, label: 'Join with Code', sub: 'Enter meeting code', color: '#2a1f3a', onClick: () => setShowJoin(true) },
                    ].map((a, i) => (
                      <div key={i} onClick={a.onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: a.color, borderRadius: 12, cursor: 'pointer', transition: 'opacity 0.2s', border: '1px solid rgba(255,255,255,0.08)' }}
                        onMouseOver={e => e.currentTarget.style.opacity = '0.8'}
                        onMouseOut={e => e.currentTarget.style.opacity = '1'}>
                        <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>{a.icon}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{a.sub}</div>
                        </div>
                        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)' }}>›</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Activity */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Outfit, sans-serif' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M3 20v-8a2 2 0 0 1 2-2h6.98"/><path d="M9 22V12H3"/><path d="M17 2v20"/><path d="M17 22H9"/></svg>
                    Recent Activity
                  </h2>
                  {meetings.length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>No recent activity</p>
                  ) : meetings.slice(0, 5).map((m, i) => (
                    <div key={m._id} onClick={() => navigate(`/meeting/${m._id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer' }}>
                      <div style={{ width: 32, height: 32, background: ['#1a3a2a', '#1e3a5f', '#2a1f3a', '#3a2a1a', '#1a2a3a'][i % 5], borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                        {m.status === 'ended' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : m.status === 'active' ? (
                          <span style={{ width: 8, height: 8, background: '#ef4444', borderRadius: '50%', display: 'inline-block' }}></span>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{m.title}"</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{new Date(m.createdAt).toLocaleDateString()}</div>
                      </div>
                      <span style={{ fontSize: 11, color: m.status === 'active' ? '#10b981' : 'rgba(255,255,255,0.3)' }}>{m.status}</span>
                    </div>
                  ))}
                </div>

                {/* Upcoming Scheduled */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Outfit, sans-serif' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                      Scheduled
                    </h2>
                    <span onClick={() => setShowSchedule(true)} style={{ color: '#6366f1', fontSize: 12, cursor: 'pointer' }}>+ Schedule</span>
                  </div>
                  {meetings.filter(m => m.status === 'scheduled').length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.3)' }}>
                      <div style={{ color: 'rgba(255,255,255,0.2)', marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                      </div>
                      <p style={{ fontSize: 12 }}>No scheduled meetings</p>
                      <button onClick={() => setShowSchedule(true)} style={{ marginTop: 10, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'DM Sans' }}>
                        Schedule Now
                      </button>
                    </div>
                  ) : meetings.filter(m => m.status === 'scheduled').slice(0, 3).map((m, i) => {
                    const scheduledTimeObj = new Date(m.scheduledTime);
                    const isJoinable = nowTime >= scheduledTimeObj - 15 * 60 * 1000;
                    
                    return (
                      <div key={m._id} onClick={() => {
                        if (isJoinable) navigate(`/meeting/${m._id}`)
                        else toast.error(`Meeting starts at ${scheduledTimeObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`)
                      }} style={{ padding: '10px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer' }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{m.title}</div>
                        <div style={{ fontSize: 11, color: '#818cf8', marginTop: 2 }}>
                          {scheduledTimeObj.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0f1e', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'white' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 11px 16px; border-radius: 10px; cursor: pointer; transition: all 0.2s; color: rgba(255,255,255,0.5); font-size: 14px; font-weight: 500; }
        .nav-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); }
        .nav-item.active { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; }
        .stat-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px 24px; flex: 1; transition: all 0.2s; }
        .stat-card:hover { background: rgba(255,255,255,0.08); transform: translateY(-2px); }
        .meeting-row { display: flex; align-items: center; gap: 16px; padding: 14px 12px; border-radius: 12px; transition: background 0.2s; cursor: pointer; }
        .meeting-row:hover { background: rgba(255,255,255,0.04); }
        .join-btn { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; font-family: 'Plus Jakarta Sans', sans-serif; transition: all 0.2s; white-space: nowrap; }
        .join-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 15px rgba(79,70,229,0.4); }
        .view-btn { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; font-family: 'Plus Jakarta Sans', sans-serif; transition: all 0.2s; white-space: nowrap; }
        .view-btn:hover { background: rgba(255,255,255,0.12); }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(4px); }
        .modal { background: #0d1533; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 28px; width: 100%; max-width: 460px; }
        .modal-input { width: 100%; background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px 16px; color: white; font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif; outline: none; transition: border-color 0.2s; }
        .modal-input:focus { border-color: #4f46e5; }
        .modal-input::placeholder { color: rgba(255,255,255,0.3); }
        .primary-btn { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; border: none; padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans'; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; flex: 1; }
        .primary-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(79,70,229,0.4); }
        .secondary-btn { flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 12px; border-radius: 10px; cursor: pointer; font-family: 'Plus Jakarta Sans'; font-size: 14px; font-weight: 600; }
        .search-bar { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 16px 10px 40px; color: white; font-size: 14px; font-family: 'Plus Jakarta Sans'; outline: none; width: 260px; }
        .search-bar::placeholder { color: rgba(255,255,255,0.3); }
        .label { display: block; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.6); margin-bottom: 6px; }
        .logout-btn { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 10px; cursor: pointer; color: rgba(255,100,100,0.7); font-size: 14px; font-weight: 500; transition: all 0.2s; border: none; background: transparent; width: 100%; font-family: 'Plus Jakarta Sans'; }
        .logout-btn:hover { background: rgba(255,100,100,0.1); color: #f87171; }
        .sidebar-mobile {
          left: 0;
          transition: left 0.3s ease;
        }
        .main-content-mobile {
          margin-left: 240px;
          transition: margin-left 0.3s ease;
        }
        .stat-cards-container {
          display: flex;
          gap: 16px;
          margin-bottom: 28px;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 20px;
        }
        .dashboard-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .dashboard-topbar-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        @media (max-width: 768px) {
          .sidebar-mobile {
            left: -240px !important;
            box-shadow: 5px 0 15px rgba(0,0,0,0.5);
            background: #0d1533 !important;
          }
          .sidebar-mobile.open {
            left: 0 !important;
          }
          .main-content-mobile {
            margin-left: 0 !important;
          }
          .stat-cards-container {
            flex-direction: column !important;
          }
          .dashboard-grid {
            grid-template-columns: 1fr !important;
          }
          .menu-toggle {
            display: block !important;
          }
          .dashboard-topbar {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
            padding: 16px 20px !important;
          }
          .dashboard-topbar > div {
            width: 100% !important;
          }
          .dashboard-topbar-actions {
            width: 100% !important;
            justify-content: space-between !important;
          }
          .search-bar {
            width: 100% !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      {/* SIDEBAR OVERLAY FOR MOBILE */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9, backdropFilter: 'blur(2px)' }} 
        />
      )}

      {/* SIDEBAR */}
      <div className={`sidebar-mobile ${sidebarOpen ? 'open' : ''}`} style={{ width: 240, background: 'rgba(255,255,255,0.03)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: '24px 16px', position: 'fixed', height: '100vh', zIndex: 10, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32, paddingLeft: 8 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 800 }}>IntellMeet</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Smarter Meetings, Better Outcomes</div>
          </div>
        </div>

        <nav style={{ flex: 1 }}>
          {[
            { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, label: 'Dashboard' },
            { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>, label: 'Meetings', action: () => setShowCreate(true) },
            { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>, label: 'Calendar', action: () => setShowSchedule(true) },
            { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>, label: 'Action Items', badge: unreadActionItems },
            { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>, label: 'Recordings' },
            { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>, label: 'Analytics' },
            { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, label: 'Teams', action: () => navigate('/teams') },
            { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, label: 'Settings' },
          ].map((item, i) => (
            <div key={i}
              className={`nav-item ${activeNav === item.label ? 'active' : ''}`}
              style={{ marginBottom: 2 }}
              onClick={() => {
                if (item.action) {
                  item.action()
                } else {
                  setActiveNav(item.label)
                  // Clear notification badge when user opens Action Items
                  if (item.label === 'Action Items') {
                    setSeenActionItemCount(totalActionItems)
                    localStorage.setItem('intellmeet_seen_action_items', String(totalActionItems))
                  }
                }
                setSidebarOpen(false)
              }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
              <span style={{ marginLeft: 8 }}>{item.label}</span>
              {item.badge > 0 && <span style={{ marginLeft: 'auto', background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>{item.badge}</span>}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 12 }}>
          <button className="logout-btn" onClick={() => setShowLogoutConfirm(true)}>
            <svg style={{ marginRight: 8 }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            Logout
          </button>
          <div onClick={() => setShowProfileModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, cursor: 'pointer' }}>
            {user?.avatar ? (
              <img src={user.avatar} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }} alt="" />
            ) : (
              <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="main-content-mobile" style={{ marginLeft: 240, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <div className="dashboard-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,15,30,0.9)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button 
              className="menu-toggle" 
              onClick={() => setSidebarOpen(true)}
              style={{ display: 'none', background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4, marginRight: 4 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800 }}>{getGreeting()}, {user?.name?.split(' ')[0]}!</h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>Here's what's happening with your meetings today.</p>
            </div>
          </div>
          <div className="dashboard-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', display:'flex', alignItems:'center' }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg></span>
              <input className="search-bar" placeholder="Search meetings..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            
            <div style={{ position: 'relative' }}>
              <div 
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.06)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', color: showNotifications ? 'white' : 'rgba(255,255,255,0.6)', transition: 'all 0.2s' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {notifications.some(n => !n.read) && (
                  <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '1.5px solid #0a0f1e' }}></div>
                )}
              </div>

              {showNotifications && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 998, cursor: 'default' }} onClick={() => setShowNotifications(false)} />
              )}

              {showNotifications && (
                <div 
                  style={{ 
                    position: 'absolute', 
                    top: 50, 
                    right: 0, 
                    width: 320, 
                    background: 'rgba(15, 23, 42, 0.95)', 
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)', 
                    borderRadius: 16, 
                    padding: 16, 
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)', 
                    zIndex: 999 
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>Notifications</span>
                    {notifications.some(n => !n.read) && (
                      <button 
                        onClick={() => {
                          const updated = notifications.map(n => ({ ...n, read: true }));
                          setNotifications(updated);
                          localStorage.setItem('intellmeet_notifications', JSON.stringify(updated));
                          toast.success('All marked as read');
                        }}
                        style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {notifications.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div 
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          style={{ 
                            display: 'flex', 
                            gap: 10, 
                            padding: '10px 12px', 
                            borderRadius: 10, 
                            background: n.read ? 'transparent' : 'rgba(99, 102, 241, 0.08)',
                            border: n.read ? '1px solid transparent' : '1px solid rgba(99, 102, 241, 0.15)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            position: 'relative'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = n.read ? 'rgba(255,255,255,0.03)' : 'rgba(99, 102, 241, 0.12)'}
                          onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(99, 102, 241, 0.08)'}
                        >
                          <div style={{ fontSize: 16, marginTop: 1 }}>
                            {n.type === 'recording' ? '🎥' : n.type === 'meeting' ? '📅' : '🔔'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: 'white', fontWeight: n.read ? 400 : 600, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {n.text}
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                              {new Date(n.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          {!n.read && (
                            <div style={{ width: 6, height: 6, background: '#6366f1', borderRadius: '50%', alignSelf: 'center' }}></div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'center' }}>
                      <button 
                        onClick={() => {
                          setNotifications([]);
                          localStorage.setItem('intellmeet_notifications', JSON.stringify([]));
                          toast.success('Notifications cleared');
                        }}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer', width: '100%', fontWeight: 600 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div onClick={() => setShowProfileModal(true)} style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15, fontWeight: 700, overflow: 'hidden' }}>
              {user?.avatar ? (
                <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              ) : (
                user?.name?.[0]?.toUpperCase()
              )}
            </div>
            <button className="join-btn" onClick={() => setShowCreate(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
              New Meeting
            </button>
            <button className="view-btn" onClick={() => setShowJoin(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Join Meeting
            </button>
          </div>
        </div>

        <div style={{ padding: '28px 32px', overflowY: 'auto', flex: 1 }}>
          {renderMainContent()}
        </div>
      </div>

      {/* MODALS */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Outfit, sans-serif' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
              Create New Meeting
            </h2>
            <label className="label">Meeting Title *</label>
            <input className="modal-input" placeholder="e.g. Weekly Team Standup" value={title} onChange={e => setTitle(e.target.value)} style={{ marginBottom: 12 }} />
            <label className="label">Description</label>
            <textarea className="modal-input" placeholder="What's this meeting about?" value={description} onChange={e => setDescription(e.target.value)} style={{ height: 80, resize: 'none', marginBottom: 12 }} />
            <label className="label">Associate Team (optional)</label>
            <select className="modal-input" value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)} style={{ marginBottom: 20, colorScheme: 'dark' }}>
              <option value="">Personal / No Team</option>
              {teams.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary-btn" onClick={createMeeting}>Create & Join</button>
              <button className="secondary-btn" onClick={() => { setShowCreate(false); setSelectedTeamId(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showJoin && (
        <div className="modal-overlay" onClick={() => setShowJoin(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Outfit, sans-serif' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>
              Join a Meeting
            </h2>
            <label className="label">Meeting Code</label>
            <input className="modal-input" placeholder="Enter code (e.g. ABC123)" value={joinCode} onChange={e => setJoinCode(e.target.value)} style={{ marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary-btn" onClick={joinMeeting}>Join Meeting</button>
              <button className="secondary-btn" onClick={() => setShowJoin(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showSchedule && (
        <div className="modal-overlay" onClick={() => setShowSchedule(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Outfit, sans-serif' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              Schedule a Meeting
            </h2>
            <label className="label">Title *</label>
            <input className="modal-input" placeholder="e.g. Product Review" value={scheduleForm.title} onChange={e => setScheduleForm({...scheduleForm, title: e.target.value})} style={{ marginBottom: 12 }} />
            <label className="label">Description</label>
            <textarea className="modal-input" placeholder="Agenda..." value={scheduleForm.description} onChange={e => setScheduleForm({...scheduleForm, description: e.target.value})} style={{ height: 64, resize: 'none', marginBottom: 12 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="label">Date *</label>
                <input type="date" className="modal-input" value={scheduleForm.date} onChange={e => setScheduleForm({...scheduleForm, date: e.target.value})} style={{ colorScheme: 'dark', padding: '12px 6px' }} />
              </div>
              <div>
                <label className="label">Hour *</label>
                <select className="modal-input" value={schHour} onChange={e => setSchHour(e.target.value)} style={{ colorScheme: 'dark', padding: '12px 6px' }}>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Min *</label>
                <select className="modal-input" value={schMinute} onChange={e => setSchMinute(e.target.value)} style={{ colorScheme: 'dark', padding: '12px 6px' }}>
                  {Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">AM/PM *</label>
                <select className="modal-input" value={schPeriod} onChange={e => setSchPeriod(e.target.value)} style={{ colorScheme: 'dark', padding: '12px 6px' }}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
            <label className="label">Duration</label>
            <select className="modal-input" value={scheduleForm.duration} onChange={e => setScheduleForm({...scheduleForm, duration: e.target.value})} style={{ marginBottom: 12, colorScheme: 'dark' }}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
            <label className="label">Associate Team (optional)</label>
            <select className="modal-input" value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)} style={{ marginBottom: 20, colorScheme: 'dark' }}>
              <option value="">Personal / No Team</option>
              {teams.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary-btn" onClick={scheduleMeeting}>Schedule</button>
              <button className="secondary-btn" onClick={() => { setShowSchedule(false); setSelectedTeamId(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* PROFILE DETAIL MODAL */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowProfileModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            
            {user?.avatar ? (
              <img src={user.avatar} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)', margin: '0 auto 16px', display: 'block' }} alt="" />
            ) : (
              <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 800, margin: '0 auto 16px' }}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
            )}
            
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{user?.name}</h2>
            <p style={{ color: '#818cf8', fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{user?.email}</p>
            
            {/* Direct Edit Button */}
            <button 
              onClick={() => {
                setShowProfileModal(false);
                setActiveProfileField('avatar');
                setProfileEditVal(user?.avatar || '');
              }}
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 20, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
            >
              📷 Edit Profile Picture
            </button>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px', textAlign: 'left', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Role</span>
                <span style={{ fontWeight: 600 }}>{user?.role || 'Member'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Organization</span>
                <span style={{ fontWeight: 600 }}>IntellMeet Org</span>
              </div>
            </div>
            
            <button className="primary-btn" onClick={() => setShowProfileModal(false)} style={{ width: '100%' }}>Close Profile</button>
          </div>
        </div>
      )}

      {/* LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px', textAlign: 'center' }}>
            <div style={{ color: '#ef4444', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, fontFamily: 'Outfit, sans-serif' }}>Confirm Sign Out</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24 }}>Are you sure you want to sign out of IntellMeet?</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary-btn" onClick={handleLogout} style={{ background: '#ef4444', fontFamily: 'Plus Jakarta Sans' }}>Yes, Sign Out</button>
              <button className="secondary-btn" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT FIELD EDIT OVERLAY */}
      {activeProfileField && (
        <div className="modal-overlay" onClick={() => { setActiveProfileField(null); setProfileEditVal(''); setCurrentPasswordVal(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              Update {activeProfileField === 'name' ? 'Name' : activeProfileField === 'email' ? 'Email' : activeProfileField === 'avatar' ? 'Profile Picture' : 'Password'}
            </h2>
            {activeProfileField === 'password' ? (
              <>
                <label className="label">Current Password</label>
                <input 
                  type="password"
                  className="modal-input" 
                  value={currentPasswordVal} 
                  onChange={e => setCurrentPasswordVal(e.target.value)} 
                  placeholder="Enter current password"
                  style={{ marginBottom: 12 }} 
                />
                <label className="label">New Password</label>
                <input 
                  type="password"
                  className="modal-input" 
                  value={profileEditVal} 
                  onChange={e => setProfileEditVal(e.target.value)} 
                  placeholder="Enter new password (min 6 chars)"
                  style={{ marginBottom: 20 }} 
                />
              </>
            ) : activeProfileField === 'avatar' ? (
              <>
                <label className="label">Paste Image URL</label>
                <input 
                  type="text"
                  className="modal-input" 
                  value={profileEditVal} 
                  onChange={e => setProfileEditVal(e.target.value)} 
                  placeholder="https://example.com/avatar.jpg"
                  style={{ marginBottom: 12 }} 
                />
                
                <div style={{ textAlign: 'center', margin: '4px 0 12px', color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 600 }}>— OR —</div>
                
                <label className="label">Upload Image File</label>
                <input 
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const uploadToast = toast.loading('Uploading profile picture...');
                    try {
                      const formData = new FormData();
                      formData.append('avatar', file);
                      
                      const response = await axios.post('/api/auth/profile/avatar', formData, {
                        headers: {
                          ...headers,
                          'Content-Type': 'multipart/form-data'
                        }
                      });
                      
                      setAuth(response.data.user, token, refreshToken);
                      toast.success('Profile picture updated successfully!', { id: uploadToast });
                      setActiveProfileField(null);
                      setProfileEditVal('');
                    } catch (uploadErr) {
                      console.error('Avatar upload failed:', uploadErr);
                      const errMsg = uploadErr.response?.data?.message || 'Upload failed.';
                      toast.error(`Upload failed: ${errMsg}`, { id: uploadToast });
                    }
                  }}
                  style={{ 
                    display: 'block', 
                    width: '100%', 
                    padding: '8px 12px', 
                    background: 'rgba(255,255,255,0.05)', 
                    border: '1px dashed rgba(255,255,255,0.15)', 
                    borderRadius: 8, 
                    color: 'rgba(255,255,255,0.8)', 
                    fontSize: 12, 
                    cursor: 'pointer',
                    marginBottom: 20
                  }}
                />
              </>
            ) : (
              <>
                <label className="label">
                  New {activeProfileField === 'name' ? 'Name' : 'Email'}
                </label>
                <input 
                  type="text"
                  className="modal-input" 
                  value={profileEditVal} 
                  onChange={e => setProfileEditVal(e.target.value)} 
                  placeholder={`Enter new ${activeProfileField}`}
                  style={{ marginBottom: 20 }} 
                />
              </>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              {activeProfileField !== 'avatar' || profileEditVal.trim() !== '' ? (
                <button 
                  className="primary-btn" 
                  onClick={async () => {
                    if (!profileEditVal.trim()) return toast.error('Value cannot be empty');
                    const updateToast = toast.loading('Saving changes...');
                    try {
                      if (activeProfileField === 'password') {
                        if (!currentPasswordVal.trim()) {
                          toast.error('Current password is required', { id: updateToast });
                          return;
                        }
                        await axios.patch('/api/auth/change-password', {
                          currentPassword: currentPasswordVal,
                          newPassword: profileEditVal
                        }, { headers });
                        toast.success('Password changed successfully!', { id: updateToast });
                      } else {
                        const payload = {};
                        if (activeProfileField === 'name') payload.name = profileEditVal.trim();
                        if (activeProfileField === 'email') payload.email = profileEditVal.trim();
                        if (activeProfileField === 'avatar') payload.avatar = profileEditVal.trim();
                        
                        const { data } = await axios.patch('/api/auth/profile', payload, { headers });
                        setAuth(data.user, token, refreshToken);
                        toast.success('Profile updated successfully!', { id: updateToast });
                      }
                      setActiveProfileField(null);
                      setProfileEditVal('');
                      setCurrentPasswordVal('');
                    } catch (err) {
                      console.error('Profile save error:', err);
                      const errMsg = err.response?.data?.message || 'Failed to save changes.';
                      toast.error(errMsg, { id: updateToast });
                    }
                  }}
                >
                  Save Changes
                </button>
              ) : null}
              <button className="secondary-btn" onClick={() => { setActiveProfileField(null); setProfileEditVal(''); setCurrentPasswordVal(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* THEATER VIDEO PLAYER OVERLAY */}
      {activeVideo && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(5, 5, 10, 0.95)', 
            backdropFilter: 'blur(8px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: 24, 
            zIndex: 9999 
          }} 
          onClick={() => setActiveVideo(null)}
        >
          <div 
            style={{ 
              width: '100%', 
              maxWidth: '960px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 16,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 20,
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }} 
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎥</span> Watching: {activeVideo.title}
              </h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button 
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/share/recording/${activeVideo.id}`;
                    navigator.clipboard.writeText(shareUrl);
                    toast.success('Share link copied to clipboard!');
                  }}
                  style={{ 
                    background: 'rgba(16, 185, 129, 0.15)', 
                    color: '#34d399', 
                    border: '1px solid rgba(16, 185, 129, 0.3)', 
                    padding: '8px 16px', 
                    borderRadius: 9, 
                    cursor: 'pointer', 
                    fontSize: 13, 
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'}
                >
                  🔗 Share Link
                </button>
                <a 
                  href={activeVideo.url} 
                  download 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ 
                    background: 'rgba(99, 102, 241, 0.15)', 
                    color: '#a5b4fc', 
                    border: '1px solid rgba(99, 102, 241, 0.3)', 
                    padding: '8px 16px', 
                    borderRadius: 9, 
                    cursor: 'pointer', 
                    fontSize: 13, 
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)'}
                >
                  ⬇ Download
                </a>
                <button 
                  onClick={() => setActiveVideo(null)}
                  style={{ 
                    background: 'rgba(255,255,255,0.06)', 
                    color: 'white', 
                    border: '1px solid rgba(255,255,255,0.12)', 
                    padding: '8px 16px', 
                    borderRadius: 9, 
                    cursor: 'pointer', 
                    fontSize: 13, 
                    fontWeight: 700,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                >
                  ✕ Go Back
                </button>
              </div>
            </div>
            
            <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <video 
                controls 
                autoPlay 
                style={{ width: '100%', display: 'block', maxHeight: '65vh' }} 
                src={activeVideo.url}
              >
                Your browser does not support video playback.
              </video>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}