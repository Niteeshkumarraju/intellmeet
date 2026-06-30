const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Meeting = require('../models/Meeting');
const { uploadToCloudinary } = require('../config/cloudinary');
const { cacheGet, cacheSet, cacheDel, cacheDelPattern } = require('../config/redis');
const router = express.Router();

// Auth middleware
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Multer: store file in memory, max 500 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const MAX_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

const autoEndExpired = async (meeting) => {
  if (
    meeting.status === 'active' &&
    meeting.startTime &&
    Date.now() - new Date(meeting.startTime).getTime() > MAX_DURATION_MS
  ) {
    meeting.status = 'ended';
    meeting.endTime = new Date();
    await meeting.save();
    console.log(`Auto-ended meeting ${meeting._id} after 3 hours`);
  }
};

// ── Create meeting ─────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, scheduledTime, teamId } = req.body;
    const meeting = new Meeting({
      title,
      description,
      host: req.userId,
      participants: [req.userId],
      meetingCode: generateCode(),
      status: scheduledTime ? 'scheduled' : 'active',
      scheduledTime: scheduledTime ? new Date(scheduledTime) : undefined,
      startTime: scheduledTime ? undefined : new Date(),
      team: teamId || null,
    });
    await meeting.save();
    await meeting.populate('host', 'name email avatar');
    if (meeting.team) {
      await meeting.populate('team', 'name');
    }

    await cacheDelPattern(`meetings:${req.userId}*`);

    // Send meeting scheduled email (non-blocking)
    try {
      const { sendMeetingScheduledEmail } = require('../services/email');
      const timeStr = scheduledTime 
        ? new Date(scheduledTime).toLocaleString() 
        : 'Now';
      const joinUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/meeting/${meeting._id}`;
      sendMeetingScheduledEmail(
        meeting.host.email,
        meeting.host.name,
        meeting.title,
        timeStr,
        meeting.meetingCode,
        joinUrl
      ).catch(() => {});
    } catch {}

    res.status(201).json(meeting);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ── Get all meetings for user (with Redis cache) ───────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const cacheKey = `meetings:${req.userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const meetings = await Meeting.find({
      $or: [{ host: req.userId }, { participants: req.userId }],
    }).populate('host', 'name email avatar').populate('team').sort({ createdAt: -1 });

    await Promise.all(meetings.map(m => autoEndExpired(m)));

    await cacheSet(cacheKey, meetings, 60); // 60s TTL
    res.json(meetings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ── Get single meeting ─────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    let meeting = await Meeting.findById(req.params.id)
      .populate('host', 'name email avatar')
      .populate('participants', 'name email avatar')
      .populate('team');
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    if (meeting.status === 'scheduled') {
      meeting.status = 'active';
      meeting.startTime = new Date();
      await meeting.save();
      await cacheDelPattern(`meetings:${req.userId}*`);
    }

    await autoEndExpired(meeting);

    const isParticipant = meeting.participants.some(p => p._id.toString() === req.userId);
    if (!isParticipant) {
      meeting.participants.push(req.userId);
      await meeting.save();
      await meeting.populate('participants', 'name email avatar');
      await cacheDelPattern(`meetings:${req.userId}*`);
    }

    res.json(meeting);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ── Join meeting by code ───────────────────────────────────────────────────
router.post('/join/:code', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ meetingCode: req.params.code });
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (!meeting.participants.includes(req.userId)) {
      meeting.participants.push(req.userId);
      await meeting.save();
      await cacheDelPattern(`meetings:${req.userId}*`);
    }
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ── End meeting + save summary ─────────────────────────────────────────────
router.patch('/:id/end', auth, async (req, res) => {
  try {
    const { transcript, summary, actionItems } = req.body;
    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      { status: 'ended', endTime: new Date(), transcript, summary, actionItems },
      { new: true }
    ).populate('participants', 'name email');

    await cacheDelPattern(`meetings:${req.userId}*`);

    // Send action items summary email to each participant (non-blocking)
    if (actionItems && actionItems.length > 0) {
      try {
        const { sendActionItemsSummaryEmail } = require('../services/email');
        meeting.participants.forEach(p => {
          if (p.email) {
            sendActionItemsSummaryEmail(p.email, p.name, meeting.title, actionItems).catch(() => {});
          }
        });
      } catch {}
    }

    res.json(meeting);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ── Update action items ────────────────────────────────────────────────────
router.patch('/:id/action-items', auth, async (req, res) => {
  try {
    const { actionItems } = req.body;
    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      { actionItems },
      { new: true }
    );
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    await cacheDelPattern(`meetings:${req.userId}*`);
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ── Upload recording to Cloudinary (with Local Fallback) ───────────────────
router.post('/:id/recording', auth, upload.single('recording'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No recording file provided' });

    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    let recordingUrl;

    // Check Cloudinary credentials are configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === 'your_cloudinary_cloud_name') {
      // Local fallback storage
      const fs = require('fs');
      const path = require('path');
      const uploadsDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const filename = `recording_${req.params.id}_${Date.now()}.webm`;
      const filepath = path.join(uploadsDir, filename);
      
      fs.writeFileSync(filepath, req.file.buffer);
      
      // Construct local URL
      const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`;
      recordingUrl = `${serverUrl}/uploads/${filename}`;
      console.log(`[Recording] Saved local file fallback: ${filepath}`);
    } else {
      // Cloudinary storage
      const result = await uploadToCloudinary(req.file.buffer, 'intellmeet/recordings', {
        public_id: `meeting_${req.params.id}_${Date.now()}`,
        overwrite: true,
      });
      recordingUrl = result.secure_url;
    }

    meeting.recording = recordingUrl;
    await meeting.save();
    await cacheDelPattern(`meetings:${req.userId}*`);

    res.json({ recordingUrl, meeting });
  } catch (error) {
    console.error('Recording upload error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

// ── Delete recording ───────────────────────────────────────────────────────
router.delete('/:id/recording', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    
    // Delete local file if stored locally
    if (meeting.recording && meeting.recording.includes('/uploads/')) {
      const fs = require('fs');
      const path = require('path');
      const filename = meeting.recording.split('/uploads/')[1];
      const filepath = path.join(__dirname, '../uploads', filename);
      if (fs.existsSync(filepath)) {
        try {
          fs.unlinkSync(filepath);
          console.log(`[Recording] Deleted local file: ${filepath}`);
        } catch (e) {
          console.error('Failed to delete local recording file:', e);
        }
      }
    }
    
    meeting.recording = undefined;
    await meeting.save();
    await cacheDelPattern(`meetings:${req.userId}*`);
    
    res.json({ message: 'Recording deleted successfully', meeting });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ── Get public recording (no auth) ─────────────────────────────────────────
router.get('/public/recording/:id', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting || !meeting.recording) {
      return res.status(404).json({ message: 'Recording not found or not yet available' });
    }
    
    // Return only non-sensitive metadata for public sharing
    res.json({
      _id: meeting._id,
      title: meeting.title,
      description: meeting.description,
      recording: meeting.recording,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
    });
  } catch (error) {
    console.error('Fetch public recording error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;