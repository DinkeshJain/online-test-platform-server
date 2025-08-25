const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app?retryWrites=true&w=majority&appName=Cluster0').then(async () => {
  console.log('Connected to database');
  
  // Find the specific problematic submission
  const problematicSubmission = await Submission.findOne({
    enrollmentNo: 'A25DF01410'
  }).populate('testId', 'subject duration questions').sort({ submittedAt: -1 });
  
  if (problematicSubmission) {
    console.log('=== DETAILED ANALYSIS ===');
    console.log('Student:', problematicSubmission.enrollmentNo);
    console.log('Submitted At:', problematicSubmission.submittedAt);
    console.log('Test Subject:', problematicSubmission.testId?.subject?.subjectCode);
    console.log('Total Answers:', problematicSubmission.answers?.length || 0);
    console.log('Score:', problematicSubmission.score);
    console.log('Total Questions in Test:', problematicSubmission.testId?.questions?.length || 0);
    
    console.log('\n=== ANSWER ANALYSIS ===');
    let nullAnswers = 0;
    let validAnswers = 0;
    let originalQuestionNumbers = new Set();
    
    problematicSubmission.answers?.forEach((answer, index) => {
      if (answer.selectedAnswer === null || answer.selectedAnswer === undefined) {
        nullAnswers++;
        if (index < 5) {
          console.log(`Null Answer ${index + 1}:`, {
            questionId: answer.questionId,
            selectedAnswer: answer.selectedAnswer,
            originalQuestionNumber: answer.originalQuestionNumber,
            shuffledToOriginal: answer.shuffledToOriginal
          });
        }
      } else {
        validAnswers++;
        if (validAnswers <= 5) {
          console.log(`Valid Answer ${validAnswers}:`, {
            questionId: answer.questionId,
            selectedAnswer: answer.selectedAnswer,
            originalQuestionNumber: answer.originalQuestionNumber,
            shuffledToOriginal: answer.shuffledToOriginal
          });
        }
      }
      
      originalQuestionNumbers.add(answer.originalQuestionNumber);
    });
    
    console.log('\n=== SUMMARY ===');
    console.log('Null Answers:', nullAnswers);
    console.log('Valid Answers:', validAnswers);
    console.log('Unique Original Question Numbers:', originalQuestionNumbers.size);
    console.log('Original Question Numbers:', Array.from(originalQuestionNumbers).sort((a, b) => a - b));
    
    // Check if all originalQuestionNumber are 1
    const allOriginalQuestionNumbers = problematicSubmission.answers?.map(a => a.originalQuestionNumber) || [];
    const allOnes = allOriginalQuestionNumbers.every(num => num === 1);
    console.log('All originalQuestionNumber = 1?', allOnes);
    
    // Check for draft submissions
    const draftSubmission = await Submission.findOne({
      enrollmentNo: 'A25DF01410',
      testId: problematicSubmission.testId._id,
      isDraft: true
    });
    
    console.log('\n=== DRAFT STATUS ===');
    console.log('Has Draft Submission:', !!draftSubmission);
    if (draftSubmission) {
      console.log('Draft Auto-Save Count:', draftSubmission.autoSaveCount);
      console.log('Draft Answers Count:', draftSubmission.answers?.length || 0);
    }
    
  } else {
    console.log('Student A25DF01410 not found');
  }
  
  mongoose.disconnect();
}).catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});
