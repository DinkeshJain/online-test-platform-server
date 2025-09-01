const express = require('express');
const mongoose = require('mongoose');
const Evaluator = require('../models/Evaluator');
const InternalMarks = require('../models/InternalMarks');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Test = require('../models/Test');
const Submission = require('../models/Submission');
const { adminAuth, evaluatorAuth, adminOrEvaluatorAuth } = require('../middleware/auth');
const DataCleanupUtility = require('../utils/dataCleanup');

const router = express.Router();

// Self-registration for evaluators (Public route)
router.post('/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;

    // Validate required fields
    if (!name || !username || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields (name, username, email, password) are required' 
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Check if evaluator already exists
    const existingEvaluator = await Evaluator.findOne({
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }]
    });

    if (existingEvaluator) {
      return res.status(400).json({ 
        success: false,
        message: 'An evaluator with this username or email already exists' 
      });
    }

    // Create new evaluator with empty assignments (admin will assign later)
    const evaluator = new Evaluator({
      name: name.trim(),
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password,
      assignedCourses: [],
      assignedSubjects: [],
      createdBy: null // Self-registered, not created by admin
    });

    await evaluator.save();

    res.status(201).json({
      success: true,
      message: 'Evaluator account created successfully! Please contact an admin to get course assignments.',
      evaluator: {
        id: evaluator._id,
        name: evaluator.name,
        username: evaluator.username,
        email: evaluator.email
      }
    });

  } catch (error) {
    console.error('Error in evaluator self-registration:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration' 
    });
  }
});

// Create new evaluator (Admin only)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { name, username, email, password, assignedCourses, assignedSubjects } = req.body;

    // Validate required fields
    if (!name || !username || !email || !password) {
      return res.status(400).json({ 
        message: 'Name, username, email, and password are required' 
      });
    }

    // Check if evaluator already exists
    const existingEvaluator = await Evaluator.findOne({
      $or: [{ username }, { email }]
    });

    if (existingEvaluator) {
      return res.status(400).json({ 
        message: 'Evaluator with this username or email already exists' 
      });
    }

    // Create new evaluator
    const evaluator = new Evaluator({
      name,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      assignedCourses: assignedCourses || [],
      assignedSubjects: assignedSubjects || [],
      createdBy: req.user._id
    });

    await evaluator.save();
    await evaluator.populate('assignedCourses', 'courseCode courseName');

    res.status(201).json({
      message: 'Evaluator created successfully',
      evaluator: {
        id: evaluator._id,
        name: evaluator.name,
        username: evaluator.username,
        email: evaluator.email,
        assignedCourses: evaluator.assignedCourses,
        assignedSubjects: evaluator.assignedSubjects,
        isActive: evaluator.isActive
      }
    });
  } catch (error) {
    console.error('Error creating evaluator:', error);
    res.status(500).json({ message: 'Server error while creating evaluator' });
  }
});

// Get all evaluators (Admin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    const evaluators = await Evaluator.find()
      .populate('assignedCourses', 'courseCode courseName')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ evaluators });
  } catch (error) {
    console.error('Error fetching evaluators:', error);
    res.status(500).json({ message: 'Server error while fetching evaluators' });
  }
});

// Get evaluator's assigned subjects and students for internal marks
router.get('/assigned-data', evaluatorAuth, async (req, res) => {
  try {
    const evaluator = await Evaluator.findById(req.user._id)
      .populate('assignedCourses', 'courseCode courseName subjects');

    if (!evaluator) {
      return res.status(404).json({ message: 'Evaluator not found' });
    }

    const assignedData = [];

    // Get data for each assigned subject
    for (const subject of evaluator.assignedSubjects) {
      const course = await Course.findById(subject.courseId);
      if (!course) continue;

      // Get students for this course
      const students = await Student.find({ course: course.courseCode })
        .select('enrollmentNo fullName emailId')
        .sort({ enrollmentNo: 1 });

      // Get tests for this subject
      const tests = await Test.find({
        course: course._id,
        'subject.subjectCode': subject.subjectCode
      }).select('title _id activeFrom activeTo');

      // Get existing internal marks for this subject
      const existingMarks = await InternalMarks.find({
        courseId: course._id,
        subjectCode: subject.subjectCode,
        evaluatorId: req.user._id
      }).populate('studentId', 'enrollmentNo fullName')
        .populate('testId', 'title');

      // Get hasExternalExam from course subjects
      const courseSubject = course.subjects.find(s => s.subjectCode === subject.subjectCode);
      const hasExternalExam = courseSubject ? courseSubject.hasExternalExam : true;

      assignedData.push({
        course: {
          _id: course._id,
          courseCode: course.courseCode,
          courseName: course.courseName
        },
        subject: {
          subjectCode: subject.subjectCode,
          subjectName: subject.subjectName,
          hasExternalExam: hasExternalExam
        },
        students,
        tests,
        existingMarks
      });
    }

    res.json({ assignedData });
  } catch (error) {
    console.error('Error fetching assigned data:', error);
    res.status(500).json({ message: 'Server error while fetching assigned data' });
  }
});

// Get student submissions for internal marking
router.get('/submissions/:courseId/:subjectCode', evaluatorAuth, async (req, res) => {
  try {
    const { courseId, subjectCode } = req.params;
    
    // Verify evaluator has access to this course/subject
    const evaluator = await Evaluator.findById(req.user._id);
    const hasAccess = evaluator.assignedSubjects.some(
      subject => subject.courseId.toString() === courseId && subject.subjectCode === subjectCode
    );

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this course/subject' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Get students for this course
    const students = await Student.find({ course: course.courseCode })
      .select('enrollmentNo fullName emailId')
      .sort({ enrollmentNo: 1 });

    // Get tests for this subject
    const tests = await Test.find({
      course: courseId,
      'subject.subjectCode': subjectCode
    }).select('title _id questions activeFrom activeTo');

    const submissionData = [];

    for (const student of students) {
      for (const test of tests) {
        // Get submission for this student-test combination
        const submission = await Submission.findOne({
          testId: test._id,
          userId: student._id
        });

        // Get existing internal marks
        const internalMark = await InternalMarks.findOne({
          studentId: student._id,
          testId: test._id,
          evaluatorId: req.user._id
        });

        submissionData.push({
          student: {
            _id: student._id,
            enrollmentNo: student.enrollmentNo,
            fullName: student.fullName,
            emailId: student.emailId
          },
          test: {
            _id: test._id,
            title: test.displayTitle,
            totalQuestions: test.questions.length,
            activeFrom: test.activeFrom,
            activeTo: test.activeTo
          },
          submission: submission ? {
            score: submission.score,
            totalQuestions: submission.totalQuestions,
            percentage: Math.round((submission.score / submission.totalQuestions) * 100),
            submittedAt: submission.submittedAt,
            timeSpent: submission.timeSpent
          } : null,
          internalMark: internalMark ? {
            marks: internalMark.internalMarks,
            comments: internalMark.evaluatorComments,
            lastUpdated: internalMark.lastUpdated
          } : null
        });
      }
    }

    res.json({ 
      course: {
        _id: course._id,
        courseCode: course.courseCode,
        courseName: course.courseName
      },
      subject: {
        subjectCode,
        subjectName: evaluator.assignedSubjects.find(s => s.subjectCode === subjectCode)?.subjectName
      },
      submissionData 
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Server error while fetching submissions' });
  }
});

// Debug route - can be accessed at /api/evaluators/debug-data
router.get('/debug-data', async (req, res) => {
  try {
    const studentCount = await Student.countDocuments();
    const courseCount = await Course.countDocuments({ isActive: { $ne: false } });
    const evaluatorCount = await Evaluator.countDocuments();
    
    const sampleStudents = await Student.find({}).select('course fullName enrollmentNo').limit(3);
    const sampleCourses = await Course.find({ isActive: { $ne: false } }).select('courseCode courseName').limit(3);
    const sampleEvaluators = await Evaluator.find({}).select('name assignedSubjects').limit(2);
    
    const studentCourses = await Student.distinct('course');
    const courseCodes = await Course.find({ isActive: { $ne: false } }).distinct('courseCode');
    
    res.json({
      counts: { studentCount, courseCount, evaluatorCount },
      samples: {
        students: sampleStudents,
        courses: sampleCourses,
        evaluators: sampleEvaluators
      },
      courseCodes: {
        fromStudents: studentCourses,
        fromCourses: courseCodes,
        mismatch: {
          studentsHaveButCoursesDoNot: studentCourses.filter(c => !courseCodes.includes(c)),
          coursesHaveButStudentsDoNot: courseCodes.filter(c => !studentCourses.includes(c))
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug route to check students data
router.get('/debug-students/:courseId/:subjectCode', evaluatorAuth, async (req, res) => {
  try {
    const { courseId, subjectCode } = req.params;
    
    // Get basic counts
    const totalStudents = await Student.countDocuments();
    const totalCourses = await Course.countDocuments();
    
    // Get course
    const course = await Course.findById(courseId);
    
    // Get all students
    const allStudents = await Student.find({}).select('course fullName enrollmentNo').limit(10);
    
    // Get students for this specific course if course exists
    let courseStudents = [];
    if (course) {
      courseStudents = await Student.find({ course: course.courseCode })
        .select('fullName enrollmentNo')
        .sort({ enrollmentNo: 1 }); // Sort by enrollment number in ascending order
    }
    
    res.json({
      debug: {
        totalStudents,
        totalCourses,
        courseId,
        subjectCode,
        course: course ? { courseCode: course.courseCode, courseName: course.courseName } : null,
        allStudents: allStudents.map(s => ({ course: s.course, name: s.fullName, enrollment: s.enrollmentNo })),
        courseStudents: courseStudents.map(s => ({ name: s.fullName, enrollment: s.enrollmentNo }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get students for internal marks evaluation (Evaluator only)
router.get('/students/:courseId/:subjectCode', evaluatorAuth, async (req, res) => {
  try {
    const { courseId, subjectCode } = req.params;
    const evaluatorId = req.user._id;

    // Verify evaluator has access to this course/subject
    const evaluator = await Evaluator.findById(evaluatorId);

    const hasAccess = evaluator.assignedSubjects.some(
      subject => subject.courseId.toString() === courseId && subject.subjectCode === subjectCode
    );

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this course/subject' });
    }

    // Get course and subject details
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const subject = evaluator.assignedSubjects.find(
      s => s.courseId.toString() === courseId && s.subjectCode === subjectCode
    );

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Get the actual subject details from the course to check hasExternalExam
    const courseSubject = course.subjects.find(s => s.subjectCode === subjectCode);
    const hasExternalExam = courseSubject ? courseSubject.hasExternalExam : true; // Default to true if not found

    // Get all students in this course sorted by enrollment number
    const students = await Student.find({ course: course.courseCode })
      .select('fullName enrollmentNo emailId')
      .sort({ enrollmentNo: 1 }); // Sort by enrollment number in ascending order

    // Get existing internal marks for these students
    const existingMarks = await InternalMarks.find({
      courseId,
      subjectCode,
      evaluatorId
    });

    // Combine student data with existing marks
    const studentsWithMarks = students.map(student => {
      const existingMark = existingMarks.find(mark => mark.studentId.toString() === student._id.toString());
      return {
        ...student.toObject(),
        name: student.fullName, // Add name field for consistency
        enrollmentNo: student.enrollmentNo,
        email: student.emailId,
        internalMark: existingMark || null
      };
    });

    res.json({
      course: {
        _id: course._id,
        courseCode: course.courseCode,
        courseName: course.courseName
      },
      subject: {
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        hasExternalExam: hasExternalExam
      },
      students: studentsWithMarks
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Server error while fetching students' });
  }
});

// Debug route to test connectivity
router.post('/debug-internal-marks', evaluatorAuth, async (req, res) => {
  try {
    console.log('Debug route hit');
    console.log('Request body:', req.body);
    console.log('User:', req.user);
    res.json({ message: 'Debug route working', body: req.body, user: req.user });
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({ message: 'Debug route error', error: error.message });
  }
});

// Update internal marks
router.post('/internal-marks', evaluatorAuth, async (req, res) => {
  try {
    console.log('Internal marks request received:', req.body);
    const { studentId, courseId, subjectCode, subjectName, internalMarks } = req.body;

    // Validate required fields
    if (!studentId || !courseId || !subjectCode) {
      console.log('Missing required fields:', { studentId, courseId, subjectCode, internalMarks });
      return res.status(400).json({ 
        message: 'Student, course, and subject are required' 
      });
    }

    // Check if marks are being cleared (empty string, null, or undefined)
    const isMarkBeingCleared = internalMarks === '' || internalMarks === null || internalMarks === undefined;

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      console.log('Invalid studentId:', studentId);
      return res.status(400).json({ message: 'Invalid student ID format' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      console.log('Invalid courseId:', courseId);
      return res.status(400).json({ message: 'Invalid course ID format' });
    }

    console.log('User from token:', req.user);

    // Verify evaluator has access to this course/subject
    const evaluator = await Evaluator.findById(req.user._id);
    console.log('Evaluator found:', evaluator);
    
    if (!evaluator) {
      console.log('Evaluator not found for ID:', req.user._id);
      return res.status(404).json({ message: 'Evaluator not found' });
    }

    // Check if evaluator has assigned subjects
    if (!evaluator.assignedSubjects || evaluator.assignedSubjects.length === 0) {
      console.log('No assigned subjects for evaluator');
      return res.status(403).json({ message: 'No subjects assigned to this evaluator' });
    }

    const hasAccess = evaluator.assignedSubjects.some(
      subject => subject.courseId.toString() === courseId && subject.subjectCode === subjectCode
    );

    console.log('Access check:', { hasAccess, assignedSubjects: evaluator.assignedSubjects, courseId, subjectCode });

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this course/subject' });
    }

    // Verify course exists and get subject details
    const course = await Course.findById(courseId);
    if (!course) {
      console.log('Course not found:', courseId);
      return res.status(404).json({ message: 'Course not found' });
    }

    // Find the subject in course to check hasExternalExam
    const courseSubject = course.subjects.find(s => s.subjectCode === subjectCode);
    const hasExternalExam = courseSubject ? courseSubject.hasExternalExam : true; // Default to true if not found

    // Handle marks validation
    let marksNum = null;
    if (!isMarkBeingCleared) {
      // Validate marks range based on whether subject has external exam
      marksNum = parseFloat(internalMarks);
      let maxMarks = hasExternalExam ? 30 : 100; // 30 for subjects with external exam, 100 for subjects without
      
      if (isNaN(marksNum) || marksNum < 0 || marksNum > maxMarks) {
        const marksType = hasExternalExam ? 'internal marks' : 'total marks';
        return res.status(400).json({ 
          message: `${marksType} must be a number between 0 and ${maxMarks}` 
        });
      }
    }

    // Verify student exists
    const student = await Student.findById(studentId);
    if (!student) {
      console.log('Student not found:', studentId);
      return res.status(404).json({ message: 'Student not found' });
    }

    // Query for existing marks with detailed logging
    const findQuery = {
      studentId: new mongoose.Types.ObjectId(studentId),
      courseId: new mongoose.Types.ObjectId(courseId),
      subjectCode,
      evaluatorId: req.user._id
    };
    
    console.log('Looking for existing mark with query:', findQuery);
    
    const existingMark = await InternalMarks.findOne(findQuery);
    console.log('Existing mark found:', existingMark);

    if (isMarkBeingCleared) {
      // If marks are being cleared, delete the existing record if it exists
      if (existingMark) {
        console.log('Deleting existing mark with ID:', existingMark._id);
        await InternalMarks.findByIdAndDelete(existingMark._id);
        console.log('Mark deleted successfully');
        return res.json({ 
          success: true,
          message: 'Internal marks cleared successfully' 
        });
      } else {
        console.log('No existing mark to clear');
        return res.json({ 
          success: true,
          message: 'No marks to clear' 
        });
      }
    }

    // Update or create internal marks
    const internalMarkData = {
      studentId: new mongoose.Types.ObjectId(studentId),
      courseId: new mongoose.Types.ObjectId(courseId),
      subjectCode,
      subjectName: subjectName || course.courseName,
      internalMarks: marksNum,
      evaluatorId: req.user._id,
      lastUpdated: new Date()
    };

    console.log('Internal mark data to save:', internalMarkData);

    if (existingMark) {
      // Update existing marks
      console.log('Updating existing mark with ID:', existingMark._id);
      const updatedMark = await InternalMarks.findByIdAndUpdate(
        existingMark._id, 
        internalMarkData,
        { new: true, runValidators: true }
      );
      console.log('Mark updated:', updatedMark);
    } else {
      // Create new marks entry
      console.log('Creating new internal mark entry');
      const newMark = new InternalMarks(internalMarkData);
      const savedMark = await newMark.save();
      console.log('New mark saved:', savedMark);
    }

    res.json({ 
      success: true,
      message: 'Internal marks saved successfully' 
    });
  } catch (error) {
    console.error('Error saving internal marks:', error);
    console.error('Error stack:', error.stack);
    
    // Handle specific MongoDB errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation error', 
        details: error.message 
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid data format', 
        details: error.message 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Duplicate entry - marks already exist for this combination' 
      });
    }
    
    res.status(500).json({ 
      message: 'Server error while saving internal marks', 
      error: error.message 
    });
  }
});

// Update evaluator (Admin only)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { name, email, assignedCourses, assignedSubjects, isActive } = req.body;

    const evaluator = await Evaluator.findById(req.params.id);
    if (!evaluator) {
      return res.status(404).json({ message: 'Evaluator not found' });
    }

    // Update fields
    if (name) evaluator.name = name;
    if (email) evaluator.email = email.toLowerCase();
    if (assignedCourses !== undefined) evaluator.assignedCourses = assignedCourses;
    if (assignedSubjects !== undefined) evaluator.assignedSubjects = assignedSubjects;
    if (isActive !== undefined) evaluator.isActive = isActive;

    await evaluator.save();
    await evaluator.populate('assignedCourses', 'courseCode courseName');

    res.json({
      message: 'Evaluator updated successfully',
      evaluator
    });
  } catch (error) {
    console.error('Error updating evaluator:', error);
    res.status(500).json({ message: 'Server error while updating evaluator' });
  }
});

// Delete evaluator (Admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const evaluator = await Evaluator.findById(req.params.id);
    if (!evaluator) {
      return res.status(404).json({ message: 'Evaluator not found' });
    }

    // Import required models for cascading deletion
    const InternalMarks = require('../models/InternalMarks');
    const mongoose = require('mongoose');

    // Start a transaction for data consistency
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Delete all internal marks records created by this evaluator
      const deletedInternalMarks = await InternalMarks.deleteMany(
        { evaluatorId: req.params.id },
        { session }
      );

      // Hard delete - completely remove evaluator from database
      const deletedEvaluator = await Evaluator.findByIdAndDelete(req.params.id, { session });

      // Commit the transaction
      await session.commitTransaction();

      // Perform auto-cleanup to ensure data consistency
      const autoCleanupSummary = await DataCleanupUtility.autoCleanupAfterDeletion();

      res.json({
        message: 'Evaluator and all associated data deleted successfully',
        deletionSummary: {
          evaluator: deletedEvaluator,
          internalMarksDeleted: deletedInternalMarks.deletedCount
        },
        autoCleanup: autoCleanupSummary
      });

    } catch (transactionError) {
      // Rollback transaction on error
      await session.abortTransaction();
      throw transactionError;
    } finally {
      // End session
      session.endSession();
    }

  } catch (error) {
    console.error('Error deleting evaluator:', error);
    res.status(500).json({ message: 'Server error while deleting evaluator' });
  }
});

module.exports = router;
