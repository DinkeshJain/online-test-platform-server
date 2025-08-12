const mongoose = require('mongoose');

const internalMarksSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: false
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  subjectCode: {
    type: String,
    required: true
  },
  subjectName: {
    type: String,
    required: true
  },
  internalMarks: {
    type: Number,
    required: true,
    min: 0,
    max: 30
  },
  evaluatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evaluator',
    required: true
  },
  evaluatorComments: {
    type: String,
    trim: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure one internal mark per student per subject per evaluator
internalMarksSchema.index({ studentId: 1, courseId: 1, subjectCode: 1, evaluatorId: 1 }, { unique: true });

module.exports = mongoose.model('InternalMarks', internalMarksSchema);
