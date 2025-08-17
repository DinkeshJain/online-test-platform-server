
const express = require('express');
const Course = require('../models/Course');
const { adminAuth } = require('../middleware/auth');
const DataCleanupUtility = require('../utils/dataCleanup');

const router = express.Router();

// Make results private for a course (undo release)
router.post('/:courseId/make-results-private', adminAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    course.resultsReleased = false;
    course.resultsReleasedAt = null;
    await course.save();
    res.json({ message: 'Results have been made private for this course.' });
  } catch (error) {
    console.error('Error making results private:', error);
    res.status(500).json({ message: 'Failed to make results private.' });
  }
});

// Get all courses
router.get('/', async (req, res) => {
  try {
    const courses = await Course.find({ isActive: { $ne: false } })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    console.log('Courses found:', courses.length);
    console.log('Courses data:', courses);

    res.json({ courses });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Server error while fetching courses' });
  }
});

// Test endpoint to get all courses without auth
router.get('/test/all', async (req, res) => {
  try {
    const allCourses = await Course.find({});
    console.log('All courses in database:', allCourses);
    res.json({
      message: 'All courses in database',
      total: allCourses.length,
      courses: allCourses
    });
  } catch (error) {
    console.error('Error fetching all courses:', error);
    res.status(500).json({ message: 'Server error while fetching courses' });
  }
});

// Get single course by ID
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('createdBy', 'name');

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json({ course });
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ message: 'Server error while fetching course' });
  }
});

// Create new course
router.post('/', adminAuth, async (req, res) => {
  try {
    const { courseName, courseCode, description, duration, subjects } = req.body;

    // Validate required fields
    if (!courseName || !courseCode || !duration) {
      return res.status(400).json({
        message: 'Course name, course code, and duration are required'
      });
    }

    // Check if course already exists
    const existingCourse = await Course.findOne({
      $or: [
        { courseName: courseName },
        { courseCode: courseCode.toUpperCase() }
      ]
    });

    if (existingCourse) {
      return res.status(400).json({
        message: 'Course with this name or code already exists'
      });
    }

    // Validate subjects if provided
    if (subjects && subjects.length > 0) {
      for (const subject of subjects) {
        if (!subject.subjectCode || !subject.subjectName) {
          return res.status(400).json({
            message: 'All subjects must have both subject code and subject name'
          });
        }
        // Set default hasExternalExam if not provided
        if (subject.hasExternalExam === undefined) {
          subject.hasExternalExam = true;
        }
      }

      // Check for duplicate subject codes within the course
      const subjectCodes = subjects.map(s => s.subjectCode.toUpperCase());
      const uniqueSubjectCodes = [...new Set(subjectCodes)];
      if (subjectCodes.length !== uniqueSubjectCodes.length) {
        return res.status(400).json({
          message: 'Duplicate subject codes are not allowed within a course'
        });
      }
    }

    // Create new course
    const course = new Course({
      courseName,
      courseCode: courseCode.toUpperCase(),
      description,
      duration,
      subjects: subjects || [],
      createdBy: req.user._id
    });

    await course.save();
    await course.populate('createdBy', 'name');

    res.status(201).json({
      message: 'Course created successfully',
      course
    });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ message: 'Server error while creating course' });
  }
});

// Update course
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { courseName, courseCode, description, duration, subjects } = req.body;

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if updated name/code conflicts with other courses
    if (courseName !== course.courseName || courseCode !== course.courseCode) {
      const existingCourse = await Course.findOne({
        _id: { $ne: req.params.id },
        $or: [
          { courseName: courseName },
          { courseCode: courseCode.toUpperCase() }
        ]
      });

      if (existingCourse) {
        return res.status(400).json({
          message: 'Course with this name or code already exists'
        });
      }
    }

    // Validate subjects if provided
    if (subjects && subjects.length > 0) {
      for (const subject of subjects) {
        if (!subject.subjectCode || !subject.subjectName) {
          return res.status(400).json({
            message: 'All subjects must have both subject code and subject name'
          });
        }
        // Ensure hasExternalExam is properly set (default to true if not specified)
        if (subject.hasExternalExam === undefined) {
          subject.hasExternalExam = true;
        }
      }

      // Check for duplicate subject codes within the course
      const subjectCodes = subjects.map(s => s.subjectCode.toUpperCase());
      const uniqueSubjectCodes = [...new Set(subjectCodes)];
      if (subjectCodes.length !== uniqueSubjectCodes.length) {
        return res.status(400).json({
          message: 'Duplicate subject codes are not allowed within a course'
        });
      }
    }

    // Update course
    course.courseName = courseName || course.courseName;
    course.courseCode = courseCode ? courseCode.toUpperCase() : course.courseCode;
    course.description = description !== undefined ? description : course.description;
    course.duration = duration || course.duration;
    course.subjects = subjects !== undefined ? subjects : course.subjects;

    await course.save();
    await course.populate('createdBy', 'name');

    res.json({
      message: 'Course updated successfully',
      course
    });
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ message: 'Server error while updating course' });
  }
});

// Delete course (soft delete with cascading)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Import required models for cascading deletion
    const Test = require('../models/Test');
    const Submission = require('../models/Submission');
    const InternalMarks = require('../models/InternalMarks');
    const Student = require('../models/Student');
    const mongoose = require('mongoose');

    // Start a transaction for data consistency
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get all tests for this course to delete their related data
      const courseTests = await Test.find({ course: req.params.id }, null, { session });
      const testIds = courseTests.map(test => test._id);

      // Delete all submissions for tests in this course
      const deletedSubmissions = await Submission.deleteMany(
        { testId: { $in: testIds } },
        { session }
      );

      // Delete all internal marks for this course
      const deletedInternalMarks = await InternalMarks.deleteMany(
        { courseId: req.params.id },
        { session }
      );

      // Delete all tests for this course
      const deletedTests = await Test.deleteMany(
        { course: req.params.id },
        { session }
      );

      // Soft delete students in this course (deactivate them)
      const deactivatedStudents = await Student.updateMany(
        { course: req.params.id },
        { isActive: false },
        { session }
      );

      // Soft delete the course
      course.isActive = false;
      await course.save({ session });

      // Commit the transaction
      await session.commitTransaction();

      // Perform auto-cleanup to ensure data consistency
      const autoCleanupSummary = await DataCleanupUtility.autoCleanupAfterDeletion();

      res.json({
        message: 'Course and all associated data deleted successfully',
        deletionSummary: {
          course: course,
          submissionsDeleted: deletedSubmissions.deletedCount,
          internalMarksDeleted: deletedInternalMarks.deletedCount,
          testsDeleted: deletedTests.deletedCount,
          studentsDeactivated: deactivatedStudents.modifiedCount
        },
        autoCleanup: autoCleanupSummary
      });

    } catch (transactionError) {
      // Rollback transaction on error
      await session.abortTransaction();
      throw transactionError;
    } finally {
      // End session
      session.endSession();
    }

  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ message: 'Server error while deleting course' });
  }
});

// Add subject to course
router.post('/:id/subjects', adminAuth, async (req, res) => {
  try {
    const { subjectCode, subjectName } = req.body;

    if (!subjectCode || !subjectName) {
      return res.status(400).json({
        message: 'Subject code and subject name are required'
      });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if subject code already exists in this course
    const existingSubject = course.subjects.find(
      subject => subject.subjectCode.toUpperCase() === subjectCode.toUpperCase()
    );

    if (existingSubject) {
      return res.status(400).json({
        message: 'Subject with this code already exists in the course'
      });
    }

    // Add new subject
    course.subjects.push({
      subjectCode: subjectCode.toUpperCase(),
      subjectName
    });

    await course.save();
    await course.populate('createdBy', 'name');

    res.json({
      message: 'Subject added successfully',
      course
    });
  } catch (error) {
    console.error('Error adding subject:', error);
    res.status(500).json({ message: 'Server error while adding subject' });
  }
});

// Remove subject from course (with cascading deletion)
router.delete('/:id/subjects/:subjectId', adminAuth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Find the subject being deleted
    const subjectToDelete = course.subjects.find(
      subject => subject._id.toString() === req.params.subjectId
    );

    if (!subjectToDelete) {
      return res.status(404).json({ message: 'Subject not found in course' });
    }

    // Import required models for cascading deletion
    const Test = require('../models/Test');
    const Submission = require('../models/Submission');
    const InternalMarks = require('../models/InternalMarks');
    const mongoose = require('mongoose');

    // Start a transaction for data consistency
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get all tests for this subject to delete their related data
      const subjectTests = await Test.find({
        course: req.params.id,
        'subject.subjectCode': subjectToDelete.subjectCode
      }, null, { session });
      const testIds = subjectTests.map(test => test._id);

      // Delete all submissions for tests in this subject
      const deletedSubmissions = await Submission.deleteMany(
        { testId: { $in: testIds } },
        { session }
      );

      // Delete all internal marks for this subject
      const deletedInternalMarks = await InternalMarks.deleteMany(
        {
          courseId: req.params.id,
          subjectCode: subjectToDelete.subjectCode
        },
        { session }
      );

      // Delete all tests for this subject
      const deletedTests = await Test.deleteMany(
        {
          course: req.params.id,
          'subject.subjectCode': subjectToDelete.subjectCode
        },
        { session }
      );

      // Remove subject from course
      course.subjects = course.subjects.filter(
        subject => subject._id.toString() !== req.params.subjectId
      );

      await course.save({ session });
      await course.populate('createdBy', 'name');

      // Commit the transaction
      await session.commitTransaction();

      // Perform auto-cleanup to ensure data consistency
      const autoCleanupSummary = await DataCleanupUtility.autoCleanupAfterDeletion();

      res.json({
        message: 'Subject and all associated data removed successfully',
        course,
        deletionSummary: {
          subject: subjectToDelete,
          submissionsDeleted: deletedSubmissions.deletedCount,
          internalMarksDeleted: deletedInternalMarks.deletedCount,
          testsDeleted: deletedTests.deletedCount
        },
        autoCleanup: autoCleanupSummary
      });

    } catch (transactionError) {
      // Rollback transaction on error
      await session.abortTransaction();
      throw transactionError;
    } finally {
      // End session
      session.endSession();
    }

  } catch (error) {
    console.error('Error removing subject:', error);
    res.status(500).json({ message: 'Server error while removing subject' });
  }
});

module.exports = router;
