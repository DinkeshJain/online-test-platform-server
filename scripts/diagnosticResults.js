// Diagnostic script to check Results collection structure
const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

console.log('🔍 Results Collection Diagnostic');
console.log('=' * 40);

async function diagnosticCheck() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected successfully');
        
        // Check total count in results
        const totalResults = await mongoose.connection.db.collection('results').countDocuments();
        console.log(`📊 Total documents in Results collection: ${totalResults}`);
        
        if (totalResults > 0) {
            // Sample 5 records to see structure
            const sampleResults = await mongoose.connection.db.collection('results')
                .find({}).limit(5).toArray();
            
            console.log('\n📋 Sample Results structure:');
            sampleResults.forEach((result, index) => {
                console.log(`\n${index + 1}. Document ID: ${result._id}`);
                console.log(`   enrollmentNumber: "${result.enrollmentNumber}" (type: ${typeof result.enrollmentNumber})`);
                console.log(`   fullName: "${result.fullName}"`);
                console.log(`   Keys: ${Object.keys(result).join(', ')}`);
            });
            
            // Check for different variations of enrollment field
            const enrollmentVariations = await mongoose.connection.db.collection('results')
                .aggregate([
                    {
                        $project: {
                            enrollmentNumber: 1,
                            enrollment: 1,
                            enrollmentNo: 1,
                            enrolmentNumber: 1
                        }
                    },
                    { $limit: 3 }
                ]).toArray();
            
            console.log('\n🔍 Checking enrollment field variations:');
            enrollmentVariations.forEach(doc => {
                console.log(`   enrollmentNumber: ${doc.enrollmentNumber}`);
                console.log(`   enrollment: ${doc.enrollment}`);
                console.log(`   enrollmentNo: ${doc.enrollmentNo}`);
                console.log(`   enrolmentNumber: ${doc.enrolmentNumber}`);
            });
        }
        
        // Check supplementary results too
        const totalSupp = await mongoose.connection.db.collection('supplementaryresults').countDocuments();
        console.log(`\n📊 Total documents in SupplementaryResults collection: ${totalSupp}`);
        
        if (totalSupp > 0) {
            const sampleSupp = await mongoose.connection.db.collection('supplementaryresults')
                .find({}).limit(2).toArray();
            
            console.log('\n📋 Sample SupplementaryResults structure:');
            sampleSupp.forEach((result, index) => {
                console.log(`\n${index + 1}. Document ID: ${result._id}`);
                console.log(`   enrollmentNumber: "${result.enrollmentNumber}" (type: ${typeof result.enrollmentNumber})`);
                console.log(`   fullName: "${result.fullName}"`);
                console.log(`   Keys: ${Object.keys(result).join(', ')}`);
            });
        }
        
        // Check Students collection sample
        const sampleStudents = await mongoose.connection.db.collection('students')
            .find({}).limit(3).toArray();
        
        console.log('\n👥 Sample Students structure:');
        sampleStudents.forEach((student, index) => {
            console.log(`\n${index + 1}. Document ID: ${student._id}`);
            console.log(`   enrollmentNumber: "${student.enrollmentNumber}" (type: ${typeof student.enrollmentNumber})`);
            console.log(`   fullName: "${student.fullName}"`);
            console.log(`   Keys: ${Object.keys(student).join(', ')}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
    }
}

diagnosticCheck();