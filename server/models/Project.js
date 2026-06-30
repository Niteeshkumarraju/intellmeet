const mongoose = require('mongoose');

const columnSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  color: { type: String, default: '#6366f1' },
}, { _id: false });

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  columns: {
    type: [columnSchema],
    default: [
      { id: 'todo', name: 'To Do', color: '#6366f1' },
      { id: 'inprogress', name: 'In Progress', color: '#f59e0b' },
      { id: 'done', name: 'Done', color: '#10b981' },
    ],
  },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
