const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  questions: [{
    question: {
      type: String,
      required: true
    },
    options: [{
      type: String,
      required: true
    }],
    correctAnswer: {
      type: Number,
      required: true
    },
    originalQuestionNumber: {
      type: Number,
      required: false // Will be auto-assigned if not present
    },
    shuffledToOriginal: {
      type: [Number],
      default: [0, 1, 2, 3] // Default option order
    }
  }],
  duration: {
    type: Number,
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  courseCode: {
    type: String,
    trim: true,
    uppercase: true
  },
  courseName: {
    type: String,
    trim: true
  },
  subject: {
    subjectCode: {
      type: String,
      required: true
    },
    subjectName: {
      type: String,
      required: true
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  showScoresToStudents: {
    type: Boolean,
    default: false
  },
  activeFrom: {
    type: Date,
    default: null
  },
  activeTo: {
    type: Date,
    default: null
  },
  shuffleQuestions: {
    type: Boolean,
    default: true
  },
  shuffleOptions: {
    type: Boolean,
    default: true
  },
  testType: {
    type: String,
    enum: ['demo', 'official', 'practice'],
    default: 'official',
    required: true
  }
}, {
  timestamps: true
});

// Virtual field for display title
testSchema.virtual('displayTitle').get(function() {
  if (this.subject && this.subject.subjectCode && this.subject.subjectName) {
    const lastDigit = this.subject.subjectCode.slice(-1);
    return `${this.subject.subjectCode}: ${this.subject.subjectName} (Paper ${lastDigit})`;
  }
  return 'Untitled Test';
});

// Ensure virtual fields are included when converting to JSON
testSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Test', testSchema);

