const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  selectedAnswer: {
    type: Number,
    min: 0,
    max: 3
  },
  isCorrect: {
    type: Boolean,
    default: false
  },
  originalQuestionNumber: {
    type: Number,
    required: true
  },
  shuffledPosition: {
    type: Number,
    required: true
  },
  shuffledToOriginal: {
    type: [Number],
    required: true
  }
});

const submissionSchema = new mongoose.Schema({
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  // FIXED: Changed course field from ObjectId to String to match Student.course
  enrollmentNo: {
    type: String,
    required: true,
    index: true
  },
  course: {
    type: String,  // FIXED: Changed from ObjectId to String
    required: true,
    index: true,
    trim: true
  },
  testType: {
    type: String,
    enum: ['official', 'demo', 'practice'],
    default: 'official',
    index: true
  },
  answers: [answerSchema],
  score: {
    type: Number,
    default: 0
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  timeSpent: {
    type: Number,
    default: 0
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  testStartedAt: {
    type: Date,
    default: Date.now
  },
  // Progress tracking fields
  isDraft: {
    type: Boolean,
    default: false
  },
  lastSavedAt: {
    type: Date,
    default: Date.now
  },
  currentQuestionIndex: {
    type: Number,
    default: 0
  },
  timeLeftWhenSaved: {
    type: Number,
    default: 0
  },
  reviewFlags: {
    type: Map,
    of: Boolean,
    default: new Map()
  },
  autoSaveCount: {
    type: Number,
    default: 0
  },
  resumeCount: {
    type: Number,
    default: 0
  },
  crashDetected: {
    type: Boolean,
    default: false
  },
  lastHeartbeat: {
    type: Date,
    default: Date.now
  },
  savedTestStructure: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// FIXED: Updated compound indexes to work with String course field
submissionSchema.index({ course: 1, testType: 1 });
submissionSchema.index({ enrollmentNo: 1, course: 1 });
submissionSchema.index({ testId: 1, userId: 1, isDraft: 1 });
submissionSchema.index({ isDraft: 1, isCompleted: 1 });
submissionSchema.index({ course: 1, isDraft: 1, isCompleted: 1 });

module.exports = mongoose.model('Submission', submissionSchema);