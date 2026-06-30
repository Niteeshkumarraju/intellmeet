import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { io } from 'socket.io-client'
import useAuthStore from '../store/authStore'
import TeammateProfileModal from '../components/TeammateProfileModal'

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
}

export default function Meeting() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const headers = { Authorization: `Bearer ${token}` }

  const [meeting, setMeeting] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [participants, setParticipants] = useState([])
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [activeTab, setActiveTab] = useState('AI Notes')
  const [summary, setSummary] = useState('')
  const [actionItems, setActionItems] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [raiseHand, setRaiseHand] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [floatingReaction, setFloatingReaction] = useState(null)
  const [transcriptLines, setTranscriptLines] = useState([])
  const [pinnedId, setPinnedId] = useState('local')
  const [speakingId, setSpeakingId] = useState('local')
  const [screenShareCount, setScreenShareCount] = useState(0)

  // Profile, Projects & Task Assignment States
  const [profileMember, setProfileMember] = useState(null)
  const [teamProjects, setTeamProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectTasks, setProjectTasks] = useState([])
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', description: '', priority: 'medium', assignee: '', dueDate: '' })

  // ── WebRTC State ─────────────────────────────────────────
  // { socketId: { stream: MediaStream, name: string, userId: string } }
  const [remoteStreams, setRemoteStreams] = useState({})
  const peerConnectionsRef = useRef({})  // socketId -> RTCPeerConnection
  const remoteStreamsRef   = useRef({})  // socketId -> { stream, name, userId }

  // Recording states
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])

  // Translation & Speech Recognition states
  const [targetLang, setTargetLang] = useState('English')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const recognitionRef = useRef(null)

  // Raised hands mapping
  const [raisedHands, setRaisedHands] = useState({})

  // Whiteboard states
  const [showWhiteboard, setShowWhiteboard] = useState(false)
  const [whiteboardAllowed, setWhiteboardAllowed] = useState(true)
  const [brushColor, setBrushColor] = useState('#ffffff')
  const [brushSize, setBrushSize] = useState(4)
  const [hoveredUser, setHoveredUser] = useState(null)

  const socketRef = useRef(null)
  const localVideoRef = useRef(null)
  const localScreenVideoRef = useRef(null)
  const streamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const messagesEndRef = useRef(null)
  const timerRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const speakingTimerRef = useRef(null)

  const canvasRef = useRef(null)
  const strokesRef = useRef([])
  const activeStrokeRef = useRef(null)

  // ── WebRTC helpers ────────────────────────────────────────
  const createPeerConnection = (socketId, remoteName, remoteUserId) => {
    if (peerConnectionsRef.current[socketId]) {
      return peerConnectionsRef.current[socketId]
    }
    const pc = new RTCPeerConnection(STUN_SERVERS)

    // Add local tracks to peer connection
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, streamRef.current)
      })
    }

    // When we receive remote track, store the stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      remoteStreamsRef.current[socketId] = { stream: remoteStream, name: remoteName, userId: remoteUserId }
      setRemoteStreams(prev => ({ ...prev, [socketId]: { stream: remoteStream, name: remoteName, userId: remoteUserId } }))
    }

    // Send ICE candidates to the peer via signaling server
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('webrtc-ice-candidate', {
          to: socketId,
          from: socketRef.current.id,
          candidate: event.candidate,
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removePeer(socketId)
      }
    }

    peerConnectionsRef.current[socketId] = pc
    return pc
  }

  const removePeer = (socketId) => {
    if (peerConnectionsRef.current[socketId]) {
      peerConnectionsRef.current[socketId].close()
      delete peerConnectionsRef.current[socketId]
    }
    delete remoteStreamsRef.current[socketId]
    setRemoteStreams(prev => {
      const next = { ...prev }
      delete next[socketId]
      return next
    })
  }

  const cleanupAllPeers = () => {
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close())
    peerConnectionsRef.current = {}
    remoteStreamsRef.current = {}
    setRemoteStreams({})
  }

  // Recording handler
  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      setIsRecording(false)
      toast.success('Recording stopped. Downloading video...')
    } else {
      if (!streamRef.current) {
        toast.error('No active stream to record')
        return
      }
      recordedChunksRef.current = []
      try {
        const options = { mimeType: 'video/webm;codecs=vp9,opus' }
        let recorder
        try {
          recorder = new MediaRecorder(streamRef.current, options)
        } catch {
          recorder = new MediaRecorder(streamRef.current)
        }
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data)
          }
        }
        recorder.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          document.body.appendChild(a)
          a.style = 'display: none'
          a.href = url
          a.download = `intellmeet-meeting-${id}-${new Date().toISOString()}.webm`
          a.click()
          window.URL.revokeObjectURL(url)
          toast.success('Meeting recording downloaded successfully!')

          // Upload to Server (Cloud or Local Fallback)
          const uploadToast = toast.loading('Saving recording to server...')
          try {
            const formData = new FormData()
            formData.append('recording', blob, `meeting-${id}.webm`)
            
            await axios.post(`/api/meetings/${id}/recording`, formData, {
              headers: {
                ...headers,
                'Content-Type': 'multipart/form-data'
              }
            })
            
            toast.success('Recording saved successfully!', { id: uploadToast })
            fetchMeeting()
          } catch (uploadErr) {
            console.error('Recording upload failed:', uploadErr)
            const errMsg = uploadErr.response?.data?.message || 'Server upload failed.'
            toast.error(`Local copy saved. Server upload failed: ${errMsg}`, { id: uploadToast, duration: 5000 })
          }
        }
        mediaRecorderRef.current = recorder
        recorder.start(1000)
        setIsRecording(true)
        toast.success('Meeting recording started!')
      } catch (err) {
        console.error('Failed to start recording', err)
        toast.error('Failed to start recording')
      }
    }
  }

  // Speech Translation handler
  const toggleTranscription = () => {
    if (isTranscribing) {
      if (recognitionRef.current) recognitionRef.current.stop()
      setIsTranscribing(false)
      toast.success('Speech recognition stopped')
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognition) {
        toast.error('Speech Recognition not supported in this browser.')
        return
      }
      const rec = new SpeechRecognition()
      rec.continuous = true
      rec.interimResults = false
      rec.lang = 'en-US'
      rec.onstart = () => {
        setIsTranscribing(true)
        toast.success('Live transcription & translation active!')
      }
      rec.onend = () => {
        setIsTranscribing(false)
      }
      rec.onresult = async (event) => {
        const resultIndex = event.resultIndex
        const transcriptText = event.results[resultIndex][0].transcript.trim()
        if (!transcriptText) return
        try {
          let translated = ''
          if (targetLang !== 'English' && targetLang !== 'Original') {
            const { data } = await axios.post(
              '/api/ai/translate',
              { text: transcriptText, targetLanguage: targetLang },
              { headers: { Authorization: `Bearer ${token}` } }
            )
            translated = data.translatedText
          }
          const line = {
            meetingId: id,
            name: user?.name || 'User',
            text: transcriptText,
            translation: translated || undefined,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
          if (socketRef.current) {
            socketRef.current.emit('new-transcript-line', line)
          } else {
            setTranscriptLines(prev => [...prev, line])
          }
        } catch (err) {
          console.error('Translation failed', err)
        }
      }
      recognitionRef.current = rec
      rec.start()
    }
  }

  // Collaborative Whiteboard drawing methods
  const drawStrokeOnCanvas = (stroke) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pts = stroke.points
    if (pts.length < 2) return

    ctx.beginPath()
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.moveTo(pts[0].x * canvas.width, pts[0].y * canvas.height)
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * canvas.width, pts[i].y * canvas.height)
    }
    ctx.stroke()
  }

  const handleCanvasMouseDown = (e) => {
    const isHost = meeting?.host?._id === user?.id
    if (!isHost && !whiteboardAllowed) {
      toast.error('Host has locked the whiteboard')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / canvas.width
    const y = (e.clientY - rect.top) / canvas.height

    activeStrokeRef.current = {
      userId: user?.id,
      userName: user?.name || 'User',
      color: brushColor,
      width: brushSize,
      points: [{ x, y }]
    }
  }

  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / canvas.width
    const my = (e.clientY - rect.top) / canvas.height

    if (activeStrokeRef.current) {
      activeStrokeRef.current.points.push({ x: mx, y: my })
      drawStrokeOnCanvas(activeStrokeRef.current)
      if (socketRef.current) {
        socketRef.current.emit('whiteboard-draw', {
          meetingId: id,
          stroke: activeStrokeRef.current
        })
      }
    }

    const clientX = e.clientX
    const clientY = e.clientY
    let foundDrawer = null
    const allStrokes = [...strokesRef.current]
    if (activeStrokeRef.current) {
      allStrokes.push(activeStrokeRef.current)
    }

    for (const stroke of allStrokes) {
      for (const pt of stroke.points) {
        const px = pt.x * canvas.width
        const py = pt.y * canvas.height
        const mouseX = mx * canvas.width
        const mouseY = my * canvas.height
        const dist = Math.sqrt((mouseX - px) ** 2 + (mouseY - py) ** 2)
        if (dist < 8) {
          foundDrawer = stroke.userName
          break
        }
      }
      if (foundDrawer) break
    }

    if (foundDrawer) {
      setHoveredUser({ name: foundDrawer, x: clientX, y: clientY })
    } else {
      setHoveredUser(null)
    }
  }

  const handleCanvasMouseUp = () => {
    if (activeStrokeRef.current) {
      strokesRef.current.push(activeStrokeRef.current)
      activeStrokeRef.current = null
    }
  }

  const clearWhiteboard = () => {
    const isHost = meeting?.host?._id === user?.id
    if (!isHost) {
      toast.error('Only the host can clear the whiteboard')
      return
    }
    strokesRef.current = []
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    if (socketRef.current) {
      socketRef.current.emit('whiteboard-clear', id)
    }
    toast.success('Whiteboard cleared!')
  }

  const toggleWhiteboardPermission = (allowed) => {
    const isHost = meeting?.host?._id === user?.id
    if (!isHost) return
    setWhiteboardAllowed(allowed)
    if (socketRef.current) {
      socketRef.current.emit('whiteboard-permission', { meetingId: id, allowed })
    }
    toast.success(allowed ? 'Whiteboard drawing unlocked for members' : 'Whiteboard drawing locked by host')
  }

  useEffect(() => {
    const handleResize = () => {
      if (showWhiteboard && canvasRef.current) {
        const canvas = canvasRef.current
        canvas.width = canvas.offsetWidth || canvas.parentElement.clientWidth || 800
        canvas.height = canvas.offsetHeight || canvas.parentElement.clientHeight || 500
        strokesRef.current.forEach(drawStrokeOnCanvas)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [showWhiteboard, pinnedId])

  useEffect(() => {
  fetchMeeting()
  fetchMessages()
  setupSocket()
  timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  return () => { cleanup(); clearInterval(timerRef.current) }
}, [id])

  // Auto-end meeting after 3 hours — warn at 2h 50m
  const MAX_MEETING_SECONDS = 3 * 60 * 60      // 3 hours
  const WARN_AT_SECONDS     = 2 * 60 * 60 + 50 * 60 // 2h 50m
  useEffect(() => {
    if (meeting?.status !== 'active') return
    if (elapsed === WARN_AT_SECONDS) {
      toast('⏰ Meeting will auto-end in 10 minutes (3-hour limit)', {
        duration: 10000,
        position: 'top-center',
        style: { background: '#f59e0b', color: '#000', fontWeight: 700 }
      })
    }
    if (elapsed >= MAX_MEETING_SECONDS) {
      toast('⏱️ Meeting reached the 3-hour limit and is ending automatically.', {
        duration: 5000,
        position: 'top-center',
        style: { background: '#ef4444', color: '#fff', fontWeight: 700 }
      })
      endMeeting()
    }
  }, [elapsed])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Sync local camera video element whenever layout changes (pin, whiteboard toggle, etc.)
  useEffect(() => {
    if (localVideoRef.current) {
      if (isVideoOff || !streamRef.current) {
        localVideoRef.current.srcObject = null
      } else {
        localVideoRef.current.srcObject = streamRef.current
      }
    }
  }, [isVideoOff, pinnedId, showWhiteboard, meeting])

  // Sync screen-share video element
  useEffect(() => {
    if (localScreenVideoRef.current) {
      if (isSharing && screenStreamRef.current) {
        localScreenVideoRef.current.srcObject = screenStreamRef.current
      } else {
        localScreenVideoRef.current.srcObject = null
      }
    }
  }, [isSharing, pinnedId, showWhiteboard, meeting])

  const formatTime = (s) => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const fetchMeeting = async () => {
  try {
    const { data } = await axios.get(`/api/meetings/${id}`, { headers })
    setMeeting(data)
    setParticipants(data.participants || [])
    if (data.summary) setSummary(data.summary)
    if (data.actionItems) setActionItems(data.actionItems)
    if (data.status === 'active') {
      // Seed timer from actual startTime so refreshing resumes correctly
      if (data.startTime) {
        const seededElapsed = Math.floor((Date.now() - new Date(data.startTime).getTime()) / 1000)
        setElapsed(seededElapsed > 0 ? seededElapsed : 0)
      }
      startVideo()
    }
    if (data.status === 'ended') {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      if (data.startTime && data.endTime) {
        const diff = Math.floor((new Date(data.endTime) - new Date(data.startTime)) / 1000)
        setElapsed(diff)
      }
    }
  } catch { toast.error('Meeting not found'); navigate('/dashboard') }
}

  const fetchMessages = async () => {
    try {
      const { data } = await axios.get(`/api/chat/${id}`, { headers })
      setMessages(data)
    } catch {}
  }

  const fetchTeamProjects = useCallback(async (teamId) => {
    try {
      const { data } = await axios.get(`/api/projects?teamId=${teamId}`, { headers })
      setTeamProjects(data)
      if (data.length > 0) setSelectedProjectId(data[0]._id)
    } catch (err) {
      console.error('Failed to load team projects', err)
    }
  }, [token])

  const fetchProjectTasks = useCallback(async (projId) => {
    if (!projId) return
    try {
      const { data } = await axios.get(`/api/tasks?projectId=${projId}`, { headers })
      setProjectTasks(data)
    } catch {}
  }, [token])

  useEffect(() => {
    if (meeting?.team?._id) {
      fetchTeamProjects(meeting.team._id)
    }
  }, [meeting?.team?._id, fetchTeamProjects])

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectTasks(selectedProjectId)
    }
  }, [selectedProjectId, fetchProjectTasks])

  // Socket listener for new tasks created in our active project
  useEffect(() => {
    if (!socketRef.current || !selectedProjectId) return
    const socket = socketRef.current

    socket.on('task-created', ({ task }) => {
      setProjectTasks(prev => {
        if (prev.some(t => t._id === task._id)) return prev;
        return [...prev, task];
      })
    })

    return () => {
      socket.off('task-created')
    }
  }, [selectedProjectId, socketRef.current])

  const handleAssignTask = async (e) => {
    if (e) e.preventDefault()
    if (!taskForm.title.trim()) return toast.error('Enter task title')
    if (!selectedProjectId) return toast.error('No project selected')
    try {
      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description || '',
        projectId: selectedProjectId,
        column: 'todo',
        priority: taskForm.priority,
        assignee: taskForm.assignee || undefined,
        dueDate: taskForm.dueDate || undefined,
      }
      const { data } = await axios.post('/api/tasks', payload, { headers })
      setProjectTasks(prev => [...prev, data])
      socketRef.current?.emit('task-created', { projectId: selectedProjectId, task: data })
      setTaskForm({ title: '', description: '', priority: 'medium', assignee: '', dueDate: '' })
      setShowTaskForm(false)
      toast.success('Task created successfully!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to assign task')
    }
  }

  const handleConvertActionItem = (item) => {
    setActiveTab('Tasks')
    setShowTaskForm(true)
    
    let matchedId = ''
    if (meeting?.team?.members) {
      const matched = meeting.team.members.find(m => 
        m.name.toLowerCase().includes(item.assignee.toLowerCase()) ||
        item.assignee.toLowerCase().includes(m.name.toLowerCase())
      )
      if (matched) matchedId = matched._id
    }
    
    setTaskForm({
      title: item.task,
      description: `Assigned from AI Action Item in meeting "${meeting?.title}".`,
      priority: 'medium',
      assignee: matchedId,
      dueDate: ''
    })
    toast.success('Action item loaded into task form!')
  }

  const handleOpenTeammateProfile = (p) => {
    if (p.isLocal) {
      setProfileMember({
        _id: user.id || user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      })
      return
    }
    const dbUser = participants.find(u => u._id === p.userId)
    if (dbUser) {
      setProfileMember(dbUser)
    } else {
      setProfileMember({
        _id: p.userId || p.id,
        name: p.name,
        email: 'No email shared',
        avatar: ''
      })
    }
  }

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      setupAudioDetection(stream)
    } catch { toast.error('Camera/mic access denied') }
  }

  const setupAudioDetection = (stream) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 512
      source.connect(analyserRef.current)
      const data = new Uint8Array(analyserRef.current.frequencyBinCount)
      const detect = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        if (avg > 15 && !isMuted) {
          setSpeakingId('local')
          clearTimeout(speakingTimerRef.current)
          speakingTimerRef.current = setTimeout(() => setSpeakingId(null), 1500)
        }
        requestAnimationFrame(detect)
      }
      detect()
    } catch {}
  }

  const setupSocket = () => {
    socketRef.current = io(import.meta.env.VITE_API_URL || 'http://localhost:5000')
    socketRef.current.emit('join-meeting', id)

    // ── Announce WebRTC presence to existing peers ─────────────────────
    // Send after a brief delay so join-meeting room is established first
    setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.emit('webrtc-join-room', {
          meetingId: id,
          userId: user?.id,
          userName: user?.name || 'User',
        })
      }
    }, 500)

    // ── WebRTC: Existing peer informs us a new user joined ──────────────
    // WE are the existing peer — create offer to the newcomer
    socketRef.current.on('webrtc-new-peer', async ({ socketId, userId: remoteUserId, userName: remoteName }) => {
      try {
        const pc = createPeerConnection(socketId, remoteName, remoteUserId)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socketRef.current.emit('webrtc-offer', {
          to: socketId,
          from: socketRef.current.id,
          offer,
          userName: user?.name,
        })
      } catch (err) {
        console.error('[WebRTC] Failed to create offer:', err)
      }
    })

    // ── WebRTC: We receive an offer (we are the new peer) ────────────
    socketRef.current.on('webrtc-offer', async ({ from, offer, userName: remoteName }) => {
      try {
        const pc = createPeerConnection(from, remoteName, null)
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socketRef.current.emit('webrtc-answer', {
          to: from,
          from: socketRef.current.id,
          answer,
        })
      } catch (err) {
        console.error('[WebRTC] Failed to handle offer:', err)
      }
    })

    // ── WebRTC: We receive an answer to our offer ────────────────
    socketRef.current.on('webrtc-answer', async ({ from, answer }) => {
      try {
        const pc = peerConnectionsRef.current[from]
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer))
      } catch (err) {
        console.error('[WebRTC] Failed to handle answer:', err)
      }
    })

    // ── WebRTC: ICE candidate from a peer ──────────────────────
    socketRef.current.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      try {
        const pc = peerConnectionsRef.current[from]
        if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error('[WebRTC] ICE candidate error:', err)
      }
    })

    // ── WebRTC: A peer left ──────────────────────────────────
    socketRef.current.on('webrtc-peer-left', ({ socketId }) => {
      removePeer(socketId)
    })

    socketRef.current.on('receive-message', (data) => {
      setMessages(prev => prev.some(m => m._id === data._id) ? prev : [...prev, data])
      if (data.sender?.name) {
        setTranscriptLines(prev => [...prev, {
          name: data.sender.name,
          text: data.content,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }])
      }
    })

    socketRef.current.on('receive-transcript-line', (line) => {
      setTranscriptLines(prev => [...prev, line])
    })

    socketRef.current.on('whiteboard-draw', (data) => {
      strokesRef.current.push(data.stroke)
      drawStrokeOnCanvas(data.stroke)
    })

    socketRef.current.on('whiteboard-clear', () => {
      strokesRef.current = []
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      toast.success('Whiteboard cleared by host')
    })

    socketRef.current.on('whiteboard-permission', (data) => {
      setWhiteboardAllowed(data.allowed)
      if (!data.allowed) {
        toast.error('Whiteboard locked by host')
      } else {
        toast.success('Whiteboard unlocked by host')
      }
    })

    socketRef.current.on('hand-raise-changed', (data) => {
      setRaisedHands(prev => ({
        ...prev,
        [data.userId]: data.raiseHand
      }));
      if (data.raiseHand) {
        toast.custom(() => (
          <div style={{ background:'#1e2d4a', border:'1px solid rgba(99,102,241,0.5)', borderRadius:14, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, fontFamily:'DM Sans', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize:20 }}>✋</div>
            <div style={{ color:'white', fontSize:13, fontWeight:700 }}>{data.userName} raised their hand</div>
          </div>
        ), { duration: 3000, position: 'top-center' });
      }
    });

    socketRef.current.on('user-joined', () => {
      toast.custom(() => (
        <div style={{ background:'#1e2d4a', border:'1px solid rgba(99,102,241,0.5)', borderRadius:14, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, fontFamily:'DM Sans', boxShadow:'0 8px 32px rgba(0,0,0,0.5)', minWidth:280 }}>
          <div style={{ width:38, height:38, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👤</div>
          <div>
            <div style={{ color:'white', fontSize:13, fontWeight:700 }}>Someone joined the meeting</div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginTop:2 }}>They can now see and hear everyone</div>
          </div>
        </div>
      ), { duration:3000, position:'top-center' })
      axios.get(`/api/meetings/${id}`, { headers }).then(({ data }) => setParticipants(data.participants || []))
    })

    socketRef.current.on('user-left', () => {
      toast.custom(() => (
        <div style={{ background:'#1e2d4a', border:'1px solid rgba(239,68,68,0.4)', borderRadius:14, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, fontFamily:'DM Sans', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>
          <div style={{ width:38, height:38, background:'rgba(239,68,68,0.2)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👋</div>
          <div style={{ color:'white', fontSize:13, fontWeight:700 }}>Someone left the meeting</div>
        </div>
      ), { duration:2000, position:'top-center' })
      axios.get(`/api/meetings/${id}`, { headers }).then(({ data }) => setParticipants(data.participants || []))
    })
  }

  const cleanup = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null }
    if (socketRef.current) {
      socketRef.current.emit('webrtc-leave-room', { meetingId: id })
      socketRef.current.emit('leave-meeting', id)
      socketRef.current.disconnect()
    }
    if (audioContextRef.current) audioContextRef.current.close()
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    cleanupAllPeers()
  }

  const toggleMute = async () => {
    if (isMuted) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const newTrack = newStream.getAudioTracks()[0]
        
        if (streamRef.current) {
          streamRef.current.getAudioTracks().forEach(t => {
            t.stop()
            streamRef.current.removeTrack(t)
          })
          streamRef.current.addTrack(newTrack)
        } else {
          streamRef.current = newStream
        }
        
        setIsMuted(false)
        setupAudioDetection(streamRef.current)
        toast.success('Microphone turned ON')
      } catch (err) {
        console.error('Failed to access microphone', err)
        toast.error('Failed to access microphone')
      }
    } else {
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(t => {
          t.stop()
          streamRef.current.removeTrack(t)
        })
      }
      if (isTranscribing && recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
        setIsTranscribing(false)
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { await audioContextRef.current.close(); audioContextRef.current = null; } catch {}
      }
      analyserRef.current = null
      setIsMuted(true)
      toast.success('Microphone turned OFF')
    }
  }

  const toggleVideo = async () => {
    if (isVideoOff) {
      // Camera is OFF — turn it ON: request fresh camera stream
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const newVideoTrack = newStream.getVideoTracks()[0]

        if (streamRef.current) {
          // Remove any stale video tracks first
          streamRef.current.getVideoTracks().forEach(t => {
            t.stop()
            streamRef.current.removeTrack(t)
          })
          streamRef.current.addTrack(newVideoTrack)
        } else {
          streamRef.current = newStream
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = streamRef.current
        }
        setIsVideoOff(false)
        toast.success('Camera turned ON')
      } catch (err) {
        console.error('Failed to access camera', err)
        toast.error('Failed to access camera')
      }
    } else {
      // Camera is ON — turn it OFF: stop all video tracks to release hardware
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach(t => {
          t.stop()               // releases the OS camera indicator light
          streamRef.current.removeTrack(t)
        })
      }
      // Detach from video element so the black frame / avatar shows
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null
      }
      setIsVideoOff(true)
      toast.success('Camera turned OFF')
    }
  }

  const toggleScreenShare = async () => {
    if (isSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
        screenStreamRef.current = null
      }
      // Detach the screen video element
      if (localScreenVideoRef.current) {
        localScreenVideoRef.current.srcObject = null
      }
      setIsSharing(false)
      setScreenShareCount(0)
      // Restore local camera if it was on before sharing
      if (!isVideoOff && streamRef.current && localVideoRef.current) {
        localVideoRef.current.srcObject = streamRef.current
      }
      toast.success('Screen sharing stopped')
    } else {
      if (screenShareCount > 0) { toast.error('Screen share already active'); return }
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        screenStreamRef.current = screenStream
        if (localScreenVideoRef.current) {
          localScreenVideoRef.current.srcObject = screenStream
        }
        setIsSharing(true)
        setScreenShareCount(1)
        screenStream.getVideoTracks()[0].onended = () => {
          if (localScreenVideoRef.current) localScreenVideoRef.current.srcObject = null
          screenStreamRef.current = null
          setIsSharing(false)
          setScreenShareCount(0)
          // Restore camera after screen share ends
          if (!isVideoOff && streamRef.current && localVideoRef.current) {
            localVideoRef.current.srcObject = streamRef.current
          }
        }
      } catch { toast.error('Screen share cancelled') }
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return
    const content = newMessage.trim()
    setNewMessage('')
    try {
      const { data } = await axios.post('/api/chat', { meetingId: id, content }, { headers })
      setMessages(prev => [...prev, data])
      setTranscriptLines(prev => [...prev, { name: user?.name, text: content, time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) }])
      if (socketRef.current) socketRef.current.emit('send-message', { ...data, meetingId: id })
    } catch { toast.error('Failed to send'); setNewMessage(content) }
  }

  const sendReaction = (emoji) => {
    setFloatingReaction(emoji)
    setShowReactions(false)
    setTimeout(() => setFloatingReaction(null), 2500)
    toast(emoji, { duration:1000, position:'bottom-center' })
  }

  const generateAISummary = async () => {
    if (aiLoading) return
    setAiLoading(true)
    console.log('Gemini request sent')
    try {
      const { generateMeetingSummary } = await import('../services/gemini')
      const text = await generateMeetingSummary(meeting?.title, messages, transcriptLines, actionItems, token)

      const summaryMatch = text.match(/SUMMARY:(.*?)(?=ACTION ITEMS:|$)/s)
      if (summaryMatch) setSummary(summaryMatch[1].trim())

      const actionMatch = text.match(/ACTION ITEMS:(.*)/s)
      if (actionMatch) {
        const items = actionMatch[1].trim().split('\n')
          .filter(l => l.trim().startsWith('-'))
          .map(l => {
            const parts = l.replace('-', '').trim().split('|')
            return { task: parts[0]?.trim(), assignee: parts[1]?.trim() || 'Team', completed: false }
          })
        setActionItems(items)
      }

      setTranscriptLines(prev => [...prev, {
        name: 'AI',
        text: 'AI Summary generated successfully!',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
      toast.success('AI Summary generated!')
    } catch (err) {
      console.error(err)
      if (err.response?.status === 429) {
        toast.error('Rate limit hit — wait 1 minute and try again')
      } else if (err.response?.status === 401) {
        toast.error('Invalid API key — check server .env')
      } else {
        toast.error('AI generation failed')
      }
    } finally { setAiLoading(false) }
  }

  const endMeeting = async () => {
    try {
      const finalTranscript = transcriptLines.map(line => `[${line.time}] ${line.name}: ${line.text}${line.translation ? ` (Translation: ${line.translation})` : ''}`).join('\n');
      await axios.patch(`/api/meetings/${id}/end`, { 
        summary, 
        actionItems,
        transcript: finalTranscript
      }, { headers })
      cleanup()
      if (timerRef.current) clearInterval(timerRef.current)
      toast.success('Meeting ended!')
      navigate('/dashboard')
    } catch { toast.error('Failed to end meeting') }
  }

  const handleToggleMeetingActionItem = async (index) => {
    const item = actionItems[index];
    const confirmToggle = window.confirm(
      item.completed 
        ? `Mark task "${item.task}" as incomplete?` 
        : `Mark task "${item.task}" as completed?`
    );
    if (!confirmToggle) return;

    const updated = actionItems.map((a, j) => 
      j === index ? { ...a, completed: !a.completed } : a
    );
    setActionItems(updated);

    try {
      await axios.patch(`/api/meetings/${id}/action-items`, { actionItems: updated }, { headers });
      toast.success('Action item status updated!');
    } catch (err) {
      console.error('Failed to update action item status:', err);
      toast.error(`Failed to save status to database: ${err.response?.data?.message || err.message}`);
    }
  }

  const handleToggleHand = () => {
    const nextState = !raiseHand
    setRaiseHand(nextState)
    if (socketRef.current) {
      socketRef.current.emit('hand-raise-changed', {
        meetingId: id,
        userId: user?.id || 'local',
        userName: user?.name || 'User',
        raiseHand: nextState
      })
    }
  }

  const renderWhiteboardOverlay = (p) => {
    if (!showWhiteboard || p.id !== pinnedId) return null;
    const isHost = meeting?.host?._id === user?.id;
    
    return (
      <>
        <div style={{ position:'absolute', inset:0, zIndex:30, pointerEvents: 'auto' }}>
          <canvas 
            ref={canvasRef} 
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            style={{ display:'block', width:'100%', height:'100%', background:'transparent' }}
          />
        </div>

        <div 
          onClick={e => e.stopPropagation()}
          style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', zIndex:40, display:'flex', alignItems:'center', gap:10, background:'rgba(10,15,30,0.85)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, padding:'6px 12px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}
        >
          <div style={{ display:'flex', gap:6 }}>
            {['#ffffff', '#ff4d4d', '#4d79ff', '#4dff4d', '#ffdb4d'].map(color => (
              <button 
                key={color} 
                onClick={() => setBrushColor(color)} 
                style={{ 
                  width:18, 
                  height:18, 
                  borderRadius:'50%', 
                  background:color, 
                  border:brushColor===color?'2px solid #818cf8':'1px solid rgba(255,255,255,0.2)', 
                  cursor:'pointer' 
                }} 
              />
            ))}
          </div>

          <div style={{ width:1, height:16, background:'rgba(255,255,255,0.15)' }}></div>

          <select 
            value={brushSize} 
            onChange={e => setBrushSize(parseInt(e.target.value))} 
            style={{ background:'#111827', color:'white', border:'1px solid rgba(255,255,255,0.2)', borderRadius:6, padding:'2px 4px', fontSize:11, outline:'none' }}
          >
            <option value="2">2px (Thin)</option>
            <option value="4">4px (Medium)</option>
            <option value="8">8px (Thick)</option>
            <option value="16">16px (Extra)</option>
          </select>

          {isHost && (
            <>
              <div style={{ width:1, height:16, background:'rgba(255,255,255,0.15)' }}></div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>Allow:</span>
                <input 
                  type="checkbox" 
                  checked={whiteboardAllowed} 
                  onChange={e => toggleWhiteboardPermission(e.target.checked)} 
                  style={{ width:12, height:12, accentColor:'#4f46e5', cursor:'pointer' }}
                />
              </div>
            </>
          )}

          <div style={{ width:1, height:16, background:'rgba(255,255,255,0.15)' }}></div>

          <button 
            onClick={clearWhiteboard} 
            style={{ background:'rgba(239,68,68,0.1)', color:'#f87171', border:'1px solid rgba(239,68,68,0.2)', padding:'4px 8px', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans' }}
          >
            🗑️ Clear
          </button>

          <button 
            onClick={() => setShowWhiteboard(false)} 
            style={{ background:'rgba(255,255,255,0.1)', color:'white', border:'1px solid rgba(255,255,255,0.15)', padding:'4px 8px', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans' }}
          >
            ✕ Close
          </button>
        </div>
      </>
    );
  }

  // Build participant tiles:
  // - Local user always first
  // - Remote WebRTC peers (real video) from remoteStreams
  // - DB participants who don't have a live WebRTC stream (fallback avatar)
  const rtcSocketIds = Object.keys(remoteStreams)
  const rtcUserIds = new Set(rtcSocketIds.map(sid => remoteStreams[sid]?.userId).filter(Boolean))

  const allParticipants = [
    { id:'local', name:user?.name, isLocal:true, isHost:meeting?.host?._id===user?.id, isMuted, isVideoOff, rtcStream: null },
    // Real WebRTC remote peers
    ...rtcSocketIds.map(sid => ({
      id: sid,
      name: remoteStreams[sid]?.name || 'Participant',
      isLocal: false,
      isHost: remoteStreams[sid]?.userId === meeting?.host?._id,
      isMuted: false,
      isVideoOff: false,
      rtcStream: remoteStreams[sid]?.stream || null,
      userId: remoteStreams[sid]?.userId,
    })),
    // DB participants without a live stream (offline/no-cam fallback)
    ...participants
      .filter(p => p._id !== user?.id && !rtcUserIds.has(p._id))
      .map(p => ({
        id: p._id,
        name: p.name,
        isLocal: false,
        isHost: p._id === meeting?.host?._id,
        isMuted: false,
        isVideoOff: true,
        rtcStream: null,
        userId: p._id,
      }))
  ]

  // Real people count (used for topbar and participants tab)
  const realParticipantCount = allParticipants.length

  const pinned = allParticipants.find(p => p.id === pinnedId) || allParticipants[0]
  const others = allParticipants.filter(p => p.id !== pinned.id)

  const getGridStyle = (count) => {
    if (count === 1) return { gridTemplateColumns:'1fr', gridTemplateRows:'1fr' }
    if (count === 2) return { gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr' }
    if (count === 3) return { gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr 1fr' }
    if (count === 4) return { gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr 1fr' }
    return { gridTemplateColumns:'repeat(3,1fr)' }
  }

  const reactions = ['👍','❤️','👏','😄','😮','🤔','🔥','💯']

  if (!meeting) return (
    <div style={{ minHeight:'100vh', background:'#0d1117', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontFamily:'DM Sans' }}>
      Loading meeting...
    </div>
  )

  if (meeting?.status === 'ended') {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#0a0f1e', fontFamily:"'DM Sans',sans-serif", color:'white', overflow:'hidden' }}>
        {/* Topbar for View Mode */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 32px', background:'#111827', borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <button onClick={() => navigate('/dashboard')} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', color:'white', padding:'8px 16px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'DM Sans' }}>
              ← Back to Dashboard
            </button>
            <div style={{ width:1, height:24, background:'rgba(255,255,255,0.1)' }}></div>
            <div>
              <div style={{ fontSize:16, fontWeight:700 }}>{meeting.title}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:2 }}>
                Meeting Archive • Code: <span 
                  onClick={() => {
                    const link = `${window.location.origin}/meeting/${meeting._id}`;
                    navigator.clipboard.writeText(link);
                    toast.success('Meeting link copied to clipboard!');
                  }}
                  style={{ color:'#818cf8', fontFamily:'monospace', cursor:'pointer', textDecoration:'underline' }}
                  title="Click to copy meeting link"
                >
                  {meeting.meetingCode}
                </span>
              </div>
            </div>
          </div>
          
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.7)', fontSize:12, padding:'4px 10px', borderRadius:6 }}>
              ⏱️ Duration: {formatTime(elapsed)}
            </span>
            <span style={{ background:'rgba(239,68,68,0.2)', color:'#ef4444', fontSize:12, fontWeight:700, padding:'4px 10px', borderRadius:6 }}>
              🔴 Completed
            </span>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex:1, display:'grid', gridTemplateColumns: '1.2fr 1fr', gap:24, padding:'24px', overflow:'hidden' }}>
          {/* Left Column: AI Summary, Action Items, Transcript */}
          <div style={{ display:'flex', flexDirection:'column', gap:20, overflowY:'auto', paddingRight:8 }}>
            
            {/* AI Summary Card */}
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'20px' }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:12, color:'#818cf8', display:'flex', alignItems:'center', gap:8 }}>
                <span>✨</span> AI Meeting Summary
              </div>
              <p style={{ fontSize:13, color:'rgba(255,255,255,0.75)', lineHeight:1.6 }}>
                {summary || 'No AI summary generated for this meeting.'}
              </p>
            </div>

            {/* Action Items Card */}
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'20px' }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
                <span>✅</span> Action Items 
                {actionItems.length > 0 && <span style={{ background:'#4f46e5', color:'white', fontSize:11, padding:'2px 8px', borderRadius:10, marginLeft:4 }}>{actionItems.length}</span>}
              </div>
              
              {actionItems.length === 0 ? (
                <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', textAlign:'center', padding:'12px' }}>No action items recorded.</p>
              ) : (
                actionItems.map((item, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                    <div 
                      onClick={() => handleToggleMeetingActionItem(i)}
                      style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${item.completed ? '#4ade80' : 'rgba(255,255,255,0.2)'}`, background: item.completed ? '#4ade80' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0, marginTop: 2, cursor: 'pointer' }}
                    >
                      {item.completed && <span style={{ color: '#111', fontWeight:700 }}>✓</span>}
                    </div>
                    <div style={{ flex:1 }} onClick={() => handleToggleMeetingActionItem(i)} style={{ flex: 1, cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)' }}>{item.task}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <div style={{ width: 18, height: 18, background: `hsl(${(item.assignee?.charCodeAt(0)||65)*20%360},50%,40%)`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                          {item.assignee?.[0]?.toUpperCase()||'T'}
                        </div>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{item.assignee}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Transcript Card */}
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'20px' }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>
                📝 Meeting Transcript
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto', paddingRight: 6 }}>
                {meeting.transcript ? (
                  meeting.transcript.split('\n').map((line, idx) => (
                    <p key={idx} style={{ fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.6, marginBottom:8, whiteSpace: 'pre-wrap' }}>{line}</p>
                  ))
                ) : (
                  <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', fontStyle:'italic' }}>No transcription recorded for this session.</p>
                )}
              </div>
            </div>

          </div>

          {/* Right Column: Chats, Participants */}
          <div style={{ display:'flex', flexDirection:'column', gap:20, overflowY:'auto', paddingRight:8 }}>
            
            {/* Chats Card */}
            <div style={{ flex:1.2, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'20px', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>
                💬 Chat History ({messages.length})
              </div>
              <div style={{ flex:1, overflowY:'auto', paddingRight:4 }}>
                {messages.length === 0 ? (
                  <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', textAlign:'center', padding:'24px' }}>No chat messages recorded.</p>
                ) : (
                  messages.map((msg, i) => (
                    <div key={msg._id||i} style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                        <div style={{ width:24, height:24, background:`hsl(${(msg.sender?.name?.charCodeAt(0)||65)*20%360},55%,38%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                          {msg.sender?.name?.[0]?.toUpperCase()||'?'}
                        </div>
                        <span style={{ fontSize:12, fontWeight:600 }}>{msg.sender?.name}</span>
                        <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)' }}>
                          {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : 'now'}
                        </span>
                      </div>
                      <div style={{ marginLeft:32, fontSize:12.5, color:'rgba(255,255,255,0.8)', wordBreak:'break-word' }}>{msg.content}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Participants Card */}
            <div style={{ flex:1, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'20px', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>
                👥 Attended Participants ({participants.length})
              </div>
              <div style={{ flex:1, overflowY:'auto', paddingRight:4 }}>
                {participants.map((p, i) => (
                  <div key={p._id||i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, marginBottom:6 }}>
                    <div style={{ width:28, height:28, background:`hsl(${(p.name?.charCodeAt(0)||65)*15%360},45%,32%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12 }}>
                      {p.name?.[0]?.toUpperCase()||'?'}
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600 }}>{p.name}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:1 }}>
                        {p._id === meeting.host?._id ? 'Host' : 'Participant'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  const hasPinnedView = pinnedId !== null

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#0d1117', fontFamily:"'DM Sans',sans-serif", color:'white', overflow:'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}
        .ctrl-btn{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:8px 14px;border-radius:10px;transition:all 0.2s;border:none;background:transparent;color:rgba(255,255,255,0.65);font-family:'DM Sans';font-size:11px;font-weight:500;}
        .ctrl-btn:hover{background:rgba(255,255,255,0.08);color:white;}
        .ctrl-btn.on{color:#4ade80;}
        .ctrl-btn.off{color:#f87171;background:rgba(239,68,68,0.1);}
        .ctrl-btn.sharing{color:#34d399;}
        .ctrl-icon{font-size:20px;}
        .tab-btn{padding:10px 14px;border-bottom:2px solid transparent;cursor:pointer;font-size:13px;font-weight:600;border-top:none;border-left:none;border-right:none;background:transparent;color:rgba(255,255,255,0.4);font-family:'DM Sans';transition:all 0.2s;white-space:nowrap;}
        .tab-btn.active{color:white;border-bottom-color:#6366f1;}
        .msg-input{flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:9px 16px;color:white;font-size:13px;font-family:'DM Sans';outline:none;}
        .msg-input::placeholder{color:rgba(255,255,255,0.3);}
        .send-btn{width:36px;height:36px;border-radius:50%;background:#6366f1;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
        .video-tile{background:#1a2744;border-radius:12px;overflow:hidden;position:relative;cursor:pointer;transition:all 0.2s;}
        .video-tile:hover .tile-overlay{opacity:1;}
        .video-tile.speaking{box-shadow:0 0 0 3px #4ade80,0 0 20px rgba(74,222,128,0.3);}
        .video-tile.pinned-main{border-radius:14px;}
        .tile-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.3);opacity:0;transition:opacity 0.2s;display:flex;align-items:center;justify-content:center;}
        .name-tag{position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:3px 10px 3px 6px;border-radius:20px;font-size:11px;font-weight:600;display:flex;align-items:center;gap:5px;}
        .thumb-tile{border-radius:10px;overflow:hidden;position:relative;cursor:pointer;flex-shrink:0;transition:all 0.2s;}
        .thumb-tile:hover{transform:scale(1.03);}
        .thumb-tile.speaking{box-shadow:0 0 0 2px #4ade80;}
        .thumb-tile.active-thumb{box-shadow:0 0 0 2px #6366f1;}
        .reaction-emoji{font-size:24px;cursor:pointer;transition:transform 0.15s;padding:4px;}
        .reaction-emoji:hover{transform:scale(1.3);}
        .top-btn{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.85);padding:7px 14px;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;font-family:'DM Sans';transition:all 0.2s;}
        .top-btn:hover{background:rgba(255,255,255,0.12);}
        .action-row{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);}
        @keyframes floatUp{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-100px) scale(2)}}
        .floating-reaction{position:fixed;bottom:140px;left:50%;transform:translateX(-50%);font-size:48px;animation:floatUp 2.5s ease forwards;pointer-events:none;z-index:999;}
        @keyframes speakingPulse{0%,100%{opacity:1}50%{opacity:0.5}}
        .speaking-dot{animation:speakingPulse 0.8s ease infinite;}
      `}</style>

      {floatingReaction && <div className="floating-reaction">{floatingReaction}</div>}

      {/* TOP BAR */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px', background:'#111827', borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }} onClick={() => navigate('/dashboard')}>
            <div style={{ width:32, height:32, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>🤖</div>
            <span style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:800 }}>IntelliMeet</span>
            <span style={{ background:'#4f46e5', color:'white', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4 }}>AI</span>
          </div>
          <div style={{ width:1, height:28, background:'rgba(255,255,255,0.1)' }}></div>
          <div>
            <div style={{ fontSize:14, fontWeight:700 }}>{meeting.title}</div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:2 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, color:'#4ade80', fontSize:12 }}>
                <div style={{ width:6, height:6, background:'#4ade80', borderRadius:'50%' }}></div>
                {formatTime(elapsed)}
              </div>
              {isRecording && (
                <div style={{ display:'flex', alignItems:'center', gap:4, color:'#ef4444', fontSize:11, fontWeight:700, marginLeft:8 }}>
                  <span className="speaking-dot" style={{ color:'#ef4444' }}>●</span> REC
                </div>
              )}
              <span style={{ color:'rgba(255,255,255,0.35)', fontSize:12 }}>•</span>
              <span style={{ color:'rgba(255,255,255,0.45)', fontSize:12 }}>👥 {realParticipantCount}</span>
              <span style={{ color:'rgba(255,255,255,0.35)', fontSize:12 }}>•</span>
              <span 
                onClick={() => {
                  const link = `${window.location.origin}/meeting/${meeting._id}`;
                  navigator.clipboard.writeText(link);
                  toast.success('Meeting link copied to clipboard!');
                }}
                style={{ 
                  color: '#818cf8', 
                  fontFamily: 'monospace', 
                  fontSize: 12, 
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(99,102,241,0.1)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(99,102,241,0.2)'
                }}
                title="Click to copy meeting link"
              >
                🔗 {meeting.meetingCode} (Copy Link)
              </span>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:20, padding:'4px 12px', fontSize:12, color:'#4ade80' }}>
          🛡️ End-to-end Encrypted
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="top-btn" style={{ background:'rgba(99,102,241,0.15)', borderColor:'rgba(99,102,241,0.3)', color:'#818cf8' }} onClick={generateAISummary} disabled={aiLoading}>
            ✨ {aiLoading?'Generating...':'AI Assistant'}
          </button>
          <button className="top-btn">👥 People <span style={{ color:'rgba(255,255,255,0.4)' }}>{realParticipantCount}</span></button>
          <button className="top-btn" onClick={toggleRecording} style={{ color: isRecording ? '#ef4444' : 'rgba(255,255,255,0.85)' }}>
            ⏺️ {isRecording ? 'Stop Rec' : 'Record'}
          </button>
          <button onClick={endMeeting} style={{ display:'flex', alignItems:'center', gap:6, background:'#ef4444', border:'none', color:'white', padding:'8px 18px', borderRadius:9, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'DM Sans' }}>
            ✕ Leave
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* VIDEO AREA */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#0d1117' }}>

          {/* SCREEN SHARE LAYOUT — screen fills main view, participants in sidebar */}
          {isSharing ? (
            <div style={{ flex:1, display:'flex', gap:8, padding:'12px', overflow:'hidden' }}>
              {/* Screen share main view */}
              <div style={{ flex:1, position:'relative', borderRadius:16, overflow:'hidden', background:'#0a1628' }}>
                <video ref={localScreenVideoRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'contain', background:'#000' }} />
                {/* Presenting banner */}
                <div style={{ position:'absolute', bottom:16, left:'50%', transform:'translateX(-50%)', background:'rgba(16,185,129,0.9)', backdropFilter:'blur(8px)', border:'1px solid rgba(16,185,129,0.2)', padding:'6px 16px', borderRadius:20, fontSize:12, fontWeight:700, color:'white', display:'flex', alignItems:'center', gap:6, zIndex:10, whiteSpace:'nowrap' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  You are presenting your screen
                </div>
                {/* Stop button top-right */}
                <button onClick={toggleScreenShare} style={{ position:'absolute', top:14, right:14, background:'#ef4444', border:'none', color:'white', padding:'6px 14px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', zIndex:20, fontFamily:'DM Sans' }}>Stop Presenting</button>
              </div>

              {/* Participants sidebar (real people only, no screen tile) */}
              <div style={{ width:150, display:'flex', flexDirection:'column', gap:8, overflowY:'auto' }}>
                {allParticipants.map((p, i) => {
                  const isHandRaised = p.isLocal ? raiseHand : !!raisedHands[p.id];
                  return (
                    <div key={p.id} className={`thumb-tile ${speakingId===p.id?'speaking':''}`}
                      style={{ height:110, background:`linear-gradient(135deg,hsl(${i*60+180},35%,12%),hsl(${i*60+200},35%,18%))` }}>
                      <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {p.isLocal ? (
                          <>
                            <video ref={localVideoRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display:isVideoOff?'none':'block' }} />
                            {isVideoOff && (
                              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <div style={{ width:44, height:44, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:18 }}>
                                  {user?.name?.[0]?.toUpperCase()}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          // Remote participant: show real video if WebRTC stream available
                          p.rtcStream ? (
                            <RemoteVideoTile stream={p.rtcStream} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          ) : (
                            <div style={{ width:44, height:44, background:`hsl(${(p.name?.charCodeAt(0)||65)*15%360},55%,38%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:18 }}>
                              {p.name?.[0]?.toUpperCase()||'?'}
                            </div>
                          )
                        )}
                      </div>
                      <div className="name-tag" style={{ fontSize:10 }}>
                        <span style={{ color:p.isMuted?'#f87171':'#4ade80', fontSize:10 }}>{p.isMuted?'🔇':'🔊'}</span>
                        {p.name?.split(' ')[0]}
                        {p.isHost && <span style={{ background:'#6366f1', fontSize:8, padding:'1px 4px', borderRadius:3 }}>H</span>}
                        {p.isLocal && <span style={{ fontSize:8, color:'rgba(255,255,255,0.4)', marginLeft:2 }}>(You)</span>}
                      </div>
                      {isHandRaised && <div style={{ position:'absolute', top:4, left:4, fontSize:14, zIndex:10 }}>✋</div>}
                    </div>
                  );
                })}
              </div>
            </div>

          ) : hasPinnedView && others.length > 0 ? (
            // Pinned layout: big main + sidebar thumbnails
            <div style={{ flex:1, display:'flex', gap:8, padding:'12px', overflow:'hidden' }}>
              {/* Main pinned video */}
              <div style={{ flex:1, position:'relative', borderRadius:16, overflow:'hidden', background:'#1a2744', border: pinnedId === pinned.id ? '2px solid #6366f1' : 'none', boxShadow: pinnedId === pinned.id ? '0 0 15px rgba(99,102,241,0.5)' : 'none' }}
                className={`video-tile pinned-main ${speakingId==='local'&&pinned.isLocal?'speaking':''}`}>
                {pinned.isLocal ? (
                  pinned.isScreen ? (
                    <>
                      <video ref={localScreenVideoRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      <div style={{ position:'absolute', bottom:16, left:'50%', transform:'translateX(-50%)', background:'rgba(16,185,129,0.9)', backdropFilter:'blur(8px)', border:'1px solid rgba(16,185,129,0.2)', padding:'6px 16px', borderRadius:20, fontSize:12, fontWeight:700, color:'white', display:'flex', alignItems:'center', gap:6, zIndex:10 }}>
                        <span>🖥️</span> You are presenting your screen to the meeting
                      </div>
                      <div style={{ position:'absolute', top:48, left:'50%', transform:'translateX(-50%)', background:'rgba(10,15,30,0.85)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.1)', padding:'10px 20px', borderRadius:16, display:'flex', flexDirection:'column', alignItems:'center', gap:8, zIndex:10, fontFamily:'DM Sans', boxShadow:'0 8px 32px rgba(0,0,0,0.5)', width:'80%', maxWidth:400, textAlign:'center' }}>
                        <span style={{ fontSize:12, color:'rgba(255,255,255,0.8)', lineHeight:1.4 }}>💡 To avoid the mirroring loop, share a different tab or window instead of this tab.</span>
                        <button onClick={toggleScreenShare} style={{ background:'#ef4444', border:'none', color:'white', padding:'6px 14px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', marginTop:4 }}>Stop Presenting</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <video ref={localVideoRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display:pinned.isVideoOff?'none':'block' }} />
                      {pinned.isVideoOff && (
                        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#111827' }}>
                          <div style={{ width:100, height:100, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:42, fontWeight:700 }}>
                            {user?.name?.[0]?.toUpperCase()}
                          </div>
                        </div>
                      )}
                    </>
                  )
                ) : (
                  // Remote peer: show real video if WebRTC stream, else avatar
                  pinned.rtcStream ? (
                    <RemoteVideoTile stream={pinned.rtcStream} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  ) : (
                    <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:`linear-gradient(135deg,hsl(${(pinned.name?.charCodeAt(0)||65)*15%360},35%,12%),hsl(${(pinned.name?.charCodeAt(0)||65)*15%360+20},35%,18%))` }}>
                      <div style={{ width:100, height:100, background:`hsl(${(pinned.name?.charCodeAt(0)||65)*15%360},55%,38%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:42, fontWeight:700 }}>
                        {pinned.name?.[0]?.toUpperCase()||'?'}
                      </div>
                    </div>
                  )
                )}
                {/* Speaking indicator */}
                {speakingId === (pinned.isLocal?(pinned.isScreen?'local-screen':'local'):pinned.id) && (
                  <div style={{ position:'absolute', top:14, left:14, display:'flex', alignItems:'center', gap:6, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)', padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600 }}>
                    <span className="speaking-dot" style={{ color:'#4ade80', fontSize:16 }}>🔊</span>
                    Speaking: {pinned.name}
                  </div>
                )}
                <div className="name-tag" style={{ bottom:12, left:12 }}>
                  {!pinned.isScreen && <span style={{ color:pinned.isMuted?'#f87171':'#4ade80', fontSize:12 }}>{pinned.isMuted?'🔇':'🔊'}</span>}
                  {pinned.name} {pinned.isHost && <span style={{ background:'#6366f1', fontSize:9, padding:'1px 5px', borderRadius:4, color:'white' }}>HOST</span>}
                  {pinned.isScreen && ' 🖥️'}
                </div>
                {(raiseHand && pinned.isLocal && !pinned.isScreen) && <div style={{ position:'absolute', top:14, right:14, fontSize:28, zIndex:10 }}>✋</div>}
                {(!pinned.isLocal && raisedHands[pinned.id]) && <div style={{ position:'absolute', top:14, right:14, fontSize:28, zIndex:10 }}>✋</div>}
                {renderWhiteboardOverlay(pinned)}
                
                {/* Corner Pin Toggle Button */}
                <button 
                  onClick={(e) => { e.stopPropagation(); setPinnedId(pinnedId === pinned.id ? null : pinned.id); }} 
                  style={{ position:'absolute', top:14, right:14, background:pinnedId===pinned.id?'#6366f1':'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:8, padding:'5px 10px', cursor:'pointer', color:'white', fontSize:12, fontFamily:'DM Sans', zIndex:20 }}
                >
                  📌 {pinnedId === pinned.id ? 'Pinned' : 'Pin'}
                </button>
              </div>
 
              {/* Thumbnails sidebar — use static avatar for screen tile to avoid duplicate ref */}
              <div style={{ width:150, display:'flex', flexDirection:'column', gap:8, overflowY:'auto' }}>
                {others.map((p, i) => {
                  const isHandRaised = p.isLocal ? (p.isScreen ? false : raiseHand) : !!raisedHands[p.id];
                  return (
                    <div key={p.id} className={`thumb-tile ${speakingId===p.id?'speaking':''} ${pinnedId===p.id?'active-thumb':''}`}
                      style={{ height:110, background:`linear-gradient(135deg,hsl(${i*60+180},35%,12%),hsl(${i*60+200},35%,18%))`, border:pinnedId===p.id?'2px solid #6366f1':'none' }}
                      onClick={() => setPinnedId(pinnedId === p.id ? null : p.id)}>
                      <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {p.isLocal ? (
                          p.isScreen ? (
                            // Screen tile in thumbnail — show icon placeholder to avoid duplicate ref
                            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                                <rect x="2" y="3" width="20" height="14" rx="2"/>
                                <line x1="8" y1="21" x2="16" y2="21"/>
                                <line x1="12" y1="17" x2="12" y2="21"/>
                              </svg>
                              <span style={{ fontSize:9, color:'#4ade80', fontWeight:700 }}>Screen</span>
                            </div>
                          ) : (
                            <>
                              <video ref={localVideoRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display:isVideoOff?'none':'block' }} />
                              {isVideoOff && (
                                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <div style={{ width:44, height:44, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:18 }}>
                                    {user?.name?.[0]?.toUpperCase()}
                                  </div>
                                </div>
                              )}
                            </>
                          )
                        ) : (
                          // Remote participant: show real video if WebRTC stream available
                          p.rtcStream ? (
                            <RemoteVideoTile stream={p.rtcStream} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          ) : (
                            <div style={{ width:44, height:44, background:`hsl(${(p.name?.charCodeAt(0)||65)*15%360},55%,38%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:18 }}>
                              {p.name?.[0]?.toUpperCase()||'?'}
                            </div>
                          )
                        )}
                      </div>
                      <div className="name-tag" style={{ fontSize:10 }}>
                        {!p.isScreen && <span style={{ color:p.isMuted?'#f87171':'#4ade80', fontSize:10 }}>{p.isMuted?'🔇':'🔊'}</span>}
                        {p.name?.split(' ')[0]}
                        {p.isHost && <span style={{ background:'#6366f1', fontSize:8, padding:'1px 4px', borderRadius:3 }}>H</span>}
                      </div>
                      {speakingId === p.id && (
                        <div style={{ position:'absolute', top:4, right:4, width:8, height:8, background:'#4ade80', borderRadius:'50%' }} className="speaking-dot"></div>
                      )}
                      {isHandRaised && (
                        <div style={{ position:'absolute', top:4, left:4, fontSize:14, zIndex:10 }}>✋</div>
                      )}
                    {/* Thumbnail Corner Pin */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPinnedId(pinnedId === p.id ? null : p.id); }} 
                      style={{ position:'absolute', top:4, right:4, background:pinnedId===p.id?'#6366f1':'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:4, padding:'2px 4px', cursor:'pointer', color:'white', fontSize:9, zIndex:20 }}
                    >
                      📌
                    </button>
                  </div>
                );})}
              </div>
            </div>
          ) : (
            // Grid layout — no pin or only 1 participant
            <div style={{ flex:1, padding:'12px', overflow:'hidden' }}>
              <div style={{ height:'100%', display:'grid', gap:8, ...getGridStyle(allParticipants.length) }}>
                {allParticipants.map((p, i) => (
                  <div key={p.id}
                    className={`video-tile ${speakingId===(p.isLocal?(p.isScreen?'local-screen':'local'):p.id)?'speaking':''}`}
                    style={{ 
                      background:`linear-gradient(135deg,hsl(${i*50+180},35%,10%),hsl(${i*50+200},35%,16%))`, 
                      gridColumn: allParticipants.length===3&&i===0?'span 2':'span 1',
                      border: pinnedId === p.id ? '2px solid #6366f1' : 'none',
                      boxShadow: pinnedId === p.id ? '0 0 15px rgba(99,102,241,0.5)' : 'none'
                    }}
                    onClick={() => setPinnedId(pinnedId === p.id ? null : p.id)}>
                    {p.isLocal ? (
                      p.isScreen ? (
                        <>
                          <video ref={localScreenVideoRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          <div style={{ position:'absolute', bottom:16, left:'50%', transform:'translateX(-50%)', background:'rgba(16,185,129,0.9)', backdropFilter:'blur(8px)', border:'1px solid rgba(16,185,129,0.2)', padding:'6px 16px', borderRadius:20, fontSize:11, fontWeight:700, color:'white', display:'flex', alignItems:'center', gap:6, zIndex:10 }}>
                            <span>🖥️</span> You are presenting your screen to the meeting
                          </div>
                          <div style={{ position:'absolute', top:48, left:'50%', transform:'translateX(-50%)', background:'rgba(10,15,30,0.85)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.1)', padding:'10px 20px', borderRadius:16, display:'flex', flexDirection:'column', alignItems:'center', gap:8, zIndex:10, fontFamily:'DM Sans', boxShadow:'0 8px 32px rgba(0,0,0,0.5)', width:'80%', maxWidth:350, textAlign:'center' }}>
                            <span style={{ fontSize:12, color:'rgba(255,255,255,0.8)', lineHeight:1.4 }}>💡 To avoid the mirroring loop, share a different tab or window instead of this tab.</span>
                            <button onClick={toggleScreenShare} style={{ background:'#ef4444', border:'none', color:'white', padding:'6px 14px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', marginTop:4 }}>Stop Presenting</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <video ref={localVideoRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display:isVideoOff?'none':'block' }} />
                          {isVideoOff && (
                            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#111827' }}>
                              <div style={{ width:72, height:72, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, fontWeight:700 }}>
                                {user?.name?.[0]?.toUpperCase()}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    ) : (
                      // Remote participant: show real video if WebRTC stream available
                      p.rtcStream ? (
                        <RemoteVideoTile stream={p.rtcStream} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      ) : (
                        <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ width:72, height:72, background:`hsl(${(p.name?.charCodeAt(0)||65)*15%360},55%,38%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, fontWeight:700, margin:'0 auto 8px' }}>
                              {p.name?.[0]?.toUpperCase()||'?'}
                            </div>
                            <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>Camera off</div>
                          </div>
                        </div>
                      )
                    )}
                    <div className="name-tag">
                      {!p.isScreen && <span style={{ color:p.isMuted?'#f87171':'#4ade80', fontSize:12 }}>{p.isMuted?'🔇':'🔊'}</span>}
                      {p.name}
                      {p.isHost && <span style={{ background:'#6366f1', fontSize:9, padding:'1px 5px', borderRadius:4, color:'white' }}>HOST</span>}
                    </div>
                    {speakingId===(p.isLocal?(p.isScreen?'local-screen':'local'):p.id) && (
                      <div style={{ position:'absolute', top:10, left:10, display:'flex', alignItems:'center', gap:5, background:'rgba(0,0,0,0.6)', padding:'3px 10px', borderRadius:20, fontSize:11 }}>
                        <span className="speaking-dot" style={{ color:'#4ade80' }}>🔊</span> Speaking
                      </div>
                    )}
                    {(p.isLocal ? (p.isScreen ? false : raiseHand) : !!raisedHands[p.id]) && <div style={{ position:'absolute', top:10, right:10, fontSize:24, zIndex:10 }}>✋</div>}
                    {renderWhiteboardOverlay(p)}
                    {/* Grid Corner Pin Toggle */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPinnedId(pinnedId === p.id ? null : p.id); }} 
                      style={{ position:'absolute', top:10, right:10, background:pinnedId===p.id?'#6366f1':'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'white', fontSize:11, zIndex:20 }}
                    >
                      📌 {pinnedId === p.id ? 'Pinned' : 'Pin'}
                    </button>
                    {/* "Waiting for others" hint removed from video overlay — shown below the grid instead */}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Waiting-for-others hint shown below the grid, not covering video */}
          {allParticipants.filter(p => !p.isScreen).length === 1 && (
            <div style={{ textAlign:'center', padding:'6px 0 2px', color:'rgba(255,255,255,0.2)', fontSize:12, pointerEvents:'none', flexShrink:0 }}>
              Waiting for others to join...
            </div>
          )}

          {/* Reactions bar (shows when reactions open) */}
          {showReactions && (
            <div style={{ position:'absolute', bottom:130, left:'50%', transform:'translateX(-50%)', zIndex:50 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:30, padding:'8px 16px' }}>
                {reactions.map((emoji,i) => <span key={i} className="reaction-emoji" onClick={() => sendReaction(emoji)}>{emoji}</span>)}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={{ width:360, background:'#111827', borderLeft:'1px solid rgba(255,255,255,0.07)', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ display:'flex', padding:'0 4px', borderBottom:'1px solid rgba(255,255,255,0.07)', gap:0 }}>
            {['AI Notes','Chat','Participants', meeting?.team && 'Tasks'].filter(Boolean).map(tab => (
              <button key={tab} className={`tab-btn ${activeTab===tab?'active':''}`} onClick={() => setActiveTab(tab)}>
                {tab==='AI Notes'?'✨ AI Notes':tab==='Chat'?`💬 Chat${messages.length>0?` (${messages.length})`:''}`:tab==='Participants'?`👥 (${realParticipantCount})`:'📋 Tasks'}
              </button>
            ))}
          </div>

          {/* AI Notes */}
          {activeTab==='AI Notes' && (
            <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
              <div style={{ marginBottom:18 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>AI Summary</div>
                  {summary && <span style={{ fontSize:10, color:'rgba(255,255,255,0.35)' }}>Generated just now</span>}
                </div>
                <p style={{ fontSize:13, color:summary?'rgba(255,255,255,0.75)':'rgba(255,255,255,0.3)', lineHeight:1.6, marginBottom:12 }}>
                  {summary || 'Click below to generate an AI-powered meeting summary.'}
                </p>
                <button onClick={generateAISummary} disabled={aiLoading} style={{ width:'100%', background:'linear-gradient(135deg,#4f46e5,#6366f1)', border:'none', color:'white', padding:'9px', borderRadius:9, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'DM Sans' }}>
                  {aiLoading?'⏳ Generating...':'✨ Generate Full Summary'}
                </button>
              </div>

              <div style={{ marginBottom:18 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:14, fontWeight:700 }}>
                    Action Items
                    {actionItems.length>0 && <span style={{ background:'#4f46e5', color:'white', fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:10 }}>{actionItems.length}</span>}
                  </div>
                </div>
                {actionItems.length===0 ? (
                  <div style={{ textAlign:'center', padding:'16px 0', color:'rgba(255,255,255,0.25)', fontSize:12 }}>
                    Generate AI summary to extract action items
                  </div>
                ) : actionItems.map((item,i) => (
                  <div key={i} className="action-row">
                    <div style={{ width:20, height:20, borderRadius:'50%', border:`2px solid ${item.completed?'#4ade80':'rgba(255,255,255,0.2)'}`, background:item.completed?'#4ade80':'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, flexShrink:0, marginTop:2, cursor:'pointer' }}
                      onClick={() => handleToggleMeetingActionItem(i)}>
                      {item.completed && <span style={{ color:'#111' }}>✓</span>}
                    </div>
                    <div style={{ flex:1 }} onClick={() => handleToggleMeetingActionItem(i)} style={{ flex: 1, cursor: 'pointer' }}>
                      <div style={{ fontSize:13, color:item.completed?'rgba(255,255,255,0.35)':'rgba(255,255,255,0.85)', textDecoration:item.completed?'line-through':'none' }}>{item.task}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                        <div style={{ width:18, height:18, background:`hsl(${(item.assignee?.charCodeAt(0)||65)*20%360},50%,40%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700 }}>
                          {item.assignee?.[0]?.toUpperCase()||'T'}
                        </div>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{item.assignee}</span>
                        {meeting?.team && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleConvertActionItem(item); }}
                            style={{ marginLeft: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', borderRadius: 4, padding: '1px 5px', fontSize: 10, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600 }}
                            title="Convert to Project Task"
                          >
                            📋 Create Task
                          </button>
                        )}
                        <span style={{ marginLeft:'auto', fontSize:10, color:'rgba(255,255,255,0.25)' }}>{new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom:18 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>Live Transcription</div>
                  <select 
                    value={targetLang} 
                    onChange={e => {
                      setTargetLang(e.target.value);
                      toast.success(`Translation set to ${e.target.value}`);
                    }}
                    style={{ background:'#111827', color:'rgba(255,255,255,0.6)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:6, padding:'2px 6px', fontSize:11, outline:'none' }}
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Japanese">Japanese</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Telugu">Telugu</option>
                  </select>
                </div>
                
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <button 
                    onClick={toggleTranscription} 
                    style={{ 
                      flex: 1, 
                      background: isTranscribing ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)', 
                      border: `1px solid ${isTranscribing ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)'}`,
                      color: isTranscribing ? '#f87171' : '#818cf8', 
                      padding: '6px', 
                      borderRadius: 8, 
                      fontSize: 11, 
                      fontWeight: 600, 
                      cursor: 'pointer',
                      fontFamily: 'DM Sans'
                    }}
                  >
                    {isTranscribing ? '⏹️ Stop Captions' : '🎤 Enable Mic'}
                  </button>
                  <button 
                    onClick={() => {
                      const sampleTexts = [
                        "Hello everyone, thanks for joining the IntellMeet product review.",
                        "We need to finalize the Q2 strategy planning this week.",
                        "Let's focus our efforts on the core whiteboard features and translation models.",
                        "Please update your action items on the dashboard."
                      ];
                      const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
                      
                      (async () => {
                        try {
                          let translated = '';
                          if (targetLang !== 'English' && targetLang !== 'Original') {
                            const { data } = await axios.post(
                              '/api/ai/translate',
                              { text: randomText, targetLanguage: targetLang },
                              { headers: { Authorization: `Bearer ${token}` } }
                            );
                            translated = data.translatedText;
                          }
                          const mockLine = {
                            meetingId: id,
                            name: user?.name || 'User',
                            text: randomText,
                            translation: translated || undefined,
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          };
                          if (socketRef.current) {
                            socketRef.current.emit('new-transcript-line', mockLine);
                          } else {
                            setTranscriptLines(prev => [...prev, mockLine]);
                          }
                        } catch (err) {
                          console.error(err);
                        }
                      })();
                    }} 
                    style={{ 
                      background: 'rgba(255,255,255,0.06)', 
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.7)', 
                      padding: '6px 10px', 
                      borderRadius: 8, 
                      fontSize: 11, 
                      fontWeight: 600, 
                      cursor: 'pointer',
                      fontFamily: 'DM Sans'
                    }}
                  >
                    Simulate
                  </button>
                </div>

                <div style={{ maxHeight:160, overflowY:'auto' }}>
                  {transcriptLines.length===0 ? (
                    <p style={{ fontSize:12, color:'rgba(255,255,255,0.25)' }}>No spoken captions recorded yet...</p>
                  ) : transcriptLines.slice(-6).map((line,i) => (
                    <div key={i} style={{ marginBottom:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <div style={{ width:18, height:18, background:`hsl(${(line.name?.charCodeAt(0)||65)*20%360},50%,40%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700 }}>
                          {line.name?.[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontSize:12, fontWeight:600, color:'#818cf8' }}>{line.name}</span>
                        <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>{line.time}</span>
                      </div>
                      <p style={{ fontSize:12, color:'rgba(255,255,255,0.6)', lineHeight:1.5, paddingLeft:24 }}>
                        {line.text}
                        {line.translation && <span style={{ display:'block', color:'#818cf8', fontSize:11.5, marginTop:2, fontStyle:'italic' }}>Translation: {line.translation}</span>}
                      </p>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize:10, color:'rgba(255,255,255,0.2)', marginTop:6 }}>Transcription is AI generated and may not be 100% accurate.</p>
              </div>
            </div>
          )}

          {/* Chat */}
          {activeTab==='Chat' && (
            <>
              <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
                {messages.length===0 ? (
                  <div style={{ textAlign:'center', marginTop:40, color:'rgba(255,255,255,0.25)' }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
                    <p style={{ fontSize:13 }}>No messages yet. Say hello!</p>
                  </div>
                ) : messages.map((msg,i) => (
                  <div key={msg._id||i} style={{ marginBottom:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <div style={{ width:28, height:28, background:`hsl(${(msg.sender?.name?.charCodeAt(0)||65)*20%360},55%,38%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
                        {msg.sender?.name?.[0]?.toUpperCase()||'?'}
                      </div>
                      <span style={{ fontSize:13, fontWeight:600 }}>{msg.sender?.name}</span>
                      <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>
                        {msg.createdAt?new Date(msg.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'now'}
                      </span>
                    </div>
                    <div style={{ marginLeft:36, fontSize:13, color:'rgba(255,255,255,0.8)', lineHeight:1.55, wordBreak:'break-word' }}>{msg.content}</div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div style={{ padding:'10px 14px', borderTop:'1px solid rgba(255,255,255,0.07)', display:'flex', gap:8, alignItems:'center' }}>
                <input className="msg-input" value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key==='Enter'&&!e.shiftKey&&sendMessage()} placeholder="Type a message..." />
                <button className="send-btn" onClick={sendMessage}>➤</button>
              </div>
            </>
          )}

          {/* Participants */}
          {activeTab==='Participants' && (
            <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:12 }}>{realParticipantCount} in this meeting{isSharing && <span style={{ marginLeft:8, color:'#4ade80', fontSize:11 }}>● You are presenting</span>}</div>
              {allParticipants.map((p,i) => (
                <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:p.isHost?'rgba(99,102,241,0.1)':'rgba(255,255,255,0.03)', border:`1px solid ${p.isHost?'rgba(99,102,241,0.2)':'rgba(255,255,255,0.05)'}`, borderRadius:12, marginBottom:8, cursor:'pointer', transition:'background 0.2s' }}
                  onClick={() => { setPinnedId(p.isLocal?'local':p.id); setActiveTab('AI Notes') }}>
                  <div 
                    onClick={(e) => { e.stopPropagation(); handleOpenTeammateProfile(p); }}
                    style={{ width:38, height:38, background:p.isHost?'linear-gradient(135deg,#4f46e5,#7c3aed)':`hsl(${i*80+180},45%,32%)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:15, cursor:'pointer' }}
                    title="View Workload"
                  >
                    {p.name?.[0]?.toUpperCase()||'?'}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>
                      {p.name}{p.isLocal?' (You)':''}
                      {(p.isLocal ? raiseHand : !!raisedHands[p.id]) && <span style={{ marginLeft: 6, fontSize: 14 }}>✋</span>}
                    </div>
                    <div style={{ fontSize:11, color:p.isHost?'#818cf8':'rgba(255,255,255,0.4)', marginTop:2 }}>
                      {p.isHost?'Host':'Participant'}
                      {speakingId===(p.isLocal?'local':p.id) && <span style={{ color:'#4ade80', marginLeft:6 }}>● Speaking</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:4, fontSize:16 }}>
                    <span>{p.isMuted?'🔇':'🔊'}</span>
                    <span>{p.isVideoOff?'📷':'📹'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tasks Tab */}
          {activeTab==='Tasks' && (
            <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.6)' }}>Assign Team Tasks</span>
                <button 
                  onClick={() => setShowTaskForm(!showTaskForm)} 
                  style={{ background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)', color:'#818cf8', borderRadius:6, padding:'4px 8px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans' }}
                >
                  {showTaskForm ? '✕ Close Form' : '+ New Task'}
                </button>
              </div>

              {/* Project Selector */}
              {teamProjects.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:'block', fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:4, fontWeight:600, textTransform:'uppercase' }}>Project</label>
                  <select 
                    value={selectedProjectId} 
                    onChange={e => setSelectedProjectId(e.target.value)}
                    style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px', color:'white', fontSize:13, outline:'none' }}
                  >
                    {teamProjects.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Task Creation Form */}
              {showTaskForm && (
                <form onSubmit={handleAssignTask} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:12, padding:12, marginBottom:16 }}>
                  <div style={{ marginBottom:8 }}>
                    <input 
                      type="text" 
                      placeholder="Task Title *" 
                      value={taskForm.title} 
                      onChange={e => setTaskForm({...taskForm, title: e.target.value})}
                      style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 10px', color:'white', fontSize:12.5, outline:'none' }}
                    />
                  </div>
                  <div style={{ marginBottom:8 }}>
                    <textarea 
                      placeholder="Description (optional)" 
                      value={taskForm.description} 
                      onChange={e => setTaskForm({...taskForm, description: e.target.value})}
                      style={{ width:'100%', height:50, resize:'vertical', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 10px', color:'white', fontSize:12.5, outline:'none' }}
                    />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                    <select 
                      value={taskForm.priority} 
                      onChange={e => setTaskForm({...taskForm, priority: e.target.value})}
                      style={{ background:'#111827', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:6, color:'white', fontSize:11.5, outline:'none' }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    <select 
                      value={taskForm.assignee} 
                      onChange={e => setTaskForm({...taskForm, assignee: e.target.value})}
                      style={{ background:'#111827', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:6, color:'white', fontSize:11.5, outline:'none' }}
                    >
                      <option value="">Unassigned</option>
                      {meeting?.team?.members?.map(m => (
                        <option key={m._id} value={m._id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <input 
                      type="date" 
                      value={taskForm.dueDate} 
                      onChange={e => setTaskForm({...taskForm, dueDate: e.target.value})}
                      style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 10px', color:'white', fontSize:11.5, outline:'none', colorScheme:'dark' }}
                    />
                  </div>
                  <button 
                    type="submit" 
                    style={{ width:'100%', background:'linear-gradient(135deg, #4f46e5, #6366f1)', border:'none', color:'white', padding:'8px', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans' }}
                  >
                    Assign Task
                  </button>
                </form>
              )}

              {/* Task list for project */}
              <div style={{ flex:1, overflowY:'auto' }}>
                <span style={{ display:'block', fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:8, fontWeight:600, textTransform:'uppercase' }}>Project Backlog ({projectTasks.length})</span>
                {projectTasks.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'24px 0', color:'rgba(255,255,255,0.3)', fontSize:12 }}>
                    No tasks in this project yet
                  </div>
                ) : (
                  projectTasks.map(t => {
                    return (
                      <div key={t._id} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10, padding:10, marginBottom:8 }}>
                        <div style={{ fontSize:12.5, fontWeight:600, color:'white', marginBottom:4 }}>{t.title}</div>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:4 }}>
                          <span style={{ fontSize:9.5, padding:'2px 5px', borderRadius:4, background:t.priority==='urgent'?'rgba(239,68,68,0.15)':t.priority==='high'?'rgba(245,158,11,0.15)':'rgba(99,102,241,0.15)', color:t.priority==='urgent'?'#f87171':t.priority==='high'?'#f59e0b':'#818cf8', fontWeight:700 }}>
                            {t.priority.toUpperCase()}
                          </span>
                          <span style={{ fontSize:9.5, padding:'1px 5px', borderRadius:4, background:t.column==='done'?'rgba(16,185,129,0.15)':t.column==='inprogress'?'rgba(245,158,11,0.15)':'rgba(99,102,241,0.15)', color:t.column==='done'?'#10b981':t.column==='inprogress'?'#f59e0b':'#818cf8', fontWeight:700 }}>
                            {t.column.toUpperCase()}
                          </span>
                          {t.assignee && (
                            <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.5)', display:'flex', alignItems:'center', gap:4 }}>
                              👤 {t.assignee.name.split(' ')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM CONTROLS */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 28px', background:'#111827', borderTop:'1px solid rgba(255,255,255,0.07)', flexShrink:0, position:'relative' }}>
        <div style={{ display:'flex', gap:2 }}>
          <button className={`ctrl-btn ${isMuted?'off':'on'}`} onClick={toggleMute}>
            <span className="ctrl-icon">{isMuted?'🔇':'🎤'}</span>
            {isMuted?'Unmute':'Mic'}
          </button>
          <button className={`ctrl-btn ${isVideoOff?'off':'on'}`} onClick={toggleVideo}>
            <span className="ctrl-icon">{isVideoOff?'📷':'📹'}</span>
            {isVideoOff?'Start Video':'Camera'}
          </button>
          <button className={`ctrl-btn ${isSharing?'sharing':''}`} onClick={toggleScreenShare}>
            <span className="ctrl-icon">🖥️</span>
            {isSharing?'Stop Share':'Share Screen'}
          </button>
          <button className={`ctrl-btn ${showReactions?'on':''}`} onClick={() => setShowReactions(!showReactions)}>
            <span className="ctrl-icon">😊</span>
            Reactions
          </button>
          <button className={`ctrl-btn ${raiseHand?'on':''}`} onClick={handleToggleHand}>
            <span className="ctrl-icon">✋</span>
            {raiseHand?'Lower Hand':'Raise Hand'}
          </button>
          <button className={`ctrl-btn ${isTranscribing?'on':''}`} onClick={toggleTranscription}>
            <span className="ctrl-icon" style={{ fontSize:14, fontWeight:700 }}>CC</span>
            Captions
          </button>
          <button className={`ctrl-btn ${showWhiteboard?'on':''}`} onClick={() => setShowWhiteboard(true)}>
            <span className="ctrl-icon">🖊️</span>
            Whiteboard
          </button>
        </div>
        <button onClick={endMeeting} style={{ display:'flex', alignItems:'center', gap:8, background:'#ef4444', border:'none', color:'white', padding:'11px 28px', borderRadius:12, cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'DM Sans' }}>
          📞 Leave
        </button>
      </div>

      {/* WHITEBOARD OVERLAY MODAL REMOVED */}

      {/* WRITER NAME HOVER TOOLTIP */}
      {showWhiteboard && hoveredUser && (
        <div style={{ 
          position:'fixed', 
          left: hoveredUser.x + 12, 
          top: hoveredUser.y + 12, 
          background:'rgba(10,15,30,0.85)', 
          border:'1px solid rgba(99,102,241,0.3)',
          color:'white', 
          padding:'5px 10px', 
          borderRadius:8, 
          fontSize:11, 
          fontWeight:600,
          zIndex:1010, 
          pointerEvents:'none',
          boxShadow:'0 4px 12px rgba(0,0,0,0.4)',
          fontFamily:'DM Sans'
        }}>
          ✍️ Drawn by: {hoveredUser.name}
        </div>
      )}

      <TeammateProfileModal 
        isOpen={!!profileMember} 
        onClose={() => setProfileMember(null)} 
        member={profileMember} 
        teamId={meeting?.team?._id} 
        token={token} 
      />
    </div>
  )
}

// ── RemoteVideoTile: attaches an RTCPeerConnection's MediaStream to a video element ──
function RemoteVideoTile({ stream, style, className }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
    }
  }, [stream])
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      style={style || { width: '100%', height: '100%', objectFit: 'cover' }}
      className={className}
    />
  )
}