require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');

// Import models
const Submission = require('./models/Submission');
const Test = require('./models/Test');
const Student = require('./models/Student');
const Course = require('./models/Course');
const InternalMarks = require('./models/InternalMarks');

// Configuration - You can modify these
const CONFIG = {
  // Date range (set to null for today only)
  startDate: null, // Format: 'YYYY-MM-DD' or null for today
  endDate: null,   // Format: 'YYYY-MM-DD' or null for today
  
  // Specific subjects to export (empty array = all subjects)
  subjectsToExport: [], // Example: ['DFS04', 'DHSE04']
  
  // Specific courses to export (empty array = all courses)
  coursesToExport: [], // Example: ['ADFS', 'DFS']
  
  // Export options
  includeInternalMarks: true,
  separateByTestType: false, // true = separate official/demo sheets
  outputDirectory: './', // relative to server folder
};

// Helper functions (same as previous script)
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

// Get date range based on config
function getDateRange() {
  let startDate, endDate;
  
  if (CONFIG.startDate) {
    startDate = new Date(CONFIG.startDate);
    startDate.setHours(0, 0, 0, 0);
  } else {
    const today = new Date();
    startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
  
  if (CONFIG.endDate) {
    endDate = new Date(CONFIG.endDate);
    endDate.setHours(23, 59, 59, 999);
  } else if (CONFIG.startDate) {
    endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);
  } else {
    const today = new Date();
    endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  }
  
  return { startDate, endDate };
}

// Fetch internal marks for students
async function fetchInternalMarks(studentIds, subjectCode) {
  if (!CONFIG.includeInternalMarks) return new Map();
  
  try {
    const internalMarks = await InternalMarks.find({
      studentId: { $in: studentIds },
      subject: subjectCode
    });
    
    const marksMap = new Map();
    internalMarks.forEach(mark => {
      marksMap.set(mark.studentId.toString(), mark.marks || 0);
    });
    
    return marksMap;
  } catch (error) {
    console.warn(`⚠️  Could not fetch internal marks for ${subjectCode}:`, error.message);
    return new Map();
  }
}

// Create worksheet with styling
function createStyledWorksheet(rows, headers) {
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

  // Grade styling for fail grades
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

  return worksheet;
}

// Main export function
async function exportExamData() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('🎯 FLEXIBLE EXAM DATA EXPORT');
    console.log('============================');

    const { startDate, endDate } = getDateRange();
    console.log(`📅 Date Range: ${startDate.toDateString()} to ${endDate.toDateString()}`);

    // Build submission query
    let submissionQuery = {
      submittedAt: { $gte: startDate, $lt: endDate },
      isDraft: false,
      isCompleted: true
    };

    // Get submissions
    const submissions = await Submission.find(submissionQuery)
      .populate('testId')
      .populate('userId');

    console.log(`📊 Found ${submissions.length} submissions in date range`);

    if (submissions.length === 0) {
      console.log('❌ No submissions found for the specified criteria');
      return;
    }

    // Filter and group submissions
    const subjectData = new Map();

    for (const submission of submissions) {
      if (!submission.testId || !submission.userId) continue;

      const test = submission.testId;
      const student = submission.userId;
      const subjectCode = test.subject?.subjectCode;
      const courseCode = test.course;

      if (!subjectCode || !courseCode) continue;

      // Filter by specific subjects if configured
      if (CONFIG.subjectsToExport.length > 0 && !CONFIG.subjectsToExport.includes(subjectCode)) {
        continue;
      }

      // Filter by specific courses if configured
      if (CONFIG.coursesToExport.length > 0 && !CONFIG.coursesToExport.includes(courseCode)) {
        continue;
      }

      const key = CONFIG.separateByTestType 
        ? `${subjectCode}_${test.testType || 'official'}`
        : subjectCode;

      if (!subjectData.has(key)) {
        subjectData.set(key, {
          subjectCode,
          subjectName: test.subject?.subjectName || subjectCode,
          courseCode,
          testType: test.testType || 'official',
          submissions: [],
          maxQuestions: 0,
          studentIds: new Set()
        });
      }

      const subjectInfo = subjectData.get(key);
      subjectInfo.submissions.push({ submission, test, student });
      subjectInfo.maxQuestions = Math.max(subjectInfo.maxQuestions, test.questions?.length || 0);
      subjectInfo.studentIds.add(student._id.toString());
    }

    if (subjectData.size === 0) {
      console.log('❌ No data found matching the specified filters');
      return;
    }

    console.log(`📚 Processing ${subjectData.size} subject(s):`);
    subjectData.forEach((data, key) => {
      console.log(`   - ${key}: ${data.submissions.length} submissions (${data.maxQuestions} questions)`);
    });

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // Process each subject
    for (const [key, subjectInfo] of subjectData) {
      console.log(`\n📝 Processing ${key}...`);

      // Fetch internal marks if enabled
      const internalMarksMap = await fetchInternalMarks(
        Array.from(subjectInfo.studentIds), 
        subjectInfo.subjectCode
      );

      const maxQuestions = subjectInfo.maxQuestions;

      // Build headers
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

      // Process submissions
      for (const { submission, test, student } of subjectInfo.submissions) {
        const answerMap = {};

        // Build answer map
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
        const internalMarks = internalMarksMap.get(student._id.toString()) || 0;
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

      // Create and style worksheet
      const worksheet = createStyledWorksheet(rows, headers);

      // Add sheet to workbook
      const sheetName = key.length > 31 ? key.substring(0, 31) : key;
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      console.log(`✅ Added sheet: ${sheetName} (${rows.length - 1} students)`);
    }

    // Generate filename
    const dateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    const dateRange = dateStr === endDateStr ? dateStr : `${dateStr}_to_${endDateStr}`;
    
    let fileName = `Exam_Results_${dateRange}`;
    if (CONFIG.subjectsToExport.length > 0) {
      fileName += `_${CONFIG.subjectsToExport.join('_')}`;
    }
    if (CONFIG.coursesToExport.length > 0) {
      fileName += `_${CONFIG.coursesToExport.join('_')}`;
    }
    fileName += '.xlsx';

    const filePath = path.join(__dirname, CONFIG.outputDirectory, fileName);

    // Write Excel file
    XLSX.writeFile(workbook, filePath);

    console.log(`\n🎉 SUCCESS! Excel file created: ${fileName}`);
    console.log(`📁 Location: ${filePath}`);
    console.log(`📊 Contains ${subjectData.size} subject sheet(s) with detailed results`);

    // Show summary
    console.log('\n📋 SUMMARY:');
    console.log('==========');
    subjectData.forEach((data, key) => {
      console.log(`📚 ${key}: ${data.submissions.length} students`);
    });

  } catch (error) {
    console.error('❌ Error exporting data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Database connection closed');
  }
}

// Command line arguments processing
const args = process.argv.slice(2);
if (args.length > 0) {
  // Parse command line arguments
  args.forEach(arg => {
    if (arg.startsWith('--date=')) {
      CONFIG.startDate = arg.split('=')[1];
      CONFIG.endDate = CONFIG.startDate;
    } else if (arg.startsWith('--start=')) {
      CONFIG.startDate = arg.split('=')[1];
    } else if (arg.startsWith('--end=')) {
      CONFIG.endDate = arg.split('=')[1];
    } else if (arg.startsWith('--subjects=')) {
      CONFIG.subjectsToExport = arg.split('=')[1].split(',');
    } else if (arg.startsWith('--courses=')) {
      CONFIG.coursesToExport = arg.split('=')[1].split(',');
    } else if (arg === '--separate-test-types') {
      CONFIG.separateByTestType = true;
    } else if (arg === '--no-internal-marks') {
      CONFIG.includeInternalMarks = false;
    }
  });
}

console.log('⚙️  Configuration:');
console.log(`   Date Range: ${CONFIG.startDate || 'today'} to ${CONFIG.endDate || 'today'}`);
console.log(`   Subjects Filter: ${CONFIG.subjectsToExport.length ? CONFIG.subjectsToExport.join(', ') : 'all'}`);
console.log(`   Courses Filter: ${CONFIG.coursesToExport.length ? CONFIG.coursesToExport.join(', ') : 'all'}`);
console.log(`   Include Internal Marks: ${CONFIG.includeInternalMarks}`);
console.log(`   Separate Test Types: ${CONFIG.separateByTestType}`);
console.log('');

// Run the export
exportExamData();
