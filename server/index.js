require('dotenv').config(); // ← MUST be first so env vars are set before passport reads them
const Sentry = require('@sentry/node');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const passport = require('./config/passport');

// ── Sentry (initialise before everything else) ─────────────────────────────
Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0,
  enabled: !!process.env.SENTRY_DSN,
});

// ── Prometheus Metrics ──────────────────────────────────────────────────────
const client = require('prom-client');
client.collectDefaultMetrics({ register: client.register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});


// Process-wide crash prevention
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:', error);
});

// ── Route imports ──────────────────────────────────────────────────────────
const authRoutes    = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const chatRoutes    = require('./routes/chat');
const aiRoutes      = require('./routes/aiRoutes');
const teamRoutes    = require('./routes/teams');
const projectRoutes = require('./routes/projects');
const taskRoutes    = require('./routes/tasks');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, methods: ['GET', 'POST'] }
});

// ── Middleware ─────────────────────────────────────────────────────────────
// Note: @sentry/node v8+ no longer uses Sentry.Handlers.requestHandler()
// Request tracing is handled automatically by Sentry.init()
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(passport.initialize());

// Track request metrics
app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status_code: res.statusCode
    });
  });
  next();
});


const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/chat',     chatRoutes);
app.use('/api/ai',       aiRoutes);
app.use('/api/teams',    teamRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks',    taskRoutes);

app.get('/', (req, res) => res.json({ message: 'IntellMeet API Running!' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});


// ── Sentry error handler — @sentry/node v8 API ───────────────────────────
// setupExpressErrorHandler replaces the old Sentry.Handlers.errorHandler()
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// ── Generic error handler ──────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// ── Socket.io ─────────────────────────────────────────────────────────────
// Track which meeting each socket is in (for WebRTC cleanup on disconnect)
const socketMeetingMap = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // ── Meeting room ─────────────────────────────────────────────
  socket.on('join-meeting', (meetingId) => {
    socket.join(meetingId);
    socketMeetingMap.set(socket.id, meetingId);
    socket.to(meetingId).emit('user-joined', socket.id);
    console.log(`User ${socket.id} joined meeting ${meetingId}`);
  });

  socket.on('send-message', (data) => {
    io.to(data.meetingId).emit('receive-message', data);
  });

  socket.on('whiteboard-draw', (data) => {
    socket.to(data.meetingId).emit('whiteboard-draw', data);
  });

  socket.on('whiteboard-clear', (meetingId) => {
    io.to(meetingId).emit('whiteboard-clear');
  });

  socket.on('whiteboard-permission', (data) => {
    io.to(data.meetingId).emit('whiteboard-permission', data);
  });

  socket.on('new-transcript-line', (data) => {
    io.to(data.meetingId).emit('receive-transcript-line', data);
  });

  socket.on('hand-raise-changed', (data) => {
    socket.to(data.meetingId).emit('hand-raise-changed', data);
  });

  socket.on('leave-meeting', (meetingId) => {
    socket.leave(meetingId);
    socketMeetingMap.delete(socket.id);
    // Notify remaining peers so they can close the WebRTC connection
    socket.to(meetingId).emit('user-left', socket.id);
    socket.to(meetingId).emit('webrtc-peer-left', { socketId: socket.id });
  });

  // ── WebRTC Signaling ──────────────────────────────────────────
  // Step 1: New user announces they are in the room
  // Server relays to ALL existing peers so they can start offers
  socket.on('webrtc-join-room', ({ meetingId, userId, userName }) => {
    socket.to(meetingId).emit('webrtc-new-peer', {
      socketId: socket.id,
      userId,
      userName,
    });
    console.log(`[WebRTC] ${userName} (${socket.id}) joined room ${meetingId}`);
  });

  // Step 2: Initiator sends SDP offer to a specific peer
  socket.on('webrtc-offer', ({ to, offer, from, userName }) => {
    io.to(to).emit('webrtc-offer', { from, offer, userName });
  });

  // Step 3: Receiver sends SDP answer back to initiator
  socket.on('webrtc-answer', ({ to, answer, from }) => {
    io.to(to).emit('webrtc-answer', { from, answer });
  });

  // Step 4: Continuous ICE candidate exchange
  socket.on('webrtc-ice-candidate', ({ to, candidate, from }) => {
    io.to(to).emit('webrtc-ice-candidate', { from, candidate });
  });

  // Peer signals it is leaving (voluntary)
  socket.on('webrtc-leave-room', ({ meetingId }) => {
    socket.to(meetingId).emit('webrtc-peer-left', { socketId: socket.id });
  });

  // ── Kanban / Project room ─────────────────────────────────────
  socket.on('join-project', (projectId) => {
    socket.join(`project:${projectId}`);
  });

  socket.on('leave-project', (projectId) => {
    socket.leave(`project:${projectId}`);
  });

  socket.on('task-created', (data) => {
    // Broadcast to everyone else in the project room
    socket.to(`project:${data.projectId}`).emit('task-created', data);
  });

  socket.on('task-moved', (data) => {
    // data: { projectId, taskId, column, task }
    socket.to(`project:${data.projectId}`).emit('task-moved', data);
  });

  socket.on('task-updated', (data) => {
    socket.to(`project:${data.projectId}`).emit('task-updated', data);
  });

  socket.on('task-deleted', (data) => {
    socket.to(`project:${data.projectId}`).emit('task-deleted', data);
  });

  // ── Disconnect ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Notify meeting peers if socket disconnects unexpectedly
    const meetingId = socketMeetingMap.get(socket.id);
    if (meetingId) {
      socket.to(meetingId).emit('user-left', socket.id);
      socket.to(meetingId).emit('webrtc-peer-left', { socketId: socket.id });
      socketMeetingMap.delete(socket.id);
    }
  });
});

// ── MongoDB ────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('MongoDB Connected!'))
  .catch(err => console.log('MongoDB Error:', err));

mongoose.connection.on('error', err => {
  console.error('Mongoose connection error after initial connection:', err);
});

// ── Redis (optional — app works without it) ────────────────────────────────
const { getRedisClient } = require('./config/redis');
try {
  getRedisClient().connect().catch(() => {
    console.warn('[Redis] Running without Redis cache.');
  });
} catch {
  console.warn('[Redis] Could not initialise Redis client.');
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));