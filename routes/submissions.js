const express = require('express');
const Test = require('../models/Test');
const Submission = require('../models/Submission');
const InternalMarks = require('../models/InternalMarks');
const { auth, adminAuth, adminOrEvaluatorAuth } = require('../middleware/auth');

const router = express.Router();

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
  const submissionDeadline = activeTo;
  
  // Also check if student has had enough time to complete the test
  const testDurationMs = test.duration * 60 * 1000; // test duration in milliseconds
  const studentTimeLimit = new Date(testStartTime.getTime() + testDurationMs);
  
  // Student can submit if:
  // 1. It's before the test end time, AND
  // 2. They haven't exceeded their individual time limit
  return now <= submissionDeadline && now <= studentTimeLimit;
}

// Submit test answers
router.post('/', auth, async (req, res) => {
  try {
    const { testId, answers, timeSpent, proctoring, testStartedAt } = req.body;

    // Get the test to validate answers
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // Check if user has already submitted this test
    const existingSubmission = await Submission.findOne({
      testId,
      userId: req.user._id
    });

    if (existingSubmission) {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // Validate submission timing - use provided testStartedAt or current time as fallback
    const studentTestStartTime = testStartedAt ? new Date(testStartedAt) : new Date();
    
    if (!canSubmitTest(test, studentTestStartTime)) {
      return res.status(400).json({ 
        message: 'Submission deadline has passed. The test is no longer accepting submissions.' 
      });
    }

    // Calculate score
    let score = 0;
    const processedAnswers = answers.map(answer => {
      const question = test.questions.id(answer.questionId);
      const isCorrect = question && question.correctAnswer === answer.selectedAnswer;
      if (isCorrect) score++;
      
      return {
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer,
        isCorrect
      };
    });

    // Create submission
    const submission = new Submission({
      testId,
      userId: req.user._id,
      answers: processedAnswers,
      score,
      totalQuestions: test.questions.length,
      timeSpent: timeSpent || 0,
      testStartedAt: studentTestStartTime,
      proctoring: proctoring || {}
    });

    await submission.save();

    // Return result only if test shows scores to students
    const result = {
      message: 'Test submitted successfully',
      submissionId: submission._id
    };

    if (test.showScoresToStudents) {
      result.score = score;
      result.totalQuestions = test.questions.length;
      result.percentage = Math.round((score / test.questions.length) * 100);
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ message: 'Server error while submitting test' });
  }
});

// Get user's submissions
router.get('/my-submissions', auth, async (req, res) => {
  try {
    const submissions = await Submission.find({ userId: req.user._id })
      .populate({
        path: 'testId',
        select: 'title duration showScoresToStudents'
      })
      .sort({ createdAt: -1 });

    const results = submissions
      .filter(submission => {
        const hasTestId = submission.testId !== null && submission.testId !== undefined;
        return hasTestId;
      })
      .map(submission => {
        return {
          _id: submission._id,
          testId: submission.testId._id, // Add this line to include the testId
          testTitle: submission.testId.displayTitle,
          score: submission.testId.showScoresToStudents ? submission.score : null,
          totalQuestions: submission.totalQuestions,
          percentage: submission.testId.showScoresToStudents && submission.totalQuestions > 0
            ? Math.round((submission.score / submission.totalQuestions) * 100)
            : null,
          timeSpent: submission.timeSpent,
          submittedAt: submission.createdAt
        };
      });

    res.json({ submissions: results });
  } catch (error) {
    console.error('Error fetching user submissions:', error);
    res.status(500).json({ message: 'Server error while fetching submissions' });
  }
});

// Get all submissions (Admin only)
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const submissions = await Submission.find()
      .populate('testId', 'title')
      .populate('userId', 'fullName username enrollmentNo')
      .sort({ createdAt: -1 });

    res.json({ submissions });
  } catch (error) {
    console.error('Error fetching admin submissions:', error);
    res.status(500).json({ message: 'Server error while fetching submissions' });
  }
});

// Get course results for admin (MOVED BEFORE /:id TO AVOID ROUTE CONFLICTS)
router.get('/course-results', adminAuth, async (req, res) => {
  try {
    const Course = require('../models/Course');
    const Student = require('../models/Student');
    
    // Get all courses
    const courses = await Course.find({ isActive: { $ne: false } }).sort({ courseCode: 1 });
    
    const courseResults = [];
    
    for (const course of courses) {
      // Get all students in this course
      const students = await Student.find({ course: course.courseCode })
        .sort({ enrollmentNo: 1 })
        .select('enrollmentNo fullName username emailId');
      
      if (students.length === 0) continue; // Skip courses with no students
      
      // Get all tests for this course
      const tests = await Test.find({ course: course._id })
        .populate('course', 'courseCode courseName')
        .sort({ 'subject.subjectCode': 1, createdAt: 1 });
      
      // Group tests by subject
      const testsBySubject = {};
      tests.forEach(test => {
        const subjectKey = test.subject?.subjectCode || 'unknown';
        if (!testsBySubject[subjectKey]) {
          testsBySubject[subjectKey] = {
            subjectCode: test.subject?.subjectCode || 'unknown',
            subjectName: test.subject?.subjectName || 'Unknown Subject',
            tests: []
          };
        }
        testsBySubject[subjectKey].tests.push(test);
      });
      
      const subjects = Object.values(testsBySubject);
      
      // Get student results
      const studentResults = [];
      
      for (const student of students) {
        const subjectResults = [];
        
        for (const subject of subjects) {
          let totalTestScore = 0;
          let totalPossibleScore = 0;
          let hasAttemptedAnyTest = false;
          
          // Calculate total test score for this subject
          for (const test of subject.tests) {
            try {
              const submission = await Submission.findOne({
                testId: test._id,
                userId: student._id
              });
              
              if (submission) {
                totalTestScore += submission.score || 0;
                hasAttemptedAnyTest = true;
              }
              totalPossibleScore += test.questions?.length || 0;
            } catch (submissionError) {
              console.error('Error fetching submission for student:', student.enrollmentNo, 'test:', test._id, submissionError);
            }
          }
          
          // Get internal marks for this subject
          let internalMark = null;
          try {
            internalMark = await InternalMarks.findOne({
              studentId: student._id,
              courseId: course._id,
              subjectCode: subject.subjectCode
            });
          } catch (internalMarkError) {
            console.error('Error fetching internal marks for student:', student.enrollmentNo, 'subject:', subject.subjectCode, internalMarkError);
          }
          
          subjectResults.push({
            subjectCode: subject.subjectCode,
            subjectName: subject.subjectName,
            testScore: hasAttemptedAnyTest ? totalTestScore : null,
            totalPossibleTestScore: totalPossibleScore,
            internalMarks: internalMark ? internalMark.internalMarks : null,
            internalMarksComments: internalMark ? internalMark.evaluatorComments : null
          });
        }
        
        studentResults.push({
          enrollmentNo: student.enrollmentNo,
          fullName: student.fullName,
          username: student.username,
          emailId: student.emailId,
          subjectResults: subjectResults
        });
      }
      
      // Check if results are released for this course
      const resultsReleased = course.resultsReleased || false;
      
      courseResults.push({
        courseId: course._id,
        courseCode: course.courseCode,
        courseName: course.courseName,
        subjects: subjects.map(s => ({
          subjectCode: s.subjectCode,
          subjectName: s.subjectName,
          maxMarks: 100 // Default, can be made configurable
        })),
        students: studentResults,
        resultsReleased: resultsReleased
      });
    }
    
    res.json({ courseResults });
  } catch (error) {
    console.error('Get course results error:', error);
    res.status(500).json({ 
      message: 'Server error while fetching course results',
      error: error.message 
    });
  }
});

// Get specific submission details (Admin only) - MOVED AFTER course-results
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('testId')
      .populate('userId', 'fullName username enrollmentNo');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    res.json({ submission });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ message: 'Server error while fetching submission' });
  }
});

// Track fullscreen exit
router.post('/fullscreen-exit', auth, async (req, res) => {
  try {
    const { testId, timestamp } = req.body;
    
    // You can implement additional logic here to track fullscreen exits
    // For now, just acknowledge the event
    
    res.json({ message: 'Fullscreen exit recorded' });
  } catch (error) {
    console.error('Fullscreen exit tracking error:', error);
    res.status(500).json({ message: 'Server error while tracking fullscreen exit' });
  }
});

// Get reports data for course and subject analysis
router.get('/reports/course-subject', adminAuth, async (req, res) => {
  try {
    const Course = require('../models/Course');
    const Student = require('../models/Student');
    
    // Get all courses with their tests and submissions
    const courses = await Course.find({ isActive: { $ne: false } }).populate('subjects');
    const reports = [];
    
    for (const course of courses) {
      // Group by subjects within each course
      for (const subject of course.subjects) {
        // Get all tests for this course and subject
        const tests = await Test.find({ 
          course: course._id,
          'subject.subjectCode': subject.subjectCode 
        }).sort({ createdAt: 1 });
        
        if (tests.length === 0) continue; // Skip if no tests for this subject
        
        // Get all students in this course
        const students = await Student.find({ course: course.courseCode })
          .sort({ enrollmentNo: 1 });
        
        // Prepare student results
        const studentResults = [];
        
        for (const student of students) {
          const testResults = [];
          
          for (const test of tests) {
            // Get submission for this student and test
            const submission = await Submission.findOne({
              testId: test._id,
              userId: student._id
            });
            
            // Get internal marks for this student and subject
            const internalMark = await InternalMarks.findOne({
              studentId: student._id,
              courseId: course._id,
              subjectCode: subject.subjectCode
            });
            
            const testResult = {
              test: {
                _id: test._id,
                title: test.displayTitle,
                totalQuestions: test.questions.length,
                maxMarks: test.questions.length,
                duration: test.duration, // Add test duration in minutes
                testType: test.testType || 'official' // Add test type
              },
              result: submission ? {
                status: 'attempted',
                score: submission.score,
                totalQuestions: submission.totalQuestions,
                percentage: Math.round((submission.score / submission.totalQuestions) * 100),
                submittedAt: submission.submittedAt,
                testStartedOn: submission.createdAt, // Use createdAt as test start time
                timeSpent: submission.timeSpent,
                answers: submission.answers,
                internalMarks: internalMark ? {
                  marks: internalMark.internalMarks,
                  comments: internalMark.evaluatorComments,
                  evaluatedBy: internalMark.evaluatedBy,
                  evaluatedAt: internalMark.createdAt
                } : null
              } : {
                status: 'not_attempted',
                score: 0,
                totalQuestions: test.questions.length,
                percentage: 0,
                internalMarks: internalMark ? {
                  marks: internalMark.internalMarks,
                  comments: internalMark.evaluatorComments,
                  evaluatedBy: internalMark.evaluatedBy,
                  evaluatedAt: internalMark.createdAt
                } : null
              }
            };
            
            testResults.push(testResult);
          }
          
          studentResults.push({
            student: {
              _id: student._id,
              fullName: student.fullName,
              enrollmentNo: student.enrollmentNo,
              emailId: student.emailId,
              course: student.course,
              fatherName: student.fatherName
            },
            testResults: testResults
          });
        }
        
        // Create report for this course-subject combination
        reports.push({
          course: {
            _id: course._id,
            courseCode: course.courseCode,
            courseName: course.courseName
          },
          subject: {
            subjectCode: subject.subjectCode,
            subjectName: subject.subjectName
          },
          tests: tests.map(test => ({
            _id: test._id,
            title: test.displayTitle,
            totalQuestions: test.questions.length,
            createdAt: test.createdAt,
            duration: test.duration,
            testType: test.testType || 'official'
          })),
          studentResults: studentResults,
          statistics: {
            totalStudents: students.length,
            totalTests: tests.length,
            averageScore: studentResults.length > 0 ? 
              studentResults.reduce((sum, sr) => {
                const totalScore = sr.testResults.reduce((testSum, tr) => testSum + tr.result.score, 0);
                return sum + totalScore;
              }, 0) / (studentResults.length * tests.length) : 0
          }
        });
      }
    }
    
    res.json({ reports });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ 
      message: 'Server error while fetching reports',
      error: error.message 
    });
  }
});

// Release results for a course
router.post('/release-results/:courseId', adminAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const Course = require('../models/Course');
    
    // Find the course and update results released status
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Add resultsReleased field to course if it doesn't exist
    if (!course.resultsReleased) {
      course.resultsReleased = true;
      course.resultsReleasedAt = new Date();
      await course.save();
    }

    res.json({ 
      message: 'Results released successfully',
      courseCode: course.courseCode,
      courseName: course.courseName
    });
  } catch (error) {
    console.error('Release results error:', error);
    res.status(500).json({ message: 'Server error while releasing results' });
  }
});

module.exports = router;