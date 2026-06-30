import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { io } from 'socket.io-client'
import useAuthStore from '../store/authStore'
import TeammateProfileModal from '../components/TeammateProfileModal'

const PRIORITY_COLORS = {
  low:    { bg: 'rgba(16,185,129,0.15)',  text: '#10b981', label: 'Low'    },
  medium: { bg: 'rgba(99,102,241,0.15)',  text: '#818cf8', label: 'Medium' },
  high:   { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b', label: 'High'   },
  urgent: { bg: 'rgba(239,68,68,0.15)',   text: '#f87171', label: 'Urgent' },
}

const COLUMN_META = {
  todo:       { color: '#6366f1', gradient: 'linear-gradient(135deg,#6366f1,#4f46e5)' },
  inprogress: { color: '#f59e0b', gradient: 'linear-gradient(135deg,#f59e0b,#d97706)' },
  done:       { color: '#10b981', gradient: 'linear-gradient(135deg,#10b981,#059669)' },
}

export default function Teams() {
  const { user, token } = useAuthStore()
  const navigate = useNavigate()
  const headers = { Authorization: `Bearer ${token}` }
  const socketRef = useRef(null)

  // State
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [profileMember, setProfileMember] = useState(null)

  // Modals
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [showJoinTeam, setShowJoinTeam] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(null) // column id
  const [showInvite, setShowInvite] = useState(false)
  const [editingTask, setEditingTask] = useState(null)

  // Forms
  const [teamForm, setTeamForm] = useState({ name: '', description: '' })
  const [joinCode, setJoinCode] = useState('')
  const [projectForm, setProjectForm] = useState({ name: '', description: '' })
  const [taskForm, setTaskForm] = useState({ title: '', description: '', priority: 'medium', assignee: '', dueDate: '', labels: '' })

  // Drag state
  const [draggedTask, setDraggedTask] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)

  // ── Socket.io ──────────────────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(import.meta.env.VITE_API_URL || 'http://localhost:5000')
    return () => socketRef.current?.disconnect()
  }, [])

  useEffect(() => {
    if (!selectedProject || !socketRef.current) return
    const socket = socketRef.current
    const projectId = selectedProject._id

    socket.emit('join-project', projectId)

    socket.on('task-created', ({ task }) => {
      setTasks(prev => [...prev, task])
    })
    socket.on('task-moved', ({ taskId, column }) => {
      setTasks(prev => prev.map(t => t._id === taskId ? { ...t, column } : t))
    })
    socket.on('task-updated', ({ task }) => {
      setTasks(prev => prev.map(t => t._id === task._id ? task : t))
    })
    socket.on('task-deleted', ({ taskId }) => {
      setTasks(prev => prev.filter(t => t._id !== taskId))
    })

    return () => {
      socket.emit('leave-project', projectId)
      socket.off('task-created')
      socket.off('task-moved')
      socket.off('task-updated')
      socket.off('task-deleted')
    }
  }, [selectedProject])

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchTeams = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/teams', { headers })
      setTeams(data)
      if (data.length > 0 && !selectedTeam) setSelectedTeam(data[0])
    } catch { toast.error('Failed to load teams') }
  }, [token])

  const fetchProjects = useCallback(async (teamId) => {
    try {
      setLoading(true)
      const { data } = await axios.get(`/api/projects?teamId=${teamId}`, { headers })
      setProjects(data)
      setSelectedProject(data[0] || null)
    } catch { toast.error('Failed to load projects') }
    finally { setLoading(false) }
  }, [token])

  const fetchTasks = useCallback(async (projectId) => {
    try {
      const { data } = await axios.get(`/api/tasks?projectId=${projectId}`, { headers })
      setTasks(data)
    } catch { toast.error('Failed to load tasks') }
  }, [token])

  useEffect(() => { fetchTeams() }, [fetchTeams])
  useEffect(() => { if (selectedTeam) { fetchProjects(selectedTeam._id); setMembers(selectedTeam.members || []) } }, [selectedTeam])
  useEffect(() => { if (selectedProject) fetchTasks(selectedProject._id) }, [selectedProject])

  // ── Handlers ────────────────────────────────────────────────────────────
  const createTeam = async () => {
    if (!teamForm.name.trim()) return toast.error('Team name required')
    try {
      const { data } = await axios.post('/api/teams', teamForm, { headers })
      setTeams(prev => [data, ...prev])
      setSelectedTeam(data)
      setTeamForm({ name: '', description: '' })
      setShowCreateTeam(false)
      toast.success('Team created!')
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to create team') }
  }

  const joinTeam = async () => {
    if (!joinCode.trim()) return toast.error('Enter an invite code')
    try {
      const { data } = await axios.post(`/api/teams/join/${joinCode}`, {}, { headers })
      setTeams(prev => prev.find(t => t._id === data._id) ? prev : [data, ...prev])
      setSelectedTeam(data)
      setJoinCode('')
      setShowJoinTeam(false)
      toast.success('Joined team!')
    } catch (e) { toast.error(e.response?.data?.message || 'Invalid invite code') }
  }

  const startTeamCall = async () => {
    if (!selectedTeam) return
    try {
      const { data } = await axios.post('/api/meetings', { 
        title: `${selectedTeam.name} Sync`,
        description: `Active team video call for ${selectedTeam.name}`,
        teamId: selectedTeam._id
      }, { headers })
      toast.success('Team call started!')
      navigate(`/meeting/${data._id}`)
    } catch (e) {
      toast.error('Failed to start team call')
    }
  }

  const createProject = async () => {
    if (!projectForm.name.trim()) return toast.error('Project name required')
    try {
      const { data } = await axios.post('/api/projects', { ...projectForm, teamId: selectedTeam._id }, { headers })
      setProjects(prev => [data, ...prev])
      setSelectedProject(data)
      setProjectForm({ name: '', description: '' })
      setShowCreateProject(false)
      toast.success('Project created!')
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to create project') }
  }

  const createTask = async (column) => {
    if (!taskForm.title.trim()) return toast.error('Task title required')
    try {
      const payload = {
        title: taskForm.title,
        description: taskForm.description,
        projectId: selectedProject._id,
        column,
        priority: taskForm.priority,
        assignee: taskForm.assignee || undefined,
        dueDate: taskForm.dueDate || undefined,
        labels: taskForm.labels ? taskForm.labels.split(',').map(l => l.trim()).filter(Boolean) : [],
      }
      const { data } = await axios.post('/api/tasks', payload, { headers })
      setTasks(prev => [...prev, data])
      socketRef.current?.emit('task-created', { projectId: selectedProject._id, task: data })
      setTaskForm({ title: '', description: '', priority: 'medium', assignee: '', dueDate: '', labels: '' })
      setShowCreateTask(null)
      toast.success('Task created!')
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to create task') }
  }

  const moveTask = async (task, newColumn) => {
    if (task.column === newColumn) return
    const original = tasks
    setTasks(prev => prev.map(t => t._id === task._id ? { ...t, column: newColumn } : t))
    try {
      const { data } = await axios.patch(`/api/tasks/${task._id}`, { column: newColumn }, { headers })
      socketRef.current?.emit('task-moved', { projectId: selectedProject._id, taskId: task._id, column: newColumn, task: data })
    } catch {
      setTasks(original)
      toast.error('Failed to move task')
    }
  }

  const deleteTask = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return
    setTasks(prev => prev.filter(t => t._id !== task._id))
    try {
      await axios.delete(`/api/tasks/${task._id}`, { headers })
      socketRef.current?.emit('task-deleted', { projectId: selectedProject._id, taskId: task._id })
      toast.success('Task deleted')
    } catch { toast.error('Failed to delete task'); fetchTasks(selectedProject._id) }
  }

  const updateTask = async (task, updates) => {
    try {
      const { data } = await axios.patch(`/api/tasks/${task._id}`, updates, { headers })
      setTasks(prev => prev.map(t => t._id === task._id ? data : t))
      socketRef.current?.emit('task-updated', { projectId: selectedProject._id, task: data })
      setEditingTask(null)
      toast.success('Task updated!')
    } catch { toast.error('Failed to update task') }
  }

  // Drag handlers
  const onDragStart = (task) => setDraggedTask(task)
  const onDragOver = (e, colId) => { e.preventDefault(); setDragOverCol(colId) }
  const onDrop = (colId) => {
    if (draggedTask) { moveTask(draggedTask, colId); setDraggedTask(null); setDragOverCol(null) }
  }

  const getTasksByColumn = (colId) => tasks.filter(t => t.column === colId)

  // ── Styles ───────────────────────────────────────────────────────────────
  const S = {
    page: { display: 'flex', height: '100vh', background: '#0a0f1e', color: 'white', fontFamily: "'Plus Jakarta Sans', sans-serif", overflow: 'hidden' },
    sidebar: { width: 260, background: 'rgba(255,255,255,0.03)', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
    sidebarHeader: { padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
    sidebarTitle: { fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },
    teamItem: (active) => ({ padding: '10px 12px', borderRadius: 10, marginBottom: 4, cursor: 'pointer', background: active ? 'rgba(99,102,241,0.2)' : 'transparent', border: active ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 10 }),
    teamAvatar: (idx) => ({ width: 32, height: 32, borderRadius: 8, background: `hsl(${idx * 70},50%,25%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: `hsl(${idx * 70},80%,75%)`, flexShrink: 0 }),
    actionBtn: { padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, width: '100%', transition: 'all 0.15s' },
    mainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    topbar: { padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', flexShrink: 0 },
    kanban: { flex: 1, display: 'flex', gap: 20, padding: '20px 24px', overflowX: 'auto', overflowY: 'hidden' },
    column: (col, isDragOver) => ({ width: 300, minWidth: 300, display: 'flex', flexDirection: 'column', background: isDragOver ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.02)', borderRadius: 16, border: `1px solid ${isDragOver ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`, transition: 'all 0.15s', overflow: 'hidden' }),
    colHeader: { padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    colTitle: (col) => ({ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }),
    colDot: (col) => ({ width: 8, height: 8, borderRadius: '50%', background: COLUMN_META[col]?.color || '#6366f1' }),
    colCount: { fontSize: 11, padding: '2px 7px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' },
    taskList: { flex: 1, padding: '0 12px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
    taskCard: (dragging) => ({ background: dragging ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '12px 14px', cursor: 'grab', transition: 'all 0.15s', opacity: dragging ? 0.5 : 1 }),
    taskTitle: { fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 },
    badge: (bg, text) => ({ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: bg, color: text, fontWeight: 600 }),
    addTaskBtn: { margin: '0 12px 12px', padding: '8px', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
    modalBox: { background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '28px', width: 420, maxWidth: '90vw' },
    input: { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 },
    primaryBtn: { background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', color: 'white', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, width: '100%' },
    ghostBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 14, marginBottom: 8 },
    projectChip: (active) => ({ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: active ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'rgba(255,255,255,0.06)', border: active ? 'none' : '1px solid rgba(255,255,255,0.1)', color: active ? 'white' : 'rgba(255,255,255,0.6)', transition: 'all 0.15s' }),
  }

  const columns = selectedProject?.columns || [
    { id: 'todo', name: 'To Do' },
    { id: 'inprogress', name: 'In Progress' },
    { id: 'done', name: 'Done' },
  ]

  return (
    <div style={S.page}>
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
      {/* ── LEFT SIDEBAR ────────────────────────────────────────────── */}
      <div style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span onClick={() => navigate('/dashboard')} style={{ fontSize: 12, color: '#818cf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Dashboard
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Outfit, sans-serif', background: 'linear-gradient(135deg,#818cf8,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Teams
          </div>
        </div>

        {/* Team list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px' }}>
          <div style={S.sidebarTitle}>Your Teams</div>
          {teams.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: '20px 0' }}>
              No teams yet. Create or join one!
            </div>
          ) : teams.map((team, idx) => (
            <div key={team._id} style={S.teamItem(selectedTeam?._id === team._id)} onClick={() => setSelectedTeam(team)}>
              <div style={S.teamAvatar(idx)}>{team.name[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {team.name}
                  {team.activeMeeting && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 8px #ef4444', animation: 'pulse 1.5s infinite' }} title="Active Meeting!" />
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{team.members?.length || 0} members</div>
              </div>
            </div>
          ))}
        </div>

        {/* Teammates list of selected team */}
        {selectedTeam && (
          <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', flex: 1, overflowY: 'auto' }}>
            <div style={{ ...S.sidebarTitle, marginTop: 12 }}>Teammates</div>
            {members.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', padding: '10px 0' }}>No teammates.</div>
            ) : members.map((member, idx) => {
              const isOwner = selectedTeam.owner?._id === member._id || selectedTeam.owner === member._id;
              return (
                <div key={member._id} onClick={() => setProfileMember(member)} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)',
                  marginBottom: 6,
                  border: '1px solid rgba(255,255,255,0.04)',
                  transition: 'all 0.2s',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                }}
                >
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: `hsl(${idx * 50}, 50%, 30%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    overflow: 'hidden',
                  }}>
                    {member.avatar ? (
                      <img src={member.avatar} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        {member.name?.[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.name}
                    </div>
                    <div style={{ fontSize: 10, color: isOwner ? '#f59e0b' : 'rgba(255,255,255,0.4)', fontWeight: isOwner ? 600 : 400 }}>
                      {isOwner ? '👑 Owner' : 'Member'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sidebar actions */}
        <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button style={S.actionBtn} onClick={() => setShowCreateTeam(true)}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
            + Create Team
          </button>
          <button style={S.actionBtn} onClick={() => setShowJoinTeam(true)}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(16,185,129,0.1)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
            🔗 Join with Code
          </button>
        </div>
      </div>

      {/* ── MAIN AREA ───────────────────────────────────────────────── */}
      <div style={S.mainArea}>
        {/* Topbar */}
        <div style={S.topbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {selectedTeam ? (
              <>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Outfit,sans-serif' }}>{selectedTeam.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{selectedTeam.description || 'No description'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {projects.map(p => (
                    <button key={p._id} style={S.projectChip(selectedProject?._id === p._id)} onClick={() => setSelectedProject(p)}>
                      {p.name}
                    </button>
                  ))}
                  <button style={S.projectChip(false)} onClick={() => setShowCreateProject(true)}>+ Project</button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)' }}>Select or create a team to get started</div>
            )}
          </div>
          {selectedTeam && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Member avatars */}
              <div style={{ display: 'flex' }}>
                {members.slice(0, 5).map((m, i) => (
                  <div key={m._id} onClick={() => setProfileMember(m)} title={m.name} style={{ width: 30, height: 30, borderRadius: '50%', background: `hsl(${i * 50},50%,30%)`, border: '2px solid #0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, marginLeft: i > 0 ? -8 : 0, zIndex: members.length - i, cursor: 'pointer' }}>
                    {m.avatar ? <img src={m.avatar} alt={m.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : m.name[0]}
                  </div>
                ))}
                {members.length > 5 && <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '2px solid #0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, marginLeft: -8 }}>+{members.length - 5}</div>}
              </div>
              <button onClick={() => setShowInvite(true)} style={{ padding: '7px 14px', borderRadius: 9, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                + Invite
              </button>
              
              {selectedTeam.activeMeeting ? (
                <button onClick={() => navigate(`/meeting/${selectedTeam.activeMeeting._id}`)} style={{ padding: '7px 14px', borderRadius: 9, background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, animation: 'pulse 1.5s infinite' }}>
                  🔴 Join Call
                </button>
              ) : (
                <button onClick={startTeamCall} style={{ padding: '7px 14px', borderRadius: 9, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  📹 Start Call
                </button>
              )}
            </div>
          )}
        </div>

        {/* Kanban board */}
        {!selectedTeam ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'rgba(255,255,255,0.3)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <p style={{ fontSize: 16 }}>Create or join a team to start managing projects</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={{ padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 700 }} onClick={() => setShowCreateTeam(true)}>+ Create Team</button>
              <button style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', fontWeight: 600 }} onClick={() => setShowJoinTeam(true)}>🔗 Join Team</button>
            </div>
          </div>
        ) : !selectedProject ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'rgba(255,255,255,0.3)' }}>
            <p style={{ fontSize: 15 }}>No projects yet. Create your first project!</p>
            <button style={{ padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 700 }} onClick={() => setShowCreateProject(true)}>+ Create Project</button>
          </div>
        ) : (
          <div style={S.kanban}>
            {columns.map(col => {
              const colTasks = getTasksByColumn(col.id)
              const isDragOver = dragOverCol === col.id
              return (
                <div key={col.id} style={S.column(col.id, isDragOver)}
                  onDragOver={e => onDragOver(e, col.id)}
                  onDrop={() => onDrop(col.id)}
                  onDragLeave={() => setDragOverCol(null)}>
                  {/* Column header */}
                  <div style={S.colHeader}>
                    <div style={S.colTitle(col.id)}>
                      <div style={S.colDot(col.id)} />
                      <span style={{ fontSize: 13 }}>{col.name}</span>
                    </div>
                    <span style={S.colCount}>{colTasks.length}</span>
                  </div>
                  {/* Task cards */}
                  <div style={S.taskList}>
                    {colTasks.map(task => (
                      <TaskCard key={task._id} task={task} S={S}
                        onDragStart={() => onDragStart(task)}
                        onDragEnd={() => setDraggedTask(null)}
                        isDragging={draggedTask?._id === task._id}
                        onDelete={() => deleteTask(task)}
                        onEdit={() => setEditingTask(task)}
                      />
                    ))}
                  </div>
                  {/* Add task button */}
                  <button style={S.addTaskBtn} onClick={() => { setShowCreateTask(col.id); setTaskForm({ title: '', description: '', priority: 'medium', assignee: '', dueDate: '', labels: '' }) }}
                    onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'}
                    onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}>
                    + Add Task
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────── */}

      {/* Create Team */}
      {showCreateTeam && (
        <div style={S.modal} onClick={() => setShowCreateTeam(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, fontFamily: 'Outfit,sans-serif' }}>Create Team</h3>
            <input style={S.input} placeholder="Team name *" value={teamForm.name} onChange={e => setTeamForm({ ...teamForm, name: e.target.value })} />
            <textarea style={{ ...S.input, height: 80, resize: 'vertical' }} placeholder="Description (optional)" value={teamForm.description} onChange={e => setTeamForm({ ...teamForm, description: e.target.value })} />
            <button style={S.primaryBtn} onClick={createTeam}>Create Team</button>
            <button style={{ ...S.ghostBtn, marginTop: 8, width: '100%' }} onClick={() => setShowCreateTeam(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Join Team */}
      {showJoinTeam && (
        <div style={S.modal} onClick={() => setShowJoinTeam(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, fontFamily: 'Outfit,sans-serif' }}>Join a Team</h3>
            <input style={S.input} placeholder="Enter invite code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinTeam()} />
            <button style={S.primaryBtn} onClick={joinTeam}>Join Team</button>
            <button style={{ ...S.ghostBtn, marginTop: 8, width: '100%' }} onClick={() => setShowJoinTeam(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Create Project */}
      {showCreateProject && (
        <div style={S.modal} onClick={() => setShowCreateProject(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, fontFamily: 'Outfit,sans-serif' }}>Create Project</h3>
            <input style={S.input} placeholder="Project name *" value={projectForm.name} onChange={e => setProjectForm({ ...projectForm, name: e.target.value })} />
            <textarea style={{ ...S.input, height: 70, resize: 'vertical' }} placeholder="Description (optional)" value={projectForm.description} onChange={e => setProjectForm({ ...projectForm, description: e.target.value })} />
            <button style={S.primaryBtn} onClick={createProject}>Create Project</button>
            <button style={{ ...S.ghostBtn, marginTop: 8, width: '100%' }} onClick={() => setShowCreateProject(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Create Task */}
      {showCreateTask && (
        <div style={S.modal} onClick={() => setShowCreateTask(null)}>
          <div style={{ ...S.modalBox, width: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, fontFamily: 'Outfit,sans-serif' }}>Add Task</h3>
            <input style={S.input} placeholder="Task title *" value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} />
            <textarea style={{ ...S.input, height: 70, resize: 'vertical' }} placeholder="Description (optional)" value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <select style={{ ...S.input, marginBottom: 0 }} value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent</option>
              </select>
              <select style={{ ...S.input, marginBottom: 0 }} value={taskForm.assignee} onChange={e => setTaskForm({ ...taskForm, assignee: e.target.value })}>
                <option value="">Unassigned</option>
                {members.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
              </select>
            </div>
            <input style={S.input} type="date" value={taskForm.dueDate} onChange={e => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
            <input style={S.input} placeholder="Labels (comma separated, e.g. bug, frontend)" value={taskForm.labels} onChange={e => setTaskForm({ ...taskForm, labels: e.target.value })} />
            <button style={S.primaryBtn} onClick={() => createTask(showCreateTask)}>Add Task</button>
            <button style={{ ...S.ghostBtn, marginTop: 8, width: '100%' }} onClick={() => setShowCreateTask(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Edit Task */}
      {editingTask && (
        <EditTaskModal task={editingTask} members={members} S={S} onClose={() => setEditingTask(null)} onSave={updateTask} />
      )}

      {/* Invite code modal */}
      {showInvite && selectedTeam && (
        <div style={S.modal} onClick={() => setShowInvite(false)}>
          <div style={{ ...S.modalBox, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, fontFamily: 'Outfit,sans-serif' }}>Invite to {selectedTeam.name}</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>Share this code with teammates</p>
            <div style={{ background: 'rgba(99,102,241,0.1)', border: '2px dashed rgba(99,102,241,0.4)', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
              <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 8, color: '#818cf8' }}>{selectedTeam.inviteCode}</div>
            </div>
            <button style={{ ...S.primaryBtn, marginBottom: 8 }} onClick={() => { navigator.clipboard.writeText(selectedTeam.inviteCode); toast.success('Invite code copied!') }}>
              📋 Copy Code
            </button>
            <button style={{ ...S.ghostBtn, width: '100%' }} onClick={() => setShowInvite(false)}>Close</button>
          </div>
        </div>
      )}

      <TeammateProfileModal 
        isOpen={!!profileMember} 
        onClose={() => setProfileMember(null)} 
        member={profileMember} 
        teamId={selectedTeam?._id} 
        token={token} 
      />
    </div>
  )
}

// ── Task Card Component ─────────────────────────────────────────────────────
function TaskCard({ task, S, onDragStart, onDragEnd, isDragging, onDelete, onEdit }) {
  const p = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()

  return (
    <div draggable style={S.taskCard(isDragging)} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={S.taskTitle}>{task.title}</div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={onEdit} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px 4px', fontSize: 13, borderRadius: 4 }}
            onMouseOver={e => e.currentTarget.style.color = '#818cf8'} onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>✎</button>
          <button onClick={onDelete} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px 4px', fontSize: 13, borderRadius: 4 }}
            onMouseOver={e => e.currentTarget.style.color = '#f87171'} onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>✕</button>
        </div>
      </div>
      {task.description && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {task.description}
        </div>
      )}
      {/* Labels */}
      {task.labels?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {task.labels.map((l, i) => (
            <span key={i} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>{l}</span>
          ))}
        </div>
      )}
      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <span style={S.badge(p.bg, p.text)}>{p.label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.dueDate && (
            <span style={{ fontSize: 10, color: isOverdue ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
              📅 {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          )}
          {task.assignee && (
            <div title={task.assignee.name} style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#818cf8' }}>
              {task.assignee.avatar
                ? <img src={task.assignee.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : task.assignee.name?.[0]}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Edit Task Modal ──────────────────────────────────────────────────────────
function EditTaskModal({ task, members, S, onClose, onSave }) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || '',
    priority: task.priority || 'medium',
    assignee: task.assignee?._id || '',
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    labels: task.labels?.join(', ') || '',
  })

  const handleSave = () => {
    onSave(task, {
      title: form.title,
      description: form.description,
      priority: form.priority,
      assignee: form.assignee || null,
      dueDate: form.dueDate || null,
      labels: form.labels ? form.labels.split(',').map(l => l.trim()).filter(Boolean) : [],
    })
  }

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={{ ...S.modalBox, width: 460 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, fontFamily: 'Outfit,sans-serif' }}>Edit Task</h3>
        <input style={S.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Task title" />
        <textarea style={{ ...S.input, height: 70, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <select style={{ ...S.input, marginBottom: 0 }} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select style={{ ...S.input, marginBottom: 0 }} value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })}>
            <option value="">Unassigned</option>
            {members.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
          </select>
        </div>
        <input style={S.input} type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
        <input style={S.input} placeholder="Labels (comma separated)" value={form.labels} onChange={e => setForm({ ...form, labels: e.target.value })} />
        <button style={S.primaryBtn} onClick={handleSave}>Save Changes</button>
        <button style={{ ...S.ghostBtn, marginTop: 8, width: '100%' }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
