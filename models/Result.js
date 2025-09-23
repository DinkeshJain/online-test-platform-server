const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  subjectCode: {
    type: String,
    required: true,
  },
  subjectName: {
    type: String,
    required: true,
  },
  credits: {
    type: Number,
    required: true,
  },
  grade: {
    type: String,
    required: true,
    enum: ['O', 'A', 'B', 'C', 'D', 'E', 'F', 'W'], // W for absent/withdrawal
  },
  gradePoints: {
    type: Number,
    required: true,
  },
  marks: {
    internal: {
      type: Number,
      required: true,
    },
    external: {
      type: Number,
      required: true,
    },
    total: {
      type: Number,
      required: true,
    }
  }
});

const resultSchema = new mongoose.Schema({
  enrollmentNo: {
    type: String,
    required: true,
    index: true,
  },
  fullName: {
    type: String,
    required: true,
  },
  fatherName: {
    type: String,
    required: true,
  },
  course: {
    courseCode: {
      type: String,
      required: true,
    },
    courseName: {
      type: String,
      required: true,
    }
  },
  subjects: [subjectSchema],
  sgpa: {
    type: Number,
    required: true,
  },
  semester: {
    type: Number,
    required: true,
  },
  academicYear: {
    type: String,
    required: true,
  },
  isReleased: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

// Update the updatedAt timestamp before saving
resultSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for overall status (Pass/Fail)
resultSchema.virtual('status').get(function() {
  return this.subjects.some(subject => subject.grade === 'F') ? 'FAIL' : 'PASS';
});

const Result = mongoose.model('Result', resultSchema);

module.exports = Result;