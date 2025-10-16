const mongoose = require('mongoose');

const supplementaryResultSchema = new mongoose.Schema({
  enrollmentNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  fatherName: {
    type: String,
    trim: true
  },
  course: {
    courseCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    courseName: {
      type: String,
      required: true,
      trim: true
    },
    semester: {
      type: String,
      required: true
    },
    academicYear: {
      type: String,
      required: true
    }
  },
  subjects: [{
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
    credits: {
      type: Number,
      required: true,
      min: 0
    },
    maxMarks: {
      type: Number,
      required: true,
      min: 0
    },
    marksObtained: {
      type: Number,
      required: true,
      min: 0
    },
    grade: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    gradePoints: {
      type: Number,
      required: true,
      min: 0,
      max: 10
    },
    marks: {
      internal: {
        type: Number,
        default: 0,
        min: 0
      },
      external: {
        type: Number,
        default: 0,
        min: 0
      },
      total: {
        type: Number,
        default: 0,
        min: 0
      }
    }
  }],
  semester: {
    type: String,
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  sgpa: {
    type: Number,
    required: true,
    min: 0,
    max: 10
  },
  totalCredits: {
    type: Number,
    required: true,
    min: 0
  },
  totalGradePoints: {
    type: Number,
    required: true,
    min: 0
  },
  supplementaryType: {
    type: String,
    enum: ['REAPPEAR', 'IMPROVEMENT', 'BACKLOG'],
    default: 'REAPPEAR'
  },
  originalExamDate: {
    type: Date
  },
  supplementaryExamDate: {
    type: Date
  },
  remarks: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  collection: 'supplementaryresults'
});

// Create compound index for efficient queries
supplementaryResultSchema.index({ 
  enrollmentNo: 1, 
  semester: 1, 
  academicYear: 1, 
  'course.courseCode': 1 
}, { unique: true });

supplementaryResultSchema.index({ enrollmentNo: 1 });
supplementaryResultSchema.index({ 'course.courseCode': 1 });
supplementaryResultSchema.index({ semester: 1, academicYear: 1 });

const SupplementaryResult = mongoose.model('SupplementaryResult', supplementaryResultSchema);

module.exports = SupplementaryResult;