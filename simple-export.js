require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

// Import models
const Student = require('./models/Student');
const Test = require('./models/Test');
const Submission = require('./models/Submission');

async function exportStudentResults() {
  try {
    console.log('🔌 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    
    console.log('📊 Fetching data...');
    
    // Get all students
    const students = await Student.find({}).sort({ course: 1, enrollmentNo: 1 });
    console.log(`Found ${students.length} students`);
    
    // Get all tests and extract unique subjects
    const tests = await Test.find({});
    const subjects = [];
    const subjectMap = new Map();
    
    tests.forEach(test => {
      if (test.subject && test.subject.subjectCode) {
        const code = test.subject.subjectCode;
        if (!subjectMap.has(code)) {
          subjectMap.set(code, {
            code: code,
            name: test.subject.subjectName,
            totalQuestions: test.questions ? test.questions.length : 0
          });
          subjects.push(subjectMap.get(code));
        }
      }
    });
    
    subjects.sort((a, b) => a.code.localeCompare(b.code));
    console.log(`Found ${subjects.length} subjects`);
    
    // Get all submissions
    const submissions = await Submission.find({})
      .populate('testId', 'subject')
      .populate('userId', 'enrollmentNo fullName');
    
    console.log(`Found ${submissions.length} submissions`);
    
    // Create submission lookup
    const submissionMap = new Map();
    submissions.forEach(sub => {
      if (sub.enrollmentNo && sub.testId && sub.testId.subject) {
        const key = `${sub.enrollmentNo}_${sub.testId.subject.subjectCode}`;
        submissionMap.set(key, sub);
      }
    });
    
    console.log('📄 Creating Excel file...');
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Student Results');
    
    // Create headers
    const headers = ['S.No.', 'Enrollment No', 'Student Name', 'Course'];
    subjects.forEach(subject => {
      headers.push(subject.code);
    });
    headers.push('Total', 'Present', 'Absent', 'Passed', 'Failed', 'Average');
    
    // Add header row
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '366092' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    
    // Process each student
    let rowNum = 1;
    students.forEach(student => {
      const row = [
        rowNum++,
        student.enrollmentNo,
        student.fullName,
        student.course
      ];
      
      let present = 0, absent = 0, passed = 0, failed = 0, totalScore = 0, scoreCount = 0;
      
      // Add subject scores
      subjects.forEach(subject => {
        const key = `${student.enrollmentNo}_${subject.code}`;
        const submission = submissionMap.get(key);
        
        if (submission && submission.score !== null && submission.score !== undefined) {
          let score = submission.score;
          // Convert percentage to actual score if needed
          if (score <= 1 && score > 0) {
            score = Math.round(score * subject.totalQuestions);
          }
          
          row.push(Math.round(score));
          present++;
          totalScore += score;
          scoreCount++;
          
          if (score >= 30) passed++;
          else failed++;
        } else {
          row.push('AB');
          absent++;
        }
      });
      
      // Add summary columns
      const average = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;
      row.push(subjects.length, present, absent, passed, failed, average);
      
      // Add row to worksheet
      const dataRow = worksheet.addRow(row);
      dataRow.alignment = { horizontal: 'center', vertical: 'middle' };
      
      // Apply color coding
      dataRow.eachCell((cell, colNumber) => {
        // Subject columns (start from column 5)
        if (colNumber > 4 && colNumber <= 4 + subjects.length) {
          if (cell.value === 'AB') {
            // Red for absent
            cell.font = { color: { argb: 'FFFFFF' }, bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC3545' } };
          } else if (typeof cell.value === 'number' && cell.value < 30) {
            // Red for fail
            cell.font = { color: { argb: 'FFFFFF' }, bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC3545' } };
          } else if (typeof cell.value === 'number' && cell.value >= 30) {
            // Green for pass
            cell.font = { color: { argb: 'FFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '28A745' } };
          }
        }
        
        // Add borders
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      if (index === 0) column.width = 6;      // S.No
      else if (index === 1) column.width = 15; // Enrollment
      else if (index === 2) column.width = 25; // Name
      else if (index === 3) column.width = 10; // Course
      else column.width = 12;                   // Others
    });
    
    // Add borders to header
    headerRow.eachCell(cell => {
      cell.border = {
        top: { style: 'thick' },
        left: { style: 'thick' },
        bottom: { style: 'thick' },
        right: { style: 'thick' }
      };
    });
    
    // Save file
    const fileName = `Student_Results_${new Date().toISOString().split('T')[0]}.xlsx`;
    await workbook.xlsx.writeFile(fileName);
    
    console.log('\n✅ Export completed!');
    console.log(`📁 File: ${fileName}`);
    console.log(`👥 Students: ${students.length}`);
    console.log(`📚 Subjects: ${subjects.length}`);
    console.log('🎨 Color coding: Red = Fail/Absent, Green = Pass');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the export
exportStudentResults();
