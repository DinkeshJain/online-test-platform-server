require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import models
const Submission = require('./models/Submission');
const Test = require('./models/Test');
const Student = require('./models/Student');

// Helper function to recalculate if an answer is correct
function recalculateIsCorrect(answer, question) {
  if (!answer || !question) return false;
  
  const selectedAnswer = parseInt(answer.selectedAnswer, 10);
  if (!Number.isInteger(selectedAnswer) || selectedAnswer < 0 || selectedAnswer > 3) {
    return false;
  }

  // Check if shuffledToOriginal exists and is valid
  if (answer.shuffledToOriginal && Array.isArray(answer.shuffledToOriginal) && answer.shuffledToOriginal.length > 0) {
    // Use shuffled logic - map shuffled answer back to original
    const originalIndex = answer.shuffledToOriginal[selectedAnswer];
    return originalIndex === question.correctAnswer;
  } else {
    // Direct comparison (non-shuffled)
    return question.correctAnswer === selectedAnswer;
  }
}

// Main function to fix incorrect isCorrect values
async function fixIncorrectAnswerLogic() {
  try {
    console.log('🔍 Starting analysis and fix of incorrect answer logic...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get command line arguments for date filtering
    const args = process.argv.slice(2);
    let dateFilter = {};
    let targetDate = null;
    
    if (args.length > 0 && args[0] !== 'all') {
      targetDate = args[0];
      const startOfDay = new Date(`${targetDate}T00:00:00.000Z`);
      const endOfDay = new Date(`${targetDate}T23:59:59.999Z`);
      
      dateFilter = {
        $or: [
          { submittedAt: { $gte: startOfDay, $lte: endOfDay } },
          { testStartedAt: { $gte: startOfDay, $lte: endOfDay } },
          { createdAt: { $gte: startOfDay, $lte: endOfDay } }
        ]
      };
      
      console.log(`📅 Analyzing submissions for date: ${targetDate}`);
    } else {
      console.log('📅 Analyzing ALL submissions (use date YYYY-MM-DD to filter)');
    }

    // Find all submissions to analyze
    const submissions = await Submission.find(dateFilter).populate('testId');
    console.log(`📊 Found ${submissions.length} submissions to analyze\n`);

    let totalAnswers = 0;
    let incorrectLogicAnswers = 0;
    let fixedAnswers = 0;
    let scoreChanges = 0;
    const detailedReport = [];
    const submissionUpdates = [];

    console.log('🔍 Analyzing submissions...\n');

    for (let i = 0; i < submissions.length; i++) {
      const submission = submissions[i];
      
      if (i % 100 === 0) {
        console.log(`Progress: ${i}/${submissions.length} submissions analyzed...`);
      }

      if (!submission.testId || !submission.answers || submission.answers.length === 0) {
        continue;
      }

      const test = submission.testId;
      let submissionChanged = false;
      let originalScore = submission.score || 0;
      let newCorrectCount = 0;

      for (let answerIndex = 0; answerIndex < submission.answers.length; answerIndex++) {
        const answer = submission.answers[answerIndex];
        totalAnswers++;

        // Find the corresponding question
        const question = test.questions.id(answer.questionId);
        if (!question) {
          console.warn(`⚠️ Question not found: ${answer.questionId} in test ${test._id}`);
          continue;
        }

        // Recalculate if the answer should be correct
        const shouldBeCorrect = recalculateIsCorrect(answer, question);
        const currentlyMarkedCorrect = answer.isCorrect;

        if (shouldBeCorrect !== currentlyMarkedCorrect) {
          incorrectLogicAnswers++;
          
          // Update the answer
          submission.answers[answerIndex].isCorrect = shouldBeCorrect;
          submissionChanged = true;
          fixedAnswers++;

          detailedReport.push({
            submissionId: submission._id,
            enrollmentNo: submission.enrollmentNo,
            course: submission.course,
            testSubject: test.subject ? test.subject.subjectCode : 'Unknown',
            questionId: answer.questionId,
            questionNumber: answer.originalQuestionNumber || answerIndex + 1,
            selectedAnswer: answer.selectedAnswer,
            correctAnswer: question.correctAnswer,
            shuffledToOriginal: answer.shuffledToOriginal,
            wasMarkedCorrect: currentlyMarkedCorrect,
            shouldBeCorrect: shouldBeCorrect,
            action: shouldBeCorrect ? 'FIXED_TO_CORRECT' : 'FIXED_TO_INCORRECT'
          });
        }

        if (shouldBeCorrect) {
          newCorrectCount++;
        }
      }

      // Update submission score if needed
      if (submissionChanged) {
        const newScore = newCorrectCount;
        submission.score = newScore;
        
        if (originalScore !== newScore) {
          scoreChanges++;
        }

        submissionUpdates.push({
          submissionId: submission._id,
          enrollmentNo: submission.enrollmentNo,
          course: submission.course,
          testSubject: test.subject ? test.subject.subjectCode : 'Unknown',
          originalScore: originalScore,
          newScore: newScore,
          scoreDifference: newScore - originalScore,
          totalQuestions: submission.totalQuestions || test.questions.length
        });

        // Save the updated submission
        await submission.save();
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 ANALYSIS COMPLETE - INCORRECT ANSWER LOGIC FIX REPORT');
    console.log('='.repeat(80));
    console.log(`📅 Analysis Date: ${targetDate || 'ALL DATES'}`);
    console.log(`📝 Total submissions analyzed: ${submissions.length}`);
    console.log(`🔢 Total answers analyzed: ${totalAnswers}`);
    console.log(`❌ Answers with incorrect logic: ${incorrectLogicAnswers}`);
    console.log(`✅ Answers fixed: ${fixedAnswers}`);
    console.log(`📊 Submissions with score changes: ${scoreChanges}`);
    console.log(`🎯 Fix success rate: ${totalAnswers > 0 ? ((fixedAnswers / totalAnswers) * 100).toFixed(2) : 0}%`);

    if (detailedReport.length > 0) {
      console.log('\n🔍 DETAILED ANSWER FIXES:');
      console.log('-'.repeat(80));
      
      // Group by test subject
      const fixesBySubject = {};
      detailedReport.forEach(fix => {
        if (!fixesBySubject[fix.testSubject]) {
          fixesBySubject[fix.testSubject] = [];
        }
        fixesBySubject[fix.testSubject].push(fix);
      });

      Object.keys(fixesBySubject).forEach(subject => {
        const fixes = fixesBySubject[subject];
        console.log(`\n📚 ${subject}: ${fixes.length} fixes`);
        
        const fixedToCorrect = fixes.filter(f => f.action === 'FIXED_TO_CORRECT').length;
        const fixedToIncorrect = fixes.filter(f => f.action === 'FIXED_TO_INCORRECT').length;
        
        console.log(`   ✅ Fixed to correct: ${fixedToCorrect}`);
        console.log(`   ❌ Fixed to incorrect: ${fixedToIncorrect}`);
      });
    }

    if (submissionUpdates.length > 0) {
      console.log('\n📈 SCORE CHANGES:');
      console.log('-'.repeat(80));
      
      // Group by course
      const scoreChangesByCourse = {};
      submissionUpdates.forEach(update => {
        if (!scoreChangesByCourse[update.course]) {
          scoreChangesByCourse[update.course] = [];
        }
        scoreChangesByCourse[update.course].push(update);
      });

      Object.keys(scoreChangesByCourse).forEach(course => {
        const updates = scoreChangesByCourse[course];
        const avgScoreChange = updates.reduce((sum, u) => sum + u.scoreDifference, 0) / updates.length;
        
        console.log(`\n🎓 ${course}: ${updates.length} students affected`);
        console.log(`   📊 Average score change: ${avgScoreChange.toFixed(2)}`);
        
        const improved = updates.filter(u => u.scoreDifference > 0).length;
        const decreased = updates.filter(u => u.scoreDifference < 0).length;
        
        console.log(`   ⬆️ Scores improved: ${improved}`);
        console.log(`   ⬇️ Scores decreased: ${decreased}`);
      });
    }

    // Export detailed report to CSV
    if (detailedReport.length > 0) {
      const csvContent = [];
      csvContent.push([
        'Submission ID', 'Enrollment No', 'Course', 'Test Subject', 'Question ID', 
        'Question Number', 'Selected Answer', 'Correct Answer', 'Shuffled To Original',
        'Was Marked Correct', 'Should Be Correct', 'Action'
      ]);
      
      detailedReport.forEach(fix => {
        csvContent.push([
          fix.submissionId,
          fix.enrollmentNo,
          fix.course,
          fix.testSubject,
          fix.questionId,
          fix.questionNumber,
          fix.selectedAnswer,
          fix.correctAnswer,
          JSON.stringify(fix.shuffledToOriginal),
          fix.wasMarkedCorrect,
          fix.shouldBeCorrect,
          fix.action
        ]);
      });

      const csvString = csvContent.map(row => row.join(',')).join('\n');
      const fileName = `Answer_Logic_Fixes_${targetDate || 'ALL'}_${new Date().toISOString().split('T')[0]}.csv`;
      const filePath = path.join(__dirname, fileName);
      
      fs.writeFileSync(filePath, csvString);
      console.log(`\n💾 Detailed report exported to: ${filePath}`);
    }

    // Export score changes to CSV
    if (submissionUpdates.length > 0) {
      const csvContent = [];
      csvContent.push([
        'Submission ID', 'Enrollment No', 'Course', 'Test Subject', 
        'Original Score', 'New Score', 'Score Difference', 'Total Questions', 'New Percentage'
      ]);
      
      submissionUpdates.forEach(update => {
        const newPercentage = ((update.newScore / update.totalQuestions) * 100).toFixed(2);
        csvContent.push([
          update.submissionId,
          update.enrollmentNo,
          update.course,
          update.testSubject,
          update.originalScore,
          update.newScore,
          update.scoreDifference,
          update.totalQuestions,
          newPercentage
        ]);
      });

      const csvString = csvContent.map(row => row.join(',')).join('\n');
      const fileName = `Score_Changes_${targetDate || 'ALL'}_${new Date().toISOString().split('T')[0]}.csv`;
      const filePath = path.join(__dirname, fileName);
      
      fs.writeFileSync(filePath, csvString);
      console.log(`💾 Score changes exported to: ${filePath}`);
    }

    console.log('\n✅ Fix operation completed successfully!');
    
    if (fixedAnswers === 0) {
      console.log('🎉 No incorrect logic found - all answers are properly marked!');
    } else {
      console.log(`🔧 Fixed ${fixedAnswers} incorrectly marked answers`);
      console.log(`📊 Updated scores for ${scoreChanges} submissions`);
    }

  } catch (error) {
    console.error('❌ Error fixing incorrect answer logic:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Helper function to run analysis only (without making changes)
async function analyzeIncorrectLogic() {
  try {
    console.log('🔍 ANALYSIS MODE - No changes will be made\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get command line arguments for date filtering
    const args = process.argv.slice(3); // Skip 'analyze' argument
    let dateFilter = {};
    let targetDate = null;
    
    if (args.length > 0 && args[0] !== 'all') {
      targetDate = args[0];
      const startOfDay = new Date(`${targetDate}T00:00:00.000Z`);
      const endOfDay = new Date(`${targetDate}T23:59:59.999Z`);
      
      dateFilter = {
        $or: [
          { submittedAt: { $gte: startOfDay, $lte: endOfDay } },
          { testStartedAt: { $gte: startOfDay, $lte: endOfDay } },
          { createdAt: { $gte: startOfDay, $lte: endOfDay } }
        ]
      };
    }

    const submissions = await Submission.find(dateFilter).populate('testId');
    console.log(`📊 Found ${submissions.length} submissions to analyze\n`);

    let totalAnswers = 0;
    let incorrectLogicAnswers = 0;
    const issuesBySubject = {};

    for (const submission of submissions) {
      if (!submission.testId || !submission.answers || submission.answers.length === 0) {
        continue;
      }

      const test = submission.testId;
      const subject = test.subject ? test.subject.subjectCode : 'Unknown';

      if (!issuesBySubject[subject]) {
        issuesBySubject[subject] = {
          totalAnswers: 0,
          incorrectLogic: 0,
          submissions: new Set()
        };
      }

      for (const answer of submission.answers) {
        totalAnswers++;
        issuesBySubject[subject].totalAnswers++;

        const question = test.questions.id(answer.questionId);
        if (!question) continue;

        const shouldBeCorrect = recalculateIsCorrect(answer, question);
        const currentlyMarkedCorrect = answer.isCorrect;

        if (shouldBeCorrect !== currentlyMarkedCorrect) {
          incorrectLogicAnswers++;
          issuesBySubject[subject].incorrectLogic++;
          issuesBySubject[subject].submissions.add(submission.enrollmentNo);
        }
      }
    }

    console.log('📊 ANALYSIS RESULTS:');
    console.log('-'.repeat(60));
    console.log(`Total answers analyzed: ${totalAnswers}`);
    console.log(`Answers with incorrect logic: ${incorrectLogicAnswers}`);
    console.log(`Error rate: ${totalAnswers > 0 ? ((incorrectLogicAnswers / totalAnswers) * 100).toFixed(2) : 0}%\n`);

    console.log('📚 Issues by subject:');
    Object.keys(issuesBySubject).forEach(subject => {
      const data = issuesBySubject[subject];
      const errorRate = data.totalAnswers > 0 ? ((data.incorrectLogic / data.totalAnswers) * 100).toFixed(2) : 0;
      console.log(`${subject}: ${data.incorrectLogic}/${data.totalAnswers} (${errorRate}%) - ${data.submissions.size} students affected`);
    });

  } catch (error) {
    console.error('❌ Error during analysis:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  const mode = process.argv[2];
  
  if (mode === 'analyze') {
    analyzeIncorrectLogic();
  } else {
    fixIncorrectAnswerLogic();
  }
}

module.exports = { fixIncorrectAnswerLogic, analyzeIncorrectLogic, recalculateIsCorrect };
