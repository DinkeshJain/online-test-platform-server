require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import models
const Student = require('./models/Student');
const Test = require('./models/Test');
const Submission = require('./models/Submission');
const Course = require('./models/Course');

// Helper function to format date for comparison
function formatDateForComparison(date) {
  const d = new Date(date);
  return d.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
}

// Helper function to validate date format
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// Helper function to get paper number from subject code
function getPaperNumber(subjectCode) {
  if (!subjectCode) return null;
  const match = subjectCode.match(/(\d+)$/);
  return match ? match[1] : null;
}

// Helper function to get course from subject code
function getCourseFromSubjectCode(subjectCode) {
  if (!subjectCode) return null;
  return subjectCode.replace(/\d+$/, '');
}

// Main function to check absentees for a given date
async function checkAbsentees(targetDate, paperFilter = null) {
  try {
    console.log(`🔍 Checking absentees for ${targetDate}${paperFilter ? ` (Paper ${paperFilter} only)` : ' (All papers)'}...\n`);
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Validate target date
    if (!isValidDate(targetDate)) {
      throw new Error('Invalid date format. Please use YYYY-MM-DD format (e.g., 2025-08-26)');
    }

    const startOfDay = new Date(`${targetDate}T00:00:00.000Z`);
    const endOfDay = new Date(`${targetDate}T23:59:59.999Z`);

    console.log(`📅 Target Date: ${targetDate}`);
    console.log(`🕐 Time Range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}\n`);

    // Find all tests conducted on the target date
    const testsOnDate = await Test.find({
      $or: [
        {
          createdAt: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        },
        {
          activeFrom: { $lte: endOfDay },
          activeTo: { $gte: startOfDay }
        }
      ]
    });

    console.log(`🎯 Found ${testsOnDate.length} total tests on ${targetDate}`);

    // Filter tests based on paper number if specified
    let filteredTests = testsOnDate;
    if (paperFilter) {
      filteredTests = testsOnDate.filter(test => {
        const paperNum = getPaperNumber(test.subject?.subjectCode);
        return paperNum === paperFilter.toString();
      });
      console.log(`📝 Paper ${paperFilter} tests found: ${filteredTests.length}`);
    }
    
    if (filteredTests.length === 0) {
      console.log(`❌ No tests found for ${targetDate}${paperFilter ? ` (Paper ${paperFilter})` : ''}`);
      return;
    }

    // Display tests
    console.log(`\n📋 Tests on ${targetDate}${paperFilter ? ` (Paper ${paperFilter})` : ''}:`);
    console.log('=' .repeat(80));
    filteredTests.forEach((test, index) => {
      const paperNum = getPaperNumber(test.subject?.subjectCode);
      console.log(`${index + 1}. ${test.subject?.subjectCode || 'No Code'}: ${test.subject?.subjectName || 'No Name'}`);
      console.log(`   Paper: ${paperNum || 'Unknown'}`);
      console.log(`   Questions: ${test.questions.length}`);
      console.log(`   Duration: ${test.duration} minutes`);
      console.log(`   Created: ${test.createdAt.toLocaleDateString()}`);
      if (test.activeFrom) {
        console.log(`   Active: ${test.activeFrom.toLocaleDateString()} to ${test.activeTo ? test.activeTo.toLocaleDateString() : 'ongoing'}`);
      }
      console.log('');
    });

    // Get test IDs for filtered tests
    const testIds = filteredTests.map(test => test._id);
    
    // Extract subject codes and corresponding courses
    const subjectCodes = filteredTests.map(test => test.subject?.subjectCode).filter(Boolean);
    const coursesFromTests = [...new Set(subjectCodes.map(code => getCourseFromSubjectCode(code)))];
    
    console.log(`🎓 Subject codes: ${subjectCodes.join(', ')}`);
    console.log(`🎓 Courses: ${coursesFromTests.join(', ')}\n`);

    // Find ALL submissions for these tests (regardless of date) to get course information
    const allSubmissionsForTests = await Submission.find({
      testId: { $in: testIds }
    }).populate('testId').populate('userId');

    console.log(`📊 Total submissions found for these tests (all time): ${allSubmissionsForTests.length}`);

    // Extract unique courses from submissions
    const coursesFromSubmissions = new Set();
    allSubmissionsForTests.forEach(submission => {
      if (submission.course) {
        coursesFromSubmissions.add(submission.course);
      }
    });

    const coursesArray = Array.from(coursesFromSubmissions);
    console.log(`📚 Courses found in submissions: ${coursesArray.join(', ')}\n`);

    // Find submissions specifically on the target date
    const submissionsOnDate = await Submission.find({
      testId: { $in: testIds },
      $or: [
        {
          submittedAt: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        },
        {
          testStartedAt: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        },
        {
          createdAt: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      ]
    }).populate('testId').populate('userId');

    console.log(`📝 Submissions on ${targetDate}: ${submissionsOnDate.length}`);

    // Get students who appeared for tests on the target date
    const studentsWhoAttempted = new Set();
    const submissionDetails = [];

    submissionsOnDate.forEach(submission => {
      if (submission.enrollmentNo) {
        studentsWhoAttempted.add(submission.enrollmentNo);
        submissionDetails.push({
          enrollmentNo: submission.enrollmentNo,
          studentName: submission.userId ? submission.userId.fullName : 'Unknown',
          course: submission.course,
          testSubject: submission.testId ? submission.testId.subject.subjectCode : 'Unknown',
          submittedAt: submission.submittedAt,
          testStartedAt: submission.testStartedAt,
          status: submission.status || 'unknown',
          score: submission.score || 0,
          totalQuestions: submission.totalQuestions || 0
        });
      }
    });

    console.log(`✅ Students who attempted tests on ${targetDate}: ${studentsWhoAttempted.size}\n`);

    // Find all students in the courses that had tests
    const studentsInCoursesWithTests = await Student.find({
      course: { $in: coursesArray }
    }).sort({ course: 1, enrollmentNo: 1 });

    console.log(`👥 Total students in courses with tests: ${studentsInCoursesWithTests.length}`);

    // Find absentees (students in courses with tests who didn't attempt)
    const absentees = [];
    const presentStudents = [];

    studentsInCoursesWithTests.forEach(student => {
      if (studentsWhoAttempted.has(student.enrollmentNo)) {
        presentStudents.push({
          enrollmentNo: student.enrollmentNo,
          fullName: student.fullName,
          course: student.course,
          batchYear: student.batchYear
        });
      } else {
        absentees.push({
          enrollmentNo: student.enrollmentNo,
          fullName: student.fullName,
          course: student.course,
          batchYear: student.batchYear,
          admissionDate: student.admissionDate
        });
      }
    });

    // Display results
    console.log('\n' + '='.repeat(100));
    console.log(`📊 ABSENTEE REPORT - ${targetDate.toUpperCase()}${paperFilter ? ` (PAPER ${paperFilter} ONLY)` : ' (ALL PAPERS)'}`);
    console.log('='.repeat(100));
    console.log(`📅 Date: ${targetDate}`);
    console.log(`📝 Paper Type: ${paperFilter ? `Paper ${paperFilter} only` : 'All papers'}`);
    console.log(`🎓 Courses with exams: ${coursesArray.length} (${coursesArray.join(', ')})`);
    console.log(`📚 Tests conducted: ${filteredTests.length} (${subjectCodes.join(', ')})`);
    console.log(`👥 Total students eligible: ${studentsInCoursesWithTests.length}`);
    console.log(`✅ Students present: ${presentStudents.length}`);
    console.log(`❌ Students absent: ${absentees.length}`);
    console.log(`📊 Attendance rate: ${((presentStudents.length / studentsInCoursesWithTests.length) * 100).toFixed(2)}%`);

    // Display detailed breakdown by course and test
    console.log('\n📋 DETAILED BREAKDOWN BY COURSE:');
    console.log('-'.repeat(80));
    
    coursesArray.forEach(course => {
      const courseStudents = studentsInCoursesWithTests.filter(s => s.course === course);
      const coursePresentStudents = presentStudents.filter(s => s.course === course);
      const courseAbsentees = absentees.filter(s => s.course === course);
      const attendanceRate = courseStudents.length > 0 ? ((coursePresentStudents.length / courseStudents.length) * 100).toFixed(2) : '0.00';
      
      console.log(`\n🎓 ${course}:`);
      console.log(`   Total enrolled: ${courseStudents.length}`);
      console.log(`   Present: ${coursePresentStudents.length}`);
      console.log(`   Absent: ${courseAbsentees.length}`);
      console.log(`   Attendance: ${attendanceRate}%`);
      
      // Show which tests this course had
      const courseTests = filteredTests.filter(test => {
        const testCourse = getCourseFromSubjectCode(test.subject?.subjectCode);
        return testCourse === course;
      });
      if (courseTests.length > 0) {
        courseTests.forEach(test => {
          const paperNum = getPaperNumber(test.subject.subjectCode);
          console.log(`   Test: ${test.subject.subjectCode} - ${test.subject.subjectName} (Paper ${paperNum})`);
        });
      }
    });

    // Display absentees by course
    console.log('\n🚨 ABSENTEES BY COURSE:');
    console.log('-'.repeat(80));
    
    const absenteesByCourse = {};
    absentees.forEach(student => {
      if (!absenteesByCourse[student.course]) {
        absenteesByCourse[student.course] = [];
      }
      absenteesByCourse[student.course].push(student);
    });

    Object.keys(absenteesByCourse).sort().forEach(course => {
      const courseAbsentees = absenteesByCourse[course];
      console.log(`\n📚 ${course}: ${courseAbsentees.length} absentees`);
      courseAbsentees.forEach((student, index) => {
        console.log(`   ${index + 1}. ${student.enrollmentNo} - ${student.fullName} (Batch: ${student.batchYear})`);
      });
    });

    // Display students who were present (limited to first 10 per course to avoid too much output)
    console.log('\n✅ STUDENTS WHO ATTENDED (FIRST 10 PER COURSE):');
    console.log('-'.repeat(80));
    
    const presentByCourse = {};
    presentStudents.forEach(student => {
      if (!presentByCourse[student.course]) {
        presentByCourse[student.course] = [];
      }
      presentByCourse[student.course].push(student);
    });

    Object.keys(presentByCourse).sort().forEach(course => {
      const coursePresentStudents = presentByCourse[course];
      console.log(`\n📚 ${course}: ${coursePresentStudents.length} present (showing first 10)`);
      coursePresentStudents.slice(0, 10).forEach((student, index) => {
        const submission = submissionDetails.find(s => s.enrollmentNo === student.enrollmentNo);
        console.log(`   ${index + 1}. ${student.enrollmentNo} - ${student.fullName} (Score: ${submission ? submission.score : 'N/A'}/${submission ? submission.totalQuestions : 'N/A'})`);
      });
      if (coursePresentStudents.length > 10) {
        console.log(`   ... and ${coursePresentStudents.length - 10} more students`);
      }
    });

    // Export to CSV
    const csvContent = [];
    csvContent.push(['Date', 'Paper Type', 'Course', 'Test Subject', 'Enrollment No', 'Student Name', 'Batch Year', 'Status', 'Score', 'Total Questions', 'Submission Time']);
    
    // Add absentees
    absentees.forEach(student => {
      const courseTests = filteredTests.filter(test => {
        const testCourse = getCourseFromSubjectCode(test.subject?.subjectCode);
        return testCourse === student.course;
      });
      
      const testSubject = courseTests.length > 0 ? courseTests[0].subject.subjectCode : 'N/A';
      
      csvContent.push([
        targetDate,
        paperFilter ? `Paper ${paperFilter}` : 'All Papers',
        student.course,
        testSubject,
        student.enrollmentNo,
        student.fullName,
        student.batchYear,
        'ABSENT',
        'N/A',
        'N/A',
        'N/A'
      ]);
    });

    // Add present students
    presentStudents.forEach(student => {
      const submission = submissionDetails.find(s => s.enrollmentNo === student.enrollmentNo);
      const courseTests = filteredTests.filter(test => {
        const testCourse = getCourseFromSubjectCode(test.subject?.subjectCode);
        return testCourse === student.course;
      });
      
      csvContent.push([
        targetDate,
        paperFilter ? `Paper ${paperFilter}` : 'All Papers',
        student.course,
        submission ? submission.testSubject : (courseTests.length > 0 ? courseTests[0].subject.subjectCode : 'N/A'),
        student.enrollmentNo,
        student.fullName,
        student.batchYear,
        'PRESENT',
        submission ? submission.score : 'N/A',
        submission ? submission.totalQuestions : 'N/A',
        submission && submission.submittedAt ? submission.submittedAt.toISOString() : 'N/A'
      ]);
    });

    // Write CSV file
    const csvString = csvContent.map(row => row.join(',')).join('\n');
    const dateForFile = targetDate.replace(/-/g, '_');
    const paperSuffix = paperFilter ? `_Paper${paperFilter}` : '_AllPapers';
    const fileName = `Absentees_${dateForFile}${paperSuffix}_${new Date().toISOString().split('T')[0].replace(/-/g, '_')}.csv`;
    const filePath = path.join(__dirname, fileName);
    
    fs.writeFileSync(filePath, csvString);
    console.log(`\n💾 Report exported to: ${filePath}`);

    // Summary statistics
    console.log('\n📈 SUMMARY STATISTICS:');
    console.log('-'.repeat(50));
    coursesArray.forEach(course => {
      const total = studentsInCoursesWithTests.filter(s => s.course === course).length;
      const absent = absenteesByCourse[course] ? absenteesByCourse[course].length : 0;
      const present = total - absent;
      const attendanceRate = total > 0 ? ((present / total) * 100).toFixed(2) : '0.00';
      
      // Get the tests for this course
      const courseTests = filteredTests.filter(test => {
        const testCourse = getCourseFromSubjectCode(test.subject?.subjectCode);
        return testCourse === course;
      });
      
      const testSubjects = courseTests.map(test => test.subject.subjectCode).join(', ');
      
      console.log(`${course} (${testSubjects || 'N/A'}): ${present}/${total} present (${attendanceRate}%)`);
    });

    console.log('\n✅ Absentee check completed successfully!');

  } catch (error) {
    console.error('❌ Error checking absentees:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Parse command line arguments
function parseArguments() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('\n📋 USAGE:');
    console.log('node check-absentees-dynamic.js <date> [paper]');
    console.log('\nEXAMPLES:');
    console.log('node check-absentees-dynamic.js 2025-08-26          # Check all papers for Aug 26, 2025');
    console.log('node check-absentees-dynamic.js 2025-08-25 4        # Check only Paper 4 for Aug 25, 2025');
    console.log('node check-absentees-dynamic.js 2025-08-27 5        # Check only Paper 5 for Aug 27, 2025');
    console.log('\nDATE FORMAT: YYYY-MM-DD');
    console.log('PAPER: Optional paper number (e.g., 4, 5, 6)');
    process.exit(1);
  }

  const targetDate = args[0];
  const paperFilter = args[1] ? parseInt(args[1]) : null;

  if (paperFilter && (isNaN(paperFilter) || paperFilter < 1 || paperFilter > 10)) {
    console.error('❌ Error: Paper number must be between 1 and 10');
    process.exit(1);
  }

  return { targetDate, paperFilter };
}

// Run the script
if (require.main === module) {
  const { targetDate, paperFilter } = parseArguments();
  checkAbsentees(targetDate, paperFilter);
}

module.exports = checkAbsentees;
