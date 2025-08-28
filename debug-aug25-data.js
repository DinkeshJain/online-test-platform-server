require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Test = require('./models/Test');
const Submission = require('./models/Submission');

async function debugAug25Data() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check all tests in the database
    const allTests = await Test.find().sort({ createdAt: -1 }).limit(20);
    console.log(`📋 Total tests in database: ${await Test.countDocuments()}`);
    console.log(`\n🔍 Last 20 tests created:`);
    
    allTests.forEach((test, index) => {
      console.log(`${index + 1}. ${test.subject?.subjectCode || 'No Code'}: ${test.subject?.subjectName || 'No Name'}`);
      console.log(`   Created: ${test.createdAt.toLocaleDateString()} ${test.createdAt.toLocaleTimeString()}`);
      if (test.activeFrom) {
        console.log(`   Active: ${test.activeFrom.toLocaleDateString()} to ${test.activeTo ? test.activeTo.toLocaleDateString() : 'ongoing'}`);
      }
      console.log(`   Course: ${test.courseCode || 'N/A'}`);
      console.log('');
    });

    // Check tests around August 25, 2025
    const aug24Start = new Date('2025-08-24T00:00:00.000Z');
    const aug26End = new Date('2025-08-26T23:59:59.999Z');
    
    const testsAroundAug25 = await Test.find({
      $or: [
        { createdAt: { $gte: aug24Start, $lte: aug26End } },
        { 
          activeFrom: { $lte: aug26End },
          activeTo: { $gte: aug24Start }
        }
      ]
    }).sort({ createdAt: -1 });

    console.log(`\n📅 Tests around Aug 24-26, 2025: ${testsAroundAug25.length}`);
    testsAroundAug25.forEach((test, index) => {
      console.log(`${index + 1}. ${test.subject?.subjectCode || 'No Code'}: ${test.subject?.subjectName || 'No Name'}`);
      console.log(`   Created: ${test.createdAt.toLocaleDateString()} ${test.createdAt.toLocaleTimeString()}`);
      if (test.activeFrom) {
        console.log(`   Active: ${test.activeFrom.toLocaleDateString()} to ${test.activeTo ? test.activeTo.toLocaleDateString() : 'ongoing'}`);
      }
      console.log('');
    });

    // Check submissions around August 25, 2025
    const submissionsAroundAug25 = await Submission.find({
      $or: [
        { submittedAt: { $gte: aug24Start, $lte: aug26End } },
        { testStartedAt: { $gte: aug24Start, $lte: aug26End } },
        { createdAt: { $gte: aug24Start, $lte: aug26End } }
      ]
    }).populate('testId').sort({ createdAt: -1 }).limit(10);

    console.log(`\n📝 Submissions around Aug 24-26, 2025: ${submissionsAroundAug25.length}`);
    submissionsAroundAug25.forEach((submission, index) => {
      console.log(`${index + 1}. Enrollment: ${submission.enrollmentNo}`);
      console.log(`   Test: ${submission.testId?.subject?.subjectCode || 'Unknown'}`);
      console.log(`   Submitted: ${submission.submittedAt ? submission.submittedAt.toLocaleDateString() : 'Not submitted'}`);
      console.log(`   Started: ${submission.testStartedAt ? submission.testStartedAt.toLocaleDateString() : 'Unknown'}`);
      console.log('');
    });

    // Check what Paper 4 tests exist in general
    const paper4Tests = await Test.find({
      'subject.subjectCode': { $regex: '4$' }
    }).sort({ createdAt: -1 });

    console.log(`\n📚 All Paper 4 tests in database: ${paper4Tests.length}`);
    paper4Tests.forEach((test, index) => {
      console.log(`${index + 1}. ${test.subject.subjectCode}: ${test.subject.subjectName}`);
      console.log(`   Created: ${test.createdAt.toLocaleDateString()}`);
      console.log(`   Course: ${test.courseCode || 'N/A'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

debugAug25Data();
