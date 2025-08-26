const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

// Connect to MongoDB
mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app');

async function checkTodaysSubmissionsForErrors() {
    try {
        console.log('🔍 CHECKING TODAY\'S SUBMISSIONS FOR ERRORS...\n');
        
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        console.log(`📅 Checking submissions from: ${today.toLocaleString()}`);
        console.log(`📅 To: ${tomorrow.toLocaleString()}\n`);
        
        // Get all today's submissions
        const totalSubmissions = await Submission.countDocuments({
            createdAt: { $gte: today, $lt: tomorrow }
        });
        
        console.log(`📊 Total submissions today: ${totalSubmissions}\n`);
        
        const batchSize = 50;
        const totalBatches = Math.ceil(totalSubmissions / batchSize);
        
        // Error tracking
        let errorSummary = {
            emptyAnswersArray: [],
            emptyShuffledToOriginal: [],
            nullIsCorrect: [],
            wrongCorrectionLogic: [],
            scoreLessThan30: [],
            allOriginalQuestionNumber1: [],
            totalErrorSubmissions: new Set()
        };
        
        for (let batch = 1; batch <= totalBatches; batch++) {
            console.log(`🔄 Processing batch ${batch}/${totalBatches} (submissions ${(batch-1)*batchSize + 1}-${Math.min(batch*batchSize, totalSubmissions)})...`);
            
            const submissions = await Submission.find({
                createdAt: { $gte: today, $lt: tomorrow }
            })
            .populate('testId')
            .skip((batch - 1) * batchSize)
            .limit(batchSize);
            
            for (const submission of submissions) {
                let hasErrors = false;
                let errors = [];
                
                // Error 1: Empty answers array
                if (!submission.answers || submission.answers.length === 0) {
                    errors.push('Empty answers array');
                    errorSummary.emptyAnswersArray.push({
                        id: submission._id,
                        enrollmentNo: submission.enrollmentNo,
                        createdAt: submission.createdAt,
                        score: submission.score || 0,
                        totalQuestions: submission.totalQuestions || 0
                    });
                    hasErrors = true;
                }
                
                if (submission.answers && submission.answers.length > 0) {
                    let emptyShuffledCount = 0;
                    let nullIsCorrectCount = 0;
                    let allQuestionNumber1 = true;
                    let wrongLogicCount = 0;
                    
                    for (const answer of submission.answers) {
                        // Error 2: Empty shuffledToOriginal
                        if (!answer.shuffledToOriginal || answer.shuffledToOriginal.length === 0) {
                            emptyShuffledCount++;
                        }
                        
                        // Error 3: isCorrect null
                        if (answer.isCorrect === null) {
                            nullIsCorrectCount++;
                        }
                        
                        // Error 6: Check if all originalQuestionNumber are 1
                        if (answer.originalQuestionNumber !== 1) {
                            allQuestionNumber1 = false;
                        }
                        
                        // Error 4: Wrong correction logic - check if selectedAnswer=0 is marked false when it should be true
                        if (answer.selectedAnswer === 0 && answer.isCorrect === false && submission.testId) {
                            // This needs test data to verify, so we'll flag as potential issue
                            wrongLogicCount++;
                        }
                    }
                    
                    // Error 2: Report if many answers have empty shuffledToOriginal
                    if (emptyShuffledCount > 0) {
                        errors.push(`${emptyShuffledCount} answers with empty shuffledToOriginal`);
                        errorSummary.emptyShuffledToOriginal.push({
                            id: submission._id,
                            enrollmentNo: submission.enrollmentNo,
                            createdAt: submission.createdAt,
                            emptyShuffledCount: emptyShuffledCount,
                            totalAnswers: submission.answers.length
                        });
                        hasErrors = true;
                    }
                    
                    // Error 3: Report if any answers have null isCorrect
                    if (nullIsCorrectCount > 0) {
                        errors.push(`${nullIsCorrectCount} answers with null isCorrect`);
                        errorSummary.nullIsCorrect.push({
                            id: submission._id,
                            enrollmentNo: submission.enrollmentNo,
                            createdAt: submission.createdAt,
                            nullCount: nullIsCorrectCount,
                            totalAnswers: submission.answers.length
                        });
                        hasErrors = true;
                    }
                    
                    // Error 4: Report potential wrong logic
                    if (wrongLogicCount > 5) { // Only report if significant number
                        errors.push(`${wrongLogicCount} potential wrong correction logic (selectedAnswer=0 marked false)`);
                        errorSummary.wrongCorrectionLogic.push({
                            id: submission._id,
                            enrollmentNo: submission.enrollmentNo,
                            createdAt: submission.createdAt,
                            potentialWrongCount: wrongLogicCount,
                            totalAnswers: submission.answers.length
                        });
                        hasErrors = true;
                    }
                    
                    // Error 6: All originalQuestionNumber are 1
                    if (allQuestionNumber1 && submission.answers.length > 1) {
                        errors.push('All originalQuestionNumber marked as 1');
                        errorSummary.allOriginalQuestionNumber1.push({
                            id: submission._id,
                            enrollmentNo: submission.enrollmentNo,
                            createdAt: submission.createdAt,
                            totalAnswers: submission.answers.length
                        });
                        hasErrors = true;
                    }
                }
                
                // Error 5: Score less than 30
                const score = submission.score || 0;
                if (score < 30 && submission.answers && submission.answers.length >= 30) {
                    errors.push(`Low score: ${score}`);
                    errorSummary.scoreLessThan30.push({
                        id: submission._id,
                        enrollmentNo: submission.enrollmentNo,
                        createdAt: submission.createdAt,
                        score: score,
                        totalQuestions: submission.totalQuestions || submission.answers.length,
                        percentage: ((score / (submission.totalQuestions || submission.answers.length)) * 100).toFixed(1)
                    });
                    hasErrors = true;
                }
                
                if (hasErrors) {
                    errorSummary.totalErrorSubmissions.add(submission._id.toString());
                    console.log(`❌ ERRORS in ${submission._id.toString().substring(0, 12)}... (${submission.enrollmentNo || 'Unknown'}):`);
                    errors.forEach(error => console.log(`   - ${error}`));
                }
            }
            
            console.log(`📈 Batch ${batch} complete. Processed ${submissions.length} submissions\n`);
        }
        
        // Final summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 ERROR ANALYSIS SUMMARY:');
        console.log('='.repeat(80));
        
        console.log(`📋 Total submissions checked: ${totalSubmissions}`);
        console.log(`🚨 Submissions with errors: ${errorSummary.totalErrorSubmissions.size}`);
        console.log(`✅ Clean submissions: ${totalSubmissions - errorSummary.totalErrorSubmissions.size}\n`);
        
        // Detailed error breakdown
        console.log('📋 ERROR BREAKDOWN:');
        console.log(`1. Empty answers array: ${errorSummary.emptyAnswersArray.length} submissions`);
        console.log(`2. Empty shuffledToOriginal: ${errorSummary.emptyShuffledToOriginal.length} submissions`);
        console.log(`3. Null isCorrect values: ${errorSummary.nullIsCorrect.length} submissions`);
        console.log(`4. Potential wrong correction logic: ${errorSummary.wrongCorrectionLogic.length} submissions`);
        console.log(`5. Score less than 30: ${errorSummary.scoreLessThan30.length} submissions`);
        console.log(`6. All originalQuestionNumber = 1: ${errorSummary.allOriginalQuestionNumber1.length} submissions\n`);
        
        // Show details for each error type
        if (errorSummary.emptyAnswersArray.length > 0) {
            console.log('🚨 EMPTY ANSWERS ARRAY DETAILS:');
            errorSummary.emptyAnswersArray.slice(0, 10).forEach((sub, i) => {
                console.log(`${i+1}. ${sub.id.toString().substring(0, 12)}... - ${sub.enrollmentNo} - Score: ${sub.score}/${sub.totalQuestions}`);
            });
            if (errorSummary.emptyAnswersArray.length > 10) {
                console.log(`... and ${errorSummary.emptyAnswersArray.length - 10} more\n`);
            } else {
                console.log('');
            }
        }
        
        if (errorSummary.nullIsCorrect.length > 0) {
            console.log('🚨 NULL isCorrect DETAILS:');
            errorSummary.nullIsCorrect.slice(0, 10).forEach((sub, i) => {
                console.log(`${i+1}. ${sub.id.toString().substring(0, 12)}... - ${sub.enrollmentNo} - ${sub.nullCount}/${sub.totalAnswers} null isCorrect`);
            });
            if (errorSummary.nullIsCorrect.length > 10) {
                console.log(`... and ${errorSummary.nullIsCorrect.length - 10} more\n`);
            } else {
                console.log('');
            }
        }
        
        if (errorSummary.scoreLessThan30.length > 0) {
            console.log('🚨 LOW SCORE (<30) DETAILS:');
            errorSummary.scoreLessThan30.slice(0, 10).forEach((sub, i) => {
                console.log(`${i+1}. ${sub.id.toString().substring(0, 12)}... - ${sub.enrollmentNo} - Score: ${sub.score}/${sub.totalQuestions} (${sub.percentage}%)`);
            });
            if (errorSummary.scoreLessThan30.length > 10) {
                console.log(`... and ${errorSummary.scoreLessThan30.length - 10} more\n`);
            } else {
                console.log('');
            }
        }
        
        if (errorSummary.allOriginalQuestionNumber1.length > 0) {
            console.log('🚨 ALL originalQuestionNumber = 1 DETAILS:');
            errorSummary.allOriginalQuestionNumber1.slice(0, 10).forEach((sub, i) => {
                console.log(`${i+1}. ${sub.id.toString().substring(0, 12)}... - ${sub.enrollmentNo} - ${sub.totalAnswers} answers all marked as Q1`);
            });
            if (errorSummary.allOriginalQuestionNumber1.length > 10) {
                console.log(`... and ${errorSummary.allOriginalQuestionNumber1.length - 10} more\n`);
            } else {
                console.log('');
            }
        }
        
        if (errorSummary.emptyShuffledToOriginal.length > 0) {
            console.log('🚨 EMPTY shuffledToOriginal DETAILS:');
            errorSummary.emptyShuffledToOriginal.slice(0, 10).forEach((sub, i) => {
                console.log(`${i+1}. ${sub.id.toString().substring(0, 12)}... - ${sub.enrollmentNo} - ${sub.emptyShuffledCount}/${sub.totalAnswers} empty shuffledToOriginal`);
            });
            if (errorSummary.emptyShuffledToOriginal.length > 10) {
                console.log(`... and ${errorSummary.emptyShuffledToOriginal.length - 10} more\n`);
            } else {
                console.log('');
            }
        }
        
        if (errorSummary.wrongCorrectionLogic.length > 0) {
            console.log('🚨 POTENTIAL WRONG CORRECTION LOGIC DETAILS:');
            errorSummary.wrongCorrectionLogic.slice(0, 10).forEach((sub, i) => {
                console.log(`${i+1}. ${sub.id.toString().substring(0, 12)}... - ${sub.enrollmentNo} - ${sub.potentialWrongCount}/${sub.totalAnswers} potential issues`);
            });
            if (errorSummary.wrongCorrectionLogic.length > 10) {
                console.log(`... and ${errorSummary.wrongCorrectionLogic.length - 10} more\n`);
            } else {
                console.log('');
            }
        }
        
        console.log('\n🔍 Use the submission IDs above to investigate specific issues further.');
        
    } catch (error) {
        console.error('Error checking submissions:', error);
    } finally {
        mongoose.connection.close();
    }
}

checkTodaysSubmissionsForErrors();
