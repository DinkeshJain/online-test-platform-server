const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app?retryWrites=true&w=majority&appName=Cluster0').then(async () => {
  console.log('Connected to database');
  
  // Get today's date range
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  
  console.log('Checking submissions from', startOfDay, 'to', endOfDay);
  
  // Find submissions from today
  const todaySubmissions = await Submission.find({
    submittedAt: { $gte: startOfDay, $lt: endOfDay },
    isDraft: false,
    isCompleted: true
  }).populate('testId', 'subject duration').sort({ submittedAt: -1 });
  
  console.log(`Found ${todaySubmissions.length} submissions today`);
  
  // Check for problematic submissions
  const problematicSubmissions = [];
  
  todaySubmissions.forEach((submission, index) => {
    const issues = [];
    
    // Check if answers array is empty
    if (!submission.answers || submission.answers.length === 0) {
      issues.push('Empty answers array');
    }
    
    // Check for null selectedAnswers
    let nullAnswers = 0;
    let allOriginalQuestionNumber1 = true;
    
    if (submission.answers && submission.answers.length > 0) {
      submission.answers.forEach(answer => {
        if (answer.selectedAnswer === null || answer.selectedAnswer === undefined) {
          nullAnswers++;
        }
        if (answer.originalQuestionNumber !== 1) {
          allOriginalQuestionNumber1 = false;
        }
      });
      
      if (nullAnswers > 0) {
        issues.push(`${nullAnswers} null selectedAnswers`);
      }
      
      if (allOriginalQuestionNumber1 && submission.answers.length > 1) {
        issues.push('All originalQuestionNumber = 1');
      }
    }
    
    if (issues.length > 0) {
      problematicSubmissions.push({
        submissionId: submission._id,
        userId: submission.userId,
        enrollmentNo: submission.enrollmentNo,
        testId: submission.testId?._id,
        testSubject: submission.testId?.subject,
        submittedAt: submission.submittedAt,
        answersCount: submission.answers?.length || 0,
        score: submission.score,
        issues: issues
      });
    }
    
    // Log first few submissions for analysis
    if (index < 3) {
      console.log(`\nSubmission ${index + 1}:`);
      console.log('- Enrollment:', submission.enrollmentNo);
      console.log('- Test Subject:', submission.testId?.subject?.subjectCode);
      console.log('- Submitted At:', submission.submittedAt);
      console.log('- Answers Count:', submission.answers?.length || 0);
      console.log('- Score:', submission.score);
      console.log('- Sample answers:', submission.answers?.slice(0, 2));
    }
  });
  
  console.log(`\n=== PROBLEMATIC SUBMISSIONS ===`);
  console.log(`Found ${problematicSubmissions.length} submissions with issues:`);
  
  problematicSubmissions.forEach(sub => {
    console.log(`\nStudent: ${sub.enrollmentNo}`);
    console.log(`Test: ${sub.testSubject?.subjectCode}`);
    console.log(`Issues: ${sub.issues.join(', ')}`);
    console.log(`Answers Count: ${sub.answersCount}`);
    console.log(`Score: ${sub.score}`);
  });
  
  mongoose.disconnect();
}).catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});
