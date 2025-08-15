#!/usr/bin/env node

/**
 * Data Consistency Cleanup Script
 * 
 * This script helps maintain data consistency by finding and cleaning up
 * orphaned records in the database.
 * 
 * Usage:
 *   node scripts/cleanup-data.js --check           # Check for orphaned records only
 *   node scripts/cleanup-data.js --cleanup-dry    # Show what would be cleaned (dry run)
 *   node scripts/cleanup-data.js --cleanup        # Actually clean up orphaned records
 */

const mongoose = require('mongoose');
const DataCleanupUtility = require('../utils/dataCleanup');

// Load environment variables
require('dotenv').config();

const args = process.argv.slice(2);
const command = args[0];

async function connectToDatabase() {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/online-test-platform';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function disconnectFromDatabase() {
  try {
    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error);
  }
}

async function main() {
  console.log('🚀 Online Test Platform - Data Consistency Cleanup Tool');
  console.log('═'.repeat(60));
  
  if (!command || !['--check', '--cleanup-dry', '--cleanup'].includes(command)) {
    console.log(`
Usage:
  node scripts/cleanup-data.js --check           # Check for orphaned records only
  node scripts/cleanup-data.js --cleanup-dry    # Show what would be cleaned (dry run)
  node scripts/cleanup-data.js --cleanup        # Actually clean up orphaned records

Examples:
  node scripts/cleanup-data.js --check
  node scripts/cleanup-data.js --cleanup-dry
  node scripts/cleanup-data.js --cleanup
`);
    process.exit(1);
  }

  await connectToDatabase();

  try {
    switch (command) {
      case '--check':
        console.log('📋 Performing data consistency check only...\n');
        await DataCleanupUtility.performDataConsistencyCheck({ 
          dryRun: true, 
          autoCleanup: false 
        });
        break;

      case '--cleanup-dry':
        console.log('🧪 Performing cleanup dry run (no actual changes)...\n');
        await DataCleanupUtility.performDataConsistencyCheck({ 
          dryRun: true, 
          autoCleanup: true 
        });
        break;

      case '--cleanup':
        console.log('⚠️  PERFORMING ACTUAL CLEANUP - RECORDS WILL BE DELETED!\n');
        
        // Add a 5-second confirmation delay
        console.log('⏰ Starting cleanup in 5 seconds... Press Ctrl+C to cancel');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await DataCleanupUtility.performDataConsistencyCheck({ 
          dryRun: false, 
          autoCleanup: true 
        });
        break;
    }

    console.log('\n✅ Data consistency operation completed successfully');

  } catch (error) {
    console.error('\n❌ Error during data consistency operation:', error);
    process.exit(1);
  } finally {
    await disconnectFromDatabase();
  }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Process interrupted by user');
  await disconnectFromDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Process terminated');
  await disconnectFromDatabase();
  process.exit(0);
});

// Run the main function
main().catch(async (error) => {
  console.error('\n💥 Unhandled error in main:', error);
  await disconnectFromDatabase();
  process.exit(1);
});
