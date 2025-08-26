const mongoose = require('mongoose');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

// Connect to MongoDB
mongoose.connect('mongodb+srv://dinkeshjain:d1d2d3d4d5@cluster0.dan1xhv.mongodb.net/online-test-app');

async function diagnoseSubmissionIssues() {
    try {
        console.log('🔍 DIAGNOSING SUBMISSION DATA INTEGRITY ISSUES...\n');
        
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Find all submissions from today
        const submissions = await Submission.find({
            createdAt: { $gte: today, $lt: tomorrow }
        }).populate('testId');
        
        console.log(`📊 Analyzing ${submissions.length} submissions from today...\n`);
        
        let issueCount = 0;
        const issueCategories = {
            emptyAnswers: [],
            nullIsCorrect: [],
            emptyShuffledToOriginal: [],
            nullStartedAt: [],
            wrongOriginalQuestionNumber: [],
            multipleIssues: []
        };
        
        for (const submission of submissions) {
            const issues = [];
            let hasIssues = false;
            
            // Issue 1: Empty answers array
            if (!submission.answers || submission.answers.length === 0) {
                issues.push('EMPTY_ANSWERS');
                issueCategories.emptyAnswers.push(submission);
                hasIssues = true;
            }
            
            // Issue 2: isCorrect is null in answers
            if (submission.answers && submission.answers.length > 0) {
                const nullIsCorrectCount = submission.answers.filter(a => a.isCorrect === null || a.isCorrect === undefined).length;
                if (nullIsCorrectCount > 0) {
                    issues.push(`NULL_ISCORRECT (${nullIsCorrectCount}/${submission.answers.length})`);
                    issueCategories.nullIsCorrect.push({
                        submission,
                        nullCount: nullIsCorrectCount,
                        totalAnswers: submission.answers.length
                    });
                    hasIssues = true;
                }
            }
            
            // Issue 3: Empty shuffledToOriginal arrays
            if (submission.answers && submission.answers.length > 0) {
                const emptyShuffledCount = submission.answers.filter(a => 
                    !a.shuffledToOriginal || a.shuffledToOriginal.length === 0
                ).length;
                if (emptyShuffledCount > 0) {
                    issues.push(`EMPTY_SHUFFLED (${emptyShuffledCount}/${submission.answers.length})`);
                    issueCategories.emptyShuffledToOriginal.push({
                        submission,
                        emptyCount: emptyShuffledCount,
                        totalAnswers: submission.answers.length
                    });
                    hasIssues = true;
                }
            }
            
            // Issue 4: startedAt is null
            if (!submission.startedAt) {
                issues.push('NULL_STARTED_AT');
                issueCategories.nullStartedAt.push(submission);
                hasIssues = true;
            }
            
            // Issue 5: originalQuestionNumber is 1 for all questions
            if (submission.answers && submission.answers.length > 1) {
                const uniqueQuestionNumbers = [...new Set(submission.answers.map(a => a.originalQuestionNumber))];
                if (uniqueQuestionNumbers.length === 1 && uniqueQuestionNumbers[0] === 1) {
                    issues.push('WRONG_QUESTION_NUMBERS');
                    issueCategories.wrongOriginalQuestionNumber.push(submission);
                    hasIssues = true;
                }
            }
            
            if (hasIssues) {
                issueCount++;
                
                console.log(`❌ SUBMISSION ${submission._id}:`);
                console.log(`   👤 Student: ${submission.enrollmentNo || 'Unknown'}`);
                console.log(`   🧪 Test: ${submission.testId?.title || 'Unknown'}`);
                console.log(`   📅 Created: ${submission.createdAt.toISOString()}`);
                console.log(`   📊 Score: ${submission.score}/${submission.answers?.length || 0}`);
                console.log(`   🚨 Issues: ${issues.join(', ')}`);
                
                // Additional diagnostic info
                console.log(`   📋 Detailed Analysis:`);
                console.log(`      - Answers array length: ${submission.answers?.length || 0}`);
                console.log(`      - Started at: ${submission.startedAt || 'NULL'}`);
                console.log(`      - Submitted at: ${submission.submittedAt || 'NULL'}`);
                console.log(`      - Is final: ${submission.isFinal || false}`);
                console.log(`      - Auto save count: ${submission.autoSaveCount || 0}`);
                
                if (submission.answers && submission.answers.length > 0) {
                    // Sample first few answers
                    console.log(`      - Sample answers (first 3):`);
                    submission.answers.slice(0, 3).forEach((answer, index) => {
                        console.log(`        ${index + 1}. originalQ: ${answer.originalQuestionNumber}, selectedAnswer: ${answer.selectedAnswer}, isCorrect: ${answer.isCorrect}, shuffled: [${answer.shuffledToOriginal?.join(',') || 'empty'}]`);
                    });
                }
                
                if (issues.length > 1) {
                    issueCategories.multipleIssues.push({
                        submission,
                        issues: issues
                    });
                }
                
                console.log('   ' + '-'.repeat(60));
            }
        }
        
        // Summary statistics
        console.log('\n' + '='.repeat(80));
        console.log('📊 DIAGNOSTIC SUMMARY:');
        console.log(`📝 Total submissions analyzed: ${submissions.length}`);
        console.log(`❌ Submissions with issues: ${issueCount}`);
        console.log(`✅ Clean submissions: ${submissions.length - issueCount}`);
        console.log(`📈 Issue rate: ${((issueCount / submissions.length) * 100).toFixed(1)}%`);
        console.log('='.repeat(80));
        
        // Detailed breakdown
        console.log('\n📋 ISSUE BREAKDOWN:');
        console.log(`1. 📭 Empty answers array: ${issueCategories.emptyAnswers.length} submissions`);
        console.log(`2. ❓ Null isCorrect values: ${issueCategories.nullIsCorrect.length} submissions`);
        console.log(`3. 🔀 Empty shuffledToOriginal: ${issueCategories.emptyShuffledToOriginal.length} submissions`);
        console.log(`4. ⏰ Null startedAt: ${issueCategories.nullStartedAt.length} submissions`);
        console.log(`5. 🔢 Wrong originalQuestionNumber: ${issueCategories.wrongOriginalQuestionNumber.length} submissions`);
        console.log(`6. 🔥 Multiple issues: ${issueCategories.multipleIssues.length} submissions`);
        
        // Pattern analysis
        console.log('\n🔍 PATTERN ANALYSIS:');
        
        // Time pattern analysis
        const issuesByHour = {};
        issueCategories.emptyAnswers.concat(
            issueCategories.nullIsCorrect.map(i => i.submission),
            issueCategories.emptyShuffledToOriginal.map(i => i.submission),
            issueCategories.nullStartedAt,
            issueCategories.wrongOriginalQuestionNumber
        ).forEach(submission => {
            const hour = submission.createdAt.getHours();
            issuesByHour[hour] = (issuesByHour[hour] || 0) + 1;
        });
        
        console.log('📅 Issues by hour:');
        Object.keys(issuesByHour).sort().forEach(hour => {
            console.log(`   ${hour}:00 - ${parseInt(hour) + 1}:00: ${issuesByHour[hour]} issues`);
        });
        
        // Test-specific analysis
        const issuesByTest = {};
        submissions.filter(s => {
            return !s.answers || s.answers.length === 0 || 
                   s.answers.some(a => a.isCorrect === null) ||
                   s.answers.some(a => !a.shuffledToOriginal) ||
                   !s.startedAt;
        }).forEach(submission => {
            const testTitle = submission.testId?.title || 'Unknown';
            issuesByTest[testTitle] = (issuesByTest[testTitle] || 0) + 1;
        });
        
        console.log('\n🧪 Issues by test:');
        Object.entries(issuesByTest).forEach(([test, count]) => {
            console.log(`   ${test}: ${count} problematic submissions`);
        });
        
        // Recommendations
        console.log('\n💡 POTENTIAL ROOT CAUSES:');
        console.log('1. 🔄 Race conditions in auto-save vs submission creation');
        console.log('2. 🌐 Network interruptions during critical operations');
        console.log('3. 📱 Browser crashes during test initialization');
        console.log('4. 🔧 Frontend-backend data synchronization issues');
        console.log('5. ⚡ Server errors during submission processing');
        console.log('6. 👥 Multiple tab/window instances of the same test');
        
        console.log('\n🔧 RECOMMENDED ACTIONS:');
        console.log('1. Add stricter validation in submission routes');
        console.log('2. Implement transaction-based submission creation');
        console.log('3. Add defensive checks for required fields');
        console.log('4. Improve error handling in auto-save process');
        console.log('5. Add data consistency validation before final submission');
        
    } catch (error) {
        console.error('Error during diagnosis:', error);
    } finally {
        mongoose.connection.close();
    }
}

diagnoseSubmissionIssues();
