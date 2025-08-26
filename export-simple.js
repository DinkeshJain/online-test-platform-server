const readline = require('readline');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Import models
const Course = require('./models/Course');
const Student = require('./models/Student');
const InternalMarks = require('./models/InternalMarks');
const Submission = require('./models/Submission');
const Test = require('./models/Test');

// Database connection
require('dotenv').config();
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-platform';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
};

const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const formatTimeSpent = (timeInSeconds) => {
  if (!timeInSeconds || timeInSeconds === 0) return '-';
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = timeInSeconds % 60;
  return minutes > 0 ? `${minutes} mins ${seconds} secs` : `${seconds} secs`;
};

const calculateGrade = (totalMarks, externalMarks, isAbsent = false) => {
  if (isAbsent) return { gradePoints: 0, grade: 'W' };
  
  const externalPercentage = (externalMarks / 70) * 100;
  if (externalPercentage < 35) return { gradePoints: '-', grade: 'F' };
  
  if (totalMarks >= 90) return { gradePoints: 10, grade: 'O' };
  if (totalMarks >= 80) return { gradePoints: 9, grade: 'A' };
  if (totalMarks >= 70) return { gradePoints: 8, grade: 'B' };
  if (totalMarks >= 60) return { gradePoints: 7, grade: 'C' };
  if (totalMarks >= 50) return { gradePoints: 6, grade: 'D' };
  if (totalMarks >= 40) return { gradePoints: 5, grade: 'E' };
  return { gradePoints: '-', grade: 'F' };
};

const showMenu = (items, title, valueKey = null, displayKey = null) => {
  console.log(`\n${title}:`);
  console.log('━'.repeat(title.length + 1));
  items.forEach((item, index) => {
    const display = displayKey ? item[displayKey] : item;
    const value = valueKey ? item[valueKey] : item;
    console.log(`${index + 1}. ${display}`);
  });
  console.log('0. Exit');
};

const getMenuChoice = async (items, title, valueKey = null, displayKey = null) => {
  while (true) {
    showMenu(items, title, valueKey, displayKey);
    const choice = await askQuestion('\nEnter your choice (number): ');
    
    const choiceNum = parseInt(choice);
    if (choiceNum === 0) {
      console.log('👋 Exiting...');
      process.exit(0);
    }
    
    if (choiceNum >= 1 && choiceNum <= items.length) {
      const selected = items[choiceNum - 1];
      const value = valueKey ? selected[valueKey] : selected;
      const display = displayKey ? selected[displayKey] : selected;
      console.log(`✅ Selected: ${display}`);
      return { value, item: selected };
    }
    
    console.log('❌ Invalid choice. Please try again.');
  }
};

const exportData = async () => {
  try {
    await connectDB();

    console.log('\n🚀 Exam Data Export - Interactive Menu');
    console.log('=====================================\n');
    
    // 1. Get available courses
    console.log('📚 Loading available courses...');
    const courses = await Course.find({ isActive: true }).sort({ courseCode: 1 });
    
    if (courses.length === 0) {
      console.log('❌ No active courses found');
      process.exit(1);
    }
    
    const selectedCourse = await getMenuChoice(
      courses, 
      '📚 Select Course', 
      'courseCode',
      'courseCode'
    );
    
    // 2. Get available subjects for selected course
    console.log('\n📖 Loading available subjects...');
    const subjects = await Test.distinct('subject.subjectCode', {
      courseCode: selectedCourse.value
    });
    
    if (subjects.length === 0) {
      console.log('❌ No subjects found for this course');
      process.exit(1);
    }
    
    // Get subject details
    const subjectDetails = [];
    for (const subjectCode of subjects) {
      const testWithSubject = await Test.findOne({
        courseCode: selectedCourse.value,
        'subject.subjectCode': subjectCode
      });
      
      subjectDetails.push({
        subjectCode: subjectCode,
        subjectName: testWithSubject?.subject?.subjectName || 'Unknown',
        display: `${subjectCode} - ${testWithSubject?.subject?.subjectName || 'Unknown'}`
      });
    }
    
    const selectedSubject = await getMenuChoice(
      subjectDetails,
      '📖 Select Subject',
      'subjectCode',
      'display'
    );
    
    // 3. Get available test types for selected course and subject
    console.log('\n🎯 Loading available test types...');
    const testTypeCounts = await Test.aggregate([
      {
        $match: {
          courseCode: selectedCourse.value,
          'subject.subjectCode': selectedSubject.value
        }
      },
      {
        $group: {
          _id: '$testType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    if (testTypeCounts.length === 0) {
      console.log('❌ No tests found for this subject');
      process.exit(1);
    }
    
    // Create test type options with counts
    const testTypeDisplayMap = {
      'official': '🎓 Official Tests',
      'demo': '🎮 Demo Tests', 
      'practice': '📝 Practice Tests'
    };
    
    const testTypeChoices = testTypeCounts.map(item => ({
      value: item._id,
      display: `${testTypeDisplayMap[item._id] || item._id} (${item.count} test${item.count > 1 ? 's' : ''})`
    }));
    
    // Add 'all' option if multiple test types exist
    if (testTypeCounts.length > 1) {
      const totalTests = testTypeCounts.reduce((sum, item) => sum + item.count, 0);
      testTypeChoices.push({
        value: 'all',
        display: `📊 All Test Types (${totalTests} tests)`
      });
    }
    
    const selectedTestType = await getMenuChoice(
      testTypeChoices,
      '🎯 Select Test Type',
      'value',
      'display'
    );

    console.log('\n📊 Selected Options:');
    console.log(`Course: ${selectedCourse.item.courseCode} - ${selectedCourse.item.courseName}`);
    console.log(`Subject: ${selectedSubject.item.display}`);
    console.log(`Test Type: ${selectedTestType.item.display}`);
    
    const confirm = await askQuestion('\nProceed with export? (y/n): ');
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ Export cancelled');
      process.exit(0);
    }

    console.log('\n🔍 Fetching data...');

    const course = selectedCourse.item;
    const courseCode = selectedCourse.value;
    const subjectCode = selectedSubject.value;
    const testType = selectedTestType.value;

    // Find tests
    let testQuery = {
      courseCode: course.courseCode,
      'subject.subjectCode': { $regex: new RegExp(`^${subjectCode}$`, 'i') }
    };
    if (testType !== 'all') {
      testQuery.testType = testType;
    }

    const tests = await Test.find(testQuery);
    if (tests.length === 0) {
      console.log('❌ No tests found');
      process.exit(1);
    }

    // Find students
    const students = await Student.find({ course: course.courseCode });

    // Find submissions
    const submissions = await Submission.find({
      testId: { $in: tests.map(t => t._id) },
      isDraft: false,
      isCompleted: true
    });

    console.log(`Found ${tests.length} tests and ${students.length} students`);

    // Prepare Excel data
    const maxQuestions = Math.max(...tests.map(test => test.questions.length));
    
    const headers = [
      'Enrollment Number', 'Full Name', 'Email', 'Status', 
      'Test Started', 'Test Completed', 'Time Taken',
      'Grade Points', 'Grade', 'Total Marks', 'Internal Marks', 'External Marks'
    ];
    
    // Add question headers
    for (let i = 1; i <= maxQuestions; i++) {
      headers.push(`Q${i}`);
    }

    const rows = [headers];

    // Process each student
    for (const student of students) {
      for (const test of tests) {
        const submission = submissions.find(s => 
          s.userId.toString() === student._id.toString() && 
          s.testId.toString() === test._id.toString()
        );

        const internalMark = await InternalMarks.findOne({
          studentId: student._id,
          courseId: course._id,
          subjectCode: subjectCode
        });

        if (submission) {
          // Student attempted test
          const externalMarks = submission.score || 0;
          const internalMarks = internalMark?.internalMarks || 0;
          const totalMarks = externalMarks + internalMarks;
          const { gradePoints, grade } = calculateGrade(totalMarks, externalMarks);

          // Question results
          const questionResults = [];
          for (let i = 1; i <= maxQuestions; i++) {
            const answer = submission.answers?.find(a => a.originalQuestionNumber === i);
            questionResults.push(answer ? (answer.isCorrect ? '1.00' : '0.00') : '-');
          }

          const row = [
            student.enrollmentNo,
            student.fullName,
            student.emailId || '-',
            'Finished',
            submission.testStartedAt ? new Date(submission.testStartedAt).toLocaleString() : '-',
            submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '-',
            formatTimeSpent(submission.timeSpent),
            gradePoints,
            grade,
            totalMarks,
            internalMarks,
            externalMarks,
            ...questionResults
          ];
          rows.push(row);
        } else {
          // Student absent
          const questionResults = new Array(maxQuestions).fill('-');
          const { gradePoints, grade } = calculateGrade(0, 0, true);

          const row = [
            student.enrollmentNo,
            student.fullName,
            student.emailId || '-',
            'Absent',
            '-', '-', '-',
            gradePoints, grade, 0, '', 0,
            ...questionResults
          ];
          rows.push(row);
        }
      }
    }

    // Create Excel file
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    
    // Calculate dynamic column widths based on content
    const colWidths = [];
    for (let col = 0; col < headers.length; col++) {
      let maxWidth = 10; // Minimum width
      
      // Check header width
      if (headers[col]) {
        maxWidth = Math.max(maxWidth, headers[col].toString().length);
      }
      
      // Check all data rows for this column
      for (let row = 1; row < rows.length; row++) {
        if (rows[row][col] !== undefined && rows[row][col] !== null) {
          const cellValue = rows[row][col].toString();
          maxWidth = Math.max(maxWidth, cellValue.length);
        }
      }
      
      // Add some padding and set reasonable limits
      const finalWidth = Math.min(Math.max(maxWidth + 2, 8), 50);
      colWidths.push({ width: finalWidth });
    }
    
    // Apply column widths
    worksheet['!cols'] = colWidths;
    
    // Style the header row
    const headerStyle = {
      font: { 
        bold: true, 
        color: { rgb: "FFFFFF" },
        size: 11
      },
      fill: { 
        patternType: 'solid',
        fgColor: { rgb: "366092" },
        bgColor: { rgb: "366092" }
      },
      alignment: { 
        horizontal: "center", 
        vertical: "center",
        wrapText: true
      },
      border: {
        top: { style: 'thin', color: { rgb: "000000" } },
        bottom: { style: 'thin', color: { rgb: "000000" } },
        left: { style: 'thin', color: { rgb: "000000" } },
        right: { style: 'thin', color: { rgb: "000000" } }
      }
    };
    
    // Apply header styling
    for (let col = 0; col < headers.length; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!worksheet[cellRef]) {
        worksheet[cellRef] = { v: headers[col], t: 's' };
      }
      worksheet[cellRef].s = headerStyle;
    }
    
    // Style grade columns with color coding
    const gradePointsCol = headers.indexOf('Grade Points');
    const gradeCol = headers.indexOf('Grade');
    
    if (gradePointsCol >= 0 && gradeCol >= 0) {
      for (let row = 1; row < rows.length; row++) {
        const gradeValue = rows[row][gradeCol];
        let style = null;
        
        if (gradeValue === 'F') {
          // Fail - Red background
          style = {
            fill: { patternType: 'solid', fgColor: { rgb: 'FFCC0000' } },
            font: { color: { rgb: 'FFFFFFFF' }, bold: true }
          };
        } else if (gradeValue === 'W') {
          // Absent/Withdrawn - Orange background
          style = {
            fill: { patternType: 'solid', fgColor: { rgb: 'FFFF8000' } },
            font: { color: { rgb: 'FFFFFFFF' }, bold: true }
          };
        } else if (gradeValue === 'O') {
          // Outstanding - Green background
          style = {
            fill: { patternType: 'solid', fgColor: { rgb: 'FF008000' } },
            font: { color: { rgb: 'FFFFFFFF' }, bold: true }
          };
        }
        
        if (style) {
          // Apply to both Grade Points and Grade columns
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
    
    // Add borders to all cells
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < headers.length; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (!worksheet[cellRef]) {
          worksheet[cellRef] = { v: rows[row][col] || '', t: 's' };
        }
        
        // Add border if not already styled
        if (!worksheet[cellRef].s) {
          worksheet[cellRef].s = {};
        }
        if (!worksheet[cellRef].s.border) {
          worksheet[cellRef].s.border = {
            top: { style: 'thin', color: { rgb: "CCCCCC" } },
            bottom: { style: 'thin', color: { rgb: "CCCCCC" } },
            left: { style: 'thin', color: { rgb: "CCCCCC" } },
            right: { style: 'thin', color: { rgb: "CCCCCC" } }
          };
        }
      }
    }
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

    // Save file
    const fileName = `${courseCode}_${subjectCode}_${testType}_report.xlsx`;
    const outputPath = path.join(__dirname, fileName);
    XLSX.writeFile(workbook, outputPath);

    console.log(`\n✅ Excel file created: ${fileName}`);
    console.log(`📍 Location: ${outputPath}`);
    console.log(`📊 Total records: ${rows.length - 1}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    rl.close();
    mongoose.connection.close();
  }
};

exportData();
