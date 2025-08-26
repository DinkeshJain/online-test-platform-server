const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

// Connect to MongoDB
mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app');

async function fixOrphanedQuestionIds() {
    try {
        console.log('🔧 FIXING ORPHANED QUESTION IDs USING originalQuestionNumber...\n');
        
        // Get today's date range  
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Find all submissions from today
        const submissions = await Submission.find({
            createdAt: { $gte: today, $lt: tomorrow }
        }).populate('testId');
        
        console.log(`📊 Found ${submissions.length} submissions to fix\n`);
        
        let totalSubmissionsProcessed = 0;
        let totalSubmissionsUpdated = 0;
        let totalAnswersFixed = 0;
        let validationErrors = 0;
        
        // Cache for test data to avoid repeated database calls
        const testCache = new Map();
        
        for (const submission of submissions) {
            totalSubmissionsProcessed++;
            let submissionChanged = false;
            let answersFixedInThisSubmission = 0;
            
            // Get test data
            let testData;
            if (!submission.testId) {
                console.log(`⚠️ Submission ${submission._id} has no testId`);
                validationErrors++;
                continue;
            }
            
            const testId = submission.testId._id.toString();
            if (testCache.has(testId)) {
                testData = testCache.get(testId);
            } else {
                testData = await Test.findById(testId);
                if (!testData) {
                    console.log(`⚠️ Test ${testId} not found`);
                    validationErrors++;
                    continue;
                }
                testCache.set(testId, testData);
            }
            
            for (const answer of submission.answers) {
                // Check if we have originalQuestionNumber
                if (!answer.originalQuestionNumber) {
                    console.log(`⚠️ Answer has no originalQuestionNumber in submission ${submission._id}`);
                    validationErrors++;
                    continue;
                }
                
                // Find the correct question using originalQuestionNumber as array index
                const questionIndex = answer.originalQuestionNumber - 1; // Convert to 0-based index
                let correctQuestion;
                
                if (questionIndex >= 0 && questionIndex < testData.questions.length) {
                    correctQuestion = testData.questions[questionIndex];
                } else {
                    console.log(`⚠️ Question ${answer.originalQuestionNumber} not found in test ${testId} (index ${questionIndex}, total questions: ${testData.questions.length})`);
                    validationErrors++;
                    continue;
                }
                
                // Check if questionId needs to be fixed
                const correctQuestionId = correctQuestion._id.toString();
                const currentQuestionId = answer.questionId ? answer.questionId.toString() : null;
                
                if (currentQuestionId !== correctQuestionId) {
                    // Fix the questionId
                    answer.questionId = correctQuestion._id;
                    submissionChanged = true;
                    answersFixedInThisSubmission++;
                    totalAnswersFixed++;
                    
                    console.log(`✅ Fixed questionId for Q${answer.originalQuestionNumber} in submission ${submission._id}`);
                    console.log(`   Old ID: ${currentQuestionId || 'null'}`);
                    console.log(`   New ID: ${correctQuestionId}`);
                }
            }
            
            if (submissionChanged) {
                await submission.save();
                totalSubmissionsUpdated++;
                
                console.log(`📊 Updated submission ${submission._id}: ${answersFixedInThisSubmission} question IDs fixed`);
            }
            
            if (totalSubmissionsProcessed % 50 === 0) {
                console.log(`📊 Progress: ${totalSubmissionsProcessed}/${submissions.length} submissions processed...`);
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 QUESTION ID FIX RESULTS:');
        console.log(`📝 Total submissions processed: ${totalSubmissionsProcessed}`);
        console.log(`🔧 Submissions updated: ${totalSubmissionsUpdated}`);
        console.log(`✅ Total question IDs fixed: ${totalAnswersFixed}`);
        console.log(`⚠️ Validation errors: ${validationErrors}`);
        console.log('='.repeat(80));
        
        if (totalAnswersFixed > 0) {
            console.log('\n🎉 ORPHANED QUESTION IDs FIXED!');
            console.log('All answers now have correct questionId references');
            console.log('Future operations can use questionId directly for better performance');
        } else {
            console.log('\n✓ All question IDs are already correct');
        }
        
        // Now let's verify a few submissions to confirm the fix
        console.log('\n🔍 VERIFICATION - Checking a few fixed submissions...');
        const verificationSubmissions = await Submission.find({
            createdAt: { $gte: today, $lt: tomorrow }
        }).limit(3).populate('testId');
        
        for (const submission of verificationSubmissions) {
            console.log(`\n📝 Verifying submission ${submission._id}:`);
            
            if (!submission.testId) continue;
            
            const testData = await Test.findById(submission.testId._id);
            if (!testData) continue;
            
            let correctMappings = 0;
            let totalMappings = 0;
            
            for (const answer of submission.answers.slice(0, 5)) { // Check first 5 answers
                totalMappings++;
                
                if (!answer.originalQuestionNumber || !answer.questionId) continue;
                
                const questionIndex = answer.originalQuestionNumber - 1;
                const expectedQuestion = testData.questions[questionIndex];
                
                if (expectedQuestion && expectedQuestion._id.toString() === answer.questionId.toString()) {
                    correctMappings++;
                }
            }
            
            console.log(`   ✅ ${correctMappings}/${totalMappings} question ID mappings are correct`);
        }
        
    } catch (error) {
        console.error('Error fixing orphaned question IDs:', error);
    } finally {
        mongoose.connection.close();
    }
}

fixOrphanedQuestionIds();
