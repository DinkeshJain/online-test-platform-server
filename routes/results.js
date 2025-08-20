const express = require('express');
const Course = require('../models/Course');
const Student = require('../models/Student');
const InternalMarks = require('../models/InternalMarks');
const Submission = require('../models/Submission');
const Test = require('../models/Test');

const router = express.Router();

// Get courses that have published results (existing)
router.get('/courses-with-results', async (req, res) => {
  try {
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

// Get subjects for a specific course (new)
router.get('/course/:courseId/subjects', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const course = await Course.findById(courseId).populate('subjects', 'subjectCode subjectName');
    if (!course) return res.status(404).json({ message: 'Course not found' });

    res.json({ subjects: course.subjects || [] });
  } catch (error) {
    console.error('Failed to fetch subjects:', error);
    res.status(500).json({ message: 'Server error fetching subjects' });
  }
});

// Get detailed report for a course and subject (new)
router.get('/reports/:courseId/:subjectCode', async (req, res) => {
  try {
    const { courseId, subjectCode } = req.params;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Get tests for course and subject
    const tests = await Test.find({ course: courseId, 'subject.subjectCode': subjectCode }).sort({ createdAt: 1 });
    if (tests.length === 0) return res.status(404).json({ message: 'No tests found for subject' });

    // Get all students in the course
    const students = await Student.find({ course: course.courseCode }).sort({ enrollmentNo: 1 });

    const studentResults = [];

    for (const student of students) {
      const testResults = [];

      for (const test of tests) {
        // Find submission of test by the student
        const submission = await Submission.findOne({ userId: student._id, testId: test._id });

        // Get internal marks for student in this course and subject
        const internalMark = await InternalMarks.findOne({ studentId: student._id, courseId, subjectCode });

        const testResult = {
          test: {
            _id: test._id,
            title: test.displayTitle,
            totalQuestions: test.questions.length,
            duration: test.duration,
            testType: test.testType || 'official'
          },
          result: submission
            ? {
              status: 'attempted',
              score: submission.score,
              totalQuestions: submission.totalQuestions,
              percentage: Math.round((submission.score / submission.totalQuestions) * 100),
              submittedAt: submission.submittedAt,
              testStartedOn: submission.testStartedAt,
              timeSpent: submission.timeSpent,
              answers: submission.answers,
              internalMarks: internalMark
                ? {
                  marks: internalMark.internalMarks,
                  comments: internalMark.evaluatorComments,
                  evaluatedBy: internalMark.evaluatedBy,
                  evaluatedAt: internalMark.createdAt
                }
                : null
            }
            : {
              status: 'not_attempted',
              score: 0,
              totalQuestions: test.questions.length,
              percentage: 0,
              internalMarks: internalMark
                ? {
                  marks: internalMark.internalMarks,
                  comments: internalMark.evaluatorComments,
                  evaluatedBy: internalMark.evaluatedBy,
                  evaluatedAt: internalMark.createdAt
                }
                : null
            }
        };

        testResults.push(testResult);
      }

      studentResults.push({
        student: {
          _id: student._id,
          fullName: student.fullName,
          enrollmentNo: student.enrollmentNo,
          emailId: student.emailId,
          course: student.course,
          fatherName: student.fatherName
        },
        testResults
      });
    }

    res.json({
      report: {
        course: {
          _id: course._id,
          courseCode: course.courseCode,
          courseName: course.courseName
        },
        subject: {
          subjectCode,
          subjectName: tests[0]?.subject?.subjectName || ''
        },
        tests: tests.map(test => ({
          _id: test._id,
          title: test.displayTitle,
          totalQuestions: test.questions.length,
          duration: test.duration,
          testType: test.testType || 'official'
        })),
        studentResults
      }
    });
  } catch (error) {
    console.error('Failed to fetch report:', error);
    res.status(500).json({ message: 'Server error in fetching report' });
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
router.get('/:studentId', async (req, res) => {
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

// NEW: Get submission details with original question numbers for Reports
router.get('/submission-details/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findById(submissionId)
      .populate('testId', 'title questions')
      .populate('userId', 'fullName enrollmentNo');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Format the response with original question numbers
    const formattedSubmission = {
      _id: submission._id,
      student: {
        name: submission.userId.fullName,
        enrollmentNo: submission.userId.enrollmentNo
      },
      test: {
        title: submission.testId.title,
        totalQuestions: submission.testId.questions.length
      },
      answers: submission.answers.map(answer => ({
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer,
        isCorrect: answer.isCorrect,
        originalQuestionNumber: answer.originalQuestionNumber,
        shuffledPosition: answer.shuffledPosition
      })),
      score: submission.score,
      submittedAt: submission.submittedAt
    };

    res.json({ submission: formattedSubmission });

  } catch (error) {
    console.error('Error fetching submission details:', error);
    res.status(500).json({ message: 'Server error while fetching submission details' });
  }
});

// NEW: Update marks for specific questions based on original question numbers
router.put('/update-question-marks/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { questionMarks } = req.body; // Array of { originalQuestionNumber, marks }

    const submission = await Submission.findById(submissionId);

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Update marks for specific questions based on original question numbers
    let updatedScore = 0;
    questionMarks.forEach(update => {
      const answerIndex = submission.answers.findIndex(
        ans => ans.originalQuestionNumber === update.originalQuestionNumber
      );
      if (answerIndex !== -1) {
        // Update the isCorrect field based on marks (assuming 1 mark = correct, 0 = incorrect)
        submission.answers[answerIndex].isCorrect = update.marks > 0;
        if (update.marks > 0) {
          updatedScore++;
        }
      }
    });


    submission.score = updatedScore;
    await submission.save();

    res.json({
      message: 'Marks updated successfully',
      updatedScore,
      submissionId: submission._id
    });

  } catch (error) {
    console.error('Error updating question marks:', error);
    res.status(500).json({ message: 'Server error while updating marks' });
  }
});

// Get subjects for a specific course (needed for frontend dropdown)
router.get('/subjects-by-course/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;

    // Get subjects that have tests for this course
    const tests = await Test.find({ course: courseId }).distinct('subject.subjectCode');
    const subjects = [];

    for (const subjectCode of tests) {
      const testWithSubject = await Test.findOne({
        course: courseId,
        'subject.subjectCode': subjectCode
      }).select('subject');

      if (testWithSubject && testWithSubject.subject) {
        subjects.push({
          subjectCode: testWithSubject.subject.subjectCode,
          subjectName: testWithSubject.subject.subjectName
        });
      }
    }

    res.json({ subjects });
  } catch (error) {
    console.error('Failed to fetch subjects:', error);
    res.status(500).json({ message: 'Server error fetching subjects' });
  }
});

// Get detailed report for a specific course and subject (for Excel export)
router.get('/reports/:courseId/:subjectCode', async (req, res) => {
  try {
    const { courseId, subjectCode } = req.params;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Get tests for this course and subject
    const tests = await Test.find({
      course: courseId,
      'subject.subjectCode': subjectCode
    }).sort({ createdAt: 1 });

    if (tests.length === 0) {
      return res.status(404).json({ message: 'No tests found for subject' });
    }

    // Get students in this course
    const students = await Student.find({ course: course.courseCode })
      .sort({ enrollmentNo: 1 });

    const studentResults = [];

    for (const student of students) {
      const testResults = [];

      for (const test of tests) {
        // Find submission for this student and test
        const submission = await Submission.findOne({
          userId: student._id,
          testId: test._id
        });

        // Get internal marks
        const internalMark = await InternalMarks.findOne({
          studentId: student._id,
          courseId: courseId,
          subjectCode: subjectCode
        });

        const testResult = {
          test: {
            _id: test._id,
            title: test.displayTitle,
            totalQuestions: test.questions.length,
            duration: test.duration,
            testType: test.testType || 'official'
          },
          result: submission ? {
            status: 'attempted',
            score: submission.score,
            totalQuestions: submission.totalQuestions,
            percentage: Math.round((submission.score / submission.totalQuestions) * 100),
            submittedAt: submission.submittedAt,
            testStartedOn: submission.testStartedAt || submission.createdAt,
            timeSpent: submission.timeSpent,
            answers: submission.answers,
            submissionId: submission._id,
            internalMarks: internalMark ? {
              marks: internalMark.internalMarks,
              comments: internalMark.evaluatorComments,
              evaluatedBy: internalMark.evaluatedBy,
              evaluatedAt: internalMark.createdAt
            } : null
          } : {
            status: 'not_attempted',
            score: 0,
            totalQuestions: test.questions.length,
            percentage: 0,
            internalMarks: internalMark ? {
              marks: internalMark.internalMarks,
              comments: internalMark.evaluatorComments,
              evaluatedBy: internalMark.evaluatedBy,
              evaluatedAt: internalMark.createdAt
            } : null
          }
        };

        testResults.push(testResult);
      }

      studentResults.push({
        student: {
          _id: student._id,
          fullName: student.fullName,
          enrollmentNo: student.enrollmentNo,
          emailId: student.emailId,
          course: student.course,
          fatherName: student.fatherName
        },
        testResults: testResults
      });
    }

    res.json({
      report: {
        course: {
          _id: course._id,
          courseCode: course.courseCode,
          courseName: course.courseName
        },
        subject: {
          subjectCode: subjectCode,
          subjectName: tests[0]?.subject?.subjectName || ''
        },
        tests: tests.map(test => ({
          _id: test._id,
          title: test.displayTitle,
          totalQuestions: test.questions.length,
          duration: test.duration,
          testType: test.testType || 'official'
        })),
        studentResults: studentResults,
        statistics: {
          totalStudents: students.length,
          totalTests: tests.length,
          averageScore: studentResults.length > 0 ?
            studentResults.reduce((sum, sr) => {
              const totalScore = sr.testResults.reduce((testSum, tr) =>
                testSum + tr.result.score, 0);
              return sum + totalScore;
            }, 0) / (studentResults.length * tests.length) : 0
        }
      }
    });

  } catch (error) {
    console.error('Failed to fetch detailed report:', error);
    res.status(500).json({ message: 'Server error in fetching detailed report' });
  }
});

module.exports = router;

