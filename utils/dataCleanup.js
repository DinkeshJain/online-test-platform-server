const mongoose = require('mongoose');
const Student = require('../models/Student');
const Test = require('../models/Test');
const Course = require('../models/Course');
const Evaluator = require('../models/Evaluator');
const Submission = require('../models/Submission');
const InternalMarks = require('../models/InternalMarks');

class DataCleanupUtility {
  /**
   * Find and clean orphaned records (records that reference non-existent entities)
   */
  static async findOrphanedRecords() {
    const orphanedRecords = {
      submissions: {
        orphanedByStudent: [],
        orphanedByTest: []
      },
      internalMarks: {
        orphanedByStudent: [],
        orphanedByTest: [],
        orphanedByCourse: []
      },
      tests: {
        orphanedByCourse: []
      },
      students: {
        orphanedByCourse: []
      }
    };

    try {
      // Check for orphaned submissions
      const allSubmissions = await Submission.find().populate('userId testId');
      
      for (const submission of allSubmissions) {
        if (!submission.userId) {
          orphanedRecords.submissions.orphanedByStudent.push(submission);
        }
        if (!submission.testId) {
          orphanedRecords.submissions.orphanedByTest.push(submission);
        }
      }

      // Check for orphaned internal marks
      const allInternalMarks = await InternalMarks.find().populate('studentId testId courseId');
      
      for (const mark of allInternalMarks) {
        if (!mark.studentId) {
          orphanedRecords.internalMarks.orphanedByStudent.push(mark);
        }
        if (mark.testId && !mark.testId._id) {
          orphanedRecords.internalMarks.orphanedByTest.push(mark);
        }
        if (!mark.courseId) {
          orphanedRecords.internalMarks.orphanedByCourse.push(mark);
        }
      }

      // Check for orphaned tests
      const allTests = await Test.find().populate('course');
      
      for (const test of allTests) {
        if (!test.course) {
          orphanedRecords.tests.orphanedByCourse.push(test);
        }
      }

      // Check for orphaned students
      const allStudents = await Student.find().populate('course');
      
      for (const student of allStudents) {
        if (!student.course) {
          orphanedRecords.students.orphanedByCourse.push(student);
        }
      }

      return orphanedRecords;

    } catch (error) {
      throw error;
    }
  }

  /**
   * Clean up orphaned records
   */
  static async cleanupOrphanedRecords(orphanedRecords, options = { dryRun: true, silent: false }) {
    if (!options.silent) {
      console.log(`🧹 ${options.dryRun ? 'DRY RUN - ' : ''}Starting cleanup of orphaned records...`);
    }
    
    const cleanupSummary = {
      submissionsDeleted: 0,
      internalMarksDeleted: 0,
      testsDeleted: 0,
      studentsDeleted: 0
    };

    if (!options.dryRun) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Delete orphaned submissions
        const orphanedSubmissionIds = [
          ...orphanedRecords.submissions.orphanedByStudent.map(s => s._id),
          ...orphanedRecords.submissions.orphanedByTest.map(s => s._id)
        ];
        
        if (orphanedSubmissionIds.length > 0) {
          const deleteSubmissionsResult = await Submission.deleteMany(
            { _id: { $in: orphanedSubmissionIds } },
            { session }
          );
          cleanupSummary.submissionsDeleted = deleteSubmissionsResult.deletedCount;
        }

        // Delete orphaned internal marks
        const orphanedInternalMarkIds = [
          ...orphanedRecords.internalMarks.orphanedByStudent.map(m => m._id),
          ...orphanedRecords.internalMarks.orphanedByTest.map(m => m._id),
          ...orphanedRecords.internalMarks.orphanedByCourse.map(m => m._id)
        ];
        
        if (orphanedInternalMarkIds.length > 0) {
          const deleteInternalMarksResult = await InternalMarks.deleteMany(
            { _id: { $in: orphanedInternalMarkIds } },
            { session }
          );
          cleanupSummary.internalMarksDeleted = deleteInternalMarksResult.deletedCount;
        }

        // Delete orphaned tests
        if (orphanedRecords.tests.orphanedByCourse.length > 0) {
          const orphanedTestIds = orphanedRecords.tests.orphanedByCourse.map(t => t._id);
          const deleteTestsResult = await Test.deleteMany(
            { _id: { $in: orphanedTestIds } },
            { session }
          );
          cleanupSummary.testsDeleted = deleteTestsResult.deletedCount;
        }

        // Delete orphaned students
        if (orphanedRecords.students.orphanedByCourse.length > 0) {
          const orphanedStudentIds = orphanedRecords.students.orphanedByCourse.map(s => s._id);
          const deleteStudentsResult = await Student.deleteMany(
            { _id: { $in: orphanedStudentIds } },
            { session }
          );
          cleanupSummary.studentsDeleted = deleteStudentsResult.deletedCount;
        }

        await session.commitTransaction();
        if (!options.silent) {
          console.log('✅ Cleanup completed successfully');
        }

      } catch (error) {
        await session.abortTransaction();
        if (!options.silent) {
          console.error('❌ Cleanup failed, transaction rolled back:', error);
        }
        throw error;
      } finally {
        session.endSession();
      }
    } else {
      // Dry run - just count what would be deleted
      cleanupSummary.submissionsDeleted = orphanedRecords.submissions.orphanedByStudent.length + 
                                          orphanedRecords.submissions.orphanedByTest.length;
      cleanupSummary.internalMarksDeleted = orphanedRecords.internalMarks.orphanedByStudent.length + 
                                           orphanedRecords.internalMarks.orphanedByTest.length +
                                           orphanedRecords.internalMarks.orphanedByCourse.length;
      cleanupSummary.testsDeleted = orphanedRecords.tests.orphanedByCourse.length;
      cleanupSummary.studentsDeleted = orphanedRecords.students.orphanedByCourse.length;
      
      if (!options.silent) {
        console.log('📋 DRY RUN - No records were actually deleted');
      }
    }

    return cleanupSummary;
  }

  /**
   * Automatic cleanup function to be called after any deletion operation
   * This performs a quick cleanup without extensive logging
   */
  static async autoCleanupAfterDeletion() {
    try {
      const orphanedRecords = await this.findOrphanedRecords();
      
      // Calculate total orphaned records
      const totalOrphaned = Object.values(orphanedRecords).reduce((total, category) => {
        return total + Object.values(category).reduce((sum, records) => sum + records.length, 0);
      }, 0);
      
      if (totalOrphaned > 0) {
        const cleanupSummary = await this.cleanupOrphanedRecords(orphanedRecords, { dryRun: false, silent: true });
        return cleanupSummary;
      }
      
      return null;
    } catch (error) {
      // Silent fail - don't log errors to avoid breaking the main operation
      return null;
    }
  }

  /**
   * Quick consistency check for API responses
   * Returns summary of inconsistencies without detailed logging
   */
  static async quickConsistencyCheck() {
    try {
      const orphanedRecords = await this.findOrphanedRecords();
      
      const summary = {
        hasInconsistencies: false,
        totalOrphaned: 0,
        details: {
          orphanedSubmissions: orphanedRecords.submissions.orphanedByStudent.length + orphanedRecords.submissions.orphanedByTest.length,
          orphanedInternalMarks: orphanedRecords.internalMarks.orphanedByStudent.length + orphanedRecords.internalMarks.orphanedByTest.length + orphanedRecords.internalMarks.orphanedByCourse.length,
          orphanedTests: orphanedRecords.tests.orphanedByCourse.length,
          orphanedStudents: orphanedRecords.students.orphanedByCourse.length
        }
      };
      
      summary.totalOrphaned = Object.values(summary.details).reduce((sum, count) => sum + count, 0);
      summary.hasInconsistencies = summary.totalOrphaned > 0;
      
      return summary;
    } catch (error) {
      console.error('❌ Quick consistency check failed:', error);
      return {
        hasInconsistencies: true,
        totalOrphaned: -1,
        error: error.message,
        details: {}
      };
    }
  }

  /**
   * Perform full data consistency check and cleanup
   */
  static async performDataConsistencyCheck(options = { dryRun: true, autoCleanup: false }) {
    console.log('🔍 Starting comprehensive data consistency check...');
    
    try {
      // Find orphaned records
      const orphanedRecords = await this.findOrphanedRecords();
      
      // Print summary
      console.log('\n📊 ORPHANED RECORDS SUMMARY:');
      console.log('─'.repeat(50));
      console.log(`Submissions orphaned by deleted students: ${orphanedRecords.submissions.orphanedByStudent.length}`);
      console.log(`Submissions orphaned by deleted tests: ${orphanedRecords.submissions.orphanedByTest.length}`);
      console.log(`Internal marks orphaned by deleted students: ${orphanedRecords.internalMarks.orphanedByStudent.length}`);
      console.log(`Internal marks orphaned by deleted tests: ${orphanedRecords.internalMarks.orphanedByTest.length}`);
      console.log(`Internal marks orphaned by deleted courses: ${orphanedRecords.internalMarks.orphanedByCourse.length}`);
      console.log(`Tests orphaned by deleted courses: ${orphanedRecords.tests.orphanedByCourse.length}`);
      console.log(`Students orphaned by deleted courses: ${orphanedRecords.students.orphanedByCourse.length}`);
      
      const totalOrphaned = Object.values(orphanedRecords).reduce((total, category) => {
        return total + Object.values(category).reduce((sum, records) => sum + records.length, 0);
      }, 0);
      
      console.log(`\n📈 Total orphaned records found: ${totalOrphaned}`);
      
      if (totalOrphaned === 0) {
        console.log('✅ No orphaned records found. Database is consistent!');
        return { orphanedRecords, cleanupSummary: null };
      }
      
      // Auto cleanup if requested
      if (options.autoCleanup && totalOrphaned > 0) {
        console.log('\n🧹 Performing automatic cleanup...');
        const cleanupSummary = await this.cleanupOrphanedRecords(orphanedRecords, { dryRun: options.dryRun });
        
        console.log('\n📋 CLEANUP SUMMARY:');
        console.log('─'.repeat(50));
        console.log(`Submissions deleted: ${cleanupSummary.submissionsDeleted}`);
        console.log(`Internal marks deleted: ${cleanupSummary.internalMarksDeleted}`);
        console.log(`Tests deleted: ${cleanupSummary.testsDeleted}`);
        console.log(`Students deleted: ${cleanupSummary.studentsDeleted}`);
        
        return { orphanedRecords, cleanupSummary };
      }
      
      return { orphanedRecords, cleanupSummary: null };
      
    } catch (error) {
      console.error('❌ Data consistency check failed:', error);
      throw error;
    }
  }
}

module.exports = DataCleanupUtility;
