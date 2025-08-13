const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const Test = require('../models/Test');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Helper function to shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Helper function to check if test is currently active and visible to students
function isTestCurrentlyActive(test) {
  // First check if the test is marked as active
  if (!test.isActive) {
    return false;
  }
  
  // If no time restrictions are set, just use the isActive flag
  if (!test.activeFrom || !test.activeTo) {
    return test.isActive;
  }
  
  const now = new Date();
  const activeFrom = new Date(test.activeFrom);
  const activeTo = new Date(test.activeTo);
  
  // Check if dates are valid
  if (isNaN(activeFrom.getTime()) || isNaN(activeTo.getTime())) {
    return test.isActive;
  }
  
  // Test is visible if it's within the active period
  // Students should see all active tests, not just during entry grace period
  const isWithinActivePeriod = now >= activeFrom && now <= activeTo;
  
  return test.isActive && isWithinActivePeriod;
}

// Helper function to check if student can start a test (entry permission)
function canStartTest(test) {
  // First check if the test is marked as active
  if (!test.isActive) {
    return false;
  }
  
  // If no time restrictions are set, just use the isActive flag
  if (!test.activeFrom || !test.activeTo) {
    return test.isActive;
  }
  
  const now = new Date();
  const activeFrom = new Date(test.activeFrom);
  
  // Check if dates are valid
  if (isNaN(activeFrom.getTime())) {
    return test.isActive;
  }
  
  // Allow entry during grace period (default 10 minutes after start)
  const entryGracePeriod = test.entryGracePeriod || 10; // minutes
  const entryDeadline = new Date(activeFrom.getTime() + (entryGracePeriod * 60 * 1000));
  
  // Check if current time is within the entry window
  const canStart = now >= activeFrom && now <= entryDeadline;
  
  return test.isActive && canStart;
}

// Helper function to check if submission is allowed (for ongoing tests)
function canSubmitTest(test, testStartedAt) {
  // First check if the test is marked as active
  if (!test.isActive) {
    return false;
  }
  
  // If no time restrictions are set, just use the isActive flag
  if (!test.activeFrom || !test.activeTo) {
    return test.isActive;
  }
  
  const now = new Date();
  const activeTo = new Date(test.activeTo);
  const testStartTime = new Date(testStartedAt);
  
  // Check if dates are valid
  if (isNaN(activeTo.getTime()) || isNaN(testStartTime.getTime())) {
    return test.isActive;
  }
  
  // Calculate maximum allowed submission time
  const extensionPeriod = test.extensionPeriod || 10; // minutes
  const submissionDeadline = new Date(activeTo.getTime() + (extensionPeriod * 60 * 1000));
  
  // Also check if student has had enough time to complete the test
  const testDurationMs = test.duration * 60 * 1000; // test duration in milliseconds
  const studentTimeLimit = new Date(testStartTime.getTime() + testDurationMs);
  
  // Student can submit if:
  // 1. It's before the extended deadline, AND
  // 2. They haven't exceeded their individual time limit
  return now <= submissionDeadline && now <= studentTimeLimit;
}

// Helper function to check basic active status (for admin toggle - ignores time limits)
function isTestActive(test) {
  return test.isActive;
}

// Import test from Excel (Admin only)
router.post('/import-excel', adminAuth, upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No Excel file uploaded' });
    }

    const { duration, course, subject, activeFrom, activeTo, entryGracePeriod, extensionPeriod, shuffleQuestions, shuffleOptions, testType } = req.body;

    if (!duration) {
      return res.status(400).json({ message: 'Duration is required' });
    }

    if (!course) {
      return res.status(400).json({ message: 'Course selection is required' });
    }

    if (!subject) {
      return res.status(400).json({ message: 'Subject selection is required' });
    }

    let parsedSubject;
    try {
      parsedSubject = JSON.parse(subject);
      if (!parsedSubject.subjectCode || !parsedSubject.subjectName) {
        return res.status(400).json({ message: 'Subject must have both code and name' });
      }
    } catch (error) {
      return res.status(400).json({ message: 'Invalid subject format' });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Headers are in row 4 (index 3), data starts from row 6 (index 5)  
    const questions = [];
    for (let i = 5; i < data.length; i++) { // Start from row 6 (index 5)
      const row = data[i];
      if (row.length < 6) continue; // Skip incomplete rows

      const [sno, question, rightOption, option2, option3, option4] = row;
      
      if (!question || !rightOption || !option2 || !option3 || !option4) {
        continue; // Skip rows with missing data
      }

      // Create options array and find correct answer index
      const options = [rightOption, option2, option3, option4];
      const correctAnswerIndex = 0; // Since right option is always first in our array

      questions.push({
        question: question.toString().trim(),
        options: options.map(opt => opt.toString().trim()),
        correctAnswer: correctAnswerIndex
      });
    }

    if (questions.length === 0) {
      return res.status(400).json({ message: 'No valid questions found in Excel file' });
    }

    // Parse dates if provided
    let parsedActiveFrom = null;
    let parsedActiveTo = null;

    if (activeFrom) {
      parsedActiveFrom = new Date(activeFrom);
      if (isNaN(parsedActiveFrom.getTime())) {
        return res.status(400).json({ message: 'Invalid activeFrom date format' });
      }
    }

    if (activeTo) {
      parsedActiveTo = new Date(activeTo);
      if (isNaN(parsedActiveTo.getTime())) {
        return res.status(400).json({ message: 'Invalid activeTo date format' });
      }
    }

    if (parsedActiveFrom && parsedActiveTo && parsedActiveFrom >= parsedActiveTo) {
      return res.status(400).json({ message: 'activeFrom must be before activeTo' });
    }

    // Generate title from subject
    const lastDigit = parsedSubject.subjectCode.slice(-1);
    const test = new Test({
      duration,
      course,
      subject: parsedSubject,
      questions,
      createdBy: req.user._id,
      isActive: true,
      activeFrom: parsedActiveFrom,
      activeTo: parsedActiveTo,
      entryGracePeriod: entryGracePeriod ? parseInt(entryGracePeriod) : 10,
      extensionPeriod: extensionPeriod ? parseInt(extensionPeriod) : 10,
      shuffleQuestions: shuffleQuestions !== undefined ? shuffleQuestions : true,
      shuffleOptions: shuffleOptions !== undefined ? shuffleOptions : true,
      testType: testType || 'official'
    });

    await test.save();
    res.status(201).json({ 
      message: `Test created successfully with ${questions.length} questions`, 
      test: {
        _id: test._id,
        title: test.displayTitle,
        duration: test.duration,
        questionCount: questions.length,
        activeFrom: test.activeFrom,
        activeTo: test.activeTo,
        shuffleQuestions: test.shuffleQuestions,
        shuffleOptions: test.shuffleOptions
      }
    });
  } catch (error) {
    console.error('Import Excel error:', error);
    if (error.message === 'Only Excel files are allowed') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error while importing Excel file' });
  }
});

// Create a new test (Admin only)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { duration, course, subject, questions, showScoresToStudents, activeFrom, activeTo, entryGracePeriod, extensionPeriod, shuffleQuestions, shuffleOptions, testType } = req.body;

    // Validate required fields
    if (!duration || !course || !subject) {
      return res.status(400).json({ message: 'Duration, course, and subject are required' });
    }

    if (!subject.subjectCode || !subject.subjectName) {
      return res.status(400).json({ message: 'Subject must have both code and name' });
    }

    // Generate title from subject
    const lastDigit = subject.subjectCode.slice(-1);
    const title = `${subject.subjectName} (Paper ${lastDigit})`;

    // Parse dates if provided
    let parsedActiveFrom = null;
    let parsedActiveTo = null;

    if (activeFrom) {
      parsedActiveFrom = new Date(activeFrom);
      if (isNaN(parsedActiveFrom.getTime())) {
        return res.status(400).json({ message: 'Invalid activeFrom date format' });
      }
    }

    if (activeTo) {
      parsedActiveTo = new Date(activeTo);
      if (isNaN(parsedActiveTo.getTime())) {
        return res.status(400).json({ message: 'Invalid activeTo date format' });
      }
    }

    if (parsedActiveFrom && parsedActiveTo && parsedActiveFrom >= parsedActiveTo) {
      return res.status(400).json({ message: 'activeFrom must be before activeTo' });
    }

    const test = new Test({
      title,
      duration,
      course,
      subject,
      questions,
      createdBy: req.user._id,
      isActive: true, // Tests are active by default when created
      showScoresToStudents: showScoresToStudents || false,
      activeFrom: parsedActiveFrom,
      activeTo: parsedActiveTo,
      entryGracePeriod: entryGracePeriod || 10,
      extensionPeriod: extensionPeriod || 10,
      shuffleQuestions: shuffleQuestions !== undefined ? shuffleQuestions : true,
      shuffleOptions: shuffleOptions !== undefined ? shuffleOptions : true,
      testType: testType || 'official'
    });

    await test.save();
    res.status(201).json({ 
      message: 'Test created successfully', 
      test: {
        ...test.toJSON(),
        title: test.displayTitle
      }
    });
  } catch (error) {
    console.error('Create test error:', error);
    res.status(500).json({ message: 'Server error while creating test' });
  }
});

// Get all tests (for students - filtered by their course)
router.get('/', auth, async (req, res) => {
  try {
    let tests;
    
    if (req.user.role === 'student') {
      // Filter tests by student's course
      const Course = require('../models/Course');
      const studentCourse = await Course.findOne({ courseCode: req.user.course });
      
      if (!studentCourse) {
        return res.status(400).json({ message: 'Student course not found' });
      }
      
      const allTests = await Test.find({ course: studentCourse._id })
        .populate('createdBy', 'name')
        .populate('course', 'courseCode courseName')
        .sort({ createdAt: -1 });
      
      // Filter to only show tests that are currently active
      tests = allTests.filter(test => isTestCurrentlyActive(test));
    } else {
      // Admin can see all tests
      tests = await Test.find()
        .populate('createdBy', 'name')
        .populate('course', 'courseCode courseName')
        .sort({ createdAt: -1 });
    }

    res.json({ tests });
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all tests for admin (including inactive ones)
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const tests = await Test.find()
      .populate('createdBy', 'name')
      .populate('course', 'courseName courseCode')
      .sort({ createdAt: -1 });

    res.json({ tests });
  } catch (error) {
    console.error('Get admin tests error:', error);
    res.status(500).json({ message: 'Server error while fetching tests' });
  }
});

// Get a specific test by ID (for taking the test)
router.get('/:id', auth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate('createdBy', 'name');

    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    if (!canStartTest(test)) {
      // Provide detailed timing information for better error messages
      const now = new Date();
      const activeFrom = new Date(test.activeFrom);
      const entryGracePeriod = test.entryGracePeriod || 10;
      const entryDeadline = new Date(activeFrom.getTime() + (entryGracePeriod * 60 * 1000));
      
      let errorMessage = 'Test is not currently active';
      if (now < activeFrom) {
        errorMessage = `Test will be available from ${activeFrom.toLocaleString()}`;
      } else if (now > entryDeadline) {
        errorMessage = `Test entry period ended at ${entryDeadline.toLocaleString()}. You can no longer start this test.`;
      }
      
      return res.status(400).json({ message: errorMessage });
    }

    // Check if student has already submitted this test
    const Submission = require('../models/Submission');
    const existingSubmission = await Submission.findOne({
      testId: test._id,
      userId: req.user._id
    });

    if (existingSubmission) {
      return res.status(400).json({ message: 'You have already submitted this test' });
    }

    // Prepare questions with shuffling if enabled
    let questions = test.questions.map(q => ({
      _id: q._id,
      question: q.question,
      options: test.shuffleOptions ? shuffleArray(q.options) : q.options,
      originalCorrectAnswer: q.correctAnswer
    }));

    // Update correct answer index if options were shuffled
    if (test.shuffleOptions) {
      questions = questions.map(q => {
        const originalCorrectOption = test.questions.find(orig => orig._id.equals(q._id)).options[q.originalCorrectAnswer];
        const newCorrectIndex = q.options.indexOf(originalCorrectOption);
        return {
          _id: q._id,
          question: q.question,
          options: q.options
          // Don't include correct answer in response for security
        };
      });
    } else {
      questions = questions.map(q => ({
        _id: q._id,
        question: q.question,
        options: q.options
        // Don't include correct answer in response for security
      }));
    }

    // Shuffle questions if enabled
    if (test.shuffleQuestions) {
      questions = shuffleArray(questions);
    }

    // Calculate timing information
    const now = new Date();
    const activeFrom = new Date(test.activeFrom);
    const activeTo = new Date(test.activeTo);
    const entryGracePeriod = test.entryGracePeriod || 10;
    const extensionPeriod = test.extensionPeriod || 10;
    const entryDeadline = new Date(activeFrom.getTime() + (entryGracePeriod * 60 * 1000));
    const submissionDeadline = new Date(activeTo.getTime() + (extensionPeriod * 60 * 1000));

    const testForUser = {
      ...test.toObject(),
      questions,
      timing: {
        testStartedAt: now, // When student accessed the test
        entryDeadline: entryDeadline,
        submissionDeadline: submissionDeadline,
        entryGracePeriod: entryGracePeriod,
        extensionPeriod: extensionPeriod
      }
    };

    // Remove sensitive fields
    delete testForUser.shuffleQuestions;
    delete testForUser.shuffleOptions;

    res.json({ test: testForUser });
  } catch (error) {
    console.error('Get test error:', error);
    res.status(500).json({ message: 'Server error while fetching test' });
  }
});

// Get a specific test by ID for editing (Admin only)
router.get('/:id/edit', adminAuth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('course', 'courseCode courseName');

    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    res.json({ test });
  } catch (error) {
    console.error('Get test for edit error:', error);
    res.status(500).json({ message: 'Server error while fetching test' });
  }
});

// Update test (Admin only)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { duration, course, subject, questions, isActive, showScoresToStudents, activeFrom, activeTo, entryGracePeriod, extensionPeriod, shuffleQuestions, shuffleOptions, testType } = req.body;

    // Validate required fields
    if (course !== undefined && !course) {
      return res.status(400).json({ message: 'Course cannot be empty' });
    }

    if (subject !== undefined && (!subject.subjectCode || !subject.subjectName)) {
      return res.status(400).json({ message: 'Subject must have both code and name' });
    }

    // Parse dates if provided
    let parsedActiveFrom = null;
    let parsedActiveTo = null;

    if (activeFrom) {
      parsedActiveFrom = new Date(activeFrom);
      if (isNaN(parsedActiveFrom.getTime())) {
        return res.status(400).json({ message: 'Invalid activeFrom date format' });
      }
    }

    if (activeTo) {
      parsedActiveTo = new Date(activeTo);
      if (isNaN(parsedActiveTo.getTime())) {
        return res.status(400).json({ message: 'Invalid activeTo date format' });
      }
    }

    if (parsedActiveFrom && parsedActiveTo && parsedActiveFrom >= parsedActiveTo) {
      return res.status(400).json({ message: 'activeFrom must be before activeTo' });
    }

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    test.duration = duration || test.duration;
    test.course = course || test.course;
    
    // Update subject if provided
    if (subject) {
      test.subject = subject;
    }
    
    test.questions = questions || test.questions;
    test.isActive = isActive !== undefined ? isActive : test.isActive;
    test.showScoresToStudents = showScoresToStudents !== undefined ? showScoresToStudents : test.showScoresToStudents;
    test.activeFrom = parsedActiveFrom !== null ? parsedActiveFrom : test.activeFrom;
    test.activeTo = parsedActiveTo !== null ? parsedActiveTo : test.activeTo;
    test.entryGracePeriod = entryGracePeriod !== undefined ? entryGracePeriod : test.entryGracePeriod;
    test.extensionPeriod = extensionPeriod !== undefined ? extensionPeriod : test.extensionPeriod;
    test.shuffleQuestions = shuffleQuestions !== undefined ? shuffleQuestions : test.shuffleQuestions;
    test.shuffleOptions = shuffleOptions !== undefined ? shuffleOptions : test.shuffleOptions;
    test.testType = testType !== undefined ? testType : test.testType;

    // Only set default dates if test is being activated AND dates are not provided
    if (test.isActive && !test.activeFrom && !test.activeTo) {
      const now = new Date();
      test.activeFrom = now;
      // Set activeTo to 7 days from now as a default
      const futureDate = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
      test.activeTo = futureDate;
    }

    await test.save();
    
    res.json({ 
      message: 'Test updated successfully', 
      test: {
        ...test.toJSON(),
        title: test.displayTitle
      }
    });
  } catch (error) {
    console.error('Update test error:', error);
    res.status(500).json({ message: 'Server error while updating test' });
  }
});

// Toggle score visibility for a test (Admin only)
router.patch('/:id/toggle-scores', adminAuth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    test.showScoresToStudents = !test.showScoresToStudents;
    await test.save();

    res.json({ 
      message: `Score visibility ${test.showScoresToStudents ? 'enabled' : 'disabled'} for students`,
      showScoresToStudents: test.showScoresToStudents
    });
  } catch (error) {
    console.error('Toggle score visibility error:', error);
    res.status(500).json({ message: 'Server error while toggling score visibility' });
  }
});

// Delete test (Admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    await Test.findByIdAndDelete(req.params.id);
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Delete test error:', error);
    res.status(500).json({ message: 'Server error while deleting test' });
  }
});

module.exports = router;

