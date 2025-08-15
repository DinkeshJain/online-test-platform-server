const mongoose = require('mongoose');

/**
 * Migration: Remove entryGracePeriod and extensionPeriod fields from existing tests
 * 
 * This migration cleans up the database after removing grace period and extension period
 * functionality from the test system.
 */

async function up() {
  try {
    console.log('Starting migration: Remove grace period and extension period fields...');
    
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected. Please ensure database connection before running migration.');
      return;
    }

    // Import the Test model
    const Test = require('../models/Test');
    
    // Count tests that have these fields
    const testsWithGracePeriod = await Test.countDocuments({
      $or: [
        { entryGracePeriod: { $exists: true } },
        { extensionPeriod: { $exists: true } }
      ]
    });
    
    console.log(`Found ${testsWithGracePeriod} tests with grace/extension period fields`);
    
    if (testsWithGracePeriod === 0) {
      console.log('No tests found with grace/extension period fields. Migration complete.');
      return;
    }
    
    // Get the specific tests to show what we're updating
    const testsToUpdate = await Test.find({
      $or: [
        { entryGracePeriod: { $exists: true } },
        { extensionPeriod: { $exists: true } }
      ]
    }, { _id: 1, 'subject.subjectCode': 1, entryGracePeriod: 1, extensionPeriod: 1 });
    
    console.log('Tests to be updated:');
    testsToUpdate.forEach(test => {
      console.log(`- ${test._id} (${test.subject?.subjectCode || 'Unknown'}): entryGracePeriod=${test.entryGracePeriod}, extensionPeriod=${test.extensionPeriod}`);
    });
    console.log('');
    
    // Remove the fields from all test documents
    const result = await Test.updateMany(
      {
        $or: [
          { entryGracePeriod: { $exists: true } },
          { extensionPeriod: { $exists: true } }
        ]
      },
      {
        $unset: {
          entryGracePeriod: 1,
          extensionPeriod: 1
        }
      }
    );
    
    console.log(`Migration completed successfully:`);
    console.log(`- Processed ${result.matchedCount} test documents`);
    console.log(`- Modified ${result.modifiedCount} test documents`);
    console.log(`- Removed entryGracePeriod and extensionPeriod fields`);
    
    // Verify the cleanup
    const remainingTests = await Test.countDocuments({
      $or: [
        { entryGracePeriod: { $exists: true } },
        { extensionPeriod: { $exists: true } }
      ]
    });
    
    if (remainingTests === 0) {
      console.log('✅ Migration verification successful - no remaining grace/extension period fields');
    } else {
      console.warn(`⚠️ Warning: ${remainingTests} tests still have grace/extension period fields`);
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

async function down() {
  console.log('Rollback not supported for this migration.');
  console.log('Grace period and extension period fields cannot be restored without data loss.');
  console.log('If needed, create new tests with simplified timing.');
}

module.exports = { up, down };

// Allow running directly with node
if (require.main === module) {
  const mongoose = require('mongoose');
  const dotenv = require('dotenv');
  
  async function runMigration() {
    try {
      dotenv.config();
      
      // Connect to MongoDB
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app');
      console.log('Connected to MongoDB\n');
      
      await up();
      
      await mongoose.disconnect();
      console.log('Migration completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  }
  
  runMigration();
}
