const mongoose = require('mongoose');
const Submission = require('./models/Submission');

console.log('\n🔧 UPDATING SCORES AFTER isCorrect CORRECTIONS...\n');

async function updateScoresAfterCorrections() {
  try {
    await mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app');
    console.log('Connected to MongoDB');
    
    console.log('📋 Date:', new Date().toLocaleString());
    
    // Get today's date range (start and end of today)
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    console.log(`📅 Updating scores for submissions from: ${startOfToday.toLocaleString()}`);
    console.log(`📅 To: ${endOfToday.toLocaleString()}`);
    
    // Count today's submissions
    const todaysSubmissionCount = await Submission.countDocuments({
      createdAt: {
        $gte: startOfToday,
        $lte: endOfToday
      }
    });

    console.log(`\n📊 Found ${todaysSubmissionCount} submissions to recalculate scores`);
    
    if (todaysSubmissionCount === 0) {
      console.log('✅ No submissions found for today!');
      return;
    }

    let totalSubmissionsProcessed = 0;
    let submissionsWithScoreChanges = 0;
    let totalScoreIncrease = 0;
    let totalScoreDecrease = 0;
    let scoreChanges = [];

    const isDryRun = process.argv.includes('--dry-run');
    console.log(`🔧 Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE UPDATE (will update scores)'}\n`);

    // Process submissions in batches to avoid memory issues
    const batchSize = 50;
    let skip = 0;

    while (skip < todaysSubmissionCount) {
      const batchNum = Math.floor(skip/batchSize) + 1;
      const totalBatches = Math.ceil(todaysSubmissionCount/batchSize);
      
      console.log(`🔄 Processing batch ${batchNum}/${totalBatches} (submissions ${skip + 1}-${Math.min(skip + batchSize, todaysSubmissionCount)})...`);
      
      const submissions = await Submission.find({
        createdAt: {
          $gte: startOfToday,
          $lte: endOfToday
        }
      }).skip(skip).limit(batchSize).exec();

      for (const submission of submissions) {
        totalSubmissionsProcessed++;
        
        // Calculate new score based on current isCorrect values
        let newScore = 0;
        let totalAnswers = 0;
        let correctAnswers = 0;
        let incorrectAnswers = 0;
        
        for (const answer of submission.answers) {
          if (answer.isCorrect !== null) {
            totalAnswers++;
            if (answer.isCorrect === true) {
              newScore++;
              correctAnswers++;
            } else {
              incorrectAnswers++;
            }
          }
        }

        const oldScore = submission.score || 0;
        const scoreChange = newScore - oldScore;

        if (scoreChange !== 0) {
          submissionsWithScoreChanges++;
          
          scoreChanges.push({
            submissionId: submission._id,
            studentId: submission.studentId,
            testId: submission.testId,
            oldScore: oldScore,
            newScore: newScore,
            change: scoreChange,
            totalAnswers: totalAnswers,
            correctAnswers: correctAnswers,
            incorrectAnswers: incorrectAnswers,
            createdAt: submission.createdAt
          });

          if (scoreChange > 0) {
            totalScoreIncrease += scoreChange;
          } else {
            totalScoreDecrease += Math.abs(scoreChange);
          }

          console.log(`   📝 Submission ${submission._id}:`);
          console.log(`      Student: ${submission.studentId}`);
          console.log(`      Old Score: ${oldScore}/${totalAnswers}`);
          console.log(`      New Score: ${newScore}/${totalAnswers}`);
          console.log(`      Change: ${scoreChange > 0 ? '+' : ''}${scoreChange} (${((scoreChange/totalAnswers)*100).toFixed(1)}%)`);

          // Update the score in database
          if (!isDryRun) {
            submission.score = newScore;
            try {
              await submission.save();
              console.log(`      ✅ Score updated successfully`);
            } catch (saveError) {
              console.log(`      ❌ Failed to save score: ${saveError.message}`);
            }
          }
        }
      }

      skip += batchSize;
      console.log(`   📈 Batch ${batchNum} complete. ${submissionsWithScoreChanges} submissions updated so far\n`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('📈 SCORE UPDATE RESULTS:');
    console.log('='.repeat(70));
    
    console.log(`📊 OVERVIEW:`);
    console.log(`   Total submissions processed: ${totalSubmissionsProcessed.toLocaleString()}`);
    console.log(`   Submissions with score changes: ${submissionsWithScoreChanges.toLocaleString()}`);
    console.log(`   Submissions with no changes: ${(totalSubmissionsProcessed - submissionsWithScoreChanges).toLocaleString()}`);
    
    console.log(`\n🔄 SCORE CHANGES:`);
    console.log(`   Total score increases: +${totalScoreIncrease.toLocaleString()}`);
    console.log(`   Total score decreases: -${totalScoreDecrease.toLocaleString()}`);
    console.log(`   Net score change: ${(totalScoreIncrease - totalScoreDecrease > 0 ? '+' : '')}${(totalScoreIncrease - totalScoreDecrease).toLocaleString()}`);
    
    if (scoreChanges.length > 0) {
      console.log(`\n📋 SCORE CHANGE DETAILS (Top 10):`);
      
      // Sort by change amount (biggest improvements first)
      scoreChanges.sort((a, b) => b.change - a.change);
      
      scoreChanges.slice(0, 10).forEach((change, index) => {
        const percentage = ((change.newScore / change.totalAnswers) * 100).toFixed(1);
        console.log(`   ${index + 1}. Submission: ${change.submissionId}`);
        console.log(`      Student: ${change.studentId}`);
        console.log(`      Score: ${change.oldScore} → ${change.newScore}/${change.totalAnswers} (${percentage}%)`);
        console.log(`      Change: ${change.change > 0 ? '+' : ''}${change.change}`);
        console.log(`      Time: ${change.createdAt.toLocaleString()}`);
        console.log('');
      });
      
      if (scoreChanges.length > 10) {
        console.log(`   ... and ${scoreChanges.length - 10} more submissions with score changes`);
      }
    }

    // Calculate statistics
    if (submissionsWithScoreChanges > 0) {
      const avgScoreIncrease = totalScoreIncrease / submissionsWithScoreChanges;
      const maxIncrease = Math.max(...scoreChanges.map(c => c.change));
      const maxDecrease = Math.min(...scoreChanges.map(c => c.change));
      
      console.log(`\n📊 STATISTICS:`);
      console.log(`   Average score change per affected submission: ${avgScoreIncrease.toFixed(2)}`);
      console.log(`   Largest score increase: +${maxIncrease}`);
      if (maxDecrease < 0) {
        console.log(`   Largest score decrease: ${maxDecrease}`);
      }
      
      const studentsImproved = scoreChanges.filter(c => c.change > 0).length;
      const studentsDecreased = scoreChanges.filter(c => c.change < 0).length;
      
      console.log(`\n👥 STUDENT IMPACT:`);
      console.log(`   Students with improved scores: ${studentsImproved}`);
      console.log(`   Students with decreased scores: ${studentsDecreased}`);
      console.log(`   Net positive impact: ${studentsImproved - studentsDecreased} students`);
    }

    if (isDryRun) {
      console.log('\n🔍 DRY RUN COMPLETE - No scores were updated');
      if (submissionsWithScoreChanges > 0) {
        console.log(`   Run without --dry-run to update ${submissionsWithScoreChanges} submission scores`);
      }
    } else {
      console.log('\n✅ SCORE UPDATES APPLIED:');
      console.log(`   Updated scores for ${submissionsWithScoreChanges.toLocaleString()} submissions`);
      console.log(`   Total score improvements: +${totalScoreIncrease.toLocaleString()} points`);
    }

  } catch (error) {
    console.error('❌ Error updating scores:', error);
    throw error;
  } finally {
    mongoose.connection.close();
  }
}

updateScoresAfterCorrections();
