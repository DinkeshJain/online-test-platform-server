// Script to correct scoring for August 23, 2025 submissions
require('dotenv').config();
const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

const TARGET_DATE = new Date('2025-08-28T00:00:00.000Z');
const NEXT_DATE = new Date('2025-08-29T00:00:00.000Z');
const BATCH_SIZE = 100;

let totalProcessed = 0;
let totalCorrected = 0;
let totalScoreUpdated = 0;

async function correctBatch(skip) {
  console.log(`Processing batch starting at position ${skip}...`);
  
  const submissions = await Submission.find({
    createdAt: { $gte: TARGET_DATE, $lt: NEXT_DATE }
  })
    .skip(skip)
    .limit(BATCH_SIZE)
    .lean();

  if (!submissions.length) {
    console.log(`No more submissions found. Batch processing complete.`);
    return 0;
  }

  console.log(`Found ${submissions.length} submissions in this batch.`);

  for (const submission of submissions) {
    totalProcessed++;
    
    const test = await Test.findById(submission.testId).lean();
    if (!test) {
      console.log(`Test not found for submission ${submission._id}`);
      continue;
    }

    let changed = false;
    let correctedCount = 0;
    
    const updatedAnswers = (submission.answers || []).map(ans => {
      // Only correct answers that are currently marked as false
      if (ans.isCorrect === false) {
        // Use shuffledToOriginal array to map selected answer to original index
        const shuffledToOriginal = ans.shuffledToOriginal;
        const originalIndex = shuffledToOriginal[ans.selectedAnswer];
        
        // If originalIndex is 0, answer should be correct
        const shouldBeCorrect = originalIndex === 0;
        
        if (shouldBeCorrect) {
          changed = true;
          correctedCount++;
          console.log(`  Question ${ans.originalQuestionNumber}: selectedAnswer=${ans.selectedAnswer}, originalIndex=${originalIndex}, isCorrect changed from false to true`);
          return { ...ans, isCorrect: true };
        }
      }
      
      return ans;
    });

    // Calculate new score based on correct answers
    const newScore = updatedAnswers.filter(ans => ans.isCorrect === true).length;
    const oldScore = submission.score;
    
    // Update if answers changed OR if score needs to be recalculated
    const scoreChanged = newScore !== oldScore;
    
    if (changed || scoreChanged) {
      const updateData = { answers: updatedAnswers, score: newScore };
      
      await Submission.updateOne(
        { _id: submission._id },
        { $set: updateData }
      );
      
      if (changed) totalCorrected++;
      if (scoreChanged) totalScoreUpdated++;
      
      if (changed && scoreChanged) {
        console.log(`Corrected submission ${submission._id} - Fixed ${correctedCount} answers, Score: ${oldScore} → ${newScore}`);
      } else if (changed) {
        console.log(`Corrected submission ${submission._id} - Fixed ${correctedCount} answers, Score unchanged: ${newScore}`);
      } else if (scoreChanged) {
        console.log(`Updated score for submission ${submission._id} - Score: ${oldScore} → ${newScore}`);
      }
    }
  }
  
  console.log(`Batch complete: ${submissions.length} processed, ${totalCorrected} answer corrections, ${totalScoreUpdated} score updates so far`);
  return submissions.length;
}

async function main() {
  console.log('Starting correction script for submissions on August 23, 2025...');
  
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully');
    
    const totalCount = await Submission.countDocuments({
      createdAt: { $gte: TARGET_DATE, $lt: NEXT_DATE }
    });
    console.log(`Total submissions to process: ${totalCount}`);
    
    if (totalCount === 0) {
      console.log('No submissions found for the target date. Exiting.');
      return;
    }
    
    let skip = 0;
    let processed;
    
    do {
      processed = await correctBatch(skip);
      skip += BATCH_SIZE;
      
      const progress = Math.min(100, (totalProcessed / totalCount) * 100).toFixed(1);
      console.log(`Overall progress: ${totalProcessed}/${totalCount} (${progress}%)`);
      
    } while (processed === BATCH_SIZE);
    
    console.log('\nCorrection process completed successfully!');
    console.log(`Final Summary:`);
    console.log(`  Total submissions processed: ${totalProcessed}`);
    console.log(`  Total submissions with answer corrections: ${totalCorrected}`);
    console.log(`  Total submissions with score updates: ${totalScoreUpdated}`);
    console.log(`  Answer correction rate: ${totalProcessed > 0 ? ((totalCorrected / totalProcessed) * 100).toFixed(1) : 0}%`);
    console.log(`  Score update rate: ${totalProcessed > 0 ? ((totalScoreUpdated / totalProcessed) * 100).toFixed(1) : 0}%`);
    
  } catch (error) {
    console.error('Error during correction process:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

main().catch(err => {
  console.error('Fatal error during correction:', err);
  process.exit(1);
});
