// ===========================================
// HOT-FIX FOR NULL SELECTEDANSWERS ISSUE
// ===========================================
// This file contains the critical fixes that need to be deployed immediately

// 1. FRONTEND FIX - Enhanced answer validation in TakeTest.jsx
// Replace the handleAnswerChange function with this enhanced version:

const handleAnswerChange = (questionId, answerIndex) => {
  // ✅ CRITICAL: Multiple layers of validation
  const isValidIndex = (answerIndex !== null && 
                       answerIndex !== undefined && 
                       typeof answerIndex === 'number' && 
                       answerIndex >= 0 && 
                       answerIndex <= 3 && 
                       Number.isInteger(answerIndex));
  
  if (isValidIndex) {
    console.log(`✅ Valid answer for question ${questionId}: ${answerIndex}`);
    setAnswers(prev => ({ ...prev, [questionId]: answerIndex }));
    setReviewFlags(prev => {
      const newFlags = { ...prev };
      delete newFlags[questionId];
      return newFlags;
    });
  } else {
    console.error('🚨 CRITICAL: Invalid answer blocked:', {
      answerIndex,
      type: typeof answerIndex,
      questionId,
      isNull: answerIndex === null,
      isUndefined: answerIndex === undefined,
      isNumber: typeof answerIndex === 'number',
      isInteger: Number.isInteger(answerIndex),
      timestamp: new Date().toISOString()
    });
    
    // 🚨 EMERGENCY: Alert user about the issue
    toast.error(`Answer validation failed. Please try selecting the option again.`);
  }
};

// 2. FRONTEND FIX - Enhanced submission validation
// In the handleSubmitTest function, add this validation:

const answeredQuestions = testRef.current.questions
  .map((question, index) => {
    const selectedAnswer = answers[question._id];
    
    // ✅ CRITICAL: Enhanced validation with logging
    const isValidAnswer = (selectedAnswer !== null && 
                          selectedAnswer !== undefined && 
                          typeof selectedAnswer === 'number' && 
                          selectedAnswer >= 0 && 
                          selectedAnswer <= 3 && 
                          Number.isInteger(selectedAnswer));
    
    if (isValidAnswer) {
      return {
        questionId: question._id,
        selectedAnswer: selectedAnswer,
        markedForReview: reviewFlags[question._id] || false,
        originalQuestionNumber: question.originalQuestionNumber || (index + 1),
        shuffledPosition: index + 1,
        shuffledToOriginal: question.shuffledToOriginal || [0, 1, 2, 3]
      };
    } else {
      // 🚨 LOG REJECTED ANSWERS
      console.error(`🚨 REJECTED answer for question ${index + 1}:`, {
        questionId: question._id,
        selectedAnswer: selectedAnswer,
        type: typeof selectedAnswer,
        isNull: selectedAnswer === null,
        isUndefined: selectedAnswer === undefined,
        questionIndex: index,
        timestamp: new Date().toISOString()
      });
    }
    return null;
  })
  .filter(item => item !== null);

// 🚨 CRITICAL: Warn user if too many answers were rejected
const totalQuestions = testRef.current.questions.length;
const rejectedCount = totalQuestions - answeredQuestions.length;

if (rejectedCount > 0) {
  console.warn(`⚠️ WARNING: ${rejectedCount} answers were rejected due to validation errors`);
  
  // If more than 10% of answers were rejected, warn the user
  if (rejectedCount / totalQuestions > 0.1) {
    const proceed = confirm(
      `WARNING: ${rejectedCount} of your answers could not be processed due to technical issues. ` +
      `Only ${answeredQuestions.length} valid answers will be submitted. ` +
      `Do you want to proceed with submission or go back to review your answers?`
    );
    
    if (!proceed) {
      setTestSubmitted(false);
      return;
    }
  }
}

// 3. BACKEND FIX - Enhanced validation in submissions.js
// Add this validation in the submission route:

// After receiving the answers array, add this validation:
const validatedAnswers = [];
const rejectedAnswers = [];

answers.forEach((answer, index) => {
  const isValidSelectedAnswer = (
    answer.selectedAnswer !== null && 
    answer.selectedAnswer !== undefined && 
    typeof answer.selectedAnswer === 'number' && 
    answer.selectedAnswer >= 0 && 
    answer.selectedAnswer <= 3 && 
    Number.isInteger(answer.selectedAnswer)
  );
  
  if (isValidSelectedAnswer) {
    validatedAnswers.push(answer);
  } else {
    rejectedAnswers.push({
      ...answer,
      rejectionReason: 'Invalid selectedAnswer value',
      originalValue: answer.selectedAnswer,
      index
    });
  }
});

// Log rejected answers for monitoring
if (rejectedAnswers.length > 0) {
  console.error(`🚨 CRITICAL: User ${req.user.enrollmentNo} submitted ${rejectedAnswers.length} invalid answers:`, {
    testId,
    userId: req.user.enrollmentNo,
    rejectedCount: rejectedAnswers.length,
    totalSubmitted: answers.length,
    validCount: validatedAnswers.length,
    sampleRejected: rejectedAnswers.slice(0, 3),
    timestamp: new Date().toISOString()
  });
}

// Use validatedAnswers instead of answers for processing
const processedAnswers = validatedAnswers.map((answer, index) => {
  // ... existing processing logic
});

// 4. IMMEDIATE MONITORING - Add to backend
// Create an endpoint to monitor the issue:

router.get('/monitor/null-answers', adminAuth, async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const submissions = await Submission.find({
      submittedAt: { $gte: startOfDay },
      isDraft: false,
      isCompleted: true
    });
    
    const issueStats = {
      total: submissions.length,
      withNullIssues: 0,
      affectedStudents: []
    };
    
    submissions.forEach(submission => {
      const nullCount = submission.answers?.filter(a => 
        a.selectedAnswer === null || a.selectedAnswer === undefined
      ).length || 0;
      
      if (nullCount > 0) {
        issueStats.withNullIssues++;
        issueStats.affectedStudents.push({
          enrollmentNo: submission.enrollmentNo,
          nullCount,
          totalAnswers: submission.answers?.length || 0,
          submittedAt: submission.submittedAt
        });
      }
    });
    
    res.json(issueStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. EMERGENCY CLIENT-SIDE FIX - Add to the radio button onChange:
onChange={() => {
  // ✅ EMERGENCY: Force validation before setting
  const safeIndex = Number(index);
  if (isNaN(safeIndex) || safeIndex < 0 || safeIndex > 3) {
    console.error('🚨 EMERGENCY: Invalid index from radio button:', index);
    toast.error('Invalid option selected. Please try again.');
    return;
  }
  handleAnswerChange(test.questions[currentQuestionIndex]._id, safeIndex);
}}

// 6. SESSION STORAGE VALIDATION - Add to session recovery:
const validateAnswersObject = (answers) => {
  if (!answers || typeof answers !== 'object') {
    return {};
  }
  
  const cleanedAnswers = {};
  Object.entries(answers).forEach(([questionId, answer]) => {
    if (answer !== null && 
        answer !== undefined && 
        typeof answer === 'number' && 
        answer >= 0 && 
        answer <= 3 && 
        Number.isInteger(answer)) {
      cleanedAnswers[questionId] = answer;
    } else {
      console.warn(`🧹 Cleaned invalid answer for question ${questionId}:`, answer);
    }
  });
  
  return cleanedAnswers;
};

// Use this when restoring from session storage:
setAnswers(validateAnswersObject(parsedState.answers || {}));
