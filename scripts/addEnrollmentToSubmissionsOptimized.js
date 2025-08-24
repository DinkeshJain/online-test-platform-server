const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
require('dotenv').config();

// Configuration options
const CONFIG = {
  BATCH_SIZE: 50,           // Number of submissions to process per batch
  DELAY_BETWEEN_BATCHES: 1000, // Milliseconds to wait between batches (1 second)
  MAX_RETRIES: 3,           // Number of retry attempts for failed operations
  SHOW_DETAILED_LOGS: true, // Show detailed progress logs
  VERIFY_AFTER_UPDATE: true // Verify each update was successful
};

const addEnrollmentToSubmissionsConfigurable = async (customConfig = {}) => {
  try {
    // Merge custom config with defaults
    const config = { ...CONFIG, ...customConfig };
    
    console.log('🔄 Starting optimized enrollment number migration...');
    console.log(`⚙️ Configuration:`);
    console.log(`   📦 Batch size: ${config.BATCH_SIZE}`);
    console.log(`   ⏱️ Delay between batches: ${config.DELAY_BETWEEN_BATCHES}ms`);
    console.log(`   🔄 Max retries: ${config.MAX_RETRIES}`);
    console.log(`   📝 Detailed logs: ${config.SHOW_DETAILED_LOGS ? 'ON' : 'OFF'}`);
    
    // Connect to MongoDB with optimized settings
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ Connected to MongoDB with optimized settings');

    // Get initial counts
    const totalSubmissions = await Submission.countDocuments();
    const submissionsWithoutEnrollment = await Submission.countDocuments({
      $or: [
        { enrollmentNo: { $exists: false } },
        { enrollmentNo: null },
        { enrollmentNo: '' }
      ]
    });

    console.log(`📊 Database Status:`);
    console.log(`   Total submissions: ${totalSubmissions}`);
    console.log(`   Missing enrollment numbers: ${submissionsWithoutEnrollment}`);
    console.log(`   Estimated batches needed: ${Math.ceil(submissionsWithoutEnrollment / config.BATCH_SIZE)}`);

    if (submissionsWithoutEnrollment === 0) {
      console.log('✅ All submissions already have enrollment numbers');
      return { success: true, message: 'No migration needed' };
    }

    let processedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let retryCount = 0;
    let batchNumber = 1;

    const skippedSubmissions = [];
    const errorSubmissions = [];
    const startTime = Date.now();

    console.log('\n🚀 Starting batch processing...\n');

    // Process submissions in batches
    while (processedCount < submissionsWithoutEnrollment) {
      const batchStartTime = Date.now();
      
      try {
        // Calculate remaining submissions to process
        const remainingSubmissions = submissionsWithoutEnrollment - processedCount;
        const currentBatchSize = Math.min(config.BATCH_SIZE, remainingSubmissions);
        
        console.log(`📦 Batch ${batchNumber}: Processing ${currentBatchSize} submissions (${processedCount + 1}-${processedCount + currentBatchSize} of ${submissionsWithoutEnrollment})`);
        
        // Fetch current batch with lean() for better performance
        const currentBatch = await Submission.find({
          $or: [
            { enrollmentNo: { $exists: false } },
            { enrollmentNo: null },
            { enrollmentNo: '' }
          ]
        })
        .populate('userId', 'enrollmentNo username fullName')
        .limit(currentBatchSize)
        .lean(); // Use lean() for better performance

        if (currentBatch.length === 0) {
          console.log('✅ No more submissions found to process');
          break;
        }

        if (config.SHOW_DETAILED_LOGS) {
          console.log(`   📝 Fetched ${currentBatch.length} submissions for processing`);
        }

        // Prepare bulk operations for better performance
        const bulkOperations = [];
        let batchUpdatedCount = 0;
        let batchSkippedCount = 0;
        let batchErrorCount = 0;

        // Process each submission in the current batch
        for (let i = 0; i < currentBatch.length; i++) {
          const submission = currentBatch[i];
          const globalIndex = processedCount + i + 1;
          
          try {
            if (submission.userId && submission.userId.enrollmentNo) {
              // Prepare bulk update operation
              bulkOperations.push({
                updateOne: {
                  filter: { _id: submission._id },
                  update: { $set: { enrollmentNo: submission.userId.enrollmentNo } }
                }
              });
              
              if (config.SHOW_DETAILED_LOGS) {
                console.log(`   ✅ [${globalIndex}] Queued update: ${submission._id} → ${submission.userId.enrollmentNo}`);
              }
              batchUpdatedCount++;
            } else {
              const reason = !submission.userId 
                ? 'Student not found' 
                : 'Student missing enrollment number';
              
              if (config.SHOW_DETAILED_LOGS) {
                console.log(`   ⚠️ [${globalIndex}] Skipping: ${submission._id} - ${reason}`);
              }
              
              skippedSubmissions.push({
                submissionId: submission._id,
                studentId: submission.userId?._id || 'N/A',
                studentName: submission.userId?.fullName || 'N/A',
                username: submission.userId?.username || 'N/A',
                reason: reason
              });
              
              batchSkippedCount++;
            }
          } catch (error) {
            if (config.SHOW_DETAILED_LOGS) {
              console.error(`   ❌ [${globalIndex}] Error preparing update for ${submission._id}:`, error.message);
            }
            
            errorSubmissions.push({
              submissionId: submission._id,
              error: error.message
            });
            
            batchErrorCount++;
          }
        }

        // Execute bulk operations if any
        if (bulkOperations.length > 0) {
          try {
            const bulkResult = await Submission.bulkWrite(bulkOperations, { ordered: false });
            console.log(`   💾 Bulk update completed: ${bulkResult.modifiedCount} documents updated`);
            
            // Verify the count matches expectations
            if (config.VERIFY_AFTER_UPDATE && bulkResult.modifiedCount !== bulkOperations.length) {
              console.log(`   ⚠️ Warning: Expected ${bulkOperations.length} updates, but ${bulkResult.modifiedCount} were applied`);
            }
          } catch (bulkError) {
            console.error(`   ❌ Bulk update failed:`, bulkError.message);
            batchErrorCount += bulkOperations.length;
          }
        }

        // Update counters
        updatedCount += batchUpdatedCount;
        skippedCount += batchSkippedCount;
        errorCount += batchErrorCount;
        processedCount += currentBatch.length;
        
        const batchTime = Date.now() - batchStartTime;
        const avgTimePerSubmission = batchTime / currentBatch.length;
        
        console.log(`   📊 Batch ${batchNumber} summary: ${batchUpdatedCount} updated, ${batchSkippedCount} skipped, ${batchErrorCount} errors (${batchTime}ms, ${avgTimePerSubmission.toFixed(1)}ms/submission)`);

        batchNumber++;

        // Add delay between batches to reduce database load
        if (processedCount < submissionsWithoutEnrollment && config.DELAY_BETWEEN_BATCHES > 0) {
          if (config.SHOW_DETAILED_LOGS) {
            console.log(`   ⏳ Waiting ${config.DELAY_BETWEEN_BATCHES}ms before next batch...\n`);
          }
          await new Promise(resolve => setTimeout(resolve, config.DELAY_BETWEEN_BATCHES));
        }

      } catch (batchError) {
        console.error(`❌ Error processing batch ${batchNumber}:`, batchError);
        
        // Retry logic
        if (retryCount < config.MAX_RETRIES) {
          retryCount++;
          console.log(`🔄 Retrying batch ${batchNumber} (attempt ${retryCount}/${config.MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, config.DELAY_BETWEEN_BATCHES * 2)); // Double the delay for retries
          continue; // Don't increment batch number or processed count
        } else {
          console.error(`❌ Max retries exceeded for batch ${batchNumber}. Skipping this batch.`);
          errorCount += config.BATCH_SIZE; // Assume all submissions in this batch failed
          processedCount += config.BATCH_SIZE; // Move to next batch
          batchNumber++;
          retryCount = 0; // Reset retry count for next batch
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const avgTimePerSubmission = updatedCount > 0 ? totalTime / updatedCount : 0;

    console.log('\n📈 Migration Summary:');
    console.log(`✅ Successfully updated: ${updatedCount} submissions`);
    console.log(`⚠️ Skipped: ${skippedCount} submissions`);
    console.log(`❌ Errors: ${errorCount} submissions`);
    console.log(`🔄 Retries used: ${retryCount} total`);
    console.log(`📦 Total batches processed: ${batchNumber - 1}`);
    console.log(`⏱️ Total time: ${(totalTime / 1000).toFixed(1)} seconds`);
    console.log(`⚡ Average time per submission: ${avgTimePerSubmission.toFixed(1)}ms`);

    // Show limited reports to avoid overwhelming output
    if (skippedSubmissions.length > 0) {
      const showCount = Math.min(5, skippedSubmissions.length);
      console.log(`\n📋 Skipped Submissions (showing ${showCount} of ${skippedSubmissions.length}):`);
      skippedSubmissions.slice(0, showCount).forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.submissionId} - ${item.reason}`);
      });
      
      if (skippedSubmissions.length > showCount) {
        console.log(`     ... and ${skippedSubmissions.length - showCount} more`);
      }
    }

    if (errorSubmissions.length > 0) {
      const showCount = Math.min(3, errorSubmissions.length);
      console.log(`\n❌ Error Submissions (showing ${showCount} of ${errorSubmissions.length}):`);
      errorSubmissions.slice(0, showCount).forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.submissionId} - ${item.error}`);
      });
      
      if (errorSubmissions.length > showCount) {
        console.log(`     ... and ${errorSubmissions.length - showCount} more`);
      }
    }

    // Final verification
    console.log('\n🔍 Final verification...');
    
    const finalStats = await Promise.all([
      Submission.countDocuments(),
      Submission.countDocuments({
        enrollmentNo: { $exists: true, $ne: null, $ne: '' }
      }),
      Submission.countDocuments({
        $or: [
          { enrollmentNo: { $exists: false } },
          { enrollmentNo: null },
          { enrollmentNo: '' }
        ]
      })
    ]);

    const [finalTotal, finalWithEnrollment, finalWithoutEnrollment] = finalStats;

    console.log(`📊 Final Status:`);
    console.log(`   Total submissions: ${finalTotal}`);
    console.log(`   With enrollment numbers: ${finalWithEnrollment}`);
    console.log(`   Still missing enrollment: ${finalWithoutEnrollment}`);
    console.log(`   Coverage: ${((finalWithEnrollment / finalTotal) * 100).toFixed(1)}%`);

    const success = finalWithoutEnrollment === 0;
    if (success) {
      console.log('\n🎉 Migration completed successfully! All submissions now have enrollment numbers');
    } else {
      console.log('\n⚠️ Migration completed with some remaining issues. Manual review recommended.');
    }

    return {
      success,
      stats: {
        totalProcessed: processedCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errorCount,
        retries: retryCount,
        batches: batchNumber - 1,
        timeMs: totalTime,
        finalCoverage: ((finalWithEnrollment / finalTotal) * 100).toFixed(1)
      }
    };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('📝 Disconnected from MongoDB');
  }
};

// Run the migration if this script is executed directly
if (require.main === module) {
  // Parse command line arguments for custom configuration
  const args = process.argv.slice(2);
  const customConfig = {};
  
  args.forEach(arg => {
    if (arg.startsWith('--batch-size=')) {
      customConfig.BATCH_SIZE = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--delay=')) {
      customConfig.DELAY_BETWEEN_BATCHES = parseInt(arg.split('=')[1]);
    } else if (arg === '--fast') {
      customConfig.BATCH_SIZE = 100;
      customConfig.DELAY_BETWEEN_BATCHES = 500;
      customConfig.SHOW_DETAILED_LOGS = false;
    } else if (arg === '--slow') {
      customConfig.BATCH_SIZE = 25;
      customConfig.DELAY_BETWEEN_BATCHES = 2000;
    }
  });

  addEnrollmentToSubmissionsConfigurable(customConfig)
    .then((result) => {
      console.log('✅ Configurable migration script completed');
      console.log('📊 Final result:', result.success ? 'SUCCESS' : 'PARTIAL');
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Configurable migration script failed:', error);
      process.exit(1);
    });
}

module.exports = addEnrollmentToSubmissionsConfigurable;
