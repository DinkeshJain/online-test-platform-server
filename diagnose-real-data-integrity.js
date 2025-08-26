require('dotenv').config();
const mongoose = require('mongoose');
const Submission = require('./models/Submission');

async function diagnoseRealDataIntegrity() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('🔍 CORRECTED DATA INTEGRITY ANALYSIS');
    console.log('=====================================');

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Fetch all submissions from today
    const submissions = await Submission.find({
      submittedAt: { $gte: startOfDay, $lt: endOfDay }
    }).select('testStartedAt answers shuffledToOriginal submittedAt enrollmentNo isCompleted isDraft');

    console.log(`📊 TOTAL SUBMISSIONS TODAY: ${submissions.length}`);
    console.log('');

    // Analyze testStartedAt field (CORRECT field name)
    let nullTestStartedAt = 0;
    let validTestStartedAt = 0;
    let emptyAnswers = 0;
    let emptyShuffledToOriginal = 0;
    let incompleteSubmissions = 0;
    let draftSubmissions = 0;

    const timeDistribution = {};

    submissions.forEach(submission => {
      // Check testStartedAt (CORRECTED field name)
      if (!submission.testStartedAt) {
        nullTestStartedAt++;
      } else {
        validTestStartedAt++;
        const hour = submission.testStartedAt.getHours();
        timeDistribution[hour] = (timeDistribution[hour] || 0) + 1;
      }

      // Check answers array
      if (!submission.answers || submission.answers.length === 0) {
        emptyAnswers++;
        console.log(`❌ Empty answers: ${submission.enrollmentNo} at ${submission.submittedAt}`);
      }

      // Check shuffledToOriginal in first answer
      if (submission.answers && submission.answers.length > 0) {
        if (!submission.answers[0].shuffledToOriginal || submission.answers[0].shuffledToOriginal.length === 0) {
          emptyShuffledToOriginal++;
          console.log(`❌ Empty shuffledToOriginal: ${submission.enrollmentNo}`);
        }
      }

      // Check completion status
      if (!submission.isCompleted) {
        incompleteSubmissions++;
      }

      if (submission.isDraft) {
        draftSubmissions++;
      }
    });

    console.log('🎯 CORRECTED ANALYSIS RESULTS:');
    console.log('==============================');
    console.log(`✅ Valid testStartedAt: ${validTestStartedAt}/${submissions.length} (${((validTestStartedAt/submissions.length)*100).toFixed(1)}%)`);
    console.log(`❌ NULL testStartedAt: ${nullTestStartedAt}/${submissions.length} (${((nullTestStartedAt/submissions.length)*100).toFixed(1)}%)`);
    console.log(`❌ Empty answers arrays: ${emptyAnswers}/${submissions.length} (${((emptyAnswers/submissions.length)*100).toFixed(1)}%)`);
    console.log(`❌ Empty shuffledToOriginal: ${emptyShuffledToOriginal}/${submissions.length} (${((emptyShuffledToOriginal/submissions.length)*100).toFixed(1)}%)`);
    console.log(`⚠️  Incomplete submissions: ${incompleteSubmissions}/${submissions.length} (${((incompleteSubmissions/submissions.length)*100).toFixed(1)}%)`);
    console.log(`📝 Draft submissions: ${draftSubmissions}/${submissions.length} (${((draftSubmissions/submissions.length)*100).toFixed(1)}%)`);
    console.log('');

    if (validTestStartedAt > 0) {
      console.log('⏰ TIME DISTRIBUTION OF VALID SUBMISSIONS:');
      console.log('==========================================');
      Object.keys(timeDistribution)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .forEach(hour => {
          console.log(`${hour.padStart(2, '0')}:00-${hour.padStart(2, '0')}:59 → ${timeDistribution[hour]} submissions`);
        });
    }

    console.log('');
    console.log('🔍 CONCLUSION:');
    console.log('==============');
    
    if (nullTestStartedAt === 0 && emptyAnswers === 0) {
      console.log('✅ NO CRITICAL DATA INTEGRITY ISSUES FOUND!');
      console.log('✅ All submissions have proper testStartedAt and answers data.');
    } else {
      console.log('🚨 DATA INTEGRITY ISSUES CONFIRMED:');
      if (nullTestStartedAt > 0) console.log(`   - ${nullTestStartedAt} submissions missing testStartedAt`);
      if (emptyAnswers > 0) console.log(`   - ${emptyAnswers} submissions with empty answers`);
    }

  } catch (error) {
    console.error('❌ Error analyzing data integrity:', error);
  } finally {
    await mongoose.disconnect();
  }
}

diagnoseRealDataIntegrity();
