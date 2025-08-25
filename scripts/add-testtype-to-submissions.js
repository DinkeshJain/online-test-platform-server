const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Submission = require('../models/Submission');
const Test = require('../models/Test');

/**
 * Migration Script: Add testType field to submissions
 * 
 * This script adds the testType field to submissions that don't have it
 * by copying the testType from their associated test.
 * 
 * Usage:
 * - Dry run (check what would be updated): node add-testtype-to-submissions.js --dry-run
 * - Execute migration: node add-testtype-to-submissions.js --execute
 */

const isDryRun = process.argv.includes('--dry-run');
const isExecute = process.argv.includes('--execute');

if (!isDryRun && !isExecute) {
  console.log('❌ Please specify either --dry-run or --execute');
  console.log('Usage:');
  console.log('  node add-testtype-to-submissions.js --dry-run    # Preview changes');
  console.log('  node add-testtype-to-submissions.js --execute    # Apply changes');
  process.exit(1);
}

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function findSubmissionsWithoutTestType() {
  try {
    console.log('🔍 Finding submissions without testType field...');
    
    // Find submissions that don't have testType field or have null/undefined testType
    const submissionsWithoutTestType = await Submission.find({
      $or: [
        { testType: { $exists: false } },
        { testType: null },
        { testType: '' }
      ]
    }).select('_id testId enrollmentNo course testType').lean();

    console.log(`📊 Found ${submissionsWithoutTestType.length} submissions without testType`);
    
    return submissionsWithoutTestType;
  } catch (error) {
    console.error('❌ Error finding submissions:', error);
    throw error;
  }
}

async function getTestTypesForSubmissions(submissions) {
  try {
    console.log('🔍 Fetching test types from associated tests...');
    
    // Get unique test IDs
    const testIds = [...new Set(submissions.map(sub => sub.testId.toString()))];
    console.log(`📊 Found ${testIds.length} unique tests to check`);
    
    // Fetch test types for all unique test IDs
    const tests = await Test.find({
      _id: { $in: testIds }
    }).select('_id testType').lean();
    
    // Create a map of testId -> testType
    const testTypeMap = {};
    tests.forEach(test => {
      testTypeMap[test._id.toString()] = test.testType;
    });
    
    console.log(`📊 Retrieved test types for ${tests.length} tests`);
    
    // Group submissions by testType for summary
    const summary = {};
    const submissionsWithTestType = [];
    const submissionsWithoutTest = [];
    
    submissions.forEach(submission => {
      const testType = testTypeMap[submission.testId.toString()];
      if (testType) {
        submissionsWithTestType.push({
          ...submission,
          newTestType: testType
        });
        summary[testType] = (summary[testType] || 0) + 1;
      } else {
        submissionsWithoutTest.push(submission);
      }
    });
    
    console.log('📊 Summary of testTypes to be assigned:');
    Object.entries(summary).forEach(([testType, count]) => {
      console.log(`  - ${testType}: ${count} submissions`);
    });
    
    if (submissionsWithoutTest.length > 0) {
      console.log(`⚠️  Warning: ${submissionsWithoutTest.length} submissions have testIds that don't exist in tests collection`);
      submissionsWithoutTest.forEach(sub => {
        console.log(`    - Submission ${sub._id} references non-existent test ${sub.testId}`);
      });
    }
    
    return { submissionsWithTestType, submissionsWithoutTest };
  } catch (error) {
    console.error('❌ Error fetching test types:', error);
    throw error;
  }
}

async function updateSubmissions(submissionsWithTestType) {
  try {
    console.log(`🔄 ${isDryRun ? 'DRY RUN: Would update' : 'Updating'} ${submissionsWithTestType.length} submissions...`);
    
    if (isDryRun) {
      console.log('📋 Preview of changes:');
      submissionsWithTestType.slice(0, 10).forEach(sub => {
        console.log(`  - Submission ${sub._id} (${sub.enrollmentNo}, ${sub.course}) -> testType: ${sub.newTestType}`);
      });
      if (submissionsWithTestType.length > 10) {
        console.log(`  ... and ${submissionsWithTestType.length - 10} more`);
      }
      return { modifiedCount: submissionsWithTestType.length };
    }
    
    // Prepare bulk operations
    const bulkOps = submissionsWithTestType.map(sub => ({
      updateOne: {
        filter: { _id: sub._id },
        update: { 
          $set: { 
            testType: sub.newTestType 
          } 
        }
      }
    }));
    
    // Execute bulk update
    const result = await Submission.bulkWrite(bulkOps);
    console.log(`✅ Updated ${result.modifiedCount} submissions`);
    
    return result;
  } catch (error) {
    console.error('❌ Error updating submissions:', error);
    throw error;
  }
}

async function verifyUpdates() {
  try {
    console.log('🔍 Verifying updates...');
    
    const remainingSubmissions = await Submission.find({
      $or: [
        { testType: { $exists: false } },
        { testType: null },
        { testType: '' }
      ]
    }).countDocuments();
    
    const totalSubmissions = await Submission.countDocuments();
    const submissionsWithTestType = await Submission.countDocuments({
      testType: { $exists: true, $ne: null, $ne: '' }
    });
    
    console.log('📊 Final status:');
    console.log(`  - Total submissions: ${totalSubmissions}`);
    console.log(`  - Submissions with testType: ${submissionsWithTestType}`);
    console.log(`  - Submissions without testType: ${remainingSubmissions}`);
    
    if (remainingSubmissions === 0) {
      console.log('✅ All submissions now have testType field!');
    } else {
      console.log(`⚠️  ${remainingSubmissions} submissions still need testType (likely orphaned)`);
    }
  } catch (error) {
    console.error('❌ Error verifying updates:', error);
    throw error;
  }
}

async function runMigration() {
  try {
    console.log('🚀 Starting testType migration for submissions...');
    console.log(`📋 Mode: ${isDryRun ? 'DRY RUN (preview only)' : 'EXECUTE (will modify data)'}`);
    console.log('');
    
    await connectToDatabase();
    
    // Step 1: Find submissions without testType
    const submissionsWithoutTestType = await findSubmissionsWithoutTestType();
    
    if (submissionsWithoutTestType.length === 0) {
      console.log('✅ All submissions already have testType field. No migration needed.');
      return;
    }
    
    // Step 2: Get testTypes from associated tests
    const { submissionsWithTestType, submissionsWithoutTest } = await getTestTypesForSubmissions(submissionsWithoutTestType);
    
    if (submissionsWithTestType.length === 0) {
      console.log('⚠️  No submissions can be updated (all reference non-existent tests)');
      return;
    }
    
    // Step 3: Update submissions
    const result = await updateSubmissions(submissionsWithTestType);
    
    // Step 4: Verify updates (only for actual execution)
    if (!isDryRun) {
      console.log('');
      await verifyUpdates();
    }
    
    console.log('');
    console.log('🎉 Migration completed successfully!');
    
    if (isDryRun) {
      console.log('');
      console.log('🔄 To execute the migration, run:');
      console.log('node add-testtype-to-submissions.js --execute');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the migration
runMigration();
