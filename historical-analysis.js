const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app?retryWrites=true&w=majority&appName=Cluster0').then(async () => {
  console.log('Connected to database');
  
  // Check last 7 days
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  console.log('Checking submissions from', sevenDaysAgo, 'to', today);
  
  // Find all submissions from last 7 days
  const recentSubmissions = await Submission.find({
    submittedAt: { $gte: sevenDaysAgo, $lt: today },
    isDraft: false,
    isCompleted: true
  }).populate('testId', 'subject').sort({ submittedAt: -1 });
  
  console.log(`Found ${recentSubmissions.length} submissions in the last 7 days`);
  
  // Analyze by day
  const dailyAnalysis = {};
  
  recentSubmissions.forEach(submission => {
    const submissionDate = submission.submittedAt.toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!dailyAnalysis[submissionDate]) {
      dailyAnalysis[submissionDate] = {
        total: 0,
        nullAnswersIssues: 0,
        emptyArrayIssues: 0,
        allNullSelectedAnswers: 0,
        zeroScores: 0,
        problematicStudents: []
      };
    }
    
    const analysis = dailyAnalysis[submissionDate];
    analysis.total++;
    
    // Check for null answers array
    if (!submission.answers) {
      analysis.emptyArrayIssues++;
      analysis.problematicStudents.push({
        enrollmentNo: submission.enrollmentNo,
        testSubject: submission.testId?.subject?.subjectCode,
        issue: 'null answers array'
      });
    } else if (submission.answers.length === 0) {
      analysis.emptyArrayIssues++;
      analysis.problematicStudents.push({
        enrollmentNo: submission.enrollmentNo,
        testSubject: submission.testId?.subject?.subjectCode,
        issue: 'empty answers array'
      });
    } else {
      // Check for null selectedAnswers
      let nullAnswers = 0;
      let validAnswers = 0;
      
      submission.answers.forEach(answer => {
        if (answer.selectedAnswer === null || answer.selectedAnswer === undefined) {
          nullAnswers++;
        } else {
          validAnswers++;
        }
      });
      
      if (nullAnswers > 0) {
        analysis.nullAnswersIssues++;
        analysis.problematicStudents.push({
          enrollmentNo: submission.enrollmentNo,
          testSubject: submission.testId?.subject?.subjectCode,
          issue: `${nullAnswers} null selectedAnswers out of ${submission.answers.length}`,
          nullCount: nullAnswers,
          validCount: validAnswers
        });
      }
      
      if (nullAnswers === submission.answers.length) {
        analysis.allNullSelectedAnswers++;
      }
    }
    
    if (submission.score === 0) {
      analysis.zeroScores++;
    }
  });
  
  // Print daily analysis
  console.log('\n=== DAILY ANALYSIS (Last 7 Days) ===');
  const sortedDates = Object.keys(dailyAnalysis).sort().reverse(); // Most recent first
  
  sortedDates.forEach(date => {
    const analysis = dailyAnalysis[date];
    console.log(`\n${date}:`);
    console.log(`  Total submissions: ${analysis.total}`);
    console.log(`  Null selectedAnswers issues: ${analysis.nullAnswersIssues}`);
    console.log(`  Empty/null arrays issues: ${analysis.emptyArrayIssues}`);
    console.log(`  All null selectedAnswers: ${analysis.allNullSelectedAnswers}`);
    console.log(`  Zero scores: ${analysis.zeroScores}`);
    
    if (analysis.problematicStudents.length > 0) {
      console.log(`  Problematic students:`);
      analysis.problematicStudents.forEach(student => {
        console.log(`    - ${student.enrollmentNo} (${student.testSubject}): ${student.issue}`);
      });
    }
  });
  
  // Overall statistics
  const totalSubmissions = recentSubmissions.length;
  const totalNullIssues = Object.values(dailyAnalysis).reduce((sum, day) => sum + day.nullAnswersIssues, 0);
  const totalEmptyIssues = Object.values(dailyAnalysis).reduce((sum, day) => sum + day.emptyArrayIssues, 0);
  
  console.log('\n=== OVERALL STATISTICS (Last 7 Days) ===');
  console.log(`Total submissions: ${totalSubmissions}`);
  console.log(`Submissions with null selectedAnswers: ${totalNullIssues} (${((totalNullIssues/totalSubmissions)*100).toFixed(2)}%)`);
  console.log(`Submissions with empty/null arrays: ${totalEmptyIssues} (${((totalEmptyIssues/totalSubmissions)*100).toFixed(2)}%)`);
  
  // Find the most problematic students (multiple issues)
  const studentIssueCount = {};
  Object.values(dailyAnalysis).forEach(day => {
    day.problematicStudents.forEach(student => {
      if (!studentIssueCount[student.enrollmentNo]) {
        studentIssueCount[student.enrollmentNo] = 0;
      }
      studentIssueCount[student.enrollmentNo]++;
    });
  });
  
  const repeatedIssueStudents = Object.entries(studentIssueCount).filter(([student, count]) => count > 1);
  
  if (repeatedIssueStudents.length > 0) {
    console.log('\n=== STUDENTS WITH REPEATED ISSUES ===');
    repeatedIssueStudents.forEach(([enrollmentNo, count]) => {
      console.log(`${enrollmentNo}: ${count} submissions with issues`);
    });
  }
  
  mongoose.disconnect();
}).catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});
