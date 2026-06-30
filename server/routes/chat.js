const express = require('express');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const router = express.Router();

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

// Get messages for a meeting
router.get('/:meetingId', auth, async (req, res) => {
  try {
    const messages = await Message.find({ meeting: req.params.meetingId })
      .populate('sender', 'name email')
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Save a message
router.post('/', auth, async (req, res) => {
  try {
    const { meetingId, content } = req.body;
    const message = new Message({
      meeting: meetingId,
      sender: req.userId,
      content
    });
    await message.save();
    await message.populate('sender', 'name email');
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;