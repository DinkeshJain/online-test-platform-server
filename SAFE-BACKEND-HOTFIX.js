// ===============================================
// SAFE HOT-FIX: BACKEND ONLY (NO FRONTEND CHANGES)
// ===============================================
// This can be deployed safely during active exams

// 1. Add monitoring endpoint to track the issue in real-time
// Add this to routes/submissions.js

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

// 2. Add data recovery endpoint for affected students
router.post('/recover-student-data/:enrollmentNo', adminAuth, async (req, res) => {
  try {
    const { enrollmentNo } = req.params;
    const { testId } = req.body;
    
    // Find the problematic submission
    const submission = await Submission.findOne({
      enrollmentNo,
      testId,
      isDraft: false,
      isCompleted: true
    });
    
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }
    
    // Count null vs valid answers
    const nullAnswers = submission.answers?.filter(a => 
      a.selectedAnswer === null || a.selectedAnswer === undefined
    ) || [];
    
    const validAnswers = submission.answers?.filter(a => 
      a.selectedAnswer !== null && a.selectedAnswer !== undefined && 
      typeof a.selectedAnswer === 'number' && a.selectedAnswer >= 0 && a.selectedAnswer <= 3
    ) || [];
    
    // Check if there's a recent draft with better data
    const recentDraft = await Submission.findOne({
      enrollmentNo,
      testId,
      isDraft: true
    }).sort({ lastSavedAt: -1 });
    
    let recoveryOptions = {
      currentSubmission: {
        validAnswers: validAnswers.length,
        nullAnswers: nullAnswers.length,
        score: submission.score,
        submittedAt: submission.submittedAt
      }
    };
    
    if (recentDraft) {
      const draftValidAnswers = recentDraft.answers?.filter(a => 
        a.selectedAnswer !== null && a.selectedAnswer !== undefined && 
        typeof a.selectedAnswer === 'number' && a.selectedAnswer >= 0 && a.selectedAnswer <= 3
      ) || [];
      
      recoveryOptions.draftData = {
        validAnswers: draftValidAnswers.length,
        nullAnswers: (recentDraft.answers?.length || 0) - draftValidAnswers.length,
        lastSavedAt: recentDraft.lastSavedAt,
        autoSaveCount: recentDraft.autoSaveCount
      };
    }
    
    res.json({
      student: enrollmentNo,
      testId,
      recoveryOptions,
      canRecover: !!recentDraft && recentDraft.answers && recentDraft.answers.length > validAnswers.length
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Enhanced logging for new submissions (modify existing submission route)
// In the main submission route, add this after validation:

// Before processing answers, add comprehensive logging
console.log(`=== SUBMISSION ANALYSIS ===`);
console.log(`Student: ${req.user.enrollmentNo}`);
console.log(`Test: ${testId}`);
console.log(`Submitted at: ${new Date().toISOString()}`);

// Analyze the answers array
const answerAnalysis = {
  total: answers.length,
  valid: 0,
  null: 0,
  undefined: 0,
  invalid: 0,
  sampleData: []
};

answers.forEach((answer, index) => {
  if (answer.selectedAnswer === null) {
    answerAnalysis.null++;
  } else if (answer.selectedAnswer === undefined) {
    answerAnalysis.undefined++;
  } else if (typeof answer.selectedAnswer === 'number' && answer.selectedAnswer >= 0 && answer.selectedAnswer <= 3) {
    answerAnalysis.valid++;
  } else {
    answerAnalysis.invalid++;
  }
  
  // Sample first 3 answers for analysis
  if (index < 3) {
    answerAnalysis.sampleData.push({
      index,
      questionId: answer.questionId,
      selectedAnswer: answer.selectedAnswer,
      type: typeof answer.selectedAnswer,
      originalQuestionNumber: answer.originalQuestionNumber
    });
  }
});

console.log(`Answer Analysis:`, answerAnalysis);

// Alert if critical issue detected
if (answerAnalysis.null > 0 || answerAnalysis.undefined > 0) {
  console.error(`🚨 CRITICAL ISSUE DETECTED for ${req.user.enrollmentNo}:`, {
    nullAnswers: answerAnalysis.null,
    undefinedAnswers: answerAnalysis.undefined,
    validAnswers: answerAnalysis.valid,
    issuePercentage: (((answerAnalysis.null + answerAnalysis.undefined) / answerAnalysis.total) * 100).toFixed(1)
  });
  
  // Could trigger alert to admin dashboard here
}

console.log(`=============================`);

// 4. Auto-recovery mechanism for auto-save route
// In the auto-save route, add data validation and cleanup:

// Before saving auto-save data, validate and clean answers
const cleanedAnswers = {};
let cleanedCount = 0;
let invalidCount = 0;

if (answers && typeof answers === 'object') {
  Object.entries(answers).forEach(([questionId, selectedAnswer]) => {
    if (selectedAnswer !== null && 
        selectedAnswer !== undefined && 
        typeof selectedAnswer === 'number' && 
        selectedAnswer >= 0 && 
        selectedAnswer <= 3 && 
        Number.isInteger(selectedAnswer)) {
      cleanedAnswers[questionId] = selectedAnswer;
      cleanedCount++;
    } else {
      invalidCount++;
      console.warn(`Auto-save: Cleaned invalid answer for question ${questionId}:`, {
        value: selectedAnswer,
        type: typeof selectedAnswer,
        user: req.user.enrollmentNo
      });
    }
  });
}

// Log cleanup results
if (invalidCount > 0) {
  console.log(`Auto-save cleanup for ${req.user.enrollmentNo}: ${cleanedCount} valid, ${invalidCount} invalid answers cleaned`);
}

// Use cleanedAnswers instead of original answers for auto-save
// ... continue with existing auto-save logic using cleanedAnswers

// 5. Create emergency data export endpoint
router.get('/emergency-export/:testId', adminAuth, async (req, res) => {
  try {
    const { testId } = req.params;
    
    const submissions = await Submission.find({
      testId,
      isDraft: false,
      isCompleted: true
    }).populate('testId', 'subject');
    
    const exportData = submissions.map(submission => {
      const nullAnswers = submission.answers?.filter(a => 
        a.selectedAnswer === null || a.selectedAnswer === undefined
      ).length || 0;
      
      const validAnswers = submission.answers?.filter(a => 
        a.selectedAnswer !== null && a.selectedAnswer !== undefined && 
        typeof a.selectedAnswer === 'number'
      ).length || 0;
      
      return {
        enrollmentNo: submission.enrollmentNo,
        score: submission.score,
        totalAnswers: submission.answers?.length || 0,
        validAnswers,
        nullAnswers,
        submittedAt: submission.submittedAt,
        hasIssue: nullAnswers > 0,
        issuePercentage: nullAnswers > 0 ? ((nullAnswers / (submission.answers?.length || 1)) * 100).toFixed(1) : 0
      };
    });
    
    res.json({
      testId,
      testSubject: submissions[0]?.testId?.subject?.subjectCode,
      totalSubmissions: exportData.length,
      submissionsWithIssues: exportData.filter(s => s.hasIssue).length,
      data: exportData
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Create a simple monitoring dashboard endpoint
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
