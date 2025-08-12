const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Evaluator = require('../models/Evaluator');
const { auth, adminAuth, evaluatorAuth } = require('../middleware/auth');

const router = express.Router();

// Register Admin
router.post('/register/admin', async (req, res) => {
  try {
    const { name, username } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin username already exists' });
    }

    // Create new admin with password same as username
    const admin = new Admin({
      name,
      username,
      password: username // Password is same as username
    });

    await admin.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: admin._id, userType: 'admin' },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Admin created successfully',
      token,
      user: {
        id: admin._id,
        name: admin.name,
        username: admin.username,
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({ message: 'Server error during admin registration' });
  }
});

// Login (works for admin, evaluator and student)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // First try to find admin
    let user = await Admin.findOne({ username });
    let userType = 'admin';

    // If not found in admin, try evaluator
    if (!user) {
      user = await Evaluator.findOne({ username }).populate('assignedCourses', 'courseCode courseName');
      userType = 'evaluator';
    }

    // If not found in evaluator, try student
    if (!user) {
      user = await Student.findOne({ username });
      userType = 'student';
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, userType: userType },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    // Prepare user response based on type
    let userResponse;
    if (userType === 'admin') {
      userResponse = {
        id: user._id,
        name: user.name,
        username: user.username,
        role: 'admin'
      };
    } else if (userType === 'evaluator') {
      userResponse = {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        assignedCourses: user.assignedCourses,
        assignedSubjects: user.assignedSubjects,
        role: 'evaluator'
      };
    } else {
      // Student login response
      userResponse = {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        enrollmentNo: user.enrollmentNo,
        course: user.course,
        studentPhoto: user.studentPhoto,
        role: 'student'
      };
    }

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    let userResponse;
    if (req.userType === 'admin') {
      userResponse = {
        id: req.user._id,
        name: req.user.name,
        username: req.user.username,
        role: 'admin'
      };
    } else if (req.userType === 'evaluator') {
      userResponse = {
        id: req.user._id,
        name: req.user.name,
        username: req.user.username,
        email: req.user.email,
        assignedCourses: req.user.assignedCourses,
        assignedSubjects: req.user.assignedSubjects,
        role: 'evaluator'
      };
    } else {
      userResponse = {
        id: req.user._id,
        fullName: req.user.fullName,
        username: req.user.username,
        enrollmentNo: req.user.enrollmentNo,
        course: req.user.course,
        studentPhoto: req.user.studentPhoto,
        role: 'student'
      };
    }

    res.json({ user: userResponse });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

