const express = require('express');
const { adminAuth } = require('../middleware/auth');
const DataCleanupUtility = require('../utils/dataCleanup');

const router = express.Router();

// Quick consistency check for dashboard
router.get('/quick-check', adminAuth, async (req, res) => {
  try {
    const consistencyCheck = await DataCleanupUtility.quickConsistencyCheck();
    
    res.json({
      success: true,
      ...consistencyCheck,
      lastChecked: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in quick consistency check:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform quick consistency check',
      error: error.message
    });
  }
});

// Get data consistency report
router.get('/consistency-report', adminAuth, async (req, res) => {
  try {
    console.log('Admin requested data consistency report');
    
    const orphanedRecords = await DataCleanupUtility.findOrphanedRecords();
    
    // Calculate totals
    const totals = {
      submissionsOrphaned: orphanedRecords.submissions.orphanedByStudent.length + 
                          orphanedRecords.submissions.orphanedByTest.length,
      internalMarksOrphaned: orphanedRecords.internalMarks.orphanedByStudent.length + 
                           orphanedRecords.internalMarks.orphanedByTest.length +
                           orphanedRecords.internalMarks.orphanedByCourse.length,
      testsOrphaned: orphanedRecords.tests.orphanedByCourse.length,
      studentsOrphaned: orphanedRecords.students.orphanedByCourse.length
    };
    
    const totalOrphaned = Object.values(totals).reduce((sum, count) => sum + count, 0);
    
    res.json({
      success: true,
      isConsistent: totalOrphaned === 0,
      totalOrphaned,
      orphanedRecords,
      totals,
      lastChecked: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating consistency report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate consistency report',
      error: error.message
    });
  }
});

// Cleanup orphaned records
router.post('/cleanup-orphaned', adminAuth, async (req, res) => {
  try {
    const { dryRun = true } = req.body;
    
    console.log(`Admin initiated cleanup (dryRun: ${dryRun})`);
    
    // First get the orphaned records
    const orphanedRecords = await DataCleanupUtility.findOrphanedRecords();
    
    // Calculate totals
    const totalOrphaned = Object.values(orphanedRecords).reduce((total, category) => {
      return total + Object.values(category).reduce((sum, records) => sum + records.length, 0);
    }, 0);
    
    if (totalOrphaned === 0) {
      return res.json({
        success: true,
        message: 'No orphaned records found. Database is already consistent!',
        cleanupSummary: {
          submissionsDeleted: 0,
          internalMarksDeleted: 0,
          testsDeleted: 0,
          studentsDeleted: 0
        },
        dryRun
      });
    }
    
    // Perform cleanup
    const cleanupSummary = await DataCleanupUtility.cleanupOrphanedRecords(orphanedRecords, { dryRun });
    
    res.json({
      success: true,
      message: dryRun ? 'Cleanup simulation completed' : 'Cleanup completed successfully',
      cleanupSummary,
      dryRun,
      totalOrphanedFound: totalOrphaned
    });

  } catch (error) {
    console.error('Error during cleanup operation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup orphaned records',
      error: error.message
    });
  }
});

// Full consistency check with optional auto-cleanup
router.post('/full-consistency-check', adminAuth, async (req, res) => {
  try {
    const { autoCleanup = false, dryRun = true } = req.body;
    
    console.log(`Admin initiated full consistency check (autoCleanup: ${autoCleanup}, dryRun: ${dryRun})`);
    
    const result = await DataCleanupUtility.performDataConsistencyCheck({
      dryRun,
      autoCleanup
    });
    
    // Calculate totals for response
    const totalOrphaned = Object.values(result.orphanedRecords).reduce((total, category) => {
      return total + Object.values(category).reduce((sum, records) => sum + records.length, 0);
    }, 0);
    
    res.json({
      success: true,
      message: 'Full consistency check completed',
      isConsistent: totalOrphaned === 0,
      totalOrphaned,
      orphanedRecords: result.orphanedRecords,
      cleanupSummary: result.cleanupSummary,
      autoCleanup,
      dryRun,
      lastChecked: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error during full consistency check:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform consistency check',
      error: error.message
    });
  }
});

module.exports = router;
