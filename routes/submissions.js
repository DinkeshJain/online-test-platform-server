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

// ✅ IMPLEMENTED: Auto-save route with proper array handling
router.post('/auto-save/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;
    const {
      answers,
      reviewFlags,
      currentQuestionIndex,
      timeLeft,
      testStartedAt,
      totalQuestions
    } = req.body;

    console.log('📝 Auto-save received:', {
      testId,
      answersCount: answers?.length || 0,
      currentQuestion: currentQuestionIndex,
      timeLeft
    });

    // Validate test exists
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // Check for existing final submission
    const existingFinalSubmission = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: false,
      isCompleted: true
    });

    if (existingFinalSubmission) {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // Get student info
    const student = await Student.findById(req.user._id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Process answers according to schema - filter out null answers
    const processedAnswers = [];
    if (answers && Array.isArray(answers)) {
      answers.forEach((answer, index) => {
        if (answer && answer.questionId && answer.selectedAnswer !== null && answer.selectedAnswer !== undefined) {
          const validatedAnswer = parseInt(answer.selectedAnswer, 10);
          if (validatedAnswer >= 0 && validatedAnswer <= 3 && Number.isInteger(validatedAnswer)) {
            // Verify question exists in test
            const question = test.questions.id(answer.questionId);
            if (question) {
              processedAnswers.push({
                questionId: answer.questionId,
                selectedAnswer: validatedAnswer,
                originalQuestionNumber: answer.originalQuestionNumber || (index + 1),
                shuffledPosition: answer.shuffledPosition || (index + 1),
                shuffledToOriginal: answer.shuffledToOriginal || [0, 1, 2, 3]
              });
            } else {
              console.warn(`Question not found in test: ${answer.questionId}`);
            }
          } else {
            console.warn(`Invalid selectedAnswer: ${answer.selectedAnswer} for question ${answer.questionId}`);
          }
        }
      });
    }

    // Create or update draft submission with upsert to handle race conditions
    const submissionData = {
      testId,
      userId: req.user._id,
      enrollmentNo: student.enrollmentNo,
      course: student.course,
      testType: test.testType || 'official',
      answers: processedAnswers,
      totalQuestions: totalQuestions || test.questions.length,
      currentQuestionIndex: currentQuestionIndex || 0,
      timeLeftWhenSaved: timeLeft || 0,
      testStartedAt: testStartedAt ? new Date(testStartedAt) : new Date(),
      isDraft: true,
      isCompleted: false,
      lastSavedAt: new Date(),
      reviewFlags: reviewFlags ? new Map(Object.entries(reviewFlags)) : new Map()
    };

    // Use findOneAndUpdate with upsert to prevent race conditions
    const result = await Submission.findOneAndUpdate(
      {
        testId,
        userId: req.user._id,
        isDraft: true
      },
      {
        ...submissionData,
        $inc: { autoSaveCount: 1 }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    console.log('✅ Auto-save successful:', {
      submissionId: result._id,
      answersCount: processedAnswers.length,
      autoSaveCount: result.autoSaveCount
    });

    res.json({
      message: 'Progress auto-saved successfully',
      answersCount: processedAnswers.length,
      lastSavedAt: result.lastSavedAt,
      autoSaveCount: result.autoSaveCount
    });

  } catch (error) {
    console.error('Auto-save error:', error);
    res.status(500).json({
      message: 'Auto-save failed',
      error: error.message
    });
  }
});

// ✅ IMPLEMENTED: Load progress route with array conversion
router.get('/load-progress/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;

    // Check if test exists
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // Check for existing final submission
    const completedSubmission = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: false,
      isCompleted: true
    });

    if (completedSubmission) {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // Check for draft submission
    const draftSubmission = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: true
    });

    if (draftSubmission) {
      // Convert saved answers back to frontend array format
      const answersArray = new Array(draftSubmission.totalQuestions).fill(null);

      // Fill array with saved answers using shuffledPosition
      draftSubmission.answers.forEach(answer => {
        const index = (answer.shuffledPosition || answer.originalQuestionNumber) - 1;
        if (index >= 0 && index < answersArray.length) {
          answersArray[index] = answer.selectedAnswer;
        }
      });

      // Convert reviewFlags Map back to object
      const reviewFlagsObj = {};
      if (draftSubmission.reviewFlags && draftSubmission.reviewFlags instanceof Map) {
        draftSubmission.reviewFlags.forEach((value, key) => {
          if (value) reviewFlagsObj[key] = true;
        });
      }

      res.json({
        hasProgress: true,
        progress: {
          answers: answersArray,
          reviewFlags: reviewFlagsObj,
          currentQuestionIndex: draftSubmission.currentQuestionIndex,
          timeLeft: draftSubmission.timeLeftWhenSaved,
          testStartedAt: draftSubmission.testStartedAt,
          lastSavedAt: draftSubmission.lastSavedAt,
          totalQuestions: draftSubmission.totalQuestions,
          autoSaveCount: draftSubmission.autoSaveCount,
          resumeCount: draftSubmission.resumeCount,
          // Include test structure if available
          savedTestStructure: draftSubmission.savedTestStructure ?
            JSON.parse(draftSubmission.savedTestStructure) : null
        }
      });
    } else {
      res.json({
        hasProgress: false,
        message: 'No saved progress found'
      });
    }

  } catch (error) {
    console.error('Load progress error:', error);
    res.status(500).json({ message: 'Server error while loading progress' });
  }
});

// ✅ IMPLEMENTED: Resume test route
router.post('/resume-test/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;

    // Increment resume count for draft submission
    const draftSubmission = await Submission.findOneAndUpdate(
      {
        testId,
        userId: req.user._id,
        isDraft: true
      },
      {
        $inc: { resumeCount: 1 },
        lastSavedAt: new Date()
      },
      { new: true }
    );

    if (draftSubmission) {
      res.json({
        message: 'Test resumed successfully',
        resumeCount: draftSubmission.resumeCount
      });
    } else {
      res.json({
        message: 'No draft found to resume',
        resumeCount: 0
      });
    }

  } catch (error) {
    console.error('Resume test error:', error);
    res.status(500).json({
      message: 'Server error while resuming test',
      error: error.message
    });
  }
});

// ✅ IMPLEMENTED: Heartbeat endpoint
router.post('/heartbeat/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;

    // Update heartbeat timestamp for draft submission
    await Submission.findOneAndUpdate(
      {
        testId,
        userId: req.user._id,
        isDraft: true
      },
      {
        lastHeartbeat: new Date()
      }
    );

    res.json({
      message: 'Heartbeat recorded',
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({
      message: 'Heartbeat failed',
      error: error.message
    });
  }
});

// ✅ UPDATED: Final submission route with enhanced array handling
router.post('/', auth, async (req, res) => {
  try {
    const { testId, answers, timeSpent, testStartedAt, autoSubmitted = false } = req.body;

    if (!testId) {
      return res.status(400).json({ message: 'testId is required' });
    }

    // Get the test to validate
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // Check for existing final submission
    const existingFinalSubmission = await Submission.findOne({
      testId,
      userId: req.user._id,
      isDraft: false,
      isCompleted: true
    });

    if (existingFinalSubmission) {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // Process answers with enhanced validation
    const processedAnswers = [];
    if (answers && Array.isArray(answers)) {
      answers.forEach((answer, index) => {
        // Validate answer structure
        if (!answer || !answer.questionId || answer.selectedAnswer === undefined || answer.selectedAnswer === null) {
          console.warn(`Skipping invalid answer at index ${index}:`, answer);
          return;
        }

        // Validate selectedAnswer value
        const validatedAnswer = parseInt(answer.selectedAnswer, 10);
        if (!Number.isInteger(validatedAnswer) || validatedAnswer < 0 || validatedAnswer > 3) {
          console.warn(`Invalid selectedAnswer for question ${answer.questionId}:`, answer.selectedAnswer);
          return;
        }

        const question = test.questions.id(answer.questionId);
        if (!question) {
          console.warn(`Question not found: ${answer.questionId}`);
          return;
        }

        // Calculate correctness
        let isCorrect = false;
        if (answer.shuffledToOriginal && Array.isArray(answer.shuffledToOriginal) && answer.shuffledToOriginal.length > 0) {
          const originalIndex = answer.shuffledToOriginal[validatedAnswer];
          isCorrect = originalIndex === question.correctAnswer;
        } else {
          isCorrect = question.correctAnswer === validatedAnswer;
        }

        processedAnswers.push({
          questionId: answer.questionId,
          selectedAnswer: validatedAnswer,
          isCorrect,
          originalQuestionNumber: answer.originalQuestionNumber || (index + 1),
          shuffledPosition: answer.shuffledPosition || (index + 1),
          shuffledToOriginal: answer.shuffledToOriginal || [0, 1, 2, 3]
        });
      });
    }

    // Get student and course info
    const student = await Student.findById(req.user._id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Calculate final score
    const score = processedAnswers.filter(answer => answer.isCorrect).length;
    const percentage = (score / test.questions.length) * 100;
    const now = new Date();

    // Delete any existing draft first
    await Submission.deleteOne({
      testId,
      userId: req.user._id,
      isDraft: true
    });

    // Create final submission data
    const submissionData = {
      testId,
      userId: req.user._id,
      answers: processedAnswers,
      score,
      percentage: Math.round(percentage * 100) / 100,
      totalQuestions: test.questions.length,
      answeredQuestions: processedAnswers.length,
      unansweredQuestions: test.questions.length - processedAnswers.length,
      timeSpent: timeSpent || 0,
      testStartedAt: testStartedAt ? new Date(testStartedAt) : now,
      submittedAt: now,
      isDraft: false,
      isCompleted: true,
      isAutoSubmitted: autoSubmitted,
      lastSavedAt: now,
      // Denormalized fields for performance
      enrollmentNo: student.enrollmentNo,
      course: student.course,
      testType: test.testType || 'official'
    };

    // Create final submission
    const submission = new Submission(submissionData);
    await submission.save();

    console.log('✅ Final submission created:', {
      submissionId: submission._id,
      answersCount: processedAnswers.length,
      score: score,
      totalQuestions: test.questions.length
    });

    // Return result
    const result = {
      message: 'Test submitted successfully',
      submissionId: submission._id,
      answeredQuestions: submission.answeredQuestions,
      totalQuestions: submission.totalQuestions
    };

    if (test.showScoresToStudents) {
      result.score = score;
      result.percentage = Math.round(percentage * 100) / 100;
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
      isDraft: false, // Only show final submissions
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
      isDraft: false, // Only show final submissions
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
                enrollmentNo: student.enrollmentNo, // Use denormalized field
                course: course.courseCode, // Use denormalized field
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
        filteredData = attendanceData;
      } else if (selectedStatus === 'Absent') {
        filteredData = [];
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
      absent: 0
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

// ✅ KEEP ALL OTHER EXISTING ROUTES AS THEY WERE...
// (I'm keeping the rest of your existing routes unchanged for brevity)
// This includes attendance routes, monitoring endpoints, etc.

// ✅ SAFE HOT-FIX: Monitoring endpoints (safe to deploy during exam)
router.get('/monitor/null-answers-live', adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const last2Hours = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const recentSubmissions = await Submission.find({
      submittedAt: { $gte: last2Hours },
      isDraft: false,
      isCompleted: true
    }).populate('testId', 'subject');

    const issueStats = {
      timeWindow: '2 hours',
      total: recentSubmissions.length,
      withNullIssues: 0,
      affectedStudents: [],
      issueRate: 0
    };

    recentSubmissions.forEach(submission => {
      const nullCount = submission.answers?.filter(a =>
        a.selectedAnswer === null || a.selectedAnswer === undefined
      ).length || 0;

      if (nullCount > 0) {
        issueStats.withNullIssues++;
        issueStats.affectedStudents.push({
          enrollmentNo: submission.enrollmentNo,
          testSubject: submission.testId?.subject?.subjectCode,
          nullCount,
          totalAnswers: submission.answers?.length || 0,
          submittedAt: submission.submittedAt,
          issuePercentage: ((nullCount / (submission.answers?.length || 1)) * 100).toFixed(1)
        });
      }
    });

    issueStats.issueRate = ((issueStats.withNullIssues / issueStats.total) * 100).toFixed(2);

    res.json(issueStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dashboard/issue-summary', adminAuth, async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const todaySubmissions = await Submission.find({
      submittedAt: { $gte: startOfDay },
      isDraft: false,
      isCompleted: true
    });

    const summary = {
      date: startOfDay.toISOString().split('T')[0],
      totalSubmissions: todaySubmissions.length,
      issuesDetected: 0,
      criticalIssues: 0,
      affectedStudents: []
    };

    todaySubmissions.forEach(submission => {
      const nullCount = submission.answers?.filter(a =>
        a.selectedAnswer === null || a.selectedAnswer === undefined
      ).length || 0;

      if (nullCount > 0) {
        summary.issuesDetected++;
        const issuePercentage = (nullCount / (submission.answers?.length || 1)) * 100;

        if (issuePercentage > 50) {
          summary.criticalIssues++;
        }

        summary.affectedStudents.push({
          enrollmentNo: submission.enrollmentNo,
          nullCount,
          totalAnswers: submission.answers?.length || 0,
          issuePercentage: issuePercentage.toFixed(1),
          submittedAt: submission.submittedAt
        });
      }
    });

    summary.issueRate = ((summary.issuesDetected / summary.totalSubmissions) * 100).toFixed(2);

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;