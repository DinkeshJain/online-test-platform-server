const mongoose = require('mongoose');

const examProgressSchema = new mongoose.Schema({
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
  answers: {
    type: Map,
    of: Number, // questionId -> selectedAnswerIndex
    default: new Map()
  },
  reviewFlags: {
    type: Map,
    of: Boolean, // questionId -> isMarkedForReview
    default: new Map()
  },
  currentQuestionIndex: {
    type: Number,
    default: 0
  },
  timeLeft: {
    type: Number, // Time left in seconds
    required: true
  },
  testStartedAt: {
    type: Date,
    required: true
  },
  lastSavedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Proctoring data
  proctoringData: {
    fullscreenExits: {
      type: Number,
      default: 0
    },
    windowSwitches: {
      type: Number,
      default: 0
    },
    tabSwitches: {
      type: Number,
      default: 0
    },
    violations: [{
      type: {
        type: String,
        enum: ['fullscreen_exit', 'window_blur', 'tab_switch', 'keyboard_shortcut', 'mouse_leave']
      },
      description: String,
      timestamp: Date,
      timeIntoTest: Number
    }]
  },
  // Network/system crash detection
  lastHeartbeat: {
    type: Date,
    default: Date.now
  },
  crashDetected: {
    type: Boolean,
    default: false
  },
  resumeCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
examProgressSchema.index({ testId: 1, userId: 1 }, { unique: true });
examProgressSchema.index({ lastHeartbeat: 1 });

module.exports = mongoose.model('ExamProgress', examProgressSchema);

