const express = require('express');
const jwt = require('jsonwebtoken');
const Project = require('../models/Project');
const Team = require('../models/Team');
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

// Create a project
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, teamId } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Project name is required' });
    if (!teamId) return res.status(400).json({ message: 'Team ID is required' });

    // Verify user is a member of the team
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    const isMember = team.members.some(m => m.toString() === req.userId);
    if (!isMember) return res.status(403).json({ message: 'Not a member of this team' });

    const project = new Project({
      name: name.trim(),
      description: description || '',
      team: teamId,
      createdBy: req.userId,
    });
    await project.save();
    await project.populate('createdBy', 'name email');
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all projects for a team
router.get('/', auth, async (req, res) => {
  try {
    const { teamId } = req.query;
    if (!teamId) return res.status(400).json({ message: 'teamId query param is required' });

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    const isMember = team.members.some(m => m.toString() === req.userId);
    if (!isMember) return res.status(403).json({ message: 'Not a member of this team' });

    const projects = await Project.find({ team: teamId })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single project
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate('createdBy', 'name email');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const team = await Team.findById(project.team);
    const isMember = team?.members.some(m => m.toString() === req.userId);
    if (!isMember) return res.status(403).json({ message: 'Access denied' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update project
router.patch('/:id', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { ...(name && { name }), ...(description !== undefined && { description }) },
      { new: true }
    ).populate('createdBy', 'name email');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete project
router.delete('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
