import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function TeammateProfileModal({ isOpen, onClose, member, teamId, token }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !member || !teamId) return
    
    const fetchTeammateTasks = async () => {
      setLoading(true)
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const { data } = await axios.get(`/api/tasks?teamId=${teamId}&assignee=${member._id}`, { headers })
        setTasks(data)
      } catch (err) {
        console.error('Failed to fetch teammate tasks', err)
        toast.error('Failed to load teammate tasks')
      } finally {
        setLoading(false)
      }
    }

    fetchTeammateTasks()
  }, [isOpen, member, teamId, token])

  if (!isOpen || !member) return null

  // Group tasks by column
  const todoTasks = tasks.filter(t => t.column === 'todo')
  const progressTasks = tasks.filter(t => t.column === 'inprogress')
  const doneTasks = tasks.filter(t => t.column === 'done')

  const S = {
    modal: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
    },
    modalBox: {
      background: '#111827',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 24,
      width: 520,
      maxWidth: '90vw',
      maxHeight: '85vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
    },
    header: {
      padding: '24px 28px 16px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    },
    body: {
      padding: '20px 28px 24px',
      overflowY: 'auto',
      flex: 1,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 24,
      fontWeight: 700,
      color: 'white',
      border: '2px solid rgba(255, 255, 255, 0.1)',
      objectFit: 'cover'
    },
    title: {
      fontSize: 20,
      fontWeight: 800,
      color: 'white',
      margin: 0,
    },
    subtitle: {
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.5)',
      marginTop: 4,
    },
    closeBtn: {
      marginLeft: 'auto',
      background: 'rgba(255, 255, 255, 0.06)',
      border: 'none',
      width: 32,
      height: 32,
      borderRadius: '50%',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      transition: 'background 0.2s',
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      color: 'rgba(255, 255, 255, 0.4)',
      marginBottom: 12,
      marginTop: 20,
    },
    taskContainer: {
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    taskTitle: {
      fontSize: 13.5,
      fontWeight: 600,
      color: 'rgba(255, 255, 255, 0.9)',
      marginBottom: 6,
    },
    taskMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 11,
      color: 'rgba(255, 255, 255, 0.4)',
    },
    badge: (color) => ({
      padding: '2px 6px',
      borderRadius: 4,
      fontSize: 9.5,
      fontWeight: 700,
      background: `rgba(${color}, 0.15)`,
      color: `rgb(${color})`,
    }),
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '239, 68, 68' // red
      case 'high': return '245, 158, 11' // amber
      case 'medium': return '99, 102, 241' // indigo
      default: return '16, 185, 129' // green
    }
  }

  const renderTaskList = (title, list, color) => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)' }}>{title}</span>
        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: 'rgba(255, 255, 255, 0.06)', color: 'rgba(255, 255, 255, 0.4)' }}>{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div style={{ padding: '12px 14px', background: 'rgba(255, 255, 255, 0.01)', border: '1px dashed rgba(255, 255, 255, 0.06)', borderRadius: 12, textAlign: 'center', color: 'rgba(255, 255, 255, 0.3)', fontSize: 12 }}>
          No tasks in this stage
        </div>
      ) : (
        list.map(t => (
          <div key={t._id} style={S.taskContainer}>
            <div style={S.taskTitle}>{t.title}</div>
            <div style={S.taskMeta}>
              <span style={S.badge(getPriorityColor(t.priority))}>{t.priority.toUpperCase()}</span>
              {t.dueDate && (
                <span>📅 {new Date(t.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          {member.avatar ? (
            <img src={member.avatar} alt={member.name} style={S.avatar} />
          ) : (
            <div style={S.avatar}>{member.name[0].toUpperCase()}</div>
          )}
          <div>
            <h3 style={S.title}>{member.name}</h3>
            <p style={S.subtitle}>{member.email}</p>
          </div>
          <button style={S.closeBtn} onClick={onClose}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}>
            ✕
          </button>
        </div>

        <div style={S.body}>
          <div style={{ display: 'flex', gap: 12, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 14, padding: 14, marginBottom: 20 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Assigned</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#818cf8' }}>{tasks.length}</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Pending</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#f59e0b' }}>{todoTasks.length + progressTasks.length}</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Completed</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#10b981' }}>{doneTasks.length}</div>
            </div>
          </div>

          <div style={S.sectionTitle}>Teammate Workload</div>
          
          {loading ? (
            <p style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: 13, padding: '20px 0' }}>Loading workload...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {renderTaskList('To Do', todoTasks, '99, 102, 241')}
              {renderTaskList('In Progress', progressTasks, '245, 158, 11')}
              {renderTaskList('Done', doneTasks, '16, 185, 129')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
