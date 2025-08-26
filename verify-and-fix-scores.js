const mongoose = require('mongoose');
const Submission = require('./models/Submission');

// Connect to MongoDB
mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app');

async function verifyAndFixScores() {
    try {
        console.log('🔍 VERIFYING SCORE CONSISTENCY WITH isCorrect COUNT...\n');
        
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Find all submissions from today
        const submissions = await Submission.find({
            createdAt: { $gte: today, $lt: tomorrow }
        });
        
        console.log(`📊 Checking ${submissions.length} submissions for score consistency...\n`);
        
        let totalSubmissions = 0;
        let correctSubmissions = 0;
        let incorrectSubmissions = 0;
        let fixedSubmissions = 0;
        let totalScoreDiscrepancy = 0;
        
        const discrepancies = [];
        
        for (const submission of submissions) {
            totalSubmissions++;
            
            // Count isCorrect: true answers
            const correctAnswersCount = submission.answers.filter(answer => answer.isCorrect === true).length;
            const currentScore = submission.score;
            const totalQuestions = submission.answers.length;
            
            if (correctAnswersCount === currentScore) {
                correctSubmissions++;
                
                if (totalSubmissions <= 5) {
                    console.log(`✅ Submission ${submission._id}: Score ${currentScore}/${totalQuestions} matches correct answers`);
                }
            } else {
                incorrectSubmissions++;
                const discrepancy = correctAnswersCount - currentScore;
                totalScoreDiscrepancy += Math.abs(discrepancy);
                
                discrepancies.push({
                    submissionId: submission._id,
                    enrollmentNo: submission.enrollmentNo,
                    currentScore: currentScore,
                    correctCount: correctAnswersCount,
                    totalQuestions: totalQuestions,
                    discrepancy: discrepancy
                });
                
                console.log(`❌ MISMATCH - Submission ${submission._id}:`);
                console.log(`   Student: ${submission.enrollmentNo || 'Unknown'}`);
                console.log(`   Current Score: ${currentScore}/${totalQuestions}`);
                console.log(`   Correct Answers Count: ${correctAnswersCount}/${totalQuestions}`);
                console.log(`   Discrepancy: ${discrepancy > 0 ? '+' : ''}${discrepancy}`);
                
                // Fix the score
                submission.score = correctAnswersCount;
                await submission.save();
                fixedSubmissions++;
                
                console.log(`   ✅ FIXED: Updated score to ${correctAnswersCount}/${totalQuestions}\n`);
            }
            
            if (totalSubmissions % 100 === 0) {
                console.log(`📊 Progress: ${totalSubmissions}/${submissions.length} submissions checked...`);
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 SCORE VERIFICATION RESULTS:');
        console.log(`📝 Total submissions checked: ${totalSubmissions}`);
        console.log(`✅ Correct scores: ${correctSubmissions}`);
        console.log(`❌ Incorrect scores: ${incorrectSubmissions}`);
        console.log(`🔧 Fixed submissions: ${fixedSubmissions}`);
        console.log(`📈 Accuracy rate: ${((correctSubmissions / totalSubmissions) * 100).toFixed(1)}%`);
        console.log(`📊 Total score discrepancy: ${totalScoreDiscrepancy} points`);
        console.log('='.repeat(80));
        
        if (incorrectSubmissions > 0) {
            console.log('\n📋 DETAILED DISCREPANCY ANALYSIS:');
            
            // Group by discrepancy size
            const positiveDiscrepancies = discrepancies.filter(d => d.discrepancy > 0);
            const negativeDiscrepancies = discrepancies.filter(d => d.discrepancy < 0);
            
            if (positiveDiscrepancies.length > 0) {
                console.log(`\n📈 UNDER-SCORED (${positiveDiscrepancies.length} submissions):`);
                console.log('Students had MORE correct answers than their recorded score');
                positiveDiscrepancies.slice(0, 10).forEach(d => {
                    console.log(`   ${d.enrollmentNo || 'Unknown'}: ${d.currentScore} → ${d.correctCount} (+${d.discrepancy})`);
                });
                if (positiveDiscrepancies.length > 10) {
                    console.log(`   ... and ${positiveDiscrepancies.length - 10} more`);
                }
            }
            
            if (negativeDiscrepancies.length > 0) {
                console.log(`\n📉 OVER-SCORED (${negativeDiscrepancies.length} submissions):`);
                console.log('Students had FEWER correct answers than their recorded score');
                negativeDiscrepancies.slice(0, 10).forEach(d => {
                    console.log(`   ${d.enrollmentNo || 'Unknown'}: ${d.currentScore} → ${d.correctCount} (${d.discrepancy})`);
                });
                if (negativeDiscrepancies.length > 10) {
                    console.log(`   ... and ${negativeDiscrepancies.length - 10} more`);
                }
            }
            
            console.log(`\n🎉 ALL ${fixedSubmissions} SCORE MISMATCHES HAVE BEEN FIXED!`);
            console.log('All submission scores now accurately reflect the count of correct answers');
        } else {
            console.log('\n✅ PERFECT! All scores are already consistent with correct answer counts');
        }
        
        // Summary statistics
        if (discrepancies.length > 0) {
            const avgDiscrepancy = totalScoreDiscrepancy / discrepancies.length;
            const maxPositive = Math.max(...discrepancies.map(d => d.discrepancy));
            const maxNegative = Math.min(...discrepancies.map(d => d.discrepancy));
            
            console.log('\n📊 DISCREPANCY STATISTICS:');
            console.log(`📏 Average discrepancy: ${avgDiscrepancy.toFixed(1)} points`);
            console.log(`📈 Largest under-scoring: +${maxPositive} points`);
            console.log(`📉 Largest over-scoring: ${maxNegative} points`);
        }
        
        // Verification sample
        console.log('\n🔍 POST-FIX VERIFICATION (random sample):');
        const verificationSample = await Submission.find({
            createdAt: { $gte: today, $lt: tomorrow }
        }).limit(5);
        
        for (const submission of verificationSample) {
            const correctCount = submission.answers.filter(a => a.isCorrect === true).length;
            const match = correctCount === submission.score ? '✅' : '❌';
            console.log(`${match} ${submission.enrollmentNo || 'Unknown'}: Score ${submission.score}, Correct ${correctCount}`);
        }
        
    } catch (error) {
        console.error('Error verifying scores:', error);
    } finally {
        mongoose.connection.close();
    }
}

verifyAndFixScores();
