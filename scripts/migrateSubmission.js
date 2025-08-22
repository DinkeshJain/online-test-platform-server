const mongoose = require('mongoose');
const Submission = require('../models/Submission'); // Adjust path as needed
const Test = require('../models/Test');
const Student = require('../models/Student');
require('dotenv').config();
// Connect to MongoDB with updated options
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'your_mongodb_connection_string', {
            // Updated connection options for newer MongoDB driver versions
            serverSelectionTimeoutMS: 30000, // 30 seconds
            socketTimeoutMS: 45000,          // 45 seconds  
            maxPoolSize: 10,                 // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 5000,  // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000,          // Close sockets after 45 seconds of inactivity
            family: 4                        // Use IPv4, skip trying IPv6
        });
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

const migrateSubmissions = async () => {
    try {
        await connectDB();

        console.log('🚀 Starting optimized submission migration...');

        // First, get the total count of submissions that need migration
        const totalCount = await Submission.countDocuments({
            $or: [
                { enrollmentNo: { $exists: false } },
                { course: { $exists: false } },
                { testType: { $exists: false } }
            ]
        });

        console.log(`📊 Found ${totalCount} submissions to migrate`);

        if (totalCount === 0) {
            console.log('✅ No submissions need migration. All done!');
            return;
        }

        const batchSize = 50; // Reduced batch size for better memory management
        let processed = 0;
        let migrated = 0;
        let failed = 0;

        // Process in smaller batches
        for (let skip = 0; skip < totalCount; skip += batchSize) {
            const batchNumber = Math.floor(skip / batchSize) + 1;
            const totalBatches = Math.ceil(totalCount / batchSize);

            console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${skip + 1}-${Math.min(skip + batchSize, totalCount)})...`);

            try {
                // Get batch of submissions without populate (much faster)
                const submissions = await Submission.find({
                    $or: [
                        { enrollmentNo: { $exists: false } },
                        { course: { $exists: false } },
                        { testType: { $exists: false } }
                    ]
                })
                    .limit(batchSize)
                    .skip(skip)
                    .lean(); // Use lean for faster queries

                // Process each submission in the batch
                for (const submission of submissions) {
                    try {
                        const updateData = {};
                        let needsUpdate = false;

                        // Get student info if enrollmentNo is missing
                        if (!submission.enrollmentNo && submission.userId) {
                            const student = await Student.findById(submission.userId).select('enrollmentNo').lean();
                            if (student && student.enrollmentNo) {
                                updateData.enrollmentNo = student.enrollmentNo;
                                needsUpdate = true;
                            }
                        }

                        // Get test info if course or testType is missing
                        if ((!submission.course || !submission.testType) && submission.testId) {
                            const test = await Test.findById(submission.testId).select('course testType').lean();
                            if (test) {
                                if (!submission.course && test.course) {
                                    updateData.course = test.course;
                                    needsUpdate = true;
                                }
                                if (!submission.testType) {
                                    updateData.testType = test.testType || 'official';
                                    needsUpdate = true;
                                }
                            }
                        }

                        // Update the submission if we have new data
                        if (needsUpdate) {
                            await Submission.updateOne(
                                { _id: submission._id },
                                { $set: updateData }
                            );
                            migrated++;
                        }

                        processed++;

                    } catch (error) {
                        console.error(`❌ Error migrating submission ${submission._id}:`, error.message);
                        failed++;
                    }
                }

                // Log batch progress
                const progressPercent = Math.round((processed / totalCount) * 100);
                console.log(`   ✓ Batch ${batchNumber} completed. Overall progress: ${processed}/${totalCount} (${progressPercent}%)`);

            } catch (batchError) {
                console.error(`❌ Error processing batch starting at ${skip}:`, batchError.message);
                failed += batchSize;
            }
        }

        console.log(`\n🎉 Migration completed!`);
        console.log(`📈 Summary:`);
        console.log(`   • Total processed: ${processed}`);
        console.log(`   • Successfully migrated: ${migrated}`);
        console.log(`   • Failed: ${failed}`);
        console.log(`   • Success rate: ${Math.round((migrated / processed) * 100)}%`);

        // Verify migration
        const remainingCount = await Submission.countDocuments({
            $or: [
                { enrollmentNo: { $exists: false } },
                { course: { $exists: false } },
                { testType: { $exists: false } }
            ]
        });

        console.log(`📋 Remaining submissions needing migration: ${remainingCount}`);

        if (remainingCount === 0) {
            console.log('🎊 All submissions have been successfully migrated!');
        }

    } catch (error) {
        console.error('💥 Migration failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
};

// Handle process termination gracefully
process.on('SIGINT', async () => {
    console.log('\n⚠️  Migration interrupted by user');
    await mongoose.connection.close();
    process.exit(0);
});

// Run migration
migrateSubmissions();
