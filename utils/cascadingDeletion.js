const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const InternalMarks = require('../models/InternalMarks');

/**
 * Deletes all data associated with a student (cascading deletion)
 * @param {string} studentId - The ID of the student to delete associated data for
 * @param {mongoose.ClientSession} session - Optional MongoDB session for transaction
 * @returns {Object} Summary of deletion operations
 */
async function deleteStudentAssociatedData(studentId, session = null) {
  const deletionSummary = {
    submissionsDeleted: 0,
    internalMarksDeleted: 0
  };

  try {
    // Delete all submissions associated with this student
    const deletedSubmissions = await Submission.deleteMany(
      { userId: studentId },
      session ? { session } : {}
    );
    deletionSummary.submissionsDeleted = deletedSubmissions.deletedCount;

    // Delete all internal marks associated with this student
    const deletedInternalMarks = await InternalMarks.deleteMany(
      { studentId: studentId },
      session ? { session } : {}
    );
    deletionSummary.internalMarksDeleted = deletedInternalMarks.deletedCount;

    return deletionSummary;
  } catch (error) {
    console.error('Error deleting student associated data:', error);
    throw error;
  }
}

/**
 * Performs a complete cascading deletion of a student and all associated data
 * @param {string} studentId - The ID of the student to delete
 * @returns {Object} Complete deletion summary
 */
async function deleteStudentWithAssociatedData(studentId) {
  const Student = require('../models/Student');
  
  // Start a transaction for data consistency
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // First, check if student exists
    const student = await Student.findById(studentId);
    if (!student) {
      throw new Error('Student not found');
    }

    // Delete associated data
    const associatedDataSummary = await deleteStudentAssociatedData(studentId, session);

    // Finally delete the student
    const deletedStudent = await Student.findByIdAndDelete(studentId, { session });

    // Commit the transaction
    await session.commitTransaction();

    console.log(`Cascading deletion completed for student ${student.enrollmentNo}:`);
    console.log(`- Deleted ${associatedDataSummary.submissionsDeleted} submissions`);
    console.log(`- Deleted ${associatedDataSummary.internalMarksDeleted} internal marks records`);
    console.log(`- Deleted student record`);

    return {
      success: true,
      student: deletedStudent,
      ...associatedDataSummary
    };

  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    throw error;
  } finally {
    // End session
    session.endSession();
  }
}

module.exports = {
  deleteStudentAssociatedData,
  deleteStudentWithAssociatedData
};
