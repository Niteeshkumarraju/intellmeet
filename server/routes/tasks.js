const express = require('express');
const jwt = require('jsonwebtoken');
const Task = require('../models/Task');
const Project = require('../models/Project');
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

// Create task
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, projectId, column, assignee, priority, labels, dueDate } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: 'Task title is required' });
    if (!projectId) return res.status(400).json({ message: 'Project ID is required' });

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const taskCount = await Task.countDocuments({ project: projectId, column: column || 'todo' });
    const task = new Task({
      title: title.trim(),
      description: description || '',
      project: projectId,
      column: column || 'todo',
      assignee: assignee || null,
      createdBy: req.userId,
      priority: priority || 'medium',
      labels: labels || [],
      dueDate: dueDate || null,
      order: taskCount,
    });
    await task.save();
    await task.populate('assignee createdBy', 'name email avatar');
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all tasks for a project or for a teammate in a team
router.get('/', auth, async (req, res) => {
  try {
    const { projectId, teamId, assignee } = req.query;
    
    let query = {};
    if (projectId) {
      query.project = projectId;
    } else if (teamId && assignee) {
      // Find all projects in the team
      const projects = await Project.find({ team: teamId });
      const projectIds = projects.map(p => p._id);
      query.project = { $in: projectIds };
      query.assignee = assignee;
    } else if (assignee) {
      query.assignee = assignee;
    } else {
      return res.status(400).json({ message: 'projectId, assignee or teamId is required' });
    }

    const tasks = await Task.find(query)
      .populate('assignee createdBy', 'name email avatar')
      .sort({ column: 1, order: 1, createdAt: 1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update task (move column, edit, reassign)
router.patch('/:id', auth, async (req, res) => {
  try {
    const { title, description, column, assignee, priority, labels, dueDate, order } = req.body;
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(column && { column }),
        ...(assignee !== undefined && { assignee }),
        ...(priority && { priority }),
        ...(labels && { labels }),
        ...(dueDate !== undefined && { dueDate }),
        ...(order !== undefined && { order }),
      },
      { new: true }
    ).populate('assignee createdBy', 'name email avatar');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete task
router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
