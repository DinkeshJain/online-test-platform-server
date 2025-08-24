const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
require('dotenv').config();

const BATCH_SIZE = 50; // Process 50 submissions at a time

const addEnrollmentToSubmissionsBatched = async () => {
  try {
    console.log('🔄 Starting batched enrollment number migration for submissions...');
    console.log(`📦 Processing in batches of ${BATCH_SIZE} submissions`);
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get total count first
    const totalSubmissions = await Submission.countDocuments();
    const submissionsWithoutEnrollment = await Submission.countDocuments({
      $or: [
        { enrollmentNumber: { $exists: false } },
        { enrollmentNumber: null },
        { enrollmentNumber: '' }
      ]
    });

    console.log(`📊 Total submissions in database: ${totalSubmissions}`);
    console.log(`📊 Submissions without enrollment numbers: ${submissionsWithoutEnrollment}`);

    if (submissionsWithoutEnrollment === 0) {
      console.log('✅ All submissions already have enrollment numbers');
      return;
    }

    let processedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let batchNumber = 1;

    const skippedSubmissions = [];
    const errorSubmissions = [];

    console.log('\n🔄 Starting batch processing...\n');

    // Process submissions in batches
    while (processedCount < submissionsWithoutEnrollment) {
      console.log(`📦 Processing Batch ${batchNumber} (${processedCount + 1}-${Math.min(processedCount + BATCH_SIZE, submissionsWithoutEnrollment)} of ${submissionsWithoutEnrollment})`);
      
      try {
        // Fetch current batch
        const currentBatch = await Submission.find({
          $or: [
            { enrollmentNumber: { $exists: false } },
            { enrollmentNumber: null },
            { enrollmentNumber: '' }
          ]
        })
        .populate('student', 'enrollmentNumber username fullName')
        .limit(BATCH_SIZE)
        .skip(0); // Always skip 0 because we're processing the remaining ones

        if (currentBatch.length === 0) {
          console.log('✅ No more submissions to process');
          break;
        }

        console.log(`   📝 Found ${currentBatch.length} submissions in this batch`);

        // Process each submission in the current batch
        for (let i = 0; i < currentBatch.length; i++) {
          const submission = currentBatch[i];
          const globalIndex = processedCount + i + 1;
          
          try {
            if (submission.student && submission.student.enrollmentNumber) {
              // Update the submission with enrollment number
              await Submission.updateOne(
                { _id: submission._id },
                { $set: { enrollmentNumber: submission.student.enrollmentNumber } }
              );
              
              console.log(`   ✅ [${globalIndex}/${submissionsWithoutEnrollment}] Updated submission ${submission._id} → ${submission.student.enrollmentNumber}`);
              updatedCount++;
            } else {
              const reason = !submission.student 
                ? 'Student not found' 
                : 'Student missing enrollment number';
              
              console.log(`   ⚠️ [${globalIndex}/${submissionsWithoutEnrollment}] Skipped submission ${submission._id} - ${reason}`);
              
              skippedSubmissions.push({
                submissionId: submission._id,
                studentId: submission.student?._id || 'N/A',
                studentName: submission.student?.fullName || 'N/A',
                username: submission.student?.username || 'N/A',
                reason: reason
              });
              
              skippedCount++;
            }
          } catch (error) {
            console.error(`   ❌ [${globalIndex}/${submissionsWithoutEnrollment}] Error updating submission ${submission._id}:`, error.message);
            
            errorSubmissions.push({
              submissionId: submission._id,
              error: error.message
            });
            
            errorCount++;
          }
        }

        processedCount += currentBatch.length;
        batchNumber++;

        // Add a small delay between batches to reduce database load
        if (processedCount < submissionsWithoutEnrollment) {
          console.log(`   ⏳ Batch ${batchNumber - 1} completed. Waiting 1 second before next batch...\n`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (batchError) {
        console.error(`❌ Error processing batch ${batchNumber}:`, batchError);
        errorCount += BATCH_SIZE; // Assume all submissions in this batch failed
        processedCount += BATCH_SIZE; // Move to next batch
        batchNumber++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`✅ Successfully updated: ${updatedCount} submissions`);
    console.log(`⚠️ Skipped: ${skippedCount} submissions`);
    console.log(`❌ Errors: ${errorCount} submissions`);
    console.log(`📦 Total batches processed: ${batchNumber - 1}`);

    // Show detailed reports if there are issues (limit to first 10 of each)
    if (skippedSubmissions.length > 0) {
      console.log('\n📋 Skipped Submissions (first 10):');
      skippedSubmissions.slice(0, 10).forEach((item, index) => {
        console.log(`  ${index + 1}. Submission: ${item.submissionId}`);
        console.log(`     Student: ${item.studentName} (${item.username})`);
        console.log(`     Reason: ${item.reason}\n`);
      });
      
      if (skippedSubmissions.length > 10) {
        console.log(`   ... and ${skippedSubmissions.length - 10} more skipped submissions`);
      }
    }

    if (errorSubmissions.length > 0) {
      console.log('\n❌ Error Submissions (first 10):');
      errorSubmissions.slice(0, 10).forEach((item, index) => {
        console.log(`  ${index + 1}. Submission: ${item.submissionId}`);
        console.log(`     Error: ${item.error}\n`);
      });
      
      if (errorSubmissions.length > 10) {
        console.log(`   ... and ${errorSubmissions.length - 10} more error submissions`);
      }
    }

    // Final verification
    console.log('\n🔍 Running post-migration verification...');
    
    const finalTotalSubmissions = await Submission.countDocuments();
    const finalSubmissionsWithEnrollment = await Submission.countDocuments({
      enrollmentNumber: { $exists: true, $ne: null, $ne: '' }
    });
    const finalSubmissionsWithoutEnrollment = await Submission.countDocuments({
      $or: [
        { enrollmentNumber: { $exists: false } },
        { enrollmentNumber: null },
        { enrollmentNumber: '' }
      ]
    });

    console.log(`\n📊 Post-Migration Status:`);
    console.log(`   Total submissions: ${finalTotalSubmissions}`);
    console.log(`   With enrollment numbers: ${finalSubmissionsWithEnrollment}`);
    console.log(`   Still missing enrollment: ${finalSubmissionsWithoutEnrollment}`);
    console.log(`   Coverage: ${((finalSubmissionsWithEnrollment / finalTotalSubmissions) * 100).toFixed(1)}%`);

    if (finalSubmissionsWithoutEnrollment === 0) {
      console.log('\n🎉 Migration completed successfully! All submissions now have enrollment numbers');
    } else {
      console.log('\n⚠️ Some submissions still missing enrollment numbers - manual review may be needed');
    }

    // Show a sample of updated submissions for verification
    console.log('\n📋 Sample of recently updated submissions:');
    const sampleUpdated = await Submission.find({
      enrollmentNumber: { $exists: true, $ne: null, $ne: '' }
    })
    .populate('student', 'enrollmentNumber username fullName')
    .limit(3)
    .select('_id enrollmentNumber student')
    .sort({ updatedAt: -1 });

    sampleUpdated.forEach((submission, index) => {
      console.log(`  ${index + 1}. Submission: ${submission._id}`);
      console.log(`     Enrollment: ${submission.enrollmentNumber}`);
      console.log(`     Student: ${submission.student?.fullName || 'N/A'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📝 Disconnected from MongoDB');
  }
};

// Run the migration if this script is executed directly
if (require.main === module) {
  addEnrollmentToSubmissionsBatched()
    .then(() => {
      console.log('✅ Batched migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Batched migration script failed:', error);
      process.exit(1);
    });
}

module.exports = addEnrollmentToSubmissionsBatched;
