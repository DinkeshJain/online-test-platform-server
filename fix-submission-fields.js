const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Submission = require('./models/Submission');
const Test = require('./models/Test');
const Student = require('./models/Student');
const Course = require('./models/Course');

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-platform';

const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const fixMissingFields = async () => {
  try {
    await connectDB();
    
    console.log('🔍 Analyzing submissions for missing fields...\n');
    
    // Process in batches for better performance
    const BATCH_SIZE = 50; // Process 50 submissions at a time
    let skip = 0;
    let totalProcessed = 0;
    let totalFixed = 0;
    let totalErrors = 0;
    
    // Get total count first
    const totalSubmissions = await Submission.countDocuments({});
    console.log(`📊 Found ${totalSubmissions} total submissions`);
    console.log(`🔄 Processing in batches of ${BATCH_SIZE}\n`);
    
    while (skip < totalSubmissions) {
      const currentBatch = Math.floor(skip / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalSubmissions / BATCH_SIZE);
      
      console.log(`\n📦 Processing Batch ${currentBatch}/${totalBatches} (submissions ${skip + 1}-${Math.min(skip + BATCH_SIZE, totalSubmissions)})`);
      
      // Get submissions for this batch
      const submissions = await Submission.find({})
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean(); // Use lean() for better performance when only reading
      
      let batchFixed = 0;
      let batchErrors = 0;
      
      for (let i = 0; i < submissions.length; i++) {
        const submission = submissions[i];
        const updates = {};
        let needsUpdate = false;
        
        const submissionIndex = skip + i + 1;
        console.log(`\n📝 Processing submission ${submissionIndex}/${totalSubmissions} (ID: ${submission._id})`);
        
        try {
        // Check and fix missing enrollmentNo
        if (!submission.enrollmentNo && submission.userId) {
          const student = await Student.findById(submission.userId);
          if (student && student.enrollmentNo) {
            updates.enrollmentNo = student.enrollmentNo;
            needsUpdate = true;
            console.log(`  ➕ Adding enrollmentNo: ${student.enrollmentNo}`);
          }
        }
        
        // Check and fix missing course
        if (!submission.course) {
          let courseCode = null;
          
          // First try to get course from student
          if (submission.userId) {
            const student = await Student.findById(submission.userId);
            if (student && student.course) {
              courseCode = student.course;
              console.log(`  🔍 Found course from student: ${courseCode}`);
            }
          }
          
          // Fallback: get course from test
          if (!courseCode && submission.testId) {
            const test = await Test.findById(submission.testId);
            if (test && test.courseCode) {
              courseCode = test.courseCode;
              console.log(`  🔍 Found course from test: ${courseCode}`);
            } else if (test && test.course) {
              // If test has course ObjectId, get the courseCode from Course model
              const course = await Course.findById(test.course);
              if (course && course.courseCode) {
                courseCode = course.courseCode;
                console.log(`  🔍 Found course from Course model via test: ${courseCode}`);
              }
            }
          }
          
          // Verify course exists in Course model and get correct courseCode
          if (courseCode) {
            const course = await Course.findOne({ 
              courseCode: { $regex: new RegExp(`^${courseCode}$`, 'i') },
              isActive: true 
            });
            
            if (course) {
              updates.course = course.courseCode;
              needsUpdate = true;
              console.log(`  ➕ Adding verified course: ${course.courseCode} (${course.courseName})`);
            } else {
              console.log(`  ⚠️ Course ${courseCode} not found in Course model or inactive`);
            }
          }
        }
        
        // Check and fix missing testType
        if (!submission.testType && submission.testId) {
          const test = await Test.findById(submission.testId);
          if (test && test.testType) {
            updates.testType = test.testType;
            needsUpdate = true;
            console.log(`  ➕ Adding testType: ${test.testType}`);
          } else {
            // Default to 'official' if not found in test
            updates.testType = 'official';
            needsUpdate = true;
            console.log(`  ➕ Adding default testType: official`);
          }
        }
        
        // Check and fix missing totalQuestions
        if (!submission.totalQuestions) {
          if (submission.answers && submission.answers.length > 0) {
            // Get max originalQuestionNumber from answers
            const maxQuestion = Math.max(...submission.answers.map(a => a.originalQuestionNumber));
            updates.totalQuestions = maxQuestion;
            needsUpdate = true;
            console.log(`  ➕ Adding totalQuestions from answers: ${maxQuestion}`);
          } else if (submission.testId) {
            // Get from test
            const test = await Test.findById(submission.testId);
            if (test && test.questions) {
              updates.totalQuestions = test.questions.length;
              needsUpdate = true;
              console.log(`  ➕ Adding totalQuestions from test: ${test.questions.length}`);
            }
          }
        }
        
        // Check and fix missing score
        if (submission.score === undefined || submission.score === null) {
          if (submission.answers && submission.answers.length > 0) {
            const correctAnswers = submission.answers.filter(a => a.isCorrect === true).length;
            updates.score = correctAnswers;
            needsUpdate = true;
            console.log(`  ➕ Calculating score from answers: ${correctAnswers}`);
          }
        }
        
        // Check and fix missing timeSpent
        if (!submission.timeSpent && submission.testStartedAt && submission.submittedAt) {
          const timeSpentSeconds = Math.floor((new Date(submission.submittedAt) - new Date(submission.testStartedAt)) / 1000);
          if (timeSpentSeconds > 0) {
            updates.timeSpent = timeSpentSeconds;
            needsUpdate = true;
            console.log(`  ➕ Calculating timeSpent: ${timeSpentSeconds} seconds`);
          }
        }
        
        // Check and fix missing testStartedAt
        if (!submission.testStartedAt) {
          if (submission.createdAt) {
            updates.testStartedAt = submission.createdAt;
            needsUpdate = true;
            console.log(`  ➕ Setting testStartedAt to createdAt: ${submission.createdAt}`);
          } else if (submission.submittedAt) {
            // Estimate start time (assume 30 minutes before submission if no other data)
            const estimatedStart = new Date(submission.submittedAt.getTime() - (30 * 60 * 1000));
            updates.testStartedAt = estimatedStart;
            needsUpdate = true;
            console.log(`  ➕ Estimating testStartedAt: ${estimatedStart}`);
          }
        }
        
        // Fix boolean fields with proper defaults
        if (submission.isCompleted === undefined || submission.isCompleted === null) {
          updates.isCompleted = submission.submittedAt ? true : false;
          needsUpdate = true;
          console.log(`  ➕ Setting isCompleted: ${updates.isCompleted}`);
        }
        
        if (submission.isDraft === undefined || submission.isDraft === null) {
          updates.isDraft = submission.isCompleted ? false : true;
          needsUpdate = true;
          console.log(`  ➕ Setting isDraft: ${updates.isDraft}`);
        }
        
        // Fix numeric fields with defaults
        if (submission.currentQuestionIndex === undefined || submission.currentQuestionIndex === null) {
          updates.currentQuestionIndex = 0;
          needsUpdate = true;
          console.log(`  ➕ Setting currentQuestionIndex: 0`);
        }
        
        if (submission.timeLeftWhenSaved === undefined || submission.timeLeftWhenSaved === null) {
          updates.timeLeftWhenSaved = 0;
          needsUpdate = true;
          console.log(`  ➕ Setting timeLeftWhenSaved: 0`);
        }
        
        if (submission.autoSaveCount === undefined || submission.autoSaveCount === null) {
          updates.autoSaveCount = 0;
          needsUpdate = true;
          console.log(`  ➕ Setting autoSaveCount: 0`);
        }
        
        if (submission.resumeCount === undefined || submission.resumeCount === null) {
          updates.resumeCount = 0;
          needsUpdate = true;
          console.log(`  ➕ Setting resumeCount: 0`);
        }
        
        if (submission.crashDetected === undefined || submission.crashDetected === null) {
          updates.crashDetected = false;
          needsUpdate = true;
          console.log(`  ➕ Setting crashDetected: false`);
        }
        
        // Fix date fields
        if (!submission.lastSavedAt) {
          updates.lastSavedAt = submission.submittedAt || submission.updatedAt || new Date();
          needsUpdate = true;
          console.log(`  ➕ Setting lastSavedAt: ${updates.lastSavedAt}`);
        }
        
        if (!submission.lastHeartbeat) {
          updates.lastHeartbeat = submission.submittedAt || submission.updatedAt || new Date();
          needsUpdate = true;
          console.log(`  ➕ Setting lastHeartbeat: ${updates.lastHeartbeat}`);
        }
        
        // Update the submission if needed
        if (needsUpdate) {
          await Submission.findByIdAndUpdate(submission._id, updates);
          batchFixed++;
          console.log(`  ✅ Updated submission with ${Object.keys(updates).length} fields`);
        } else {
          console.log(`  ✓ No missing fields found`);
        }
        
      } catch (error) {
        console.error(`  ❌ Error processing submission ${submission._id}:`, error.message);
        batchErrors++;
      }
    }
    
    // Update totals
    totalProcessed += submissions.length;
    totalFixed += batchFixed;
    totalErrors += batchErrors;
    
    console.log(`\n📊 Batch ${currentBatch} Summary:`);
    console.log(`  Processed: ${submissions.length}`);
    console.log(`  Fixed: ${batchFixed}`);
    console.log(`  Errors: ${batchErrors}`);
    
    // Move to next batch
    skip += BATCH_SIZE;
    
    // Small delay between batches to prevent overwhelming the database
    if (skip < totalSubmissions) {
      console.log(`⏳ Waiting 1 second before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('\n🎉 All batches completed!');
  console.log('📊 Final Summary:');
  console.log(`Total submissions processed: ${totalProcessed}`);
  console.log(`Total submissions updated: ${totalFixed}`);
  console.log(`Total errors encountered: ${totalErrors}`);
  console.log('✅ Process completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
};

// Add dry-run mode
const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
  
  const dryRunAnalysis = async () => {
    try {
      await connectDB();
      
      const BATCH_SIZE = 100; // Larger batch size for read-only analysis
      let skip = 0;
      const totalSubmissions = await Submission.countDocuments({});
      console.log(`📊 Found ${totalSubmissions} total submissions\n`);
      
      const missingFields = {};
      let processed = 0;
      
      while (skip < totalSubmissions) {
        const currentBatch = Math.floor(skip / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(totalSubmissions / BATCH_SIZE);
        
        console.log(`🔍 Analyzing batch ${currentBatch}/${totalBatches}...`);
        
        const submissions = await Submission.find({})
          .skip(skip)
          .limit(BATCH_SIZE)
          .lean();
        
        for (const submission of submissions) {
          const missing = [];
          
          if (!submission.enrollmentNo) missing.push('enrollmentNo');
          if (!submission.course) missing.push('course');
          if (!submission.testType) missing.push('testType');
          if (!submission.totalQuestions) missing.push('totalQuestions');
          if (submission.score === undefined || submission.score === null) missing.push('score');
          if (!submission.timeSpent) missing.push('timeSpent');
          if (!submission.testStartedAt) missing.push('testStartedAt');
          if (submission.isCompleted === undefined) missing.push('isCompleted');
          if (submission.isDraft === undefined) missing.push('isDraft');
          
          missing.forEach(field => {
            missingFields[field] = (missingFields[field] || 0) + 1;
          });
        }
        
        processed += submissions.length;
        skip += BATCH_SIZE;
      }
      
      console.log('📋 Missing fields summary:');
      Object.entries(missingFields).forEach(([field, count]) => {
        console.log(`  ${field}: ${count} submissions missing this field`);
      });
      
      console.log('\nRun without --dry-run to fix these issues.');
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    } finally {
      mongoose.connection.close();
    }
  };
  
  dryRunAnalysis();
} else {
  fixMissingFields();
}
