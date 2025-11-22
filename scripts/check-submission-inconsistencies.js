const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
console.log('🔌 Connecting to MongoDB...');
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app')
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch(err => {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    });

const Submission = require('../models/Submission');

async function analyzeSubmissionInconsistencies() {
    try {
        console.log('🔍 Analyzing submission data inconsistencies...\n');
        
        // Get all submissions sorted by date (both drafts and final)
        const allSubmissions = await Submission.find({}).sort({ submittedAt: 1 }).limit(200);
        
        console.log(`Total submissions found: ${allSubmissions.length}\n`);
        
        // Analyze draft vs final submissions
        const draftSubmissions = allSubmissions.filter(sub => sub.isDraft === true);
        const finalSubmissions = allSubmissions.filter(sub => sub.isDraft === false && sub.isCompleted === true);
        
        console.log(`Draft submissions: ${draftSubmissions.length}`);
        console.log(`Final submissions: ${finalSubmissions.length}\n`);
        
        // Define August 26th cutoff date (using 2025 since data is from 2025)
        const august26th = new Date('2025-08-26');
        
        // Split submissions into before and after August 26th
        const submissionsBefore = allSubmissions.filter(sub => 
            new Date(sub.submittedAt) < august26th
        );
        
        const submissionsAfter = allSubmissions.filter(sub => 
            new Date(sub.submittedAt) >= august26th
        );
        
        console.log(`Submissions before Aug 26th: ${submissionsBefore.length}`);
        console.log(`Submissions after Aug 26th: ${submissionsAfter.length}\n`);
        
        // Check for course field issues specifically
        console.log('🔍 COURSE FIELD ISSUES ANALYSIS:');
        const courseObjectIds = allSubmissions.filter(sub => {
            return sub.course && typeof sub.course === 'string' && sub.course.match(/^[0-9a-fA-F]{24}$/);
        });
        
        const courseCodes = allSubmissions.filter(sub => {
            return sub.course && typeof sub.course === 'string' && !sub.course.match(/^[0-9a-fA-F]{24}$/);
        });
        
        console.log(`Submissions with ObjectId as course: ${courseObjectIds.length}`);
        console.log(`Submissions with course codes: ${courseCodes.length}`);
        
        if (courseObjectIds.length > 0) {
            console.log('Sample ObjectId courses:', courseObjectIds.slice(0, 5).map(sub => sub.course));
        }
        if (courseCodes.length > 0) {
            console.log('Sample course codes:', courseCodes.slice(0, 5).map(sub => sub.course));
        }
        
        console.log('\n');
        
        // Check missing percentage issues
        console.log('📊 PERCENTAGE CALCULATION ISSUES:');
        const missingPercentage = allSubmissions.filter(sub => 
            sub.percentage === null || sub.percentage === undefined
        );
        console.log(`Submissions without percentage: ${missingPercentage.length}/${allSubmissions.length}`);
        
        // Check score vs answers inconsistencies
        const scoreInconsistencies = allSubmissions.filter(sub => {
            if (!sub.answers || sub.answers.length === 0) return false;
            const correctAnswers = sub.answers.filter(a => a.isCorrect === true).length;
            return sub.score !== correctAnswers;
        });
        console.log(`Score inconsistencies: ${scoreInconsistencies.length}`);
        
        if (scoreInconsistencies.length > 0) {
            console.log('Sample score inconsistency:');
            const sample = scoreInconsistencies[0];
            const correctCount = sample.answers.filter(a => a.isCorrect === true).length;
            console.log(`- Stored score: ${sample.score}, Actual correct answers: ${correctCount}`);
        }
        console.log('\n');
        
        // Analyze structure differences
        console.log('📊 STRUCTURE ANALYSIS:\n');
        
        // Check field consistency
        const beforeFields = new Set();
        const afterFields = new Set();
        
        // Sample a few submissions from each period
        const beforeSample = submissionsBefore.slice(0, 10);
        const afterSample = submissionsAfter.slice(0, 10);
        
        console.log('🔍 BEFORE AUG 26TH SAMPLE:');
        beforeSample.forEach((sub, index) => {
            console.log(`\n--- Submission ${index + 1} ---`);
            console.log(`Date: ${sub.submittedAt}`);
            console.log(`User ID: ${sub.userId || sub.studentId}`);
            console.log(`Test ID: ${sub.testId}`);
            console.log(`Course: ${sub.course}`);
            console.log(`Course Type: ${typeof sub.course}`);
            console.log(`Answers length: ${sub.answers?.length || 0}`);
            console.log(`Score: ${sub.score}`);
            console.log(`Total Questions: ${sub.totalQuestions}`);
            console.log(`Percentage: ${sub.percentage}`);
            console.log(`Is Draft: ${sub.isDraft}`);
            console.log(`Is Completed: ${sub.isCompleted}`);
            
            // Check if course is populated or just a string
            if (sub.course) {
                if (typeof sub.course === 'object' && sub.course.courseCode) {
                    console.log(`Course Code: ${sub.course.courseCode}`);
                    console.log(`Course Name: ${sub.course.courseName}`);
                } else {
                    console.log(`Course (raw): ${sub.course}`);
                }
            }
            
            Object.keys(sub.toObject()).forEach(field => beforeFields.add(field));
        });
        
        console.log('\n\n🔍 AFTER AUG 26TH SAMPLE:');
        afterSample.forEach((sub, index) => {
            console.log(`\n--- Submission ${index + 1} ---`);
            console.log(`Date: ${sub.submittedAt}`);
            console.log(`User ID: ${sub.userId || sub.studentId}`);
            console.log(`Test ID: ${sub.testId}`);
            console.log(`Course: ${sub.course}`);
            console.log(`Course Type: ${typeof sub.course}`);
            console.log(`Answers length: ${sub.answers?.length || 0}`);
            console.log(`Score: ${sub.score}`);
            console.log(`Total Questions: ${sub.totalQuestions}`);
            console.log(`Percentage: ${sub.percentage}`);
            console.log(`Is Draft: ${sub.isDraft}`);
            console.log(`Is Completed: ${sub.isCompleted}`);
            
            // Check if course is populated or just a string
            if (sub.course) {
                if (typeof sub.course === 'object' && sub.course.courseCode) {
                    console.log(`Course Code: ${sub.course.courseCode}`);
                    console.log(`Course Name: ${sub.course.courseName}`);
                } else {
                    console.log(`Course (raw): ${sub.course}`);
                }
            }
            
            Object.keys(sub.toObject()).forEach(field => afterFields.add(field));
        });
        
        // Compare field differences
        console.log('\n\n📋 FIELD COMPARISON:');
        console.log('Fields in BEFORE submissions:', Array.from(beforeFields));
        console.log('Fields in AFTER submissions:', Array.from(afterFields));
        
        const onlyInBefore = [...beforeFields].filter(x => !afterFields.has(x));
        const onlyInAfter = [...afterFields].filter(x => !beforeFields.has(x));
        
        if (onlyInBefore.length > 0) {
            console.log('\n🔴 Fields ONLY in BEFORE submissions:', onlyInBefore);
        }
        if (onlyInAfter.length > 0) {
            console.log('\n🟢 Fields ONLY in AFTER submissions:', onlyInAfter);
        }
        
        // Check for course field inconsistencies specifically
        console.log('\n\n🎯 COURSE FIELD ANALYSIS:');
        
        const beforeCourseTypes = {};
        const afterCourseTypes = {};
        
        submissionsBefore.forEach(sub => {
            const type = typeof sub.course;
            beforeCourseTypes[type] = (beforeCourseTypes[type] || 0) + 1;
        });
        
        submissionsAfter.forEach(sub => {
            const type = typeof sub.course;
            afterCourseTypes[type] = (afterCourseTypes[type] || 0) + 1;
        });
        
        console.log('Course field types BEFORE Aug 26th:', beforeCourseTypes);
        console.log('Course field types AFTER Aug 26th:', afterCourseTypes);
        
        // Check for missing scores or percentages
        console.log('\n\n📊 SCORE ANALYSIS:');
        
        const beforeMissingScores = submissionsBefore.filter(sub => 
            sub.score === null || sub.score === undefined || 
            sub.percentage === null || sub.percentage === undefined
        ).length;
        
        const afterMissingScores = submissionsAfter.filter(sub => 
            sub.score === null || sub.score === undefined || 
            sub.percentage === null || sub.percentage === undefined
        ).length;
        
        console.log(`Missing scores BEFORE Aug 26th: ${beforeMissingScores}`);
        console.log(`Missing scores AFTER Aug 26th: ${afterMissingScores}`);
        
        // Check for answer structure differences
        console.log('\n\n🔍 ANSWER STRUCTURE ANALYSIS:');
        
        if (beforeSample.length > 0 && beforeSample[0].answers) {
            console.log('Sample answer structure BEFORE:', JSON.stringify(beforeSample[0].answers[0], null, 2));
        }
        
        if (afterSample.length > 0 && afterSample[0].answers) {
            console.log('Sample answer structure AFTER:', JSON.stringify(afterSample[0].answers[0], null, 2));
        }
        
        console.log('\n✅ Analysis complete!');
        
    } catch (error) {
        console.error('❌ Error analyzing submissions:', error);
    } finally {
        mongoose.disconnect();
    }
}

analyzeSubmissionInconsistencies();