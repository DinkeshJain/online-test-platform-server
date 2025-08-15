const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  subjectCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  subjectName: {
    type: String,
    required: true,
    trim: true
  },
  hasExternalExam: {
    type: Boolean,
    default: true // Default to having external exam (traditional system)
  }
}, { _id: true });

const courseSchema = new mongoose.Schema({
  courseName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  courseCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  description: {
    type: String,
    trim: true
  },
  duration: {
    type: String, // e.g., "4 years", "2 years"
    required: true,
    trim: true
  },
  subjects: [subjectSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  resultsReleased: {
    type: Boolean,
    default: false
  },
  resultsReleasedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for better search performance
courseSchema.index({ courseName: 1, courseCode: 1 });

module.exports = mongoose.model('Course', courseSchema);
