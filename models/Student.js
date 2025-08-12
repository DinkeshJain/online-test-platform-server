const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const studentSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 3
  },
  enrollmentNo: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  batchYear: {
    type: String,
    required: true,
    trim: true
  },
  course: {
    type: String,
    required: true,
    trim: true
  },
  admissionDate: {
    type: Date,
    required: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female', 'Other'],
    trim: true
  },
  emailId: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  mobileNo: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number']
  },
  aadharNo: {
    type: String,
    trim: true,
    default: null
  },
  casteCategory: {
    type: String,
    trim: true,
    default: null
  },
  fatherName: {
    type: String,
    trim: true,
    default: null
  },
  motherName: {
    type: String,
    trim: true,
    default: null
  },
  addressLine1: {
    type: String,
    trim: true,
    default: null
  },
  addressLine2: {
    type: String,
    trim: true,
    default: null
  },
  city: {
    type: String,
    trim: true,
    default: null
  },
  state: {
    type: String,
    trim: true,
    default: null
  },
  pincode: {
    type: String,
    trim: true,
    default: null
  },
  studentPhoto: {
    type: String, // Will store the photo filename
    default: null
  }
}, {
  timestamps: true
});

// Hash password before saving
studentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
studentSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Student', studentSchema);
