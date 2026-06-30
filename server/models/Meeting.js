const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  meetingCode: { type: String, unique: true },
  status: { type: String, enum: ['scheduled', 'active', 'ended'], default: 'scheduled' },
  startTime: { type: Date },
  endTime: { type: Date },
  transcript: { type: String, default: '' },
  summary: { type: String, default: '' },
  actionItems: [{ 
    task: String, 
    assignee: String, 
    completed: { type: Boolean, default: false }
  }],
  recording: { type: String, default: '' },
  scheduledTime: { type: Date },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Meeting', meetingSchema);