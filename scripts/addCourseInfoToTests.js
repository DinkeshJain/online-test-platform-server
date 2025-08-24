const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models
const Test = require('../models/Test');
const Course = require('../models/Course');

// Configuration
const config = {
  BATCH_SIZE: 25, // Process 25 tests at a time
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  SHOW_DETAILED_LOGS: false, // Set to true for verbose logging
  DRY_RUN: false // Set to true to simulate without making changes
};

// Global statistics
let totalProcessed = 0;
let totalUpdated = 0;
let totalSkipped = 0;
let totalErrors = 0;
const skippedTests = [];
const errorTests = [];

// Helper function to add delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to add course info to tests in batches
async function addCourseInfoToTests() {
  try {
    console.log('🚀 Starting Course Info Migration for Tests');
    console.log(`📋 Configuration:`);
    console.log(`   Batch Size: ${config.BATCH_SIZE}`);
    console.log(`   Max Retries: ${config.MAX_RETRIES}`);
    console.log(`   Dry Run: ${config.DRY_RUN ? 'YES' : 'NO'}`);
    console.log(`   Detailed Logs: ${config.SHOW_DETAILED_LOGS ? 'ON' : 'OFF'}`);
    console.log('');

    // Connect to MongoDB with optimized settings
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000
    });

    console.log('✅ Connected to MongoDB');

    // Get initial counts
    const totalTests = await Test.countDocuments();
    const testsWithoutCourseInfo = await Test.countDocuments({
      $or: [
        { courseCode: { $exists: false } },
        { courseCode: null },
        { courseCode: '' },
        { courseName: { $exists: false } },
        { courseName: null },
        { courseName: '' }
      ]
    });

    console.log(`📊 Database Status:`);
    console.log(`   Total tests: ${totalTests}`);
    console.log(`   Missing course info: ${testsWithoutCourseInfo}`);
    console.log(`   Estimated batches needed: ${Math.ceil(testsWithoutCourseInfo / config.BATCH_SIZE)}`);

    if (testsWithoutCourseInfo === 0) {
      console.log('✅ All tests already have course information. Migration not needed.');
      return;
    }

    console.log('\n🔄 Starting batch processing...\n');

    let processedCount = 0;
    let batchNumber = 1;

    // Process tests in batches
    while (processedCount < testsWithoutCourseInfo) {
      const remainingTests = testsWithoutCourseInfo - processedCount;
      const currentBatchSize = Math.min(config.BATCH_SIZE, remainingTests);
      
      console.log(`📦 Batch ${batchNumber}: Processing ${currentBatchSize} tests (${processedCount + 1}-${processedCount + currentBatchSize} of ${testsWithoutCourseInfo})`);
      
      // Fetch current batch with course population
      const currentBatch = await Test.find({
        $or: [
          { courseCode: { $exists: false } },
          { courseCode: null },
          { courseCode: '' },
          { courseName: { $exists: false } },
          { courseName: null },
          { courseName: '' }
        ]
      })
      .populate('course', 'courseCode courseName')
      .limit(currentBatchSize)
      .lean();

      if (currentBatch.length === 0) {
        console.log('✅ No more tests found to process');
        break;
      }

      if (config.SHOW_DETAILED_LOGS) {
        console.log(`   📝 Fetched ${currentBatch.length} tests for processing`);
      }

      // Prepare bulk operations for better performance
      const bulkOperations = [];
      let batchUpdatedCount = 0;
      let batchSkippedCount = 0;
      let batchErrorCount = 0;

      // Process each test in the current batch
      for (let i = 0; i < currentBatch.length; i++) {
        const test = currentBatch[i];
        const globalIndex = processedCount + i + 1;
        
        try {
          if (test.course && test.course.courseCode && test.course.courseName) {
            // Prepare bulk update operation
            const updateData = {
              courseCode: test.course.courseCode,
              courseName: test.course.courseName
            };

            if (!config.DRY_RUN) {
              bulkOperations.push({
                updateOne: {
                  filter: { _id: test._id },
                  update: { $set: updateData }
                }
              });
            }
            
            if (config.SHOW_DETAILED_LOGS) {
              console.log(`   ✅ [${globalIndex}] Queued update: ${test._id} → ${test.course.courseCode}: ${test.course.courseName}`);
            }
            batchUpdatedCount++;
          } else {
            const reason = !test.course 
              ? 'Course not found' 
              : 'Course missing code/name';
            
            if (config.SHOW_DETAILED_LOGS) {
              console.log(`   ⚠️ [${globalIndex}] Skipping: ${test._id} - ${reason}`);
            }
            
            skippedTests.push({
              testId: test._id,
              courseId: test.course?._id || 'N/A',
              courseCode: test.course?.courseCode || 'N/A',
              courseName: test.course?.courseName || 'N/A',
              reason: reason
            });
            
            batchSkippedCount++;
          }
        } catch (error) {
          console.error(`   ❌ [${globalIndex}] Error processing test ${test._id}:`, error.message);
          
          errorTests.push({
            testId: test._id,
            courseId: test.course?._id || 'N/A',
            error: error.message
          });
          
          batchErrorCount++;
        }
      }

      // Execute bulk operations if not dry run
      if (bulkOperations.length > 0 && !config.DRY_RUN) {
        try {
          const bulkResult = await Test.bulkWrite(bulkOperations, { ordered: false });
          
          if (config.SHOW_DETAILED_LOGS) {
            console.log(`   💾 Bulk write completed: ${bulkResult.modifiedCount} tests updated`);
          }
        } catch (bulkError) {
          console.error(`   ❌ Bulk write error for batch ${batchNumber}:`, bulkError.message);
          batchErrorCount += bulkOperations.length;
        }
      }

      // Update counters
      totalProcessed += currentBatch.length;
      totalUpdated += batchUpdatedCount;
      totalSkipped += batchSkippedCount;
      totalErrors += batchErrorCount;
      processedCount += currentBatch.length;

      // Log batch results
      console.log(`   📊 Batch ${batchNumber} complete: ${batchUpdatedCount} updated, ${batchSkippedCount} skipped, ${batchErrorCount} errors`);
      
      // Small delay between batches to prevent overwhelming the database
      if (processedCount < testsWithoutCourseInfo) {
        await delay(config.RETRY_DELAY / 2);
      }
      
      batchNumber++;
    }

    console.log('\n📋 Migration Summary:');
    console.log(`   Tests processed: ${totalProcessed}`);
    console.log(`   Tests updated: ${totalUpdated}`);
    console.log(`   Tests skipped: ${totalSkipped}`);
    console.log(`   Errors encountered: ${totalErrors}`);

    if (config.DRY_RUN) {
      console.log('\n🔍 DRY RUN COMPLETE - No actual changes were made');
    }

    // Show final statistics
    const finalStats = await Promise.all([
      Test.countDocuments(),
      Test.countDocuments({
        courseCode: { $exists: true, $ne: null, $ne: '' },
        courseName: { $exists: true, $ne: null, $ne: '' }
      }),
      Test.countDocuments({
        $or: [
          { courseCode: { $exists: false } },
          { courseCode: null },
          { courseCode: '' },
          { courseName: { $exists: false } },
          { courseName: null },
          { courseName: '' }
        ]
      })
    ]);

    const [finalTotal, finalWithCourseInfo, finalWithoutCourseInfo] = finalStats;

    console.log('\n📊 Final Database Status:');
    console.log(`   Total tests: ${finalTotal}`);
    console.log(`   With course info: ${finalWithCourseInfo}`);
    console.log(`   Without course info: ${finalWithoutCourseInfo}`);

    // Show detailed error/skip reports if any
    if (skippedTests.length > 0) {
      console.log('\n⚠️ Skipped Tests Details:');
      skippedTests.slice(0, 10).forEach((item, index) => {
        console.log(`   ${index + 1}. Test: ${item.testId} | Course: ${item.courseId} | Reason: ${item.reason}`);
      });
      if (skippedTests.length > 10) {
        console.log(`   ... and ${skippedTests.length - 10} more`);
      }
    }

    if (errorTests.length > 0) {
      console.log('\n❌ Error Tests Details:');
      errorTests.slice(0, 10).forEach((item, index) => {
        console.log(`   ${index + 1}. Test: ${item.testId} | Course: ${item.courseId} | Error: ${item.error}`);
      });
      if (errorTests.length > 10) {
        console.log(`   ... and ${errorTests.length - 10} more`);
      }
    }

    console.log('\n✅ Course info migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the migration
if (require.main === module) {
  addCourseInfoToTests()
    .then(() => {
      console.log('\n🎉 Migration script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { addCourseInfoToTests };
