const fs = require('fs');
const path = require('path');

// Scripts to KEEP (essential/useful for future maintenance)
const ESSENTIAL_SCRIPTS = [
    'index.js',                          // Main server file
    'test-maintenance.js',               // Original maintenance script
    'check-todays-errors.js',            // Comprehensive error analysis
    'fix-orphaned-question-ids.js',     // Useful for future maintenance
    'verify-question-ids.js',            // Verification tool
    'verify-and-fix-scores.js',          // Score consistency checker
    'update-scores-after-corrections.js' // Score recalculation utility
];

// All scripts to REMOVE (temporary/debugging scripts)
const SCRIPTS_TO_REMOVE = [
    'add-missing-iscorrect.js',
    'analyze-18k-shuffling-fixes.js',
    'analyze-completed-submissions.js',
    'analyze-orphaned-questions.js',
    'analyze-submission-error.js',
    'analyze-wrong-logic.js',
    'assess-damage.js',
    'bulk-delete-student-submissions.js',
    'check-all-submissions.js',
    'check-available-tests.js',
    'check-empty-answers.js',
    'check-enrollment-submissions.js',
    'check-orphaned-questions.js',
    'check-question-numbers.js',
    'check-remaining-null-isCorrect.js',
    'check-remaining-null.js',
    'check-specific-students.js',
    'check-student-submissions-today.js',
    'check-students-exist.js',
    'check-submissions.js',
    'cleanup-scripts.js',
    'comprehensive-cleanup.js',
    'current-empty-answers.js',
    'debug-question-matching.js',
    'debug-recovery-issue.js',
    'deep-investigation.js',
    'delete-student-submission-completely.js',
    'delete-submission-completely.js',
    'demonstrate-empty-detection.js',
    'detailed-analysis.js',
    'detailed-iscorrect-check.js',
    'detailed-shuffling-analysis.js',
    'detailed-submission-check.js',
    'diagnose-originalQuestionNumber.js',
    'diagnose-question-ids.js',
    'diagnose-submission-issues.js',
    'emergency-recovery.js',
    'emergency-revert-fix.js',
    'empty-array-analysis.js',
    'evidence-examples.js',
    'find-actual-empty.js',
    'find-incorrect-shuffling.js',
    'fix-isCorrect-by-number.js',
    'fix-iscorrect-comprehensive.js',
    'fix-isCorrect-field.js',
    'fix-iscorrect-fields.js',
    'fix-null-isCorrect-with-shuffling.js',
    'fix-originalQuestionNumber-advanced.js',
    'fix-originalQuestionNumber.js',
    'fix-orphaned-originalQuestionNumbers.js',
    'fix-specific-student-issues.js',
    'fix-specific-submission.js',
    'fix-todays-submissions.js',
    'fix-wrong-correction-logic.js',
    'fix-wrongly-marked-false.js',
    'handle-orphaned-questions.js',
    'historical-analysis.js',
    'HOT-FIX-NULL-ANSWERS.js',
    'investigate-orphaned-questions.js',
    'investigate-selected-answer.js',
    'monitor-issues.js',
    'monitor-submission-creation.js',
    'null-analysis.js',
    'proper-fix-wrong-logic.js',
    'SAFE-BACKEND-HOTFIX.js',
    'smart-fix-isCorrect.js',
    'solution-clear-storage.js',
    'submission-summary.js',
    'validation-example.js',
    'verify-low-scores.js',
    'verify-score-correctness.js'
];

async function cleanupUnnecessaryScripts() {
    console.log('🧹 CLEANING UP UNNECESSARY SCRIPTS...\n');
    
    const serverDir = __dirname;
    let removedCount = 0;
    let keptCount = 0;
    let errorCount = 0;
    
    console.log('📋 ESSENTIAL SCRIPTS (keeping):');
    ESSENTIAL_SCRIPTS.forEach(script => {
        const filePath = path.join(serverDir, script);
        if (fs.existsSync(filePath)) {
            console.log(`✅ Keeping: ${script}`);
            keptCount++;
        } else {
            console.log(`⚠️ Essential script not found: ${script}`);
        }
    });
    
    console.log('\n🗑️ REMOVING TEMPORARY SCRIPTS:');
    
    for (const script of SCRIPTS_TO_REMOVE) {
        const filePath = path.join(serverDir, script);
        
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`❌ Removed: ${script}`);
                removedCount++;
            } catch (error) {
                console.log(`❗ Error removing ${script}: ${error.message}`);
                errorCount++;
            }
        } else {
            console.log(`⚪ Not found: ${script}`);
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 CLEANUP SUMMARY:');
    console.log(`✅ Essential scripts kept: ${keptCount}`);
    console.log(`❌ Temporary scripts removed: ${removedCount}`);
    console.log(`❗ Errors encountered: ${errorCount}`);
    console.log('='.repeat(80));
    
    if (removedCount > 0) {
        console.log('\n🎉 CLEANUP COMPLETED!');
        console.log('📁 Server directory is now clean and organized');
        console.log('🔧 Only essential and useful scripts remain');
        
        console.log('\n📋 REMAINING ESSENTIAL SCRIPTS:');
        console.log('• index.js - Main server application');
        console.log('• test-maintenance.js - System maintenance utilities');
        console.log('• check-todays-errors.js - Comprehensive error analysis');
        console.log('• fix-orphaned-question-ids.js - Question ID repair utility');
        console.log('• verify-question-ids.js - Question ID verification');
        console.log('• verify-and-fix-scores.js - Score consistency checker');
        console.log('• update-scores-after-corrections.js - Score recalculation');
    } else {
        console.log('\n✅ No cleanup needed - all specified scripts already removed');
    }
    
    // Show current directory contents
    console.log('\n📁 CURRENT SERVER DIRECTORY:');
    const files = fs.readdirSync(serverDir).filter(file => file.endsWith('.js'));
    files.sort().forEach(file => {
        console.log(`📄 ${file}`);
    });
}

cleanupUnnecessaryScripts();
