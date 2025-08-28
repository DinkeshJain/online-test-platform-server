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

// Main function to check absentees for August 26, 2025
async function checkAbsenteesAug26() {
  try {
    console.log('🔍 Checking absentees for August 26, 2025...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Define the target date (August 26, 2025)
    const targetDate = '2025-08-26';
    const startOfDay = new Date(`${targetDate}T00:00:00.000Z`);
    const endOfDay = new Date(`${targetDate}T23:59:59.999Z`);

    console.log(`📅 Target Date: ${targetDate}`);
    console.log(`🕐 Time Range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}\n`);

    // First, find all tests created/active on August 26, 2025
    const testsOnAug26 = await Test.find({
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

    console.log(`📝 Tests found on ${targetDate}: ${testsOnAug26.length}`);
    
    if (testsOnAug26.length === 0) {
      console.log('❌ No tests found for August 26, 2025');
      return;
    }

    // Display all tests
    console.log('\n📋 Tests on August 26, 2025:');
    console.log('=' .repeat(80));
    testsOnAug26.forEach((test, index) => {
      console.log(`${index + 1}. ${test.subject.subjectCode}: ${test.subject.subjectName}`);
      console.log(`   Questions: ${test.questions.length}`);
      console.log(`   Duration: ${test.duration} minutes`);
      console.log(`   Created: ${test.createdAt.toLocaleDateString()}`);
      if (test.activeFrom) {
        console.log(`   Active: ${test.activeFrom.toLocaleDateString()} to ${test.activeTo ? test.activeTo.toLocaleDateString() : 'ongoing'}`);
      }
      console.log('');
    });

    // Get test IDs for all tests
    const testIds = testsOnAug26.map(test => test._id);
    
    // Extract subject codes to map to courses
    const subjectCodes = testsOnAug26.map(test => test.subject.subjectCode);
    const coursesWithExams = subjectCodes.map(code => code.replace(/\d+$/, '')); // Remove trailing numbers to get course codes
    
    console.log(`🎓 Subject codes on ${targetDate}: ${subjectCodes.join(', ')}`);
    console.log(`🎓 Courses with exams: ${coursesWithExams.join(', ')}\n`);

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

    // Find submissions specifically on August 26, 2025
    const submissionsOnAug26 = await Submission.find({
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

    console.log(`📝 Submissions on ${targetDate}: ${submissionsOnAug26.length}`);

    // Get students who appeared for exams on Aug 26
    const studentsWhoAttempted = new Set();
    const submissionDetails = [];

    submissionsOnAug26.forEach(submission => {
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

    console.log(`✅ Students who attempted exams on ${targetDate}: ${studentsWhoAttempted.size}\n`);

    // Now find all students in the courses that had exams
    const studentsInCoursesWithExams = await Student.find({
      course: { $in: coursesArray }
    }).sort({ course: 1, enrollmentNo: 1 });

    console.log(`👥 Total students in courses with exams: ${studentsInCoursesWithExams.length}`);

    // Find absentees (students in courses with exams who didn't attempt)
    const absentees = [];
    const presentStudents = [];

    studentsInCoursesWithExams.forEach(student => {
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
    console.log('📊 ABSENTEE REPORT - AUGUST 26, 2025');
    console.log('='.repeat(100));
    console.log(`📅 Date: ${targetDate}`);
    console.log(`📝 Tests conducted: ${testsOnAug26.length} (${subjectCodes.join(', ')})`);
    console.log(`🎓 Courses with exams: ${coursesArray.length} (${coursesArray.join(', ')})`);
    console.log(`👥 Total students eligible: ${studentsInCoursesWithExams.length}`);
    console.log(`✅ Students present: ${presentStudents.length}`);
    console.log(`❌ Students absent: ${absentees.length}`);
    console.log(`📊 Attendance rate: ${((presentStudents.length / studentsInCoursesWithExams.length) * 100).toFixed(2)}%`);

    // Display detailed breakdown by course and test
    console.log('\n📋 DETAILED BREAKDOWN BY COURSE:');
    console.log('-'.repeat(80));
    
    coursesArray.forEach(course => {
      const courseStudents = studentsInCoursesWithExams.filter(s => s.course === course);
      const coursePresentStudents = presentStudents.filter(s => s.course === course);
      const courseAbsentees = absentees.filter(s => s.course === course);
      const attendanceRate = courseStudents.length > 0 ? ((coursePresentStudents.length / courseStudents.length) * 100).toFixed(2) : '0.00';
      
      console.log(`\n🎓 ${course}:`);
      console.log(`   Total enrolled: ${courseStudents.length}`);
      console.log(`   Present: ${coursePresentStudents.length}`);
      console.log(`   Absent: ${courseAbsentees.length}`);
      console.log(`   Attendance: ${attendanceRate}%`);
      
      // Show which tests this course had
      const courseTests = testsOnAug26.filter(test => {
        const testCourse = test.subject.subjectCode.replace(/\d+$/, '');
        return testCourse === course;
      });
      if (courseTests.length > 0) {
        courseTests.forEach(test => {
          console.log(`   Test: ${test.subject.subjectCode} - ${test.subject.subjectName}`);
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

    // Display students who were present
    console.log('\n✅ STUDENTS WHO ATTENDED (BY COURSE):');
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
      console.log(`\n📚 ${course}: ${coursePresentStudents.length} present`);
      coursePresentStudents.forEach((student, index) => {
        const submission = submissionDetails.find(s => s.enrollmentNo === student.enrollmentNo);
        console.log(`   ${index + 1}. ${student.enrollmentNo} - ${student.fullName} (Score: ${submission ? submission.score : 'N/A'}/${submission ? submission.totalQuestions : 'N/A'})`);
      });
    });

    // Export to CSV
    const csvContent = [];
    csvContent.push(['Date', 'Course', 'Test Subject', 'Enrollment No', 'Student Name', 'Batch Year', 'Status', 'Score', 'Total Questions', 'Submission Time']);
    
    // Add absentees
    absentees.forEach(student => {
      const courseTests = testsOnAug26.filter(test => {
        const testCourse = test.subject.subjectCode.replace(/\d+$/, '');
        return testCourse === student.course;
      });
      
      csvContent.push([
        targetDate,
        student.course,
        courseTests.length > 0 ? courseTests.map(t => t.subject.subjectCode).join(', ') : 'N/A',
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
      const courseTests = testsOnAug26.filter(test => {
        const testCourse = test.subject.subjectCode.replace(/\d+$/, '');
        return testCourse === student.course;
      });
      
      csvContent.push([
        targetDate,
        student.course,
        submission ? submission.testSubject : (courseTests.length > 0 ? courseTests.map(t => t.subject.subjectCode).join(', ') : 'N/A'),
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
    const fileName = `Absentees_Aug26_2025_${new Date().toISOString().split('T')[0]}.csv`;
    const filePath = path.join(__dirname, fileName);
    
    fs.writeFileSync(filePath, csvString);
    console.log(`\n💾 Report exported to: ${filePath}`);

    // Summary statistics
    console.log('\n📈 SUMMARY STATISTICS:');
    console.log('-'.repeat(50));
    coursesArray.forEach(course => {
      const total = studentsInCoursesWithExams.filter(s => s.course === course).length;
      const absent = absenteesByCourse[course] ? absenteesByCourse[course].length : 0;
      const present = total - absent;
      const attendanceRate = total > 0 ? ((present / total) * 100).toFixed(2) : '0.00';
      
      // Get the tests for this course
      const courseTests = testsOnAug26.filter(test => {
        const testCourse = test.subject.subjectCode.replace(/\d+$/, '');
        return testCourse === course;
      });
      
      const testCodes = courseTests.map(t => t.subject.subjectCode).join(', ');
      console.log(`${course} (${testCodes || 'N/A'}): ${present}/${total} present (${attendanceRate}%)`);
    });

    console.log('\n✅ Absentee check completed successfully!');

  } catch (error) {
    console.error('❌ Error checking absentees:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  checkAbsenteesAug26();
}

module.exports = checkAbsenteesAug26;
