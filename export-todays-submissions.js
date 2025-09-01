// Script to export today's submissions to Excel
require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Submission = require('./models/Submission');
const Student = require('./models/Student');
const Test = require('./models/Test');
const path = require('path');

// Get today's date range
const today = new Date();
const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

async function exportTodaysSubmissions() {
  console.log('Starting export of today\'s submissions...');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully');
    
    // Find all submissions for today (including drafts and incomplete)
    const submissions = await Submission.find({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
      // Removed filters to include ALL submissions
    })
    .populate('userId', 'enrollmentNo fullName course')
    .populate('testId', 'title subject.subjectCode subject.subjectName')
    .sort({ createdAt: 1 }) // Sort by time
    .lean();
    
    console.log('Sample submission data for debugging:');
    if (submissions.length > 0) {
      const sample = submissions[0];
      console.log('Student data:', sample.userId);
      console.log('Test data:', sample.testId);
      console.log('Enrollment in submission:', sample.enrollmentNo);
      console.log('Course in submission:', sample.course);
    }
    
    console.log(`Found ${submissions.length} submissions for today`);
    
    if (submissions.length === 0) {
      console.log('No submissions found for today. Exiting.');
      return;
    }
    
    // Group submissions by paper number (last character of subject code)
    const groupedByPaper = {};
    
    submissions.forEach(submission => {
      const test = submission.testId;
      const subjectCode = test?.subject?.subjectCode || 'UNKNOWN';
      
      // Extract paper number from last character of subject code
      const lastChar = subjectCode.slice(-1);
      const paperNumber = isNaN(lastChar) ? 'Unknown' : lastChar;
      const paperKey = `Paper ${paperNumber}`;
      
      if (!groupedByPaper[paperKey]) {
        groupedByPaper[paperKey] = [];
      }
      
      groupedByPaper[paperKey].push(submission);
    });
    
    console.log('Papers found:', Object.keys(groupedByPaper));
    
    // Sort each paper group by enrollment number
    Object.keys(groupedByPaper).forEach(paperKey => {
      groupedByPaper[paperKey].sort((a, b) => {
        const enrollmentA = a.userId?.enrollmentNo || a.enrollmentNo || '';
        const enrollmentB = b.userId?.enrollmentNo || b.enrollmentNo || '';
        return enrollmentA.localeCompare(enrollmentB);
      });
    });
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    
    // Process each paper separately
    Object.keys(groupedByPaper).sort().forEach(paperKey => {
      const paperSubmissions = groupedByPaper[paperKey];
      
      // Create worksheet for this paper
      const worksheet = workbook.addWorksheet(paperKey);
    
      // Add headers
      worksheet.columns = [
        { header: 'Enrollment No', key: 'enrollmentNo', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Course', key: 'course', width: 15 },
        { header: 'Subject Code', key: 'subjectCode', width: 15 },
        { header: 'Score', key: 'score', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Test Started At', key: 'testStartedAt', width: 20 },
        { header: 'Submission Time', key: 'submissionTime', width: 20 }
      ];
      
      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      
      // Process submissions for this paper
      paperSubmissions.forEach((submission, index) => {
        const student = submission.userId;
        const test = submission.testId;
        
        // Calculate score
        const totalQuestions = submission.answers?.length || 0;
        const correctAnswers = submission.answers?.filter(ans => ans.isCorrect).length || 0;
        const scorePercentage = totalQuestions > 0 ? ((correctAnswers / totalQuestions) * 100).toFixed(2) : 0;
        
        // Determine status
        let status = 'Completed';
        if (submission.isDraft) status = 'Draft';
        if (!submission.isCompleted) status = 'Incomplete';
        
        const rowData = {
          enrollmentNo: student?.enrollmentNo || submission.enrollmentNo || 'N/A',
          name: student?.fullName || 'N/A',
          course: student?.course || submission.course || 'N/A',
          subjectCode: test?.subject?.subjectCode || 'N/A',
          score: `${correctAnswers}/${totalQuestions} (${scorePercentage}%)`,
          status: status,
          testStartedAt: submission.testStartedAt ? new Date(submission.testStartedAt).toLocaleString() : 'N/A',
          submissionTime: submission.createdAt?.toLocaleString() || 'N/A'
        };
        
        const row = worksheet.addRow(rowData);
        const rowNumber = index + 2; // +2 because index starts at 0 and row 1 is header
        
        // Apply conditional formatting based on status and score
        let fillColor = 'FFFFFFFF'; // Default white
        
        if (status === 'Incomplete' || status === 'Draft') {
          fillColor = 'FFFFA500'; // Orange
        } else if (status === 'Completed') {
          if (correctAnswers >= 28) {
            fillColor = 'FF90EE90'; // Light Green
          } else {
            fillColor = 'FFFF6B6B'; // Light Red
          }
        }
        
        // Apply the fill color to all cells in the row
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: fillColor }
          };
        });
      });
      
      // Add borders to all cells for this worksheet
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });
      
      console.log(`${paperKey}: ${paperSubmissions.length} submissions`);
    });
    
    // Generate filename with today's date
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    const filename = `Todays_Submissions_${dateStr}.xlsx`;
    const filepath = path.join(__dirname, filename);
    
    // Save the file
    await workbook.xlsx.writeFile(filepath);
    
    console.log('\nExport completed successfully!');
    console.log(`File saved as: ${filename}`);
    console.log(`Full path: ${filepath}`);
    console.log(`Total submissions exported: ${submissions.length}`);
    
    // Summary statistics
    const completedCount = submissions.filter(s => s.isCompleted && !s.isDraft).length;
    const draftCount = submissions.filter(s => s.isDraft).length;
    const incompleteCount = submissions.filter(s => !s.isCompleted).length;
    
    // Count unique students
    const uniqueStudents = new Set(submissions.map(s => s.userId?._id?.toString()).filter(Boolean));
    const uniqueStudentCount = uniqueStudents.size;
    
    console.log('\nSummary:');
    console.log(`  Total submissions: ${submissions.length}`);
    console.log(`  Unique students: ${uniqueStudentCount}`);
    console.log(`  Average submissions per student: ${uniqueStudentCount > 0 ? (submissions.length / uniqueStudentCount).toFixed(2) : 0}`);
    console.log(`  Completed submissions: ${completedCount}`);
    console.log(`  Draft submissions: ${draftCount}`);
    console.log(`  Incomplete submissions: ${incompleteCount}`);
    
  } catch (error) {
    console.error('Error during export:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

// Check if ExcelJS is installed
try {
  require('exceljs');
} catch (error) {
  console.error('ExcelJS is not installed. Please run: npm install exceljs');
  process.exit(1);
}

exportTodaysSubmissions().catch(err => {
  console.error('Fatal error during export:', err);
  process.exit(1);
});
