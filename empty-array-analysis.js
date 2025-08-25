const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app?retryWrites=true&w=majority&appName=Cluster0').then(async () => {
  console.log('Connected to database');
  
  // Get today's date range
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  
  // Find all submissions from today
  const todaySubmissions = await Submission.find({
    submittedAt: { $gte: startOfDay, $lt: endOfDay },
    isDraft: false,
    isCompleted: true
  }).populate('testId', 'subject').sort({ submittedAt: -1 });
  
  console.log(`Found ${todaySubmissions.length} submissions today`);
  
  // Check for different types of empty/problematic submissions
  const emptyArraySubmissions = [];
  const nullArraySubmissions = [];
  const zeroLengthSubmissions = [];
  const allNullAnswersSubmissions = [];
  
  todaySubmissions.forEach(submission => {
    const answers = submission.answers;
    const enrollmentNo = submission.enrollmentNo;
    const testSubject = submission.testId?.subject?.subjectCode;
    const submittedAt = submission.submittedAt;
    const score = submission.score;
    
    // Check for completely empty/null answers array
    if (!answers) {
      nullArraySubmissions.push({
        enrollmentNo,
        testSubject,
        submittedAt,
        score,
        issue: 'answers is null/undefined'
      });
    } else if (answers.length === 0) {
      emptyArraySubmissions.push({
        enrollmentNo,
        testSubject,
        submittedAt,
        score,
        issue: 'answers array is empty (length 0)'
      });
    } else {
      // Check if all answers have null selectedAnswer
      const allNullSelected = answers.every(answer => 
        answer.selectedAnswer === null || answer.selectedAnswer === undefined
      );
      
      if (allNullSelected) {
        allNullAnswersSubmissions.push({
          enrollmentNo,
          testSubject,
          submittedAt,
          score,
          answersCount: answers.length,
          issue: 'all selectedAnswers are null'
        });
      }
    }
  });
  
  console.log('\n=== EMPTY ANSWERS ARRAY ANALYSIS ===');
  console.log(`Submissions with NULL answers array: ${nullArraySubmissions.length}`);
  console.log(`Submissions with EMPTY answers array: ${emptyArraySubmissions.length}`);
  console.log(`Submissions with ALL NULL selectedAnswers: ${allNullAnswersSubmissions.length}`);
  
  if (nullArraySubmissions.length > 0) {
    console.log('\n=== NULL ANSWERS ARRAY ===');
    nullArraySubmissions.forEach(sub => {
      console.log(`${sub.enrollmentNo} (${sub.testSubject}) - Score: ${sub.score} - ${sub.issue}`);
    });
  }
  
  if (emptyArraySubmissions.length > 0) {
    console.log('\n=== EMPTY ANSWERS ARRAY ===');
    emptyArraySubmissions.forEach(sub => {
      console.log(`${sub.enrollmentNo} (${sub.testSubject}) - Score: ${sub.score} - ${sub.issue}`);
    });
  }
  
  if (allNullAnswersSubmissions.length > 0) {
    console.log('\n=== ALL NULL SELECTED ANSWERS ===');
    allNullAnswersSubmissions.forEach(sub => {
      console.log(`${sub.enrollmentNo} (${sub.testSubject}) - Score: ${sub.score} - Answers: ${sub.answersCount} - ${sub.issue}`);
    });
  }
  
  // Also check for submissions with very low answer counts (might indicate problems)
  const lowAnswerCountSubmissions = todaySubmissions.filter(submission => {
    const answersCount = submission.answers?.length || 0;
    return answersCount > 0 && answersCount < 10; // Less than 10 answers
  });
  
  if (lowAnswerCountSubmissions.length > 0) {
    console.log('\n=== SUSPICIOUSLY LOW ANSWER COUNTS (< 10 answers) ===');
    lowAnswerCountSubmissions.forEach(submission => {
      const validAnswers = submission.answers?.filter(a => 
        a.selectedAnswer !== null && a.selectedAnswer !== undefined
      ).length || 0;
      
      console.log(`${submission.enrollmentNo} (${submission.testId?.subject?.subjectCode}) - Total: ${submission.answers?.length || 0}, Valid: ${validAnswers}, Score: ${submission.score}`);
    });
  }
  
  // Check for students with zero scores
  const zeroScoreSubmissions = todaySubmissions.filter(submission => submission.score === 0);
  
  if (zeroScoreSubmissions.length > 0) {
    console.log('\n=== ZERO SCORE SUBMISSIONS ===');
    console.log(`Found ${zeroScoreSubmissions.length} submissions with score 0:`);
    
    // Group by reason for zero score
    const zeroScoreReasons = {};
    
    zeroScoreSubmissions.forEach(submission => {
      const answersCount = submission.answers?.length || 0;
      const validAnswers = submission.answers?.filter(a => 
        a.selectedAnswer !== null && a.selectedAnswer !== undefined
      ).length || 0;
      
      let reason;
      if (answersCount === 0) {
        reason = 'No answers submitted';
      } else if (validAnswers === 0) {
        reason = 'All answers are null';
      } else {
        reason = 'All answers incorrect';
      }
      
      if (!zeroScoreReasons[reason]) {
        zeroScoreReasons[reason] = [];
      }
      
      zeroScoreReasons[reason].push({
        enrollmentNo: submission.enrollmentNo,
        testSubject: submission.testId?.subject?.subjectCode,
        answersCount,
        validAnswers
      });
    });
    
    Object.keys(zeroScoreReasons).forEach(reason => {
      console.log(`\n${reason}: ${zeroScoreReasons[reason].length} students`);
      zeroScoreReasons[reason].slice(0, 5).forEach(student => {
        console.log(`  - ${student.enrollmentNo} (${student.testSubject}) - Answers: ${student.answersCount}, Valid: ${student.validAnswers}`);
      });
      if (zeroScoreReasons[reason].length > 5) {
        console.log(`  ... and ${zeroScoreReasons[reason].length - 5} more`);
      }
    });
  }
  
  mongoose.disconnect();
}).catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});
