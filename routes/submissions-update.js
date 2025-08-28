/**
 * ⚠️ BACKUP FILE ONLY - DO NOT USE IN PRODUCTION
 * 
 * This file contains backup/reference implementations that have been
 * integrated into the main submissions.js file. This is kept for 
 * reference purposes only.
 * 
 * All functionality from this file has been moved to:
 * → server/routes/submissions.js
 * 
 * DO NOT IMPORT OR USE THIS FILE IN THE APPLICATION.
 */

const express = require('express');
const Test = require('../models/Test');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ✅ NEW: Create initial submission when test starts
router.post('/start-test', auth, async (req, res) => {
  try {
    const {
      testId,
      testStartedAt,
      status = 'in_progress',
      totalQuestions,
      testTitle,
      subject,
      duration,
      metadata = {}
    } = req.body;

    const studentId = req.user.id;

    // Validate required fields
    if (!testId || !testStartedAt || !totalQuestions) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: testId, testStartedAt, or totalQuestions'
      });
    }

    // Check if test exists
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    // Check if student is enrolled in the test
    if (!test.enrolledStudents.includes(studentId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this test'
      });
    }

    // Check if submission already exists
    const existingSubmission = await Submission.findOne({
      testId: testId,
      studentId: studentId
    });

    if (existingSubmission) {
      // If submission exists but not completed, update the start time
      if (existingSubmission.status !== 'completed') {
        existingSubmission.testStartedAt = new Date(testStartedAt);
        existingSubmission.status = status;
        existingSubmission.metadata = {
          ...existingSubmission.metadata,
          ...metadata,
          lastStartedAt: new Date(testStartedAt)
        };
        await existingSubmission.save();

        return res.status(200).json({
          success: true,
          message: 'Existing submission updated',
          submissionId: existingSubmission._id,
          isResuming: true
        });
      } else {
        return res.status(409).json({
          success: false,
          message: 'Test already completed'
        });
      }
    }

    // Create new submission
    const newSubmission = new Submission({
      testId: testId,
      studentId: studentId,
      testStartedAt: new Date(testStartedAt),
      status: status,
      answers: [],
      totalQuestions: totalQuestions,
      answeredQuestions: 0,
      timeSpent: 0,
      metadata: {
        ...metadata,
        testTitle,
        subject,
        duration,
        createdAt: new Date(),
        initialStartTime: new Date(testStartedAt)
      }
    });

    await newSubmission.save();

    console.log(`📝 Initial submission created for student ${studentId} in test ${testId}`);

    res.status(201).json({
      success: true,
      message: 'Test session initialized successfully',
      submissionId: newSubmission._id,
      isResuming: false
    });

  } catch (error) {
    console.error('❌ Error creating initial submission:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize test session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ ENHANCED: Resume test endpoint
router.post('/resume-test/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;
    const studentId = req.user.id;

    // Find existing submission
    const submission = await Submission.findOne({
      testId: testId,
      studentId: studentId
    });

    if (submission && submission.status !== 'completed') {
      // Update resume count
      submission.metadata = {
        ...submission.metadata,
        resumeCount: (submission.metadata.resumeCount || 0) + 1,
        lastResumedAt: new Date()
      };
      await submission.save();

      console.log(`📝 Test resumed by student ${studentId} for test ${testId} (Resume #${submission.metadata.resumeCount})`);
    }

    res.status(200).json({
      success: true,
      message: 'Test resume logged'
    });

  } catch (error) {
    console.error('❌ Error logging test resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log test resume'
    });
  }
});

// ✅ UPDATE the main submission route to handle status updates
// Replace the existing POST '/' route with this enhanced version:
/*
router.post('/', auth, async (req, res) => {
  try {
    const {
      testId,
      answers = [],
      totalQuestions,
      answeredQuestions,
      unansweredQuestions,
      timeSpent,
      testStartedAt,
      submittedAt,
      status = 'completed'
    } = req.body;

    const studentId = req.user.id;

    // Validate required fields
    if (!testId || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid submission data'
      });
    }

    // Check if test exists and student is enrolled
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    if (!test.enrolledStudents.includes(studentId)) {
      return res.status(403).json({ message: 'Not enrolled in this test' });
    }

    // Check if already submitted
    const existingSubmission = await Submission.findOne({
      testId: testId,
      studentId: studentId,
      status: 'completed'
    });

    if (existingSubmission) {
      return res.status(409).json({
        success: false,
        message: 'Test already submitted'
      });
    }

    // Find existing submission or create new one
    let submission = await Submission.findOne({
      testId: testId,
      studentId: studentId
    });

    if (submission) {
      // Update existing submission
      submission.answers = answers;
      submission.totalQuestions = totalQuestions;
      submission.answeredQuestions = answeredQuestions;
      submission.unansweredQuestions = unansweredQuestions;
      submission.timeSpent = timeSpent;
      submission.submittedAt = new Date(submittedAt || new Date());
      submission.status = status;
      submission.metadata = {
        ...submission.metadata,
        finalSubmissionTime: new Date(),
        submissionMethod: 'manual'
      };
    } else {
      // Create new submission (fallback)
      submission = new Submission({
        testId,
        studentId,
        answers,
        totalQuestions,
        answeredQuestions,
        unansweredQuestions,
        timeSpent,
        testStartedAt: new Date(testStartedAt || new Date()),
        submittedAt: new Date(submittedAt || new Date()),
        status,
        metadata: {
          submissionMethod: 'manual',
          finalSubmissionTime: new Date()
        }
      });
    }

    // Calculate and update score
    const score = await calculateScore(submission.answers, test);
    submission.score = score;

    await submission.save();

    console.log(`✅ Test submitted successfully by student ${studentId} for test ${testId}`);

    res.status(200).json({
      success: true,
      message: 'Test submitted successfully',
      submissionId: submission._id,
      totalQuestions: submission.totalQuestions,
      answeredQuestions: submission.answeredQuestions,
      timeSpent: submission.timeSpent,
      score: submission.score
    });

  } catch (error) {
    console.error('❌ Error submitting test:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit test',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
*/

module.exports = router;
