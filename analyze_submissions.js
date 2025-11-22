const mongoose = require('mongoose');
const Submission = require('./models/Submission');

mongoose.connect('mongodb://localhost:27017/online-test-app')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Get submissions before August 26th
    console.log('\n=== SUBMISSIONS BEFORE AUGUST 26TH ===');
    const beforeSubs = await Submission.find({
      submittedAt: { $lt: new Date('2024-08-26') }
    }).sort({ submittedAt: -1 }).limit(3).lean();
    
    beforeSubs.forEach((sub, index) => {
      console.log(`\n--- Submission ${index + 1} (BEFORE) ---`);
      console.log(`Date: ${sub.submittedAt.toISOString()}`);
      console.log(`Course: ${JSON.stringify(sub.course)} (type: ${typeof sub.course})`);
      console.log(`EnrollmentNo: ${sub.enrollmentNo}`);
      console.log(`Answers Count: ${sub.answers ? sub.answers.length : 'N/A'}`);
      console.log(`Test ID: ${sub.testId}`);
      console.log(`User ID: ${sub.userId}`);
      
      if (sub.answers && sub.answers.length > 0) {
        const firstAnswer = sub.answers[0];
        console.log('First Answer Keys:', Object.keys(firstAnswer));
        console.log('Has shuffledToOriginal?', 'shuffledToOriginal' in firstAnswer);
        console.log('Has originalQuestionNumber?', 'originalQuestionNumber' in firstAnswer);
        console.log('Has shuffledPosition?', 'shuffledPosition' in firstAnswer);
      }
    });
    
    // Get submissions after August 26th
    console.log('\n\n=== SUBMISSIONS AFTER AUGUST 26TH ===');
    const afterSubs = await Submission.find({
      submittedAt: { $gte: new Date('2024-08-26') }
    }).sort({ submittedAt: 1 }).limit(3).lean();
    
    afterSubs.forEach((sub, index) => {
      console.log(`\n--- Submission ${index + 1} (AFTER) ---`);
      console.log(`Date: ${sub.submittedAt.toISOString()}`);
      console.log(`Course: ${JSON.stringify(sub.course)} (type: ${typeof sub.course})`);
      console.log(`EnrollmentNo: ${sub.enrollmentNo}`);
      console.log(`Answers Count: ${sub.answers ? sub.answers.length : 'N/A'}`);
      console.log(`Test ID: ${sub.testId}`);
      console.log(`User ID: ${sub.userId}`);
      
      if (sub.answers && sub.answers.length > 0) {
        const firstAnswer = sub.answers[0];
        console.log('First Answer Keys:', Object.keys(firstAnswer));
        console.log('Has shuffledToOriginal?', 'shuffledToOriginal' in firstAnswer);
        console.log('Has originalQuestionNumber?', 'originalQuestionNumber' in firstAnswer);
        console.log('Has shuffledPosition?', 'shuffledPosition' in firstAnswer);
      }
    });
    
    // Check for course field inconsistencies
    console.log('\n\n=== COURSE FIELD ANALYSIS ===');
    const courseTypes = await Submission.aggregate([
      {
        $project: {
          courseType: { $type: "$course" },
          courseValue: "$course",
          submittedAt: 1
        }
      },
      {
        $group: {
          _id: "$courseType",
          count: { $sum: 1 },
          examples: { $push: { date: "$submittedAt", value: "$courseValue" } }
        }
      }
    ]);
    
    console.log('Course field types:', JSON.stringify(courseTypes, null, 2));
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });