const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app?retryWrites=true&w=majority&appName=Cluster0').then(async () => {
  console.log('Connected to database');
  
  // Get current time
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  console.log('Checking for current students with empty answers arrays...');
  console.log('Current time:', now.toISOString());
  
  // Find active draft submissions (students currently taking tests)
  const activeDrafts = await Submission.find({
    isDraft: true,
    lastSavedAt: { $gte: oneHourAgo }, // Active within last hour
    $or: [
      { lastHeartbeat: { $gte: oneHourAgo } },
      { lastSavedAt: { $gte: oneHourAgo } }
    ]
  }).populate('testId', 'subject duration').sort({ lastSavedAt: -1 });
  
  console.log(`\nFound ${activeDrafts.length} active draft submissions (students currently taking tests)`);
  
  // Analyze each active draft
  const emptyAnswersStudents = [];
  const lowAnswersStudents = [];
  const normalStudents = [];
  
  activeDrafts.forEach(draft => {
    const answersCount = draft.answers?.length || 0;
    const enrollmentNo = draft.enrollmentNo;
    const testSubject = draft.testId?.subject?.subjectCode;
    const lastActivity = draft.lastSavedAt || draft.lastHeartbeat;
    const timeInTest = Math.floor((now - new Date(draft.testStartedAt || draft.createdAt)) / (1000 * 60)); // minutes
    
    const studentInfo = {
      enrollmentNo,
      testSubject,
      answersCount,
      lastActivity,
      timeInTest,
      autoSaveCount: draft.autoSaveCount || 0,
      currentQuestionIndex: draft.currentQuestionIndex || 0,
      timeLeftWhenSaved: draft.timeLeftWhenSaved
    };
    
    if (answersCount === 0) {
      emptyAnswersStudents.push(studentInfo);
    } else if (answersCount < 5) {
      lowAnswersStudents.push(studentInfo);
    } else {
      normalStudents.push(studentInfo);
    }
  });
  
  console.log('\n=== STUDENTS WITH EMPTY ANSWERS ARRAYS ===');
  if (emptyAnswersStudents.length > 0) {
    console.log(`Found ${emptyAnswersStudents.length} students with completely empty answers:`);
    emptyAnswersStudents.forEach(student => {
      const minutesAgo = Math.floor((now - new Date(student.lastActivity)) / (1000 * 60));
      console.log(`- ${student.enrollmentNo} (${student.testSubject})`);
      console.log(`  Time in test: ${student.timeInTest} minutes`);
      console.log(`  Last activity: ${minutesAgo} minutes ago`);
      console.log(`  Auto-saves: ${student.autoSaveCount}`);
      console.log(`  Current question: ${student.currentQuestionIndex + 1}`);
      console.log(`  Time left: ${student.timeLeftWhenSaved || 'unknown'} seconds`);
      console.log('');
    });
  } else {
    console.log('✅ No students with completely empty answers arrays');
  }
  
  console.log('\n=== STUDENTS WITH LOW ANSWER COUNTS (< 5 answers) ===');
  if (lowAnswersStudents.length > 0) {
    console.log(`Found ${lowAnswersStudents.length} students with very few answers:`);
    lowAnswersStudents.forEach(student => {
      const minutesAgo = Math.floor((now - new Date(student.lastActivity)) / (1000 * 60));
      console.log(`- ${student.enrollmentNo} (${student.testSubject}): ${student.answersCount} answers`);
      console.log(`  Time in test: ${student.timeInTest} minutes`);
      console.log(`  Last activity: ${minutesAgo} minutes ago`);
      console.log(`  Current question: ${student.currentQuestionIndex + 1}`);
      console.log('');
    });
  } else {
    console.log('✅ No students with critically low answer counts');
  }
  
  console.log('\n=== SUMMARY ===');
  console.log(`Total active students: ${activeDrafts.length}`);
  console.log(`Students with empty answers: ${emptyAnswersStudents.length}`);
  console.log(`Students with low answers (< 5): ${lowAnswersStudents.length}`);
  console.log(`Students progressing normally: ${normalStudents.length}`);
  
  // Check for students who might be stuck
  const stuckStudents = activeDrafts.filter(draft => {
    const minutesSinceActivity = Math.floor((now - new Date(draft.lastSavedAt || draft.lastHeartbeat)) / (1000 * 60));
    const timeInTest = Math.floor((now - new Date(draft.testStartedAt || draft.createdAt)) / (1000 * 60));
    return minutesSinceActivity > 10 && timeInTest > 5 && (draft.answers?.length || 0) === 0;
  });
  
  if (stuckStudents.length > 0) {
    console.log('\n⚠️ POTENTIALLY STUCK STUDENTS (no activity >10min, empty answers):');
    stuckStudents.forEach(student => {
      const minutesAgo = Math.floor((now - new Date(student.lastSavedAt || student.lastHeartbeat)) / (1000 * 60));
      console.log(`- ${student.enrollmentNo} (${student.testId?.subject?.subjectCode}): ${minutesAgo} minutes since last activity`);
    });
  }
  
  // Check for students with concerning patterns
  const concerningPatterns = activeDrafts.filter(draft => {
    const timeInTest = Math.floor((now - new Date(draft.testStartedAt || draft.createdAt)) / (1000 * 60));
    const answersCount = draft.answers?.length || 0;
    const autoSaveCount = draft.autoSaveCount || 0;
    
    // Red flags: been in test >15 minutes but no answers, or many auto-saves but no answers
    return (timeInTest > 15 && answersCount === 0) || (autoSaveCount > 5 && answersCount === 0);
  });
  
  if (concerningPatterns.length > 0) {
    console.log('\n🚨 CONCERNING PATTERNS:');
    concerningPatterns.forEach(student => {
      const timeInTest = Math.floor((now - new Date(student.testStartedAt || student.createdAt)) / (1000 * 60));
      console.log(`- ${student.enrollmentNo} (${student.testId?.subject?.subjectCode})`);
      console.log(`  Time in test: ${timeInTest} minutes`);
      console.log(`  Answers: ${student.answers?.length || 0}`);
      console.log(`  Auto-saves: ${student.autoSaveCount || 0}`);
      console.log('');
    });
  }
  
  mongoose.disconnect();
}).catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});
