// Update Student Names in Results Collection
// This script updates student names in the Results collection using the current names from Students collection
// Matches by enrollment number to ensure accuracy

const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

console.log('🔄 Student Name Update Script for Results Collection');
console.log('=' * 60);

async function connectToDatabase() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-platform');
        console.log('✅ Connected to MongoDB successfully');
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB:', error);
        throw error;
    }
}

async function updateStudentNamesInResults() {
    try {
        console.log('📊 Starting student name update process...');
        
        // Get all unique enrollment numbers from Results collection
        const resultsEnrollments = await mongoose.connection.db.collection('results')
            .distinct('enrollmentNo');
        
        console.log(`📋 Found ${resultsEnrollments.length} unique enrollment numbers in Results collection`);
        
        // Get all students from Students collection
        const students = await mongoose.connection.db.collection('students')
            .find({}, { projection: { enrollmentNo: 1, fullName: 1, _id: 0 } })
            .toArray();
        
        console.log(`👥 Found ${students.length} students in Students collection`);
        
        // Create a map for quick lookup
        const studentNameMap = new Map();
        students.forEach(student => {
            if (student.enrollmentNo && student.fullName) {
                studentNameMap.set(student.enrollmentNo, student.fullName);
            }
        });
        
        console.log(`🗂️  Created name mapping for ${studentNameMap.size} students`);
        
        let updatedCount = 0;
        let notFoundCount = 0;
        let noChangeCount = 0;
        
        // Process each enrollment number
        for (const enrollmentNo of resultsEnrollments) {
            if (!enrollmentNo) {
                console.log('⚠️  Skipping result with empty enrollment number');
                continue;
            }
            
            const currentName = studentNameMap.get(enrollmentNo);
            
            if (!currentName) {
                console.log(`❌ Student not found in Students collection: ${enrollmentNo}`);
                notFoundCount++;
                continue;
            }
            
            // Get current name in results
            const resultRecord = await mongoose.connection.db.collection('results')
                .findOne({ enrollmentNo: enrollmentNo }, { projection: { fullName: 1 } });
            
            if (resultRecord && resultRecord.fullName === currentName) {
                console.log(`✅ Name already up-to-date for ${enrollmentNo}: ${currentName}`);
                noChangeCount++;
                continue;
            }
            
            // Update all results for this enrollment number
            const updateResult = await mongoose.connection.db.collection('results')
                .updateMany(
                    { enrollmentNo: enrollmentNo },
                    { 
                        $set: { 
                            fullName: currentName,
                            nameUpdatedAt: new Date()
                        } 
                    }
                );
            
            if (updateResult.modifiedCount > 0) {
                console.log(`🔄 Updated ${updateResult.modifiedCount} result(s) for ${enrollmentNo}: ${resultRecord?.fullName || 'N/A'} → ${currentName}`);
                updatedCount += updateResult.modifiedCount;
            }
        }
        
        // Also check for supplementary results if they exist
        const supplementaryCollection = mongoose.connection.db.collection('supplementaryresults');
        const supplementaryCount = await supplementaryCollection.countDocuments();
        
        if (supplementaryCount > 0) {
            console.log('\n📋 Processing Supplementary Results...');
            
            const suppResultsEnrollments = await supplementaryCollection
                .distinct('enrollmentNo');
            
            console.log(`📋 Found ${suppResultsEnrollments.length} unique enrollment numbers in Supplementary Results`);
            
            let suppUpdatedCount = 0;
            let suppNotFoundCount = 0;
            let suppNoChangeCount = 0;
            
            for (const enrollmentNo of suppResultsEnrollments) {
                if (!enrollmentNo) continue;
                
                const currentName = studentNameMap.get(enrollmentNo);
                
                if (!currentName) {
                    console.log(`❌ Student not found for supplementary result: ${enrollmentNo}`);
                    suppNotFoundCount++;
                    continue;
                }
                
                const suppResultRecord = await supplementaryCollection
                    .findOne({ enrollmentNo: enrollmentNo }, { projection: { fullName: 1 } });
                
                if (suppResultRecord && suppResultRecord.fullName === currentName) {
                    console.log(`✅ Supplementary name already up-to-date for ${enrollmentNo}: ${currentName}`);
                    suppNoChangeCount++;
                    continue;
                }
                
                const updateResult = await supplementaryCollection
                    .updateMany(
                        { enrollmentNo: enrollmentNo },
                        { 
                            $set: { 
                                fullName: currentName,
                                nameUpdatedAt: new Date()
                            } 
                        }
                    );
                
                if (updateResult.modifiedCount > 0) {
                    console.log(`🔄 Updated ${updateResult.modifiedCount} supplementary result(s) for ${enrollmentNo}: ${suppResultRecord?.fullName || 'N/A'} → ${currentName}`);
                    suppUpdatedCount += updateResult.modifiedCount;
                }
            }
            
            console.log('\n📊 Supplementary Results Update Summary:');
            console.log(`✅ Records updated: ${suppUpdatedCount}`);
            console.log(`⚠️  Students not found: ${suppNotFoundCount}`);
            console.log(`📋 No change needed: ${suppNoChangeCount}`);
        }
        
        console.log('\n' + '=' * 60);
        console.log('📊 FINAL UPDATE SUMMARY');
        console.log('=' * 60);
        console.log(`✅ Total result records updated: ${updatedCount}`);
        console.log(`⚠️  Students not found in Students collection: ${notFoundCount}`);
        console.log(`📋 Records with no change needed: ${noChangeCount}`);
        console.log(`📊 Total enrollment numbers processed: ${resultsEnrollments.length}`);
        
        if (updatedCount > 0) {
            console.log('\n🎉 Student names have been successfully updated in Results collection!');
            console.log('💡 All updated records now have a "nameUpdatedAt" timestamp');
        } else {
            console.log('\n✅ All student names were already up-to-date in Results collection');
        }
        
    } catch (error) {
        console.error('❌ Error updating student names:', error);
        throw error;
    }
}

async function verifyUpdates() {
    try {
        console.log('\n🔍 Verifying updates...');
        
        // Sample verification - check a few random records
        const sampleResults = await mongoose.connection.db.collection('results')
            .aggregate([
                { $sample: { size: 5 } },
                { $project: { enrollmentNo: 1, fullName: 1, nameUpdatedAt: 1 } }
            ]).toArray();
        
        console.log('\n📋 Sample updated records:');
        sampleResults.forEach(result => {
            console.log(`👤 ${result.enrollmentNo}: ${result.fullName} ${result.nameUpdatedAt ? '(Updated: ' + result.nameUpdatedAt.toISOString() + ')' : '(Not updated)'}`);
        });
        
    } catch (error) {
        console.error('❌ Error during verification:', error);
    }
}

// Main execution
async function main() {
    try {
        await connectToDatabase();
        await updateStudentNamesInResults();
        await verifyUpdates();
        
        console.log('\n✅ Script completed successfully!');
        
    } catch (error) {
        console.error('❌ Script failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Database connection closed');
    }
}

// Run the script
main();