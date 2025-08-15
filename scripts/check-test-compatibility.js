/**
 * Test Compatibility Checker
 * 
 * This script checks if existing tests in the database are compatible
 * with the new simplified timing system (without grace/extension periods).
 */

const mongoose = require('mongoose');

async function checkTestCompatibility() {
  try {
    console.log('🔍 Checking test compatibility after grace/extension period removal...\n');
    
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB not connected. Please ensure database connection.');
      return false;
    }

    // Import the Test model
    const Test = require('../models/Test');
    
    // Get all tests
    const allTests = await Test.find({}).lean();
    console.log(`📊 Found ${allTests.length} total tests in database\n`);
    
    if (allTests.length === 0) {
      console.log('✅ No tests in database - compatibility check complete');
      return true;
    }

    let compatibilityIssues = 0;
    let testsWithOldFields = 0;
    
    // Check each test
    for (const test of allTests) {
      let hasIssues = false;
      const issues = [];
      
      // Check for old fields
      if (test.entryGracePeriod !== undefined) {
        testsWithOldFields++;
        issues.push(`Has entryGracePeriod field: ${test.entryGracePeriod}`);
        hasIssues = true;
      }
      
      if (test.extensionPeriod !== undefined) {
        if (!issues.length) testsWithOldFields++; // Only count once per test
        issues.push(`Has extensionPeriod field: ${test.extensionPeriod}`);
        hasIssues = true;
      }
      
      // Check required fields for new system
      if (!test.activeFrom) {
        issues.push('Missing activeFrom (start time)');
        hasIssues = true;
      }
      
      if (!test.activeTo) {
        issues.push('Missing activeTo (end time)');
        hasIssues = true;
      }
      
      if (!test.duration) {
        issues.push('Missing duration');
        hasIssues = true;
      }
      
      // Check timing logic compatibility
      if (test.activeFrom && test.activeTo) {
        const start = new Date(test.activeFrom);
        const end = new Date(test.activeTo);
        
        if (start >= end) {
          issues.push('Invalid timing: start time is after or equal to end time');
          hasIssues = true;
        }
      }
      
      if (hasIssues) {
        compatibilityIssues++;
        console.log(`⚠️ Test ${test._id}:`);
        console.log(`   Subject: ${test.subject?.subjectCode || 'Unknown'} - ${test.subject?.subjectName || 'Unknown'}`);
        issues.forEach(issue => console.log(`   - ${issue}`));
        console.log('');
      }
    }
    
    // Summary
    console.log('📋 COMPATIBILITY SUMMARY:');
    console.log(`   Total tests: ${allTests.length}`);
    console.log(`   Tests with old fields: ${testsWithOldFields}`);
    console.log(`   Tests with issues: ${compatibilityIssues}`);
    console.log(`   Compatible tests: ${allTests.length - compatibilityIssues}\n`);
    
    if (testsWithOldFields > 0) {
      console.log('🔧 RECOMMENDED ACTIONS:');
      console.log('   1. Run the migration script to remove old fields:');
      console.log('      node server/migrations/remove-grace-extension-periods.js');
      console.log('');
    }
    
    if (compatibilityIssues === 0) {
      console.log('✅ All tests are compatible with the new timing system!');
      return true;
    } else {
      console.log(`❌ ${compatibilityIssues} tests have compatibility issues that need attention.`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Compatibility check failed:', error);
    return false;
  }
}

module.exports = { checkTestCompatibility };

// Allow running directly with node
if (require.main === module) {
  const mongoose = require('mongoose');
  const dotenv = require('dotenv');
  
  async function runCheck() {
    try {
      dotenv.config();
      
      // Connect to MongoDB
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app');
      console.log('Connected to MongoDB\n');
      
      const isCompatible = await checkTestCompatibility();
      
      await mongoose.disconnect();
      process.exit(isCompatible ? 0 : 1);
    } catch (error) {
      console.error('Check failed:', error);
      process.exit(1);
    }
  }
  
  runCheck();
}
