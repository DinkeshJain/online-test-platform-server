const express = require('express');
const Test = require('../models/Test');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
const InternalMarks = require('../models/InternalMarks');
const { auth, adminAuth, adminOrEvaluatorAuth } = require('../middleware/auth');

const router = express.Router();

// Helper function to check if submission is allowed (for ongoing tests)
function canSubmitTest(test, testStartedAt) {
  if (!test.isActive) {
    return false;
  }

  if (!test.activeFrom || !test.activeTo) {
    return test.isActive;
  }

  const now = new Date();
  const activeTo = new Date(test.activeTo);
  const testStartTime = new Date(testStartedAt);

  if (isNaN(activeTo.getTime()) || isNaN(testStartTime.getTime())) {
    return test.isActive;
  }

  const submissionDeadline = activeTo;
  const testDurationMs = test.duration * 60 * 1000;
  const studentTimeLimit = new Date(testStartTime.getTime() + testDurationMs);

  return now <= submissionDeadline && now <= studentTimeLimit;
}

// ✅ FIXED: Auto-save route with proper originalQuestionNumber handling
router.post('/auto-save', auth, async (req, res) => {
  try {
    const { testId, answers, reviewFlags, currentQuestionIndex, timeLeft, testStartedAt, testStructure } = req.body;

    if (!testId || timeLeft === undefined) {
      return res.status(400).json({ message: 'testId and timeLeft are required' });
    }

    // Get the test to validate
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // IMPORTANT: Check only for FINAL submissions, not drafts
    const existingFinalSubmission = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: false,
      isCompleted: true
    });

    if (existingFinalSubmission) {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // ✅ FIXED: Process answers for auto-save with proper originalQuestionNumber
    const processedAnswers = [];
    if (answers && typeof answers === 'object') {
      for (const [questionId, selectedAnswer] of Object.entries(answers)) {
        if (selectedAnswer !== null && selectedAnswer !== undefined) {
          const question = test.questions.id(questionId);
          let isCorrect = false;

          if (question && selectedAnswer !== null && selectedAnswer !== undefined) {
            isCorrect = question.correctAnswer === selectedAnswer;
          }

          // ✅ FIXED: Calculate proper original question number
          let originalQuestionNumber = 1;
          if (question) {
            const questionIndex = test.questions.findIndex(q => q._id.toString() === questionId);
            originalQuestionNumber = question.originalQuestionNumber || question.questionNumber || (questionIndex + 1);
          }

          processedAnswers.push({
            questionId,
            selectedAnswer,
            isCorrect,
            originalQuestionNumber, // ✅ NOW USES CORRECT VALUE
            shuffledPosition: processedAnswers.length + 1,
            shuffledToOriginal: question?.shuffledToOriginal || []
          });
        }
      }
    }

    // Calculate current score
    const currentScore = processedAnswers.filter(answer => answer.isCorrect).length;

    // Convert reviewFlags to Map if it's an object
    let reviewFlagsMap = new Map();
    if (reviewFlags && typeof reviewFlags === 'object') {
      for (const [key, value] of Object.entries(reviewFlags)) {
        if (value) {
          reviewFlagsMap.set(key, value);
        }
      }
    }

    // FIXED: Find existing draft to get current auto-save count
    const existingDraft = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: true
    });

    const currentAutoSaveCount = existingDraft ? (existingDraft.autoSaveCount || 0) : 0;
    const testWithCourse = await Test.findById(testId).populate('course', 'courseCode');

    // ✅ ENHANCED: Synchronize heartbeat with auto-save to fix timestamp mismatch
    const now = new Date();

    // Update or create draft submission
    const submissionData = {
      testId,
      userId: req.user._id,
      answers: processedAnswers,
      score: currentScore,
      totalQuestions: test.questions.length,
      timeSpent: (test.duration * 60) - timeLeft,
      testStartedAt: testStartedAt ? new Date(testStartedAt) : new Date(),
      isDraft: true,
      lastSavedAt: now, // ✅ Synchronized timestamp
      lastHeartbeat: now, // ✅ Update heartbeat at same time
      currentQuestionIndex: currentQuestionIndex || 0,
      timeLeftWhenSaved: timeLeft,
      reviewFlags: reviewFlagsMap,
      isCompleted: false,
      crashDetected: false,

      // NEW: Add denormalized fields for performance
      enrollmentNo: req.user.enrollmentNo,
      course: testWithCourse.course.courseCode,
      testType: test.testType || 'official',

      // FIXED: Increment auto-save count properly
      autoSaveCount: currentAutoSaveCount + 1,

      // Keep existing resume count (don't change it here)
      resumeCount: existingDraft ? existingDraft.resumeCount || 0 : 0,

      // Save the test structure exactly as presented to student
      savedTestStructure: testStructure ? JSON.stringify(testStructure) : null
    };

    const submission = await Submission.findOneAndUpdate(
      { testId, userId: req.user._id, isDraft: true },
      submissionData,
      { upsert: true, new: true }
    );

    res.json({
      message: 'Progress saved successfully',
      lastSavedAt: submission.lastSavedAt,
      autoSaveCount: submission.autoSaveCount
    });

  } catch (error) {
    console.error('Auto-save error:', error);
    res.status(500).json({ message: 'Server error while saving progress' });
  }
});

// FIXED: Load progress route - DON'T increment resume count here
router.get('/load-progress/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;

    // Check if test exists
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // IMPORTANT: Check only for FINAL submissions
    const completedSubmission = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: false,
      isCompleted: true
    });

    if (completedSubmission) {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // Find draft submission
    const draftSubmission = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: true
    });

    if (!draftSubmission) {
      return res.json({ hasProgress: false });
    }

    // Check if progress is not too old
    const now = new Date();
    const timeSinceLastSave = (now - draftSubmission.lastSavedAt) / 1000;

    if (timeSinceLastSave > 900) {  // 15 minutes
      return res.status(400).json({
        message: 'Saved progress is too old. Please start the test again.'
      });
    }

    // Convert answers to object format
    const answersObj = {};
    draftSubmission.answers.forEach(answer => {
      answersObj[answer.questionId] = answer.selectedAnswer;
    });

    // Convert reviewFlags Map to object
    const reviewFlagsObj = {};
    if (draftSubmission.reviewFlags) {
      for (let [key, value] of draftSubmission.reviewFlags) {
        reviewFlagsObj[key] = value;
      }
    }

    // Parse saved test structure
    let savedTestStructure = null;
    if (draftSubmission.savedTestStructure) {
      try {
        savedTestStructure = JSON.parse(draftSubmission.savedTestStructure);
      } catch (error) {
        console.error('Error parsing saved test structure:', error);
      }
    }

    // FIXED: DON'T increment resume count here - only when user clicks "Resume Test"
    // Just mark that crash was detected but don't increment counter yet
    draftSubmission.crashDetected = true;
    await draftSubmission.save();

    res.json({
      hasProgress: true,
      progress: {
        answers: answersObj,
        reviewFlags: reviewFlagsObj,
        currentQuestionIndex: draftSubmission.currentQuestionIndex || 0,
        timeLeft: draftSubmission.timeLeftWhenSaved || test.duration * 60,
        testStartedAt: draftSubmission.testStartedAt,
        resumeCount: draftSubmission.resumeCount || 0, // Show current count without incrementing
        lastSavedAt: draftSubmission.lastSavedAt,
        autoSaveCount: draftSubmission.autoSaveCount || 0,
        savedTestStructure: savedTestStructure
      }
    });

  } catch (error) {
    console.error('Error loading progress:', error);
    res.status(500).json({ message: 'Server error while loading progress' });
  }
});

// NEW: Resume test route - increment resume count only when user clicks "Resume Test"
router.post('/resume-test/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;

    // Find draft submission
    const draftSubmission = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: true
    });

    if (!draftSubmission) {
      return res.status(404).json({ message: 'No saved progress found' });
    }

    // FIXED: Increment resume count only when user actually resumes
    draftSubmission.resumeCount = (draftSubmission.resumeCount || 0) + 1;
    draftSubmission.crashDetected = true;
    await draftSubmission.save();

    res.json({
      message: 'Resume count updated',
      resumeCount: draftSubmission.resumeCount
    });

  } catch (error) {
    console.error('Error updating resume count:', error);
    res.status(500).json({ message: 'Server error while updating resume count' });
  }
});

// Heartbeat endpoint for crash detection
router.post('/heartbeat/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;

    await Submission.findOneAndUpdate(
      { testId, userId: req.user._id, isDraft: true },
      {
        lastHeartbeat: new Date(),
        crashDetected: false
      }
    );

    res.json({ message: 'Heartbeat recorded' });
  } catch (error) {
    console.error('Error recording heartbeat:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ FIXED: Submit test answers - only save answered questions with enhanced metadata
router.post('/', auth, async (req, res) => {
  try {
    const { testId, answers, timeSpent, testStartedAt, proctoring, totalQuestions, answeredQuestions, unansweredQuestions } = req.body;

    // Better validation
    if (!testId) {
      return res.status(400).json({ message: 'testId is required' });
    }
    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'answers must be an array' });
    }
    if (typeof timeSpent !== 'number') {
      return res.status(400).json({ message: 'timeSpent must be a number' });
    }

    // Get the test to validate answers
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // Check if user has already submitted this test (FINAL submission)
    const existingFinalSubmission = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: false,
      isCompleted: true
    });

    if (existingFinalSubmission) {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // Validate submission timing
    const studentTestStartTime = testStartedAt ? new Date(testStartedAt) : new Date();
    if (!canSubmitTest(test, studentTestStartTime)) {
      return res.status(400).json({
        message: 'Submission deadline has passed. The test is no longer accepting submissions.'
      });
    }

    // ✅ ENHANCED: Log submission details for debugging
    console.log(`Submission received:`, {
      userId: req.user.enrollmentNo,
      testId,
      totalQuestions: totalQuestions || test.questions.length,
      answeredQuestions: answeredQuestions || answers.length,
      unansweredQuestions: unansweredQuestions || (test.questions.length - answers.length),
      isAutoSubmitted: proctoring?.isAutoSubmitted || false,
      violations: proctoring?.totalViolations || 0
    });

    // Calculate score only for answered questions
    let score = 0;
    const processedAnswers = answers.map((answer, index) => {
      const question = test.questions.id(answer.questionId);

      let isCorrect = false;
      if (question && answer.shuffledToOriginal && Array.isArray(answer.shuffledToOriginal)) {
        const selectedOriginalIndex = answer.shuffledToOriginal[answer.selectedAnswer];
        isCorrect = selectedOriginalIndex === question.correctAnswer;
      } else {
        isCorrect = question && question.correctAnswer === answer.selectedAnswer;
      }

      if (isCorrect) score++;

      return {
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer,
        isCorrect,
        originalQuestionNumber: answer.originalQuestionNumber || (index + 1),
        shuffledPosition: index + 1,
        shuffledToOriginal: answer.shuffledToOriginal || []
      };
    });

    const testWithCourse = await Test.findById(testId).populate('course', 'courseCode');
    if (!testWithCourse) {
      return res.status(404).json({ message: 'Test not found' });
    }
    if (!testWithCourse.course) {
      return res.status(400).json({ message: 'Test course not found' });
    }

    // ✅ ENHANCED: Create FINAL submission with comprehensive metadata
    const submissionTime = new Date();
    const submission = new Submission({
      testId,
      userId: req.user._id,
      answers: processedAnswers,
      score,
      totalQuestions: totalQuestions || test.questions.length,
      answeredQuestions: answeredQuestions || answers.length, // ✅ Track answered count
      unansweredQuestions: unansweredQuestions || (test.questions.length - answers.length), // ✅ Track unanswered count
      timeSpent: timeSpent || 0,
      testStartedAt: studentTestStartTime,
      submittedAt: submissionTime, // ✅ Set submission timestamp
      lastSavedAt: submissionTime, // ✅ Set last saved as submission time for final submissions
      isCompleted: true,
      isDraft: false, // Mark as final submission

      // ✅ Add proctoring metadata
      isAutoSubmitted: proctoring?.isAutoSubmitted || false,
      proctoringViolations: proctoring?.totalViolations || 0,
      submissionReason: proctoring?.isAutoSubmitted ? 'auto_submitted' : 'manual_submitted',

      // NEW: Add denormalized fields for performance
      enrollmentNo: req.user.enrollmentNo,
      course: testWithCourse.course.courseCode,
      testType: test.testType || 'official'
    });

    await submission.save();

    // Clean up any draft submissions for this test
    await Submission.deleteMany({
      testId,
      userId: req.user._id,
      isDraft: true
    });

    // Return result only if test shows scores to students
    const result = {
      message: 'Test submitted successfully',
      submissionId: submission._id,
      answeredQuestions: submission.answeredQuestions,
      totalQuestions: submission.totalQuestions
    };

    if (test.showScoresToStudents) {
      result.score = score;
      result.percentage = submission.totalQuestions > 0 ? Math.round((score / submission.totalQuestions) * 100) : 0;
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
    const submissions = await Submission.find({
      userId: req.user._id,
      isDraft: false,  // Only show final submissions
      isCompleted: true
    })
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
          testId: submission.testId._id,
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
    const submissions = await Submission.find({
      isDraft: false,  // Only show final submissions
      isCompleted: true
    })
      .populate('testId', 'title')
      .populate('userId', 'fullName username enrollmentNo')
      .sort({ createdAt: -1 });

    res.json({ submissions });
  } catch (error) {
    console.error('Error fetching admin submissions:', error);
    res.status(500).json({ message: 'Server error while fetching submissions' });
  }
});

// ✅ FIXED: Get course results for admin - added missing await
router.get('/course-results', adminAuth, async (req, res) => {
  try {
    const Course = require('../models/Course');
    const Student = require('../models/Student');

    const courses = await Course.find({ isActive: { $ne: false } }).sort({ courseCode: 1 });
    const courseResults = [];

    for (const course of courses) {
      // ✅ FIXED: Added missing await
      const students = await Student.find({ course: course.courseCode })
        .sort({ enrollmentNo: 1 })
        .select('enrollmentNo fullName username emailId');

      if (students.length === 0) continue;

      const tests = await Test.find({ course: course.courseCode })
        .populate('course', 'courseCode courseName')
        .sort({ 'subject.subjectCode': 1, createdAt: 1 });

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
      const studentResults = [];

      for (const student of students) {
        const subjectResults = [];

        for (const subject of subjects) {
          let totalTestScore = 0;
          let totalPossibleScore = 0;
          let hasAttemptedAnyTest = false;

          for (const test of subject.tests) {
            try {
              const submission = await Submission.findOne({
                testId: test._id,
                userId: student._id,
                enrollmentNo: student.enrollmentNo,  // Use denormalized field
                course: course.courseCode,                   // Use denormalized field
                isDraft: false,
                isCompleted: true
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

      const resultsReleased = course.resultsReleased || false;

      courseResults.push({
        courseId: course._id,
        courseCode: course.courseCode,
        courseName: course.courseName,
        subjects: subjects.map(s => ({
          subjectCode: s.subjectCode,
          subjectName: s.subjectName,
          maxMarks: 100
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

// Get specific submission details (Admin only)
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

    const courses = await Course.find({ isActive: { $ne: false } }).populate('subjects');
    const reports = [];

    for (const course of courses) {
      for (const subject of course.subjects) {
        const tests = await Test.find({
          course: course._id,
          'subject.subjectCode': subject.subjectCode
        }).sort({ createdAt: 1 });

        if (tests.length === 0) continue;

        const students = await Student.find({ course: course._id })
          .sort({ enrollmentNo: 1 });

        const studentResults = [];
        for (const student of students) {
          const testResults = [];

          for (const test of tests) {
            const submission = await Submission.findOne({
              testId: test._id,
              userId: student._id,
              isDraft: false,
              isCompleted: true
            });

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
                duration: test.duration,
                testType: test.testType || 'official'
              },
              result: submission ? {
                status: 'attempted',
                score: submission.score,
                totalQuestions: submission.totalQuestions,
                percentage: Math.round((submission.score / submission.totalQuestions) * 100),
                submittedAt: submission.submittedAt,
                testStartedOn: submission.createdAt,
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

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

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

// Add timezone utility at the top
const TimezoneUtils = require('../utils/timezone');

// Get distinct submission dates for the attendance filter
router.get('/attendance/dates', adminAuth, async (req, res) => {
  try {
    // Get distinct submission dates from completed submissions
    const submissionDates = await Submission.aggregate([
      {
        $match: {
          isDraft: false,
          isCompleted: true,
          submittedAt: { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$submittedAt"
            }
          },
          count: { $sum: 1 },
          testTypes: { $addToSet: "$testType" }
        }
      },
      {
        $sort: { _id: -1 }
      },
      {
        $project: {
          date: "$_id",
          count: 1,
          testTypes: 1,
          _id: 0
        }
      }
    ]);

    res.json({
      dates: submissionDates
    });

  } catch (error) {
    console.error('Error fetching submission dates:', error);
    res.status(500).json({
      message: 'Server error while fetching submission dates',
      error: error.message
    });
  }
});

// Get test types for a specific date
router.get('/attendance/test-types/:date', adminAuth, async (req, res) => {
  try {
    const { date } = req.params;
    
    // Parse date and create range for the day
    const startDate = new Date(date + 'T00:00:00.000Z');
    const endDate = new Date(date + 'T23:59:59.999Z');

    const testTypes = await Submission.aggregate([
      {
        $match: {
          isDraft: false,
          isCompleted: true,
          submittedAt: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: "$testType",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          testType: "$_id",
          count: 1,
          _id: 0
        }
      }
    ]);

    res.json({
      testTypes: testTypes
    });

  } catch (error) {
    console.error('Error fetching test types:', error);
    res.status(500).json({
      message: 'Server error while fetching test types',
      error: error.message
    });
  }
});

// New attendance route with date and testType filtering
router.get('/attendance/data', adminAuth, async (req, res) => {
  try {
    const { 
      date,
      testType,
      course: selectedCourse,
      status: selectedStatus,
      page = 1, 
      limit = 50,
      search = ''
    } = req.query;

    console.log('📊 New Attendance API called:', { date, testType, selectedCourse, selectedStatus, page, limit, search });

    // Validate required parameters
    if (!date || !testType) {
      return res.status(400).json({ 
        message: 'Date and testType are required parameters' 
      });
    }

    // Parse date and create range for the day
    const startDate = new Date(date + 'T00:00:00.000Z');
    const endDate = new Date(date + 'T23:59:59.999Z');

    console.log('📅 Date range:', { startDate, endDate });

    // Build submission query
    let submissionQuery = {
      isDraft: false,
      isCompleted: true,
      testType: testType,
      submittedAt: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Add course filter if specified
    if (selectedCourse && selectedCourse !== 'all') {
      submissionQuery.course = selectedCourse;
    }

    console.log('🔍 Submission query:', submissionQuery);

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get submissions with populated data
    let submissionsQuery = Submission.find(submissionQuery)
      .populate('userId', 'fullName enrollmentNo course')
      .populate('testId', 'subject testType course duration questions')
      .sort({ enrollmentNo: 1, 'testId.subject.subjectCode': 1 });

    // Apply search filter if provided
    if (search && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      // Add search to the original query instead of using where
      submissionQuery.$or = [
        { enrollmentNo: searchRegex }
      ];
      submissionsQuery = Submission.find(submissionQuery)
        .populate('userId', 'fullName enrollmentNo course')
        .populate('testId', 'subject testType course duration questions')
        .sort({ enrollmentNo: 1, 'testId.subject.subjectCode': 1 });
    }

    // Get total count before pagination
    const totalSubmissions = await Submission.countDocuments(submissionQuery);
    console.log('📊 Total submissions found:', totalSubmissions);

    // Apply pagination
    const submissions = await submissionsQuery
      .skip(skip)
      .limit(limitNum);

    console.log('📋 Submissions for current page:', submissions.length);

    // Transform submissions into the expected format
    const attendanceData = submissions.map(submission => {
      const student = submission.userId;
      const test = submission.testId;
      
      return {
        student: {
          _id: student._id,
          name: student.fullName,
          enrollmentNumber: student.enrollmentNo,
          course: student.course
        },
        subject: test?.subject ? {
          code: test.subject.subjectCode,
          name: test.subject.subjectName
        } : null,
        testType: submission.testType,
        submission: {
          _id: submission._id,
          score: submission.score,
          totalQuestions: submission.totalQuestions,
          answeredQuestions: submission.answeredQuestions || submission.answers?.length || 0,
          timeSpent: submission.timeSpent,
          testStartedAt: submission.testStartedAt,
          lastSavedAt: submission.lastSavedAt,
          submittedAt: submission.submittedAt
        }
      };
    });

    // Apply status filtering if specified
    let filteredData = attendanceData;
    if (selectedStatus && selectedStatus !== 'all') {
      if (selectedStatus === 'Finished') {
        // Already filtered by having submissions
        filteredData = attendanceData;
      } else if (selectedStatus === 'Absent') {
        // For absent students, we need to find students who didn't submit
        // This is more complex with the submission-based approach
        // We'll need to get all students and subtract those who submitted
        filteredData = []; // For now, empty as we're showing submissions
      }
    }

    // Calculate total pages
    const totalPages = Math.ceil(totalSubmissions / limitNum);

    // Get subjects and courses for filters
    const allSubmissions = await Submission.find({
      isDraft: false,
      isCompleted: true,
      testType: testType,
      submittedAt: { $gte: startDate, $lte: endDate }
    }).populate('testId', 'subject').limit(100);

    const subjects = [...new Set(allSubmissions.map(sub => 
      sub.testId?.subject?.subjectCode
    ).filter(Boolean))].map(code => {
      const submission = allSubmissions.find(sub => 
        sub.testId?.subject?.subjectCode === code
      );
      return {
        code: code,
        name: submission?.testId?.subject?.subjectName || code
      };
    }).sort((a, b) => a.code.localeCompare(b.code));

    const courses = [...new Set(allSubmissions.map(sub => sub.course).filter(Boolean))].map(courseCode => ({
      courseCode,
      courseName: courseCode
    }));

    // Calculate counts
    const counts = {
      finished: totalSubmissions,
      started: 0,
      absent: 0 // We'll calculate this separately if needed
    };

    res.json({
      attendanceData: filteredData,
      subjects,
      courses,
      counts,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalStudents: totalSubmissions,
        studentsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      filters: {
        date,
        testType,
        selectedCourse: selectedCourse === 'all' ? null : selectedCourse,
        selectedStatus: selectedStatus || 'all'
      }
    });

    console.log('✅ New attendance response sent:', {
      submissionsInPage: filteredData.length,
      totalSubmissions,
      currentPage: pageNum,
      totalPages
    });

  } catch (error) {
    console.error('Error fetching attendance data:', error);
    res.status(500).json({
      message: 'Server error while fetching attendance data',
      error: error.message
    });
  }
});

// Updated attendance route with enhanced data when subject is selected
router.get('/attendance/:courseId', adminAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { 
      subject: selectedSubject, 
      page = 1, 
      limit = 25,
      search = ''
    } = req.query; // Get pagination and search params

    console.log('📊 Attendance API called:', { courseId, selectedSubject, page, limit, search });

    // Get course details
    const Course = require('../models/Course');
    const Student = require('../models/Student');
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    console.log('🎓 Course details:', {
      courseId: course._id,
      courseCode: course.courseCode,
      courseName: course.courseName
    });

    // Check if this matches the expected DHSE02 course ID
    const expectedDHSE02CourseId = '6880ff1845ca253a98123326';
    console.log('🔍 Course ID check:', {
      currentCourseId: courseId,
      expectedDHSE02CourseId,
      isMatch: courseId === expectedDHSE02CourseId
    });

    // Build search query for students
    let studentQuery = { course: course.courseCode };
    if (search.trim()) {
      studentQuery.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { enrollmentNo: { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count of students for pagination
    const totalStudents = await Student.countDocuments(studentQuery);
    console.log('👥 Total students found:', totalStudents);

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const totalPages = Math.ceil(totalStudents / limitNum);

    // Get paginated students
    const students = await Student.find(studentQuery)
      .select('_id fullName enrollmentNo')
      .sort({ enrollmentNo: 1 })
      .skip(skip)
      .limit(limitNum);

    console.log('📄 Students for current page:', students.length);

    // Get all tests for this course (not paginated since tests are usually fewer)
    const tests = await Test.find({ course: courseId })
      .select('_id subject questions duration testType')
      .sort({ 'subject.subjectCode': 1, createdAt: 1 });

    console.log('📝 Tests found:', tests.length);
    console.log('📋 Test subjects found:', tests.map(t => ({
      testId: t._id,
      subjectCode: t.subject?.subjectCode,
      subjectName: t.subject?.subjectName,
      courseId: t.course // Check what course each test belongs to
    })));

    // Special debug for DHSE02
    const dhse02Tests = tests.filter(t => t.subject?.subjectCode === 'DHSE02');
    console.log('🔍 DHSE02 specific tests:', dhse02Tests.length, dhse02Tests.map(t => ({
      testId: t._id,
      courseId: t.course
    })));

    // Get submissions only for the current page of students
    const studentIds = students.map(s => s._id);
    const testIds = tests.map(t => t._id);

    // Enhanced submission query with more fields when specific subject is selected
    let submissionFields = 'userId testId isDraft isCompleted createdAt';
    if (selectedSubject && selectedSubject !== 'all') {
      submissionFields += ' answers score timeSpent testStartedAt lastSavedAt submittedAt';
    }

    const submissions = await Submission.find({
      userId: { $in: studentIds },
      testId: { $in: testIds }
    }).select(submissionFields);

    console.log('📋 Submissions found for current page:', submissions.length);
    
    // Special debug for DHSE02 submissions
    if (dhse02Tests.length > 0) {
      const dhse02Submissions = submissions.filter(sub => 
        dhse02Tests.some(test => test._id.toString() === sub.testId.toString())
      );
      console.log('🔍 DHSE02 submissions found:', dhse02Submissions.length);
      if (dhse02Submissions.length > 0) {
        console.log('📄 Sample DHSE02 submission:', {
          submissionId: dhse02Submissions[0]._id,
          testId: dhse02Submissions[0].testId,
          userId: dhse02Submissions[0].userId,
          isDraft: dhse02Submissions[0].isDraft,
          isCompleted: dhse02Submissions[0].isCompleted
        });
      }
    }

    // Structure the attendance data
    const attendanceData = students.map(student => {
      const studentAttendance = {
        student: {
          _id: student._id,
          name: student.fullName,
          enrollmentNumber: student.enrollmentNo
        },
        testStatuses: {}
      };

      tests.forEach(test => {
        const submission = submissions.find(sub =>
          sub.userId.toString() === student._id.toString() &&
          sub.testId.toString() === test._id.toString()
        );

        // Special debug for DHSE02
        if (test.subject?.subjectCode === 'DHSE02') {
          console.log('🔍 DHSE02 test processing:', {
            studentId: student._id.toString().substring(0, 8) + '...',
            testId: test._id,
            submissionFound: !!submission,
            submissionId: submission?._id
          });
        }

        let status = 'Absent';
        let submissionData = {
          status,
          testId: test._id,
          submissionId: null,
          testType: test.testType
        };

        if (submission) {
          submissionData.submissionId = submission._id;

          console.log('🔍 Submission debug:', {
            submissionId: submission._id,
            isDraft: submission.isDraft,
            isCompleted: submission.isCompleted,
            testId: test._id,
            userId: student._id
          });

          if (submission.isDraft) {
            status = 'Started';
          } else if (submission.isCompleted) {
            status = 'Finished';
          } else {
            // If not draft and not completed, what is it?
            console.log('⚠️ Submission exists but neither draft nor completed:', submission);
            status = 'Started'; // Default to Started if submission exists
          }

          submissionData.status = status;

          // Add detailed fields when specific subject is selected
          if (selectedSubject && selectedSubject !== 'all' &&
            test.subject.subjectCode === selectedSubject) {
            submissionData.detailedInfo = {
              questionsAttempted: submission.answers ? submission.answers.length : 0,
              totalQuestions: test.questions ? test.questions.length : 0,
              score: submission.score || 0,
              testStartedAt: submission.testStartedAt ?
                TimezoneUtils.formatForDisplay(submission.testStartedAt) : 'N/A',
              // For completed submissions, show submittedAt as lastSavedAt since that's when saving stopped
              lastSavedAt: (submission.isCompleted && submission.submittedAt) ?
                TimezoneUtils.formatForDisplay(submission.submittedAt) :
                (submission.lastSavedAt ? TimezoneUtils.formatForDisplay(submission.lastSavedAt) : 'N/A'),
              submittedAt: submission.submittedAt ?
                TimezoneUtils.formatForDisplay(submission.submittedAt) : 'N/A',
              timeSpent: submission.timeSpent || 0
            };
          }
        }

        // Handle multiple tests for the same subject by keeping the "best" status
        const existingStatus = studentAttendance.testStatuses[test.subject.subjectCode];
        if (existingStatus) {
          // Priority: Finished > Started > Absent
          // Only overwrite if the new status is better
          const statusPriority = { 'Finished': 3, 'Started': 2, 'Absent': 1 };
          const currentPriority = statusPriority[existingStatus.status] || 0;
          const newPriority = statusPriority[status] || 0;
          
          if (newPriority > currentPriority) {
            studentAttendance.testStatuses[test.subject.subjectCode] = submissionData;
            console.log('🔄 Updated DHSE02 status for student:', {
              studentId: student._id.toString().substring(0, 8) + '...',
              from: existingStatus.status,
              to: status,
              testId: test._id
            });
          } else {
            console.log('⏭️ Keeping existing DHSE02 status for student:', {
              studentId: student._id.toString().substring(0, 8) + '...',
              existing: existingStatus.status,
              skipped: status,
              testId: test._id
            });
          }
        } else {
          studentAttendance.testStatuses[test.subject.subjectCode] = submissionData;
        }
      });

      return studentAttendance;
    });

    // Calculate summary counts for ALL students (not just current page)
    // For performance, we'll calculate this differently based on request
    let counts = { finished: 0, started: 0, absent: 0 };

    // Only calculate detailed counts if specifically requested (first page or count request)
    if (pageNum === 1 || req.query.includeCounts === 'true') {
      console.log('🔢 Calculating total counts...');
      
      if (selectedSubject && selectedSubject !== 'all') {
        // For specific subject, count students based on their status in that subject
        const allStudents = await Student.find({ course: course.courseCode }).select('_id');
        const subjectTests = tests.filter(t => t.subject.subjectCode === selectedSubject);
        const allSubmissions = await Submission.find({
          userId: { $in: allStudents.map(s => s._id) },
          testId: { $in: subjectTests.map(t => t._id) }
        }).select('userId testId isDraft isCompleted');

        // Group submissions by student
        const studentSubmissions = new Map();
        allSubmissions.forEach(sub => {
          if (!studentSubmissions.has(sub.userId.toString())) {
            studentSubmissions.set(sub.userId.toString(), []);
          }
          studentSubmissions.get(sub.userId.toString()).push(sub);
        });

        // Count each student once based on their overall status in the subject
        allStudents.forEach(student => {
          const studentId = student._id.toString();
          const submissions = studentSubmissions.get(studentId) || [];
          
          if (submissions.length === 0) {
            // No submissions for this subject
            counts.absent++;
          } else {
            // Check if all tests in subject are completed
            const completedCount = submissions.filter(sub => sub.isCompleted).length;
            const startedCount = submissions.filter(sub => sub.isDraft).length;
            
            if (completedCount > 0) {
              counts.finished++;
            } else if (startedCount > 0) {
              counts.started++;
            } else {
              counts.absent++;
            }
          }
        });
      } else {
        // For all subjects, count students based on their overall progress
        const allStudents = await Student.find({ course: course.courseCode }).select('_id');
        const allSubmissions = await Submission.find({
          userId: { $in: allStudents.map(s => s._id) },
          testId: { $in: testIds }
        }).select('userId testId isDraft isCompleted');

        // Group submissions by student
        const studentSubmissions = new Map();
        allSubmissions.forEach(sub => {
          if (!studentSubmissions.has(sub.userId.toString())) {
            studentSubmissions.set(sub.userId.toString(), []);
          }
          studentSubmissions.get(sub.userId.toString()).push(sub);
        });

        // Count each student once based on their overall status across all subjects
        allStudents.forEach(student => {
          const studentId = student._id.toString();
          const submissions = studentSubmissions.get(studentId) || [];
          
          console.log('👤 Student count debug:', {
            studentId: studentId.substring(0, 8) + '...',
            totalSubmissions: submissions.length,
            completedSubmissions: submissions.filter(sub => sub.isCompleted).length,
            draftSubmissions: submissions.filter(sub => sub.isDraft).length
          });
          
          if (submissions.length === 0) {
            // No submissions at all
            counts.absent++;
          } else {
            const completedCount = submissions.filter(sub => sub.isCompleted).length;
            const startedCount = submissions.filter(sub => sub.isDraft).length;
            
            if (completedCount > 0) {
              counts.finished++;
            } else if (startedCount > 0) {
              counts.started++;
            } else {
              counts.absent++;
            }
          }
        });
      }
      
      console.log('📊 Total counts calculated:', counts);
    }

    // Get unique subjects
    const subjects = [];
    const subjectMap = new Map();
    tests.forEach(test => {
      if (test.subject && test.subject.subjectCode) {
        const key = test.subject.subjectCode;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            code: test.subject.subjectCode,
            name: test.subject.subjectName
          });
          subjects.push({
            code: test.subject.subjectCode,
            name: test.subject.subjectName
          });
        }
      }
    });

    res.json({
      course: {
        _id: course._id,
        courseCode: course.courseCode,
        courseName: course.courseName
      },
      attendanceData,
      subjects,
      counts,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalStudents,
        studentsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      totalTests: tests.length,
      selectedSubject: selectedSubject || 'all'
    });

    console.log('✅ Response sent:', {
      studentsInPage: attendanceData.length,
      totalStudents,
      currentPage: pageNum,
      totalPages
    });

  } catch (error) {
    console.error('Error fetching attendance data:', error);
    res.status(500).json({
      message: 'Server error while fetching attendance data',
      error: error.message
    });
  }
});

// Delete a specific submission (for attendance management)
router.delete('/:submissionId', adminAuth, async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Only allow deletion of completed submissions (isDraft: false)
    if (submission.isDraft) {
      return res.status(400).json({
        message: 'Cannot delete draft submissions. Student is still taking the test.'
      });
    }

    await Submission.findByIdAndDelete(submissionId);

    res.json({
      message: 'Submission deleted successfully',
      deletedSubmission: {
        _id: submission._id,
        userId: submission.userId,
        testId: submission.testId
      }
    });

  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({
      message: 'Server error while deleting submission',
      error: error.message
    });
  }
});

// Simple attendance endpoints - Get unique submission dates
router.get('/attendance/dates', adminAuth, async (req, res) => {
  try {
    console.log('📅 Getting submission dates from submittedAt field...');
    
    // Get unique dates from submissions where submittedAt exists
    const submissions = await Submission.find(
      { submittedAt: { $exists: true, $ne: null } },
      { submittedAt: 1 }
    ).sort({ submittedAt: -1 });

    // Extract unique dates (YYYY-MM-DD format)
    const uniqueDates = [...new Set(
      submissions.map(submission => 
        submission.submittedAt.toISOString().split('T')[0]
      )
    )];

    console.log('📅 Found submission dates:', uniqueDates.slice(0, 5), '... total:', uniqueDates.length);

    res.json({
      success: true,
      dates: uniqueDates
    });
  } catch (error) {
    console.error('Error getting submission dates:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting submission dates',
      error: error.message
    });
  }
});

// Simple attendance endpoints - Get submissions filtered by date
router.get('/attendance/data', adminAuth, async (req, res) => {
  try {
    const { 
      date, 
      testType = 'all', 
      courseId = 'all', 
      status = 'all', 
      search = '', 
      page = 1, 
      limit = 50 
    } = req.query;

    console.log('📊 Getting attendance data for date:', date);

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    // Create date range for the selected day (00:00:00 to 23:59:59)
    const startDate = new Date(date + 'T00:00:00.000Z');
    const endDate = new Date(date + 'T23:59:59.999Z');
    
    console.log('📅 Date range:', { startDate, endDate });

    // Build query conditions
    let query = {
      submittedAt: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Add status filter
    if (status !== 'all') {
      if (status === 'completed') {
        query.isCompleted = true;
        query.isDraft = false;
      } else if (status === 'draft') {
        query.isDraft = true;
      }
    }

    console.log('🔍 Base query:', query);

    // Get submissions with populated data
    const submissions = await Submission.find(query)
      .populate({
        path: 'userId',
        select: 'name email rollNumber'
      })
      .populate({
        path: 'testId',
        select: 'subjectName subjectCode testType courseId',
        populate: {
          path: 'courseId',
          select: 'courseName courseCode'
        }
      })
      .sort({ submittedAt: -1 });

    console.log('📋 Raw submissions found:', submissions.length);

    // Filter by testType and courseId after population
    let filteredSubmissions = submissions.filter(submission => {
      let include = true;
      
      // Filter by testType
      if (testType !== 'all' && submission.testId?.testType !== testType) {
        include = false;
      }
      
      // Filter by courseId
      if (courseId !== 'all' && submission.testId?.courseId?._id.toString() !== courseId) {
        include = false;
      }
      
      // Filter by search term
      if (search.trim()) {
        const searchTerm = search.trim().toLowerCase();
        const studentName = submission.userId?.name?.toLowerCase() || '';
        const rollNumber = submission.userId?.rollNumber?.toLowerCase() || '';
        const subjectName = submission.testId?.subjectName?.toLowerCase() || '';
        
        if (!studentName.includes(searchTerm) && 
            !rollNumber.includes(searchTerm) && 
            !subjectName.includes(searchTerm)) {
          include = false;
        }
      }
      
      return include;
    });

    console.log('📋 Filtered submissions:', filteredSubmissions.length);

    // Apply pagination
    const totalSubmissions = filteredSubmissions.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedSubmissions = filteredSubmissions.slice(skip, skip + parseInt(limit));

    // Calculate pagination info
    const totalPages = Math.ceil(totalSubmissions / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    // Format the data for frontend
    const formattedData = paginatedSubmissions.map(submission => ({
      _id: submission._id,
      studentName: submission.userId?.name || 'Unknown',
      rollNumber: submission.userId?.rollNumber || 'N/A',
      email: submission.userId?.email || 'N/A',
      subjectName: submission.testId?.subjectName || 'Unknown Subject',
      subjectCode: submission.testId?.subjectCode || 'N/A',
      testType: submission.testId?.testType || 'unknown',
      courseName: submission.testId?.courseId?.courseName || 'Unknown Course',
      courseCode: submission.testId?.courseId?.courseCode || 'N/A',
      questionsAttempted: submission.questionsAttempted || 0,
      totalQuestions: submission.totalQuestions || 0,
      score: submission.score || 0,
      startedAt: submission.startedAt,
      submittedAt: submission.submittedAt,
      timeTaken: submission.timeTaken || 0,
      status: submission.isDraft ? 'Draft' : (submission.isCompleted ? 'Completed' : 'In Progress')
    }));

    console.log('✅ Sending formatted data:', formattedData.length, 'submissions');

    res.json({
      success: true,
      attendanceData: formattedData,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalSubmissions,
        hasNextPage,
        hasPrevPage,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error getting attendance data:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting attendance data',
      error: error.message
    });
  }
});

module.exports = router;