const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models
const Test = require('../models/Test');

async function testAdminEndpoint() {
  try {
    console.log('🧪 Testing Admin Endpoint Data Structure');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000
    });

    console.log('✅ Connected to MongoDB');

    // Test the query that the admin endpoint uses
    const tests = await Test.find()
      .select('-createdBy') // Exclude createdBy field
      .sort({ createdAt: -1 })
      .limit(3); // Just get a few tests for testing

    console.log('\n📊 Test Data Structure:');
    console.log(`Found ${tests.length} tests`);
    
    if (tests.length > 0) {
      const sampleTest = tests[0];
      console.log('\n📝 Sample Test Data:');
      console.log('Test ID:', sampleTest._id);
      console.log('Course Code:', sampleTest.courseCode || 'NOT SET');
      console.log('Course Name:', sampleTest.courseName || 'NOT SET');
      console.log('Subject Code:', sampleTest.subject?.subjectCode || 'NOT SET');
      console.log('Subject Name:', sampleTest.subject?.subjectName || 'NOT SET');
      console.log('Test Type:', sampleTest.testType);
      console.log('Questions Count:', sampleTest.questions?.length || 0);
      console.log('Duration:', sampleTest.duration);
      console.log('Created By field present:', 'createdBy' in sampleTest);
      console.log('Course reference field present:', 'course' in sampleTest);
      
      // Check how many tests have course info
      const testsWithCourseInfo = await Test.countDocuments({
        courseCode: { $exists: true, $ne: null, $ne: '' },
        courseName: { $exists: true, $ne: null, $ne: '' }
      });
      
      const totalTests = await Test.countDocuments();
      
      console.log('\n📈 Migration Status:');
      console.log(`Total tests: ${totalTests}`);
      console.log(`Tests with course info: ${testsWithCourseInfo}`);
      console.log(`Tests missing course info: ${totalTests - testsWithCourseInfo}`);
      
      if (testsWithCourseInfo === 0) {
        console.log('\n⚠️  WARNING: No tests have course info yet. Run the migration script first!');
      } else if (testsWithCourseInfo < totalTests) {
        console.log('\n⚠️  WARNING: Some tests are missing course info. Consider running the migration script!');
      } else {
        console.log('\n✅ All tests have course information!');
      }
    } else {
      console.log('\n⚠️  No tests found in database');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testAdminEndpoint()
    .then(() => {
      console.log('\n🎉 Test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testAdminEndpoint };
