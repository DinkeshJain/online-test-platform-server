const express = require('express');
const ExamProgress = require('../models/ExamProgress');
const Test = require('../models/Test');
const Submission = require('../models/Submission');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Save exam progress (auto-save during exam)
router.post('/save', auth, async (req, res) => {
  try {
    const { 
      testId, 
      answers, 
      reviewFlags, 
      currentQuestionIndex, 
      timeLeft, 
      testStartedAt,
    } = req.body;

    if (!testId || timeLeft === undefined) {
      return res.status(400).json({ message: 'testId and timeLeft are required' });
    }

    // Check if test exists and is still active
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // Check if student has already submitted this test
    const existingSubmission = await Submission.findOne({
      testId,
      userId: req.user._id
    });

    if (existingSubmission) {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // Convert answers and reviewFlags objects to Maps
    const answersMap = new Map();
    const reviewFlagsMap = new Map();

    if (answers) {
      Object.keys(answers).forEach(questionId => {
        if (answers[questionId] !== undefined) {
          answersMap.set(questionId, answers[questionId]);
        }
      });
    }

    if (reviewFlags) {
      Object.keys(reviewFlags).forEach(questionId => {
        if (reviewFlags[questionId]) {
          reviewFlagsMap.set(questionId, reviewFlags[questionId]);
        }
      });
    }

    // Update or create exam progress
    const progressData = {
      testId,
      userId: req.user._id,
      answers: answersMap,
      reviewFlags: reviewFlagsMap,
      currentQuestionIndex: currentQuestionIndex || 0,
      timeLeft,
      testStartedAt: testStartedAt || new Date(),
      lastSavedAt: new Date(),
      lastHeartbeat: new Date(),
      isActive: true
    };

    const progress = await ExamProgress.findOneAndUpdate(
      { testId, userId: req.user._id },
      progressData,
      { upsert: true, new: true }
    );

    res.json({ 
      message: 'Progress saved successfully',
      lastSavedAt: progress.lastSavedAt
    });
  } catch (error) {
    console.error('Error saving exam progress:', error);
    res.status(500).json({ message: 'Server error while saving progress' });
  }
});

// Load exam progress (resume exam after crash)
router.get('/load/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;

    // Check if test exists
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // Check if student has already submitted this test
    const existingSubmission = await Submission.findOne({
      testId,
      userId: req.user._id
    });

    if (existingSubmission) {
      return res.status(400).json({ message: 'Test already submitted' });
    }

    // Find saved progress
    const progress = await ExamProgress.findOne({
      testId,
      userId: req.user._id,
      isActive: true
    });

    if (!progress) {
      return res.status(404).json({ message: 'No saved progress found' });
    }

    // Check if progress is not too old (prevent cheating)
    const now = new Date();
    const timeSinceLastSave = (now - progress.lastSavedAt) / 1000; // seconds
    
    // If more than 10 minutes since last save, consider it suspicious
    if (timeSinceLastSave > 600) {
      return res.status(400).json({ 
        message: 'Saved progress is too old. Please start the test again.',
        timeSinceLastSave 
      });
    }

    // Convert Maps back to objects for frontend
    const answersObj = {};
    const reviewFlagsObj = {};

    if (progress.answers) {
      progress.answers.forEach((value, key) => {
        answersObj[key] = value;
      });
    }

    if (progress.reviewFlags) {
      progress.reviewFlags.forEach((value, key) => {
        reviewFlagsObj[key] = value;
      });
    }

    // Update resume count
    progress.resumeCount += 1;
    progress.crashDetected = true;
    await progress.save();

    res.json({
      progress: {
        answers: answersObj,
        reviewFlags: reviewFlagsObj,
        currentQuestionIndex: progress.currentQuestionIndex,
        timeLeft: progress.timeLeft,
        testStartedAt: progress.testStartedAt,
        resumeCount: progress.resumeCount,
        crashDetected: progress.crashDetected,
        lastSavedAt: progress.lastSavedAt
      }
    });
  } catch (error) {
    console.error('Error loading exam progress:', error);
    res.status(500).json({ message: 'Server error while loading progress' });
  }
});

// Heartbeat endpoint to detect crashes
router.post('/heartbeat/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;

    await ExamProgress.findOneAndUpdate(
      { testId, userId: req.user._id, isActive: true },
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

// Check for crashed sessions (admin utility)
router.get('/crashed-sessions', auth, async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const crashedSessions = await ExamProgress.find({
      isActive: true,
      lastHeartbeat: { $lt: fiveMinutesAgo }
    }).populate('testId', 'subject duration')
      .populate('userId', 'name rollNumber');

    res.json({ crashedSessions });
  } catch (error) {
    console.error('Error finding crashed sessions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Deactivate progress (when test is submitted)
router.post('/deactivate/:testId', auth, async (req, res) => {
  try {
    const { testId } = req.params;

    await ExamProgress.findOneAndUpdate(
      { testId, userId: req.user._id },
      { 
        isActive: false,
        lastSavedAt: new Date()
      }
    );

    res.json({ message: 'Progress deactivated' });
  } catch (error) {
    console.error('Error deactivating progress:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

