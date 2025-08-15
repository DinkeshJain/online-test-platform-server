const mongoose = require('mongoose');
const dotenv = require('dotenv');

async function inspectDatabase() {
  try {
    dotenv.config();
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app');
    console.log('Connected to MongoDB\n');
    
    const Test = require('../models/Test');
    
    // Get all tests with all fields to see what's actually there
    const allTests = await Test.find({}).lean();
    
    console.log(`Total tests: ${allTests.length}\n`);
    
    allTests.forEach((test, index) => {
      console.log(`Test ${index + 1}: ${test._id}`);
      console.log(`  Subject: ${test.subject?.subjectCode || 'Unknown'} - ${test.subject?.subjectName || 'Unknown'}`);
      console.log(`  Has entryGracePeriod: ${test.hasOwnProperty('entryGracePeriod')} (value: ${test.entryGracePeriod})`);
      console.log(`  Has extensionPeriod: ${test.hasOwnProperty('extensionPeriod')} (value: ${test.extensionPeriod})`);
      console.log(`  All keys: ${Object.keys(test).join(', ')}`);
      console.log('');
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Inspection failed:', error);
  }
}

inspectDatabase();
