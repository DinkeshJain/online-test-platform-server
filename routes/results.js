const express = require('express');
const Course = require('../models/Course');
const Student = require('../models/Student');
const InternalMarks = require('../models/InternalMarks');
const Submission = require('../models/Submission');
const Test = require('../models/Test');

const router = express.Router();

// Get courses that have published results
router.get('/courses-with-results', async (req, res) => {
  try {
    // Find courses that have either internal marks or test submissions
    const coursesWithInternalMarks = await InternalMarks.distinct('course');
    const coursesWithTestResults = await Submission.distinct('testId').then(async (testIds) => {
      const tests = await Test.find({ _id: { $in: testIds } }).distinct('course');
      return tests;
    });
    
    const allCourseIds = [...new Set([...coursesWithInternalMarks, ...coursesWithTestResults])];
    
    const courses = await Course.find({ 
      _id: { $in: allCourseIds },
      isActive: true 
    }).select('courseCode courseName');
    
    res.json({ courses });
  } catch (error) {
    console.error('Error fetching courses with results:', error);
    res.status(500).json({ message: 'Server error while fetching courses' });
  }
});

// Search results by course and roll number
router.get('/search', async (req, res) => {
  try {
    const { courseId, rollNumber } = req.query;
    
    if (!courseId || !rollNumber) {
      return res.status(400).json({ message: 'Course ID and roll number are required' });
    }

    // Find course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Search students with partial roll number match
    const students = await Student.find({
      course: courseId,
      rollNumber: { $regex: rollNumber, $options: 'i' }
    }).select('name rollNumber course');

    if (students.length === 0) {
      return res.json({ results: [] });
    }

    const results = [];

    for (const student of students) {
      const result = {
        student: {
          name: student.name,
          rollNumber: student.rollNumber
        },
        course: {
          courseCode: course.courseCode,
          courseName: course.courseName
        },
        subjects: [],
        overall: null,
        publishedAt: new Date()
      };

      // Get internal marks for all subjects
      const internalMarks = await InternalMarks.find({
        student: student._id,
        course: courseId
      }).populate('subject', 'subjectCode subjectName hasExternalExam');

      // Get external marks from test submissions
      const submissions = await Submission.find({
        userId: student._id
      }).populate({
        path: 'testId',
        match: { course: courseId },
        select: 'subject questions'
      });

      // Process each subject
      const subjectMap = new Map();

      // Add internal marks
      for (const mark of internalMarks) {
        if (!mark.subject) continue;
        
        const subjectKey = mark.subject.subjectCode;
        if (!subjectMap.has(subjectKey)) {
          subjectMap.set(subjectKey, {
            subjectCode: mark.subject.subjectCode,
            subjectName: mark.subject.subjectName,
            hasExternalExam: mark.subject.hasExternalExam,
            internalMarks: null,
            externalMarks: null,
            internalMaxMarks: 30,
            externalMaxMarks: 70,
            totalMaxMarks: 100
          });
        }
        
        const subjectData = subjectMap.get(subjectKey);
        subjectData.internalMarks = mark.marks;
      }

      // Add external marks from submissions
      for (const submission of submissions) {
        if (!submission.testId || !submission.testId.subject) continue;
        
        const subjectKey = submission.testId.subject.subjectCode;
        if (!subjectMap.has(subjectKey)) {
          subjectMap.set(subjectKey, {
            subjectCode: submission.testId.subject.subjectCode,
            subjectName: submission.testId.subject.subjectName,
            hasExternalExam: true,
            internalMarks: null,
            externalMarks: null,
            internalMaxMarks: 30,
            externalMaxMarks: 70,
            totalMaxMarks: 100
          });
        }
        
        const subjectData = subjectMap.get(subjectKey);
        
        // Calculate external marks based on dynamic question allocation
        const totalQuestions = submission.testId.questions.length;
        let maxMarks = 70;
        
        if (totalQuestions < 70) {
          maxMarks = totalQuestions;
        }
        
        subjectData.externalMarks = submission.score;
        subjectData.externalMaxMarks = maxMarks;
        
        // Adjust total max marks if external exam has different max marks
        if (maxMarks !== 70) {
          subjectData.totalMaxMarks = subjectData.internalMaxMarks + maxMarks;
        }
      }

      // Calculate totals and percentages for each subject
      let overallTotal = 0;
      let overallMaxMarks = 0;

      for (const [subjectCode, subjectData] of subjectMap) {
        let totalMarks = 0;
        let hasMarks = false;

        if (subjectData.internalMarks !== null) {
          totalMarks += subjectData.internalMarks;
          hasMarks = true;
        }

        if (subjectData.externalMarks !== null) {
          totalMarks += subjectData.externalMarks;
          hasMarks = true;
        }

        if (hasMarks) {
          subjectData.totalMarks = totalMarks;
          subjectData.percentage = (totalMarks / subjectData.totalMaxMarks) * 100;
          
          overallTotal += totalMarks;
          overallMaxMarks += subjectData.totalMaxMarks;
          
          result.subjects.push(subjectData);
        }
      }

      // Calculate overall performance
      if (overallMaxMarks > 0) {
        result.overall = {
          totalMarks: overallTotal,
          maxMarks: overallMaxMarks,
          percentage: (overallTotal / overallMaxMarks) * 100
        };
      }

      // Only include students who have at least some results
      if (result.subjects.length > 0) {
        results.push(result);
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Error searching results:', error);
    res.status(500).json({ message: 'Server error while searching results' });
  }
});

// Get detailed result for a specific student
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const student = await Student.findById(studentId).populate('course');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Get all internal marks
    const internalMarks = await InternalMarks.find({
      student: studentId
    }).populate('subject', 'subjectCode subjectName hasExternalExam');

    // Get all test submissions
    const submissions = await Submission.find({
      userId: studentId
    }).populate({
      path: 'testId',
      select: 'subject questions duration'
    });

    const result = {
      student: {
        name: student.name,
        rollNumber: student.rollNumber,
        email: student.email
      },
      course: {
        courseCode: student.course.courseCode,
        courseName: student.course.courseName
      },
      subjects: [],
      tests: [],
      overall: null
    };

    // Process internal marks
    const subjectMap = new Map();
    for (const mark of internalMarks) {
      if (!mark.subject) continue;
      
      subjectMap.set(mark.subject.subjectCode, {
        subjectCode: mark.subject.subjectCode,
        subjectName: mark.subject.subjectName,
        hasExternalExam: mark.subject.hasExternalExam,
        internalMarks: mark.marks,
        externalMarks: null,
        internalMaxMarks: 30,
        externalMaxMarks: 70,
        totalMaxMarks: 100
      });
    }

    // Process test submissions
    for (const submission of submissions) {
      if (!submission.testId || !submission.testId.subject) continue;
      
      const subjectKey = submission.testId.subject.subjectCode;
      if (!subjectMap.has(subjectKey)) {
        subjectMap.set(subjectKey, {
          subjectCode: submission.testId.subject.subjectCode,
          subjectName: submission.testId.subject.subjectName,
          hasExternalExam: true,
          internalMarks: null,
          externalMarks: null,
          internalMaxMarks: 30,
          externalMaxMarks: 70,
          totalMaxMarks: 100
        });
      }
      
      const subjectData = subjectMap.get(subjectKey);
      
      // Calculate external marks with dynamic allocation
      const totalQuestions = submission.testId.questions.length;
      let maxMarks = 70;
      
      if (totalQuestions < 70) {
        maxMarks = totalQuestions;
      }
      
      subjectData.externalMarks = submission.score;
      subjectData.externalMaxMarks = maxMarks;
      
      if (maxMarks !== 70) {
        subjectData.totalMaxMarks = subjectData.internalMaxMarks + maxMarks;
      }

      // Add test details
      result.tests.push({
        subject: submission.testId.subject,
        score: submission.score,
        totalQuestions: submission.testId.questions.length,
        timeSpent: submission.timeSpent,
        submittedAt: submission.submittedAt
      });
    }

    // Calculate totals
    let overallTotal = 0;
    let overallMaxMarks = 0;

    for (const [subjectCode, subjectData] of subjectMap) {
      let totalMarks = 0;
      let hasMarks = false;

      if (subjectData.internalMarks !== null) {
        totalMarks += subjectData.internalMarks;
        hasMarks = true;
      }

      if (subjectData.externalMarks !== null) {
        totalMarks += subjectData.externalMarks;
        hasMarks = true;
      }

      if (hasMarks) {
        subjectData.totalMarks = totalMarks;
        subjectData.percentage = (totalMarks / subjectData.totalMaxMarks) * 100;
        
        overallTotal += totalMarks;
        overallMaxMarks += subjectData.totalMaxMarks;
        
        result.subjects.push(subjectData);
      }
    }

    if (overallMaxMarks > 0) {
      result.overall = {
        totalMarks: overallTotal,
        maxMarks: overallMaxMarks,
        percentage: (overallTotal / overallMaxMarks) * 100
      };
    }

    res.json({ result });
  } catch (error) {
    console.error('Error fetching student result:', error);
    res.status(500).json({ message: 'Server error while fetching student result' });
  }
});

module.exports = router;

