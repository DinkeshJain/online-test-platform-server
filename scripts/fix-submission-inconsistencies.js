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
const Student = require('../models/Student');
const Course = require('../models/Course');

async function fixSubmissionInconsistencies() {
    try {
        console.log('🔧 Starting submission inconsistency fixes...\n');
        
        // 1. Fix course field - convert ObjectIds to course codes
        console.log('1️⃣ Fixing course field ObjectIds...');
        
        // Get all submissions with ObjectId course fields
        const objectIdCourseSubmissions = await Submission.find({
            course: { $regex: /^[0-9a-fA-F]{24}$/ }
        });
        
        console.log(`Found ${objectIdCourseSubmissions.length} submissions with ObjectId courses`);
        
        // Create a mapping of course ObjectIds to course codes
        const courseMap = {};
        const allCourses = await Course.find({});
        allCourses.forEach(course => {
            courseMap[course._id.toString()] = course.courseCode;
        });
        
        console.log('Course mapping:', courseMap);
        
        let courseFixed = 0;
        for (const submission of objectIdCourseSubmissions) {
            const courseCode = courseMap[submission.course];
            if (courseCode) {
                await Submission.updateOne(
                    { _id: submission._id },
                    { course: courseCode }
                );
                courseFixed++;
            } else {
                // If no mapping found, try to get course from student
                try {
                    const student = await Student.findById(submission.userId);
                    if (student && student.course) {
                        await Submission.updateOne(
                            { _id: submission._id },
                            { course: student.course }
                        );
                        courseFixed++;
                    }
                } catch (error) {
                    console.warn(`Could not fix course for submission ${submission._id}`);
                }
            }
        }
        
        console.log(`✅ Fixed course field for ${courseFixed} submissions\n`);
        
        // 2. Fix missing percentages
        console.log('2️⃣ Fixing missing percentage calculations...');
        
        const submissionsWithoutPercentage = await Submission.find({
            $or: [
                { percentage: { $exists: false } },
                { percentage: null },
                { percentage: undefined }
            ],
            isDraft: false,
            isCompleted: true
        });
        
        console.log(`Found ${submissionsWithoutPercentage.length} final submissions without percentages`);
        
        let percentageFixed = 0;
        for (const submission of submissionsWithoutPercentage) {
            if (submission.totalQuestions > 0) {
                const percentage = Math.round((submission.score / submission.totalQuestions) * 100 * 100) / 100;
                await Submission.updateOne(
                    { _id: submission._id },
                    { percentage: percentage }
                );
                percentageFixed++;
            }
        }
        
        console.log(`✅ Fixed percentages for ${percentageFixed} submissions\n`);
        
        // 3. Fix enrollmentNo field for submissions that might be missing it
        console.log('3️⃣ Fixing missing enrollment numbers...');
        
        const submissionsWithoutEnrollment = await Submission.find({
            $or: [
                { enrollmentNo: { $exists: false } },
                { enrollmentNo: null },
                { enrollmentNo: '' }
            ]
        }).populate('userId', 'enrollmentNo');
        
        console.log(`Found ${submissionsWithoutEnrollment.length} submissions without enrollment numbers`);
        
        let enrollmentFixed = 0;
        for (const submission of submissionsWithoutEnrollment) {
            if (submission.userId && submission.userId.enrollmentNo) {
                await Submission.updateOne(
                    { _id: submission._id },
                    { enrollmentNo: submission.userId.enrollmentNo }
                );
                enrollmentFixed++;
            }
        }
        
        console.log(`✅ Fixed enrollment numbers for ${enrollmentFixed} submissions\n`);
        
        // 4. Clean up old draft submissions (optional - be careful with this)
        console.log('4️⃣ Analyzing old draft submissions...');
        
        const oldDrafts = await Submission.find({
            isDraft: true,
            lastSavedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // older than 7 days
        });
        
        console.log(`Found ${oldDrafts.length} old draft submissions (older than 7 days)`);
        console.log('Note: Not automatically deleting these. Review manually if needed.\n');
        
        // 5. Validate fixes
        console.log('5️⃣ Validating fixes...');
        
        const validationResults = await Submission.aggregate([
            {
                $group: {
                    _id: null,
                    totalSubmissions: { $sum: 1 },
                    withObjectIdCourse: {
                        $sum: {
                            $cond: [
                                { $regexMatch: { input: "$course", regex: /^[0-9a-fA-F]{24}$/ } },
                                1,
                                0
                            ]
                        }
                    },
                    withoutPercentage: {
                        $sum: {
                            $cond: [
                                { 
                                    $and: [
                                        { $eq: ["$isDraft", false] },
                                        { $eq: ["$isCompleted", true] },
                                        {
                                            $or: [
                                                { $eq: ["$percentage", null] },
                                                { $not: { $ifNull: ["$percentage", false] } }
                                            ]
                                        }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    withoutEnrollmentNo: {
                        $sum: {
                            $cond: [
                                {
                                    $or: [
                                        { $eq: ["$enrollmentNo", null] },
                                        { $eq: ["$enrollmentNo", ""] },
                                        { $not: { $ifNull: ["$enrollmentNo", false] } }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);
        
        console.log('Validation Results:', validationResults[0]);
        
        console.log('\n✅ All fixes completed successfully!');
        console.log('\n📊 Summary of fixes:');
        console.log(`- Course ObjectId fixes: ${courseFixed}`);
        console.log(`- Percentage calculations: ${percentageFixed}`);
        console.log(`- Enrollment number fixes: ${enrollmentFixed}`);
        
    } catch (error) {
        console.error('❌ Error fixing submissions:', error);
    } finally {
        mongoose.disconnect();
        console.log('🔌 Database connection closed');
    }
}

// Add a confirmation prompt
if (process.argv.includes('--confirm')) {
    fixSubmissionInconsistencies();
} else {
    console.log('🚨 This script will modify submission data in the database.');
    console.log('⚠️  Please review the planned changes carefully.');
    console.log('');
    console.log('Planned fixes:');
    console.log('1. Convert course ObjectIds to course codes');
    console.log('2. Calculate missing percentages');
    console.log('3. Add missing enrollment numbers');
    console.log('');
    console.log('To proceed, run: node scripts/fix-submission-inconsistencies.js --confirm');
    console.log('');
    console.log('💡 Tip: Test on a backup database first!');
}