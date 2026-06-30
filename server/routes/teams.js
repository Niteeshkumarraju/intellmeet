const express = require('express');
const jwt = require('jsonwebtoken');
const Team = require('../models/Team');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
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

// Create a team
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Team name is required' });
    const team = new Team({
      name: name.trim(),
      description: description || '',
      owner: req.userId,
      members: [req.userId],
    });
    await team.save();
    await team.populate('owner members', 'name email avatar');
    res.status(201).json(team);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all teams for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const teams = await Team.find({ members: req.userId })
      .populate('owner', 'name email avatar')
      .populate('members', 'name email avatar')
      .sort({ createdAt: -1 });

    const teamsWithMeetings = await Promise.all(teams.map(async (t) => {
      const teamObj = t.toObject();
      const activeMeeting = await Meeting.findOne({ team: t._id, status: 'active' })
        .populate('host', 'name email avatar')
        .select('_id title meetingCode startTime host');
      teamObj.activeMeeting = activeMeeting || null;
      return teamObj;
    }));

    res.json(teamsWithMeetings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get a single team
router.get('/:id', auth, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('owner', 'name email avatar')
      .populate('members', 'name email avatar');
    if (!team) return res.status(404).json({ message: 'Team not found' });
    const isMember = team.members.some(m => m._id.toString() === req.userId);
    if (!isMember) return res.status(403).json({ message: 'Not a member of this team' });
    
    const teamObj = team.toObject();
    const activeMeeting = await Meeting.findOne({ team: team._id, status: 'active' })
      .populate('host', 'name email avatar')
      .select('_id title meetingCode startTime host');
    teamObj.activeMeeting = activeMeeting || null;

    res.json(teamObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Join team by invite code
router.post('/join/:inviteCode', auth, async (req, res) => {
  try {
    const team = await Team.findOne({ inviteCode: req.params.inviteCode.toUpperCase() });
    if (!team) return res.status(404).json({ message: 'Invalid invite code' });
    const alreadyMember = team.members.some(m => m.toString() === req.userId);
    if (!alreadyMember) {
      team.members.push(req.userId);
      await team.save();
    }
    await team.populate('owner members', 'name email avatar');
    res.json(team);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update team
router.patch('/:id', auth, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    if (team.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only owner can update team' });
    const { name, description } = req.body;
    if (name) team.name = name.trim();
    if (description !== undefined) team.description = description;
    await team.save();
    await team.populate('owner members', 'name email avatar');
    res.json(team);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Remove a member (owner only)
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    if (team.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only owner can remove members' });
    team.members = team.members.filter(m => m.toString() !== req.params.userId);
    await team.save();
    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
