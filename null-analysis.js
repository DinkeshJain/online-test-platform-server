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
  
  // Analyze all submissions for null selectedAnswer issues
  const analysisResults = [];
  
  todaySubmissions.forEach(submission => {
    let nullAnswers = 0;
    let validAnswers = 0;
    let totalAnswers = submission.answers?.length || 0;
    
    submission.answers?.forEach(answer => {
      if (answer.selectedAnswer === null || answer.selectedAnswer === undefined) {
        nullAnswers++;
      } else {
        validAnswers++;
      }
    });
    
    analysisResults.push({
      enrollmentNo: submission.enrollmentNo,
      testSubject: submission.testId?.subject?.subjectCode,
      submittedAt: submission.submittedAt,
      totalAnswers,
      validAnswers,
      nullAnswers,
      score: submission.score,
      hasNullIssue: nullAnswers > 0
    });
  });
  
  // Group by null answer issues
  const withNullIssues = analysisResults.filter(r => r.hasNullIssue);
  const withoutNullIssues = analysisResults.filter(r => !r.hasNullIssue);
  
  console.log('\n=== NULL ANSWER ANALYSIS ===');
  console.log(`Submissions with NULL answer issues: ${withNullIssues.length}`);
  console.log(`Submissions without NULL issues: ${withoutNullIssues.length}`);
  
  if (withNullIssues.length > 0) {
    console.log('\n=== STUDENTS WITH NULL ANSWER ISSUES ===');
    withNullIssues.forEach(result => {
      console.log(`${result.enrollmentNo} (${result.testSubject}): ${result.nullAnswers} null / ${result.totalAnswers} total answers, Score: ${result.score}`);
    });
    
    // Statistics
    const avgNullAnswers = withNullIssues.reduce((sum, r) => sum + r.nullAnswers, 0) / withNullIssues.length;
    const avgValidAnswers = withNullIssues.reduce((sum, r) => sum + r.validAnswers, 0) / withNullIssues.length;
    
    console.log('\n=== STATISTICS ===');
    console.log(`Average null answers per affected student: ${avgNullAnswers.toFixed(1)}`);
    console.log(`Average valid answers per affected student: ${avgValidAnswers.toFixed(1)}`);
  }
  
  // Check if there's a pattern by test subject
  const bySubject = {};
  analysisResults.forEach(result => {
    const subject = result.testSubject || 'Unknown';
    if (!bySubject[subject]) {
      bySubject[subject] = { total: 0, withNullIssues: 0 };
    }
    bySubject[subject].total++;
    if (result.hasNullIssue) {
      bySubject[subject].withNullIssues++;
    }
  });
  
  console.log('\n=== BY TEST SUBJECT ===');
  Object.keys(bySubject).forEach(subject => {
    const data = bySubject[subject];
    const percentage = ((data.withNullIssues / data.total) * 100).toFixed(1);
    console.log(`${subject}: ${data.withNullIssues}/${data.total} (${percentage}%) have null issues`);
  });
  
  mongoose.disconnect();
}).catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});
