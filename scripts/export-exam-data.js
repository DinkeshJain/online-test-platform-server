#!/usr/bin/env node

/**
 * Export Exam Data to Excel Script
 * 
 * This script exports detailed exam data for a specific course, subject, and test type
 * to an Excel file format similar to the Reports.jsx component.
 * 
 * Usage: node export-exam-data.js
 * The script will prompt for: courseCode, subjectCode, testType
 */

const readline = require('readline');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const path = require('path');

// Import models
const Course = require('../models/Course');
const Student = require('../models/Student');
const InternalMarks = require('../models/InternalMarks');
const Submission = require('../models/Submission');
const Test = require('../models/Test');

// Database connection
const connectDB = async () => {
  try {
    // Try to load environment config
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
    
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/online-test-platform';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Helper function to create readline interface
const createReadlineInterface = () => {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
};

// Helper function to prompt user input
const askQuestion = (rl, question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
};

// Helper function to format time in minutes and seconds
const formatTimeSpent = (timeInSeconds, testDurationMinutes, testStartTime, testEndTime) => {
  if (!timeInSeconds || timeInSeconds === 0) return '-';

  let actualTimeSpent = timeInSeconds;

  // Fallback calculation if timeSpent is 0 but we have timestamps
  if (timeInSeconds === 0 && testStartTime && testEndTime) {
    const startTime = new Date(testStartTime);
    const endTime = new Date(testEndTime);
    const calculatedTime = Math.floor((endTime - startTime) / 1000);
    if (calculatedTime > 0) {
      actualTimeSpent = calculatedTime;
    }
  }

  actualTimeSpent = Math.max(0, actualTimeSpent);
  const minutes = Math.floor(actualTimeSpent / 60);
  const seconds = actualTimeSpent % 60;

  return minutes > 0 ? `${minutes} mins ${seconds} secs` : `${seconds} secs`;
};

// Helper function to calculate grade and points
const calculateGradeAndPoints = (totalMarks, externalMarks, maxExternalMarks, isAbsent = false) => {
  if (isAbsent) {
    return { gradePoints: 0, grade: 'W' };
  }

  // Check if student failed due to insufficient external marks (less than 35%)
  const externalPercentage = (externalMarks / 70) * 100;
  const hasMinimumExternal = externalPercentage >= 35;

  if (!hasMinimumExternal) {
    return { gradePoints: '-', grade: 'F' };
  }

  // Calculate grade based on total marks
  if (totalMarks >= 90) return { gradePoints: 10, grade: 'O' };
  if (totalMarks >= 80) return { gradePoints: 9, grade: 'A' };
  if (totalMarks >= 70) return { gradePoints: 8, grade: 'B' };
  if (totalMarks >= 60) return { gradePoints: 7, grade: 'C' };
  if (totalMarks >= 50) return { gradePoints: 6, grade: 'D' };
  if (totalMarks >= 40) return { gradePoints: 5, grade: 'E' };
  return { gradePoints: '-', grade: 'F' };
};

// Function to fetch course by course code
const getCourseByCode = async (courseCode) => {
  try {
    const course = await Course.findOne({ 
      courseCode: { $regex: new RegExp(`^${courseCode}$`, 'i') },
      isActive: true 
    });
    return course;
  } catch (error) {
    console.error('Error fetching course:', error);
    return null;
  }
};

// Function to fetch report data (similar to Reports.jsx)
const fetchReportData = async (courseId, subjectCode, examType) => {
  try {
    const course = await Course.findById(courseId);
    if (!course) throw new Error('Course not found');

    // Get tests for this course and subject
    let testQuery = {
      course: course.courseCode,
      'subject.subjectCode': { $regex: new RegExp(`^${subjectCode}$`, 'i') }
    };
    if (examType && examType !== 'all') {
      testQuery.testType = examType;
    }

    const tests = await Test.find(testQuery).sort({ createdAt: 1 });
    if (tests.length === 0) {
      throw new Error('No tests found for the specified criteria');
    }

    const testIds = tests.map(test => test._id);

    // Get submissions for these tests
    const submissions = await Submission.find({
      testId: { $in: testIds },
      isDraft: false,
      isCompleted: true
    });

    // Get students for this course
    const students = await Student.find({
      course: course.courseCode
    }).select('enrollmentNo fullName emailId fatherName _id');

    // Create student lookup map
    const studentMap = new Map();
    students.forEach(student => {
      studentMap.set(student._id.toString(), student);
    });

    // Group submissions by student
    const submissionsByStudent = new Map();
    submissions.forEach(submission => {
      const studentId = submission.userId.toString();
      if (!submissionsByStudent.has(studentId)) {
        submissionsByStudent.set(studentId, []);
      }
      submissionsByStudent.get(studentId).push(submission);
    });

    const studentResults = [];

    // Process each student
    for (const student of students) {
      const studentId = student._id.toString();
      const studentSubmissions = submissionsByStudent.get(studentId) || [];
      const testResults = [];

      for (const test of tests) {
        // Find submission for this test
        const submission = studentSubmissions.find(
          sub => sub.testId.toString() === test._id.toString()
        );

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
          course: course.courseCode,
          fatherName: student.fatherName
        },
        testResults: testResults
      });
    }

    return {
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
      studentResults: studentResults
    };
  } catch (error) {
    throw error;
  }
};

// Function to export data to Excel (similar to Reports.jsx)
const exportToExcel = (report, testType) => {
  const testsToInclude = testType === 'all' ? report.tests : 
    report.tests.filter(test => test.testType === testType);

  if (testsToInclude.length === 0) {
    throw new Error(`No ${testType === 'demo' ? 'demo' : testType === 'official' ? 'official' : ''} tests found for this subject.`);
  }

  const maxQuestions = Math.max(...testsToInclude.map(test => test.totalQuestions), 0);

  // Build headers based on export type
  let baseHeaders;
  if (testType === 'demo') {
    baseHeaders = [
      'Enrollment Number',
      'Full Name',
      'State (Finished or Not)',
      'Time Taken (mins:secs)',
      'External Marks/70.00'
    ];
  } else {
    baseHeaders = [
      'Enrollment Number',
      'Full Name',
      'Student Email Address',
      'State (Finished or Not)',
      'Test Started On',
      'Test Completed On',
      'Time Taken (mins:secs)',
      'Grade Points',
      'Grade',
      'Total Marks',
      'Internal Marks',
      'External Marks/70.00'
    ];
  }

  const questionHeaders = [];
  for (let i = 1; i <= maxQuestions; i++) {
    questionHeaders.push(`Q${i}`);
  }

  const headers = [...baseHeaders, ...questionHeaders];
  const rows = [headers];

  report.studentResults.forEach(studentResult => {
    testsToInclude.forEach(test => {
      const testResult = studentResult.testResults.find(tr => tr.test._id.toString() === test._id.toString());

      const fullQuestionNumbers = Array.from({ length: maxQuestions }, (_, i) => i + 1);
      const answerMap = {};

      if (testResult && testResult.result.answers && Array.isArray(testResult.result.answers)) {
        testResult.result.answers.forEach(answer => {
          answerMap[answer.originalQuestionNumber] = answer.isCorrect ? '1.00' : '0.00';
        });
      }

      const questionStatuses = fullQuestionNumbers.map(qNum =>
        answerMap.hasOwnProperty(qNum) ? answerMap[qNum] : '-'
      );

      if (testResult && testResult.result.status === 'attempted') {
        const testStartedOn = testResult.result.testStartedOn
          ? new Date(testResult.result.testStartedOn).toLocaleString('en-IN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
          }) : '-';

        const testCompletedOn = testResult.result.submittedAt
          ? new Date(testResult.result.submittedAt).toLocaleString('en-IN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
          }) : '-';

        const gradeOutOfTotal = testResult.result.score;
        const internalMarks = testResult.result.internalMarks ? testResult.result.internalMarks.marks : 0;
        const totalMarks = (gradeOutOfTotal || 0) + (internalMarks || 0);
        const { gradePoints, grade } = calculateGradeAndPoints(totalMarks, gradeOutOfTotal, maxQuestions);

        let row;
        if (testType === 'demo') {
          row = [
            studentResult.student.enrollmentNo,
            studentResult.student.fullName,
            'Finished',
            formatTimeSpent(testResult.result.timeSpent, testResult.test.duration,
              testResult.result.testStartedOn, testResult.result.submittedAt),
            gradeOutOfTotal,
            ...questionStatuses.map(status => status === '-' ? '-' : parseFloat(status))
          ];
        } else {
          row = [
            studentResult.student.enrollmentNo,
            studentResult.student.fullName,
            studentResult.student.emailId || '-',
            'Finished',
            testStartedOn,
            testCompletedOn,
            formatTimeSpent(testResult.result.timeSpent, testResult.test.duration,
              testResult.result.testStartedOn, testResult.result.submittedAt),
            gradePoints,
            grade,
            totalMarks,
            testResult.result.internalMarks ? testResult.result.internalMarks.marks : '',
            gradeOutOfTotal,
            ...questionStatuses.map(status => status === '-' ? '-' : parseFloat(status))
          ];
        }
        rows.push(row);

      } else if (testResult) {
        // Absent students
        const questionStatuses = new Array(maxQuestions).fill('-');
        const { gradePoints, grade } = calculateGradeAndPoints(0, 0, maxQuestions, true);

        let row;
        if (testType === 'demo') {
          row = [
            studentResult.student.enrollmentNo,
            studentResult.student.fullName,
            'Absent',
            '-',
            0,
            ...questionStatuses
          ];
        } else {
          row = [
            studentResult.student.enrollmentNo,
            studentResult.student.fullName,
            studentResult.student.emailId || '-',
            'Absent',
            '-', '-', '-',
            gradePoints, grade, 0, '', 0,
            ...questionStatuses
          ];
        }
        rows.push(row);
      }
    });
  });

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  const colWidths = [];
  for (let col = 0; col < headers.length; col++) {
    let maxWidth = 10;
    if (headers[col]) {
      maxWidth = Math.max(maxWidth, headers[col].length);
    }
    for (let row = 1; row < rows.length; row++) {
      if (rows[row][col]) {
        const cellValue = String(rows[row][col]);
        maxWidth = Math.max(maxWidth, cellValue.length);
      }
    }
    colWidths.push({ width: Math.min(Math.max(maxWidth + 2, 12), 50) });
  }
  worksheet['!cols'] = colWidths;

  // Header styling
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { bgColor: { rgb: "366092" } },
    alignment: { horizontal: "center", vertical: "center" }
  };

  for (let col = 0; col < headers.length; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!worksheet[cellRef]) worksheet[cellRef] = {};
    worksheet[cellRef].s = headerStyle;
  }

  // Grade styling (only for non-demo exports)
  if (testType !== 'demo') {
    const failStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFFF0000' }, bgColor: { rgb: 'FFFF0000' } },
      font: { color: { rgb: 'FFFFFFFF' }, bold: true }
    };
    const absentStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFFF8000' }, bgColor: { rgb: 'FFFF8000' } },
      font: { color: { rgb: 'FFFFFFFF' }, bold: true }
    };

    const gradePointsCol = 7;
    const gradeCol = 8;

    for (let row = 1; row < rows.length; row++) {
      const gradeValue = rows[row][gradeCol];
      const style = gradeValue === 'F' ? failStyle : gradeValue === 'W' ? absentStyle : null;

      if (style) {
        [gradePointsCol, gradeCol].forEach(col => {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
          if (!worksheet[cellRef]) {
            worksheet[cellRef] = { v: rows[row][col], t: 's' };
          }
          worksheet[cellRef].s = style;
        });
      }
    }
  }

  // Generate filename and sheet name
  let fileName;
  if (testType === 'demo') {
    fileName = `(Demo)_${report.course.courseCode}_${report.subject.subjectCode}_detailed_report.xlsx`;
  } else if (testType === 'official') {
    fileName = `${report.course.courseCode}_${report.subject.subjectCode}_detailed_report.xlsx`;
  } else {
    fileName = `${report.course.courseCode}_${report.subject.subjectCode}_combined_report.xlsx`;
  }

  const sheetName = testType === 'demo' ? 'Demo Report' :
    testType === 'official' ? 'Official Report' :
      `${report.subject.subjectCode} Report`;

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Get the script's directory and create output path
  const outputPath = path.join(__dirname, '..', 'exports', fileName);
  
  // Ensure exports directory exists
  const fs = require('fs');
  const exportsDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }
  
  XLSX.writeFile(workbook, outputPath);
  
  return { fileName, outputPath, totalRecords: rows.length - 1 };
};

// Main function
const main = async () => {
  console.log('🚀 Exam Data Export Script');
  console.log('==========================\n');

  const rl = createReadlineInterface();

  try {
    // Connect to database
    await connectDB();

    // Get user inputs
    console.log('Please provide the following information:\n');
    
    const courseCode = await askQuestion(rl, '📚 Enter Course Code (e.g., BCA): ');
    if (!courseCode) {
      console.log('❌ Course code is required');
      process.exit(1);
    }

    const subjectCode = await askQuestion(rl, '📖 Enter Subject Code (e.g., MATH101): ');
    if (!subjectCode) {
      console.log('❌ Subject code is required');
      process.exit(1);
    }

    console.log('\n📝 Test Type Options:');
    console.log('  - demo: Demo/Practice tests only');
    console.log('  - official: Official tests only'); 
    console.log('  - all: All test types combined\n');
    
    const testType = await askQuestion(rl, '🎯 Enter Test Type (demo/official/all): ');
    if (!testType || !['demo', 'official', 'all'].includes(testType.toLowerCase())) {
      console.log('❌ Invalid test type. Please enter: demo, official, or all');
      process.exit(1);
    }

    rl.close();

    console.log('\n🔍 Searching for course...');
    const course = await getCourseByCode(courseCode);
    if (!course) {
      console.log(`❌ Course with code "${courseCode}" not found or inactive`);
      process.exit(1);
    }

    console.log(`✅ Found course: ${course.courseName} (${course.courseCode})`);
    console.log('\n📊 Fetching report data...');
    
    const reportData = await fetchReportData(course._id, subjectCode, testType.toLowerCase());
    
    console.log(`✅ Found ${reportData.tests.length} test(s) for subject: ${reportData.subject.subjectCode}`);
    console.log(`✅ Found ${reportData.studentResults.length} student(s)`);
    
    console.log('\n📁 Generating Excel file...');
    const result = await exportToExcel(reportData, testType.toLowerCase());
    
    console.log('\n🎉 Export completed successfully!');
    console.log('==================================');
    console.log(`📄 File: ${result.fileName}`);
    console.log(`📍 Path: ${result.outputPath}`);
    console.log(`📊 Records: ${result.totalRecords} student records`);
    console.log(`🎯 Test Type: ${testType}`);
    console.log(`📚 Course: ${reportData.course.courseName} (${reportData.course.courseCode})`);
    console.log(`📖 Subject: ${reportData.subject.subjectCode}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    rl.close();
    mongoose.connection.close();
  }
};

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n\n👋 Script terminated by user');
  mongoose.connection.close();
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main, exportToExcel, fetchReportData };
