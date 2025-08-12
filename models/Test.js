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
    enum: ['demo', 'official'],
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

