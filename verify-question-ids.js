const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

// Connect to MongoDB
mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app');

async function verifyQuestionIdMappings() {
    try {
        console.log('🔍 VERIFYING QUESTION ID MAPPINGS FOR INFORMATION RETRIEVAL...\n');
        
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Get a few submissions to test
        const testSubmissions = await Submission.find({
            createdAt: { $gte: today, $lt: tomorrow }
        }).limit(5).populate('testId');
        
        console.log(`📊 Testing ${testSubmissions.length} submissions for question ID accuracy...\n`);
        
        let totalTests = 0;
        let passedTests = 0;
        let failedTests = 0;
        
        for (const submission of testSubmissions) {
            if (!submission.testId) continue;
            
            console.log(`🧪 Testing submission ${submission._id}:`);
            console.log(`📝 Student: ${submission.enrollmentNo || 'Unknown'}`);
            console.log(`🎯 Test: ${submission.testId.title || 'Unknown'}`);
            
            const testData = await Test.findById(submission.testId._id);
            if (!testData) {
                console.log('❌ Test data not found\n');
                continue;
            }
            
            // Test first 10 answers in this submission
            for (let i = 0; i < Math.min(10, submission.answers.length); i++) {
                const answer = submission.answers[i];
                totalTests++;
                
                console.log(`\n  📋 Testing Answer ${i + 1}:`);
                console.log(`     originalQuestionNumber: ${answer.originalQuestionNumber}`);
                console.log(`     questionId: ${answer.questionId}`);
                
                // METHOD 1: Retrieve using questionId directly
                let questionViaId = null;
                if (answer.questionId) {
                    questionViaId = testData.questions.find(q => 
                        q._id.toString() === answer.questionId.toString()
                    );
                }
                
                // METHOD 2: Retrieve using originalQuestionNumber as array index
                let questionViaIndex = null;
                if (answer.originalQuestionNumber) {
                    const questionIndex = answer.originalQuestionNumber - 1;
                    if (questionIndex >= 0 && questionIndex < testData.questions.length) {
                        questionViaIndex = testData.questions[questionIndex];
                    }
                }
                
                // VERIFICATION: Both methods should return the same question
                const bothMethodsWork = questionViaId && questionViaIndex && 
                    questionViaId._id.toString() === questionViaIndex._id.toString();
                
                if (bothMethodsWork) {
                    passedTests++;
                    console.log(`     ✅ PASS: Both methods return same question`);
                    console.log(`     📄 Question: "${questionViaId.question.substring(0, 50)}..."`);
                    console.log(`     ✅ Correct answer: ${questionViaId.correctAnswer}`);
                    
                    // Test information retrieval
                    console.log(`     📊 Selected answer: ${answer.selectedAnswer}`);
                    console.log(`     📊 Is correct: ${answer.isCorrect}`);
                    
                    // Verify grading logic using questionId method
                    let expectedCorrect = false;
                    if (answer.shuffledToOriginal && answer.shuffledToOriginal.length > 0) {
                        const originalAnswerIndex = answer.shuffledToOriginal[answer.selectedAnswer];
                        expectedCorrect = questionViaId.correctAnswer === originalAnswerIndex;
                    } else {
                        expectedCorrect = questionViaId.correctAnswer === answer.selectedAnswer;
                    }
                    
                    if (expectedCorrect === answer.isCorrect) {
                        console.log(`     ✅ Grading is correct using questionId method`);
                    } else {
                        console.log(`     ⚠️ Grading mismatch: expected ${expectedCorrect}, got ${answer.isCorrect}`);
                    }
                    
                } else {
                    failedTests++;
                    console.log(`     ❌ FAIL: Methods return different results`);
                    
                    if (questionViaId) {
                        console.log(`     📄 Via questionId: "${questionViaId.question.substring(0, 30)}..."`);
                    } else {
                        console.log(`     ❌ Via questionId: Not found`);
                    }
                    
                    if (questionViaIndex) {
                        console.log(`     📄 Via index: "${questionViaIndex.question.substring(0, 30)}..."`);
                    } else {
                        console.log(`     ❌ Via index: Not found`);
                    }
                }
            }
            
            console.log('\n' + '-'.repeat(60));
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 VERIFICATION RESULTS:');
        console.log(`🧪 Total tests: ${totalTests}`);
        console.log(`✅ Passed tests: ${passedTests}`);
        console.log(`❌ Failed tests: ${failedTests}`);
        console.log(`📈 Success rate: ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0}%`);
        console.log('='.repeat(80));
        
        if (passedTests === totalTests) {
            console.log('\n🎉 PERFECT! All question IDs are working correctly!');
            console.log('✅ You can now use questionId for direct information retrieval');
            console.log('✅ Both questionId and originalQuestionNumber methods work consistently');
        } else if (passedTests > failedTests) {
            console.log('\n⚠️ MOSTLY WORKING: Most question IDs are correct');
            console.log(`🔧 ${failedTests} question IDs still need fixing`);
        } else {
            console.log('\n❌ NEEDS WORK: Many question IDs are still orphaned');
            console.log('🔧 Run the fix-orphaned-question-ids.js script first');
        }
        
        // Demonstrate practical usage
        if (passedTests > 0) {
            console.log('\n💡 PRACTICAL USAGE EXAMPLE:');
            console.log('Now you can retrieve question info like this:');
            console.log('```javascript');
            console.log('// Get question using questionId directly');
            console.log('const question = testData.questions.find(q => ');
            console.log('    q._id.toString() === answer.questionId.toString()');
            console.log(');');
            console.log('console.log(question.question);');
            console.log('console.log(question.correctAnswer);');
            console.log('```');
        }
        
    } catch (error) {
        console.error('Error verifying question ID mappings:', error);
    } finally {
        mongoose.connection.close();
    }
}

verifyQuestionIdMappings();
