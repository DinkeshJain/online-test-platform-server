require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

// Import models
const Student = require('./models/Student');
const Test = require('./models/Test');
const Submission = require('./models/Submission');

async function exportStudentResults() {
  try {
    console.log('📊 Starting Excel export by course (Official Tests Only)...');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get all students
    const students = await Student.find({})
      .select('enrollmentNo fullName course batchYear')
      .sort({ course: 1, enrollmentNo: 1 });

    console.log(`Found ${students.length} students`);

    // Get only official tests with subjects
    const tests = await Test.find({ testType: 'official' })
      .select('subject questions courseCode courseName testType')
      .sort({ 'subject.subjectCode': 1 });

    // Create subjects grouped by course
    const courseSubjects = {};
    const subjectMap = new Map();
    
    tests.forEach(test => {
      if (test.subject && test.subject.subjectCode) {
        // Determine course from subject code (remove numbers to get course code)
        const courseCode = test.subject.subjectCode.replace(/\d+$/, '');
        
        if (!courseSubjects[courseCode]) {
          courseSubjects[courseCode] = [];
        }
        
        if (!subjectMap.has(test.subject.subjectCode)) {
          const subjectInfo = {
            code: test.subject.subjectCode,
            name: test.subject.subjectName,
            course: courseCode,
            testId: test._id
          };
          
          subjectMap.set(test.subject.subjectCode, subjectInfo);
          courseSubjects[courseCode].push(subjectInfo);
        }
      }
    });

    // Sort subjects within each course
    Object.keys(courseSubjects).forEach(course => {
      courseSubjects[course].sort((a, b) => a.code.localeCompare(b.code));
    });

    const allSubjects = Array.from(subjectMap.values());
    console.log(`Found ${tests.length} official tests with ${allSubjects.length} subjects across ${Object.keys(courseSubjects).length} courses`);

    // Get all submissions for official tests only
    const submissions = await Submission.find({})
      .populate({
        path: 'testId',
        match: { testType: 'official' },
        select: 'subject testType'
      })
      .select('enrollmentNo score testId answers');

    // Filter out submissions where testId is null (non-official tests)
    const officialSubmissions = submissions.filter(sub => sub.testId !== null);

    // Create lookup for submissions from official tests only
    const submissionLookup = {};
    officialSubmissions.forEach(sub => {
      if (sub.enrollmentNo && sub.testId && sub.testId.subject) {
        const key = `${sub.enrollmentNo}_${sub.testId.subject.subjectCode}`;
        submissionLookup[key] = {
          score: sub.score,
          answersLength: Array.isArray(sub.answers) ? sub.answers.length : 0
        };
      }
    });

    console.log(`Found ${officialSubmissions.length} official test submissions out of ${submissions.length} total submissions`);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // Group students by course
    const studentsByCourse = {};
    students.forEach(student => {
      const course = student.course || 'Unknown';
      if (!studentsByCourse[course]) {
        studentsByCourse[course] = [];
      }
      studentsByCourse[course].push(student);
    });

    console.log(`Students grouped into ${Object.keys(studentsByCourse).length} courses`);

    // Create a worksheet for each course
    Object.keys(studentsByCourse).sort().forEach(course => {
      const courseStudents = studentsByCourse[course];
      const courseSubjectList = courseSubjects[course] || [];
      
      console.log(`Creating sheet for ${course} with ${courseStudents.length} students and ${courseSubjectList.length} subjects`);
      
      // Create worksheet for this course
      const worksheet = workbook.addWorksheet(`${course} Students`);

      // Create headers
      const headers = ['S.No', 'Enrollment No', 'Student Name', 'Batch'];
      courseSubjectList.forEach(subject => {
        headers.push(subject.code);
      });
      headers.push('Total', 'Passed', 'Failed', 'Absent');

      // Add course summary at the top
      const summaryRow = worksheet.addRow([`${course} Course - ${courseStudents.length} Students - ${courseSubjectList.length} Subjects (Official Tests Only)`]);
      summaryRow.font = { bold: true, size: 14, color: { argb: '000000' } };
      summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6F3FF' } };
      summaryRow.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.mergeCells(1, 1, 1, headers.length);

      // Add header row
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '366092' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      // Add student data for this course
      let serialNo = 1;
      for (const student of courseStudents) {
        const row = [
          serialNo++,
          student.enrollmentNo,
          student.fullName,
          student.batchYear
        ];

        let passed = 0, failed = 0, absent = 0;

        // Add scores for subjects that this course has
        courseSubjectList.forEach(subject => {
          const key = `${student.enrollmentNo}_${subject.code}`;
          const subObj = submissionLookup[key];
          if (subObj && subObj.score !== undefined && subObj.score !== null) {
            row.push(`${subObj.score}/${subObj.answersLength}`);
            if (subObj.score >= 28) passed++;
            else failed++;
          } else {
            row.push('AB/-');
            absent++;
          }
        });

        // Add summary columns
        row.push(courseSubjectList.length, passed, failed, absent);

        // Add row to worksheet
        const dataRow = worksheet.addRow(row);
        dataRow.alignment = { horizontal: 'center', vertical: 'middle' };

        // Apply color coding
        dataRow.eachCell((cell, colNumber) => {
          // Add borders
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };

          // Color code subject scores (columns 5 onwards, before summary)
          if (colNumber > 4 && colNumber <= 4 + courseSubjectList.length) {
            if (typeof cell.value === 'string' && cell.value.startsWith('AB')) {
              // Red for absent
              cell.font = { color: { argb: 'FFFFFF' }, bold: true };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC3545' } };
            } else if (typeof cell.value === 'string' && cell.value.includes('/')) {
              const scoreVal = parseFloat(cell.value.split('/')[0]);
              if (!isNaN(scoreVal) && scoreVal < 28) {
                // Red for fail
                cell.font = { color: { argb: 'FFFFFF' }, bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC3545' } };
              } else if (!isNaN(scoreVal) && scoreVal >= 28) {
                // Green for pass
                cell.font = { color: { argb: 'FFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '28A745' } };
              }
            }
          }
        });
      }

      // Auto-fit columns
      worksheet.columns.forEach((column, index) => {
        if (index === 0) column.width = 6;      // S.No
        else if (index === 1) column.width = 15; // Enrollment
        else if (index === 2) column.width = 25; // Name
        else if (index === 3) column.width = 15; // Batch
        else column.width = 12;                  // Others
      });
    });

    // Add overall summary sheet
    const summarySheet = workbook.addWorksheet('Overall Summary');
    
    // Add summary data
    const summaryData = [
      ['📊 OVERALL STATISTICS (Official Tests Only)', ''],
      ['Total Students', students.length],
      ['Total Courses', Object.keys(studentsByCourse).length],
      ['Total Official Subjects', allSubjects.length],
      ['Total Official Tests', tests.length],
      ['Total Submissions (Official)', officialSubmissions.length],
      ['Export Date', new Date().toLocaleString()],
      ['', ''],
      ['📚 COURSE BREAKDOWN', ''],
      ['Course', 'Students', 'Subjects']
    ];

    // Add course breakdown
    Object.keys(studentsByCourse).sort().forEach(course => {
      const courseSubjectCount = courseSubjects[course] ? courseSubjects[course].length : 0;
      summaryData.push([course, studentsByCourse[course].length, courseSubjectCount]);
    });

    summaryData.push(['', '']);
    summaryData.push(['🎨 COLOR CODING', '']);
    summaryData.push(['Red Background', 'Score < 28 or Absent']);
    summaryData.push(['Green Background', 'Score ≥ 28 (Passing)']);
    summaryData.push(['Blue Header', 'Column Headers']);
    summaryData.push(['Note:', 'Only Official Tests Included']);

    summaryData.forEach((rowData, index) => {
      const summaryRow = summarySheet.addRow(rowData);
      
      if (index === 0 || index === 7 || index === 7 + Object.keys(studentsByCourse).length + 2) {
        // Header rows
        summaryRow.font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
        summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '366092' } };
      } else if (index === 8) {
        // Sub-header row
        summaryRow.font = { bold: true, size: 11 };
      }
      
      summaryRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Style summary sheet columns
    summarySheet.columns[0].width = 25;
    summarySheet.columns[1].width = 15;
    summarySheet.columns[2].width = 15;

    // Save file
    const fileName = `Student_Results_by_Course_Official_${new Date().toISOString().split('T')[0]}.xlsx`;
    await workbook.xlsx.writeFile(fileName);

    console.log(`✅ Excel file created: ${fileName}`);
    console.log(`📊 Created ${Object.keys(studentsByCourse).length} course sheets + summary (Official Tests Only)`);
    console.log('🎨 Color coding: Red = Fail/Absent (<28), Green = Pass (≥28)');

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the export
exportStudentResults();
