require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Import models
const Submission = require('./models/Submission');
const Test = require('./models/Test');
const Student = require('./models/Student');
const Course = require('./models/Course');
const InternalMarks = require('./models/InternalMarks');

// Helper function to calculate grade and points
function calculateGradeAndPoints(totalMarks, maxQuestions, isAbsent = false) {
  if (isAbsent) {
    return { gradePoints: 0, grade: 'W' };
  }
  
  const percentage = (totalMarks / maxQuestions) * 100;
  
  if (percentage >= 90) return { gradePoints: 10, grade: 'A+' };
  if (percentage >= 80) return { gradePoints: 9, grade: 'A' };
  if (percentage >= 70) return { gradePoints: 8, grade: 'B+' };
  if (percentage >= 60) return { gradePoints: 7, grade: 'B' };
  if (percentage >= 50) return { gradePoints: 6, grade: 'C+' };
  if (percentage >= 40) return { gradePoints: 5, grade: 'C' };
  if (percentage >= 35) return { gradePoints: 4, grade: 'D' };
  return { gradePoints: 0, grade: 'F' };
}

// Helper function to format time spent
function formatTimeSpent(timeSpentSeconds, testDurationMinutes, testStartedOn, submittedAt) {
  if (!timeSpentSeconds && testStartedOn && submittedAt) {
    const startTime = new Date(testStartedOn);
    const endTime = new Date(submittedAt);
    timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
  }
  
  if (!timeSpentSeconds) return '-';
  
  const minutes = Math.floor(timeSpentSeconds / 60);
  const seconds = timeSpentSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Main export function
async function exportTodaysExamData() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('🎯 EXPORTING TODAY\'S EXAM DATA TO EXCEL');
    console.log('=======================================');

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    console.log(`📅 Date Range: ${startOfDay.toDateString()} to ${endOfDay.toDateString()}`);

    // Get all submissions from today
    const todaysSubmissions = await Submission.find({
      submittedAt: { $gte: startOfDay, $lt: endOfDay },
      isDraft: false,
      isCompleted: true
    }).populate('testId').populate('userId');

    console.log(`📊 Found ${todaysSubmissions.length} submissions today`);

    if (todaysSubmissions.length === 0) {
      console.log('❌ No submissions found for today');
      return;
    }

    // Group submissions by subject
    const subjectData = new Map();

    for (const submission of todaysSubmissions) {
      if (!submission.testId || !submission.userId) continue;

      const test = submission.testId;
      const student = submission.userId;
      const subjectCode = test.subject?.subjectCode || 'UNKNOWN';
      const courseCode = test.course || 'UNKNOWN';

      if (!subjectData.has(subjectCode)) {
        subjectData.set(subjectCode, {
          subjectCode,
          subjectName: test.subject?.subjectName || subjectCode,
          courseCode,
          submissions: [],
          maxQuestions: 0
        });
      }

      const subjectInfo = subjectData.get(subjectCode);
      subjectInfo.submissions.push({
        submission,
        test,
        student
      });
      subjectInfo.maxQuestions = Math.max(subjectInfo.maxQuestions, test.questions?.length || 0);
    }

    console.log(`📚 Found ${subjectData.size} subjects:`);
    subjectData.forEach((data, subject) => {
      console.log(`   - ${subject}: ${data.submissions.length} submissions (${data.maxQuestions} questions)`);
    });

    // Create Excel workbook with multiple sheets
    const workbook = XLSX.utils.book_new();

    // Process each subject
    for (const [subjectCode, subjectInfo] of subjectData) {
      console.log(`\n📝 Processing ${subjectCode}...`);

      const maxQuestions = subjectInfo.maxQuestions;

      // Build headers (same format as Reports.jsx)
      const baseHeaders = [
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

      const questionHeaders = [];
      for (let i = 1; i <= maxQuestions; i++) {
        questionHeaders.push(`Q${i}`);
      }

      const headers = [...baseHeaders, ...questionHeaders];
      const rows = [headers];

      // Process each submission
      for (const { submission, test, student } of subjectInfo.submissions) {
        const answerMap = {};

        // Build answer map based on originalQuestionNumber
        if (submission.answers && Array.isArray(submission.answers)) {
          submission.answers.forEach(answer => {
            if (answer.originalQuestionNumber) {
              answerMap[answer.originalQuestionNumber] = answer.isCorrect ? '1.00' : '0.00';
            }
          });
        }

        // Fill question statuses
        const questionStatuses = [];
        for (let i = 1; i <= maxQuestions; i++) {
          questionStatuses.push(answerMap.hasOwnProperty(i) ? answerMap[i] : '-');
        }

        // Format timestamps
        const testStartedOn = submission.testStartedAt
          ? new Date(submission.testStartedAt).toLocaleString('en-IN', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
            }) : '-';

        const testCompletedOn = submission.submittedAt
          ? new Date(submission.submittedAt).toLocaleString('en-IN', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
            }) : '-';

        // Calculate grades
        const externalMarks = submission.score || 0;
        const internalMarks = 0; // Would need to fetch from InternalMarks collection
        const totalMarks = externalMarks + internalMarks;
        const { gradePoints, grade } = calculateGradeAndPoints(totalMarks, maxQuestions);

        // Build row
        const row = [
          student.enrollmentNo || '-',
          student.fullName || '-',
          student.emailId || '-',
          'Finished',
          testStartedOn,
          testCompletedOn,
          formatTimeSpent(submission.timeSpent, test.duration, submission.testStartedAt, submission.submittedAt),
          gradePoints,
          grade,
          totalMarks,
          internalMarks,
          externalMarks,
          ...questionStatuses.map(status => status === '-' ? '-' : parseFloat(status))
        ];

        rows.push(row);
      }

      // Create worksheet
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

      // Grade styling
      const failStyle = {
        fill: { patternType: 'solid', fgColor: { rgb: 'FFFF0000' }, bgColor: { rgb: 'FFFF0000' } },
        font: { color: { rgb: 'FFFFFFFF' }, bold: true }
      };

      const gradePointsCol = 7;
      const gradeCol = 8;

      for (let row = 1; row < rows.length; row++) {
        const gradeValue = rows[row][gradeCol];
        if (gradeValue === 'F') {
          [gradePointsCol, gradeCol].forEach(col => {
            const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
            if (!worksheet[cellRef]) {
              worksheet[cellRef] = { v: rows[row][col], t: 's' };
            }
            worksheet[cellRef].s = failStyle;
          });
        }
      }

      // Add sheet to workbook
      const sheetName = `${subjectCode}_Report`;
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      console.log(`✅ Added sheet: ${sheetName} (${rows.length - 1} students)`);
    }

    // Generate filename with today's date
    const dateStr = today.toISOString().split('T')[0];
    const fileName = `Todays_Exam_Results_${dateStr}.xlsx`;
    const filePath = path.join(__dirname, fileName);

    // Write Excel file
    XLSX.writeFile(workbook, filePath);

    console.log(`\n🎉 SUCCESS! Excel file created: ${fileName}`);
    console.log(`📁 Location: ${filePath}`);
    console.log(`📊 Contains ${subjectData.size} subjects with detailed results`);

    // Show summary
    console.log('\n📋 SUMMARY:');
    console.log('==========');
    subjectData.forEach((data, subject) => {
      console.log(`📚 ${subject} (${data.subjectName}): ${data.submissions.length} students`);
    });

  } catch (error) {
    console.error('❌ Error exporting data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Database connection closed');
  }
}

// Run the export
exportTodaysExamData();
