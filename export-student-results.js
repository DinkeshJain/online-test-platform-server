require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;

// Import models
const Student = require('./models/Student');
const Test = require('./models/Test');
const Submission = require('./models/Submission');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Function to export student results to Excel
const exportStudentResults = async (dateFilter = null, courseFilter = null) => {
  try {
    console.log('📊 Starting student results export...\n');

    // Step 1: Get all students
    console.log('👥 Fetching all students...');
    let studentQuery = {};
    if (courseFilter) {
      studentQuery.course = courseFilter;
    }
    
    const students = await Student.find(studentQuery)
      .select('enrollmentNo fullName course batchYear')
      .sort({ course: 1, enrollmentNo: 1 });

    console.log(`Found ${students.length} students\n`);

    // Step 2: Get all tests with subject information
    console.log('📚 Fetching all tests...');
    let testQuery = {};
    
    if (dateFilter) {
      const startDate = new Date(dateFilter);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      
      testQuery.$or = [
        {
          createdAt: {
            $gte: startDate,
            $lt: endDate
          }
        },
        {
          activeFrom: { $lte: endDate },
          activeTo: { $gte: startDate }
        }
      ];
    }

    const tests = await Test.find(testQuery)
      .select('subject courseCode courseName questions')
      .sort({ 'subject.subjectCode': 1 });

    console.log(`Found ${tests.length} tests\n`);

    // Step 3: Get unique subjects from tests
    const subjectMap = new Map();
    tests.forEach(test => {
      if (test.subject && test.subject.subjectCode) {
        const key = test.subject.subjectCode;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            subjectCode: test.subject.subjectCode,
            subjectName: test.subject.subjectName,
            testId: test._id,
            totalQuestions: test.questions ? test.questions.length : 0
          });
        }
      }
    });

    const subjects = Array.from(subjectMap.values()).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
    console.log(`Found ${subjects.length} unique subjects\n`);

    // Step 4: Get all submissions
    console.log('📝 Fetching all submissions...');
    const submissions = await Submission.find({})
      .populate('testId', 'subject')
      .populate('userId', 'enrollmentNo fullName course')
      .select('testId userId enrollmentNo score totalQuestions answeredQuestions submittedAt status');

    console.log(`Found ${submissions.length} submissions\n`);

    // Step 5: Create submissions lookup
    const submissionLookup = {};
    submissions.forEach(sub => {
      if (sub.enrollmentNo && sub.testId && sub.testId.subject) {
        const key = `${sub.enrollmentNo}_${sub.testId.subject.subjectCode}`;
        submissionLookup[key] = sub;
      }
    });

    // Step 6: Create Excel workbook
    console.log('📄 Creating Excel workbook...');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Student Results');

    // Step 7: Create headers
    const headers = ['S.No.', 'Enrollment Number', 'Student Name', 'Course', 'Batch Year'];
    
    // Add subject headers
    subjects.forEach(subject => {
      headers.push(`${subject.subjectCode}\n${subject.subjectName}`);
    });

    // Add summary columns
    headers.push('Total\nSubjects', 'Attempted', 'Absent', 'Passed\n(≥30)', 'Failed\n(<30)', 'Average\nScore');

    const headerRow = worksheet.addRow(headers);

    // Style the header row
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '366092' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headerRow.height = 40;

    // Step 8: Process each student
    console.log('🔄 Processing student data...');
    let processedCount = 0;
    let serialNumber = 1;

    for (const student of students) {
      const row = [
        serialNumber++,
        student.enrollmentNo || 'N/A',
        student.fullName || 'N/A',
        student.course || 'N/A',
        student.batchYear || 'N/A'
      ];

      let totalSubjects = subjects.length;
      let attempted = 0;
      let absent = 0;
      let passed = 0;
      let failed = 0;
      let totalScore = 0;
      let scoreCount = 0;

      // Add scores for each subject
      subjects.forEach(subject => {
        const submissionKey = `${student.enrollmentNo}_${subject.subjectCode}`;
        const submission = submissionLookup[submissionKey];

        if (submission && submission.score !== undefined && submission.score !== null) {
          // Student attempted the test
          attempted++;
          let score = submission.score;
          
          // Convert percentage to actual score if needed
          if (score <= 1 && score > 0) {
            score = Math.round((score * subject.totalQuestions) * 100) / 100;
          } else {
            score = Math.round(score * 100) / 100; // Round to 2 decimal places
          }
          
          row.push(score);
          
          totalScore += score;
          scoreCount++;

          if (score >= 30) {
            passed++;
          } else {
            failed++;
          }
        } else {
          // Student was absent or didn't attempt
          absent++;
          row.push('AB');
        }
      });

      // Add summary data
      const averageScore = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 100) / 100 : 0;
      
      row.push(totalSubjects, attempted, absent, passed, failed, averageScore);

      // Add row to worksheet
      const dataRow = worksheet.addRow(row);
      
      // Style the row
      dataRow.alignment = { horizontal: 'center', vertical: 'middle' };
      dataRow.height = 25;

      // Apply conditional formatting
      dataRow.eachCell((cell, colNumber) => {
        // Add borders
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };

        if (colNumber > 5 && colNumber <= 5 + subjects.length) {
          // Subject score columns
          if (cell.value === 'AB') {
            // Mark absent students in red
            cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 10 };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'DC3545' } // Red background
            };
          } else if (typeof cell.value === 'number' && cell.value < 30) {
            // Mark scores less than 30 in red
            cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 10 };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'DC3545' } // Red background
            };
          } else if (typeof cell.value === 'number' && cell.value >= 30) {
            // Mark passing scores in green
            cell.font = { color: { argb: 'FFFFFF' }, size: 10 };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: '28A745' } // Green background
            };
          }
        } else if (colNumber > 5 + subjects.length) {
          // Summary columns - style based on values
          if (colNumber === 5 + subjects.length + 4) { // Failed column
            if (typeof cell.value === 'number' && cell.value > 0) {
              cell.font = { color: { argb: 'DC3545' }, bold: true, size: 10 };
            }
          } else if (colNumber === 5 + subjects.length + 6) { // Average score column
            if (typeof cell.value === 'number') {
              if (cell.value < 30) {
                cell.font = { color: { argb: 'DC3545' }, bold: true, size: 10 };
              } else {
                cell.font = { color: { argb: '28A745' }, bold: true, size: 10 };
              }
            }
          }
        }
      });

      processedCount++;
      if (processedCount % 50 === 0) {
        console.log(`Processed ${processedCount}/${students.length} students...`);
      }
    }

    // Step 9: Auto-fit columns
    console.log('🎨 Formatting Excel file...');
    worksheet.columns.forEach((column, index) => {
      if (index === 0) { // S.No.
        column.width = 6;
      } else if (index === 1) { // Enrollment Number
        column.width = 15;
      } else if (index === 2) { // Student Name
        column.width = 25;
      } else if (index === 3) { // Course
        column.width = 12;
      } else if (index === 4) { // Batch Year
        column.width = 18;
      } else if (index > 4 && index <= 4 + subjects.length) {
        // Subject columns
        column.width = 12;
      } else {
        // Summary columns
        column.width = 10;
      }
    });

    // Add borders to header row
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thick' },
        left: { style: 'thick' },
        bottom: { style: 'thick' },
        right: { style: 'thick' }
      };
    });

    // Step 10: Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary Statistics');
    
    // Calculate overall statistics
    const overallStats = {
      totalStudents: students.length,
      totalTests: tests.length,
      totalSubjects: subjects.length,
      totalSubmissions: submissions.length,
      averageAttendance: 0,
      overallPassRate: 0
    };

    // Calculate attendance and pass rates
    let totalPossibleSubmissions = 0;
    let totalActualSubmissions = 0;
    let totalPassed = 0;
    let totalAttempted = 0;

    students.forEach(student => {
      subjects.forEach(subject => {
        totalPossibleSubmissions++;
        const submissionKey = `${student.enrollmentNo}_${subject.subjectCode}`;
        const submission = submissionLookup[submissionKey];
        
        if (submission && submission.score !== undefined && submission.score !== null) {
          totalActualSubmissions++;
          totalAttempted++;
          let score = submission.score;
          
          // Convert percentage to actual score if needed
          if (score <= 1 && score > 0) {
            score = score * subject.totalQuestions;
          }
          
          if (score >= 30) {
            totalPassed++;
          }
        }
      });
    });

    overallStats.averageAttendance = totalPossibleSubmissions > 0 ? 
      Math.round((totalActualSubmissions / totalPossibleSubmissions) * 10000) / 100 : 0;
    
    overallStats.overallPassRate = totalAttempted > 0 ? 
      Math.round((totalPassed / totalAttempted) * 10000) / 100 : 0;

    // Add summary data
    const summaryData = [
      ['📊 OVERALL STATISTICS', ''],
      ['Metric', 'Value'],
      ['Total Students', overallStats.totalStudents],
      ['Total Subjects', overallStats.totalSubjects],
      ['Total Tests', overallStats.totalTests],
      ['Total Submissions', overallStats.totalSubmissions],
      ['Average Attendance Rate', `${overallStats.averageAttendance}%`],
      ['Overall Pass Rate (≥30)', `${overallStats.overallPassRate}%`],
      ['', ''],
      ['📅 EXPORT DETAILS', ''],
      ['Export Date', new Date().toLocaleString()],
      ['Date Filter', dateFilter || 'All dates'],
      ['Course Filter', courseFilter || 'All courses'],
      ['', ''],
      ['🎨 COLOR CODING', ''],
      ['Red Background', 'Score < 30 or Absent'],
      ['Green Background', 'Score ≥ 30 (Passing)'],
      ['Blue Header', 'Column Headers']
    ];

    summaryData.forEach((rowData, index) => {
      const summaryRow = summarySheet.addRow(rowData);
      
      if (index === 0 || index === 9 || index === 14) {
        // Header rows
        summaryRow.font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
        summaryRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '366092' }
        };
      } else if (index === 1) {
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
    summarySheet.columns[1].width = 20;

    // Step 11: Create course-wise analysis sheet
    const courseSheet = workbook.addWorksheet('Course-wise Analysis');
    
    // Group students by course
    const courseStats = {};
    students.forEach(student => {
      const course = student.course || 'Unknown';
      if (!courseStats[course]) {
        courseStats[course] = {
          totalStudents: 0,
          totalAttempted: 0,
          totalPassed: 0,
          totalFailed: 0,
          totalAbsent: 0,
          averageScore: 0,
          totalScore: 0,
          scoreCount: 0
        };
      }
      
      courseStats[course].totalStudents++;
      
      // Calculate stats for this student
      subjects.forEach(subject => {
        const submissionKey = `${student.enrollmentNo}_${subject.subjectCode}`;
        const submission = submissionLookup[submissionKey];
        
        if (submission && submission.score !== undefined && submission.score !== null) {
          courseStats[course].totalAttempted++;
          let score = submission.score;
          
          if (score <= 1 && score > 0) {
            score = score * subject.totalQuestions;
          }
          
          courseStats[course].totalScore += score;
          courseStats[course].scoreCount++;
          
          if (score >= 30) {
            courseStats[course].totalPassed++;
          } else {
            courseStats[course].totalFailed++;
          }
        } else {
          courseStats[course].totalAbsent++;
        }
      });
    });

    // Calculate averages
    Object.keys(courseStats).forEach(course => {
      const stats = courseStats[course];
      stats.averageScore = stats.scoreCount > 0 ? 
        Math.round((stats.totalScore / stats.scoreCount) * 100) / 100 : 0;
    });

    // Add course analysis data
    const courseHeaders = ['Course', 'Total Students', 'Total Attempts', 'Passed (≥30)', 'Failed (<30)', 'Absent', 'Average Score', 'Pass Rate %'];
    const courseHeaderRow = courseSheet.addRow(courseHeaders);
    
    courseHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    courseHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '366092' }
    };
    courseHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };

    Object.keys(courseStats).sort().forEach(course => {
      const stats = courseStats[course];
      const passRate = stats.totalAttempted > 0 ? 
        Math.round((stats.totalPassed / stats.totalAttempted) * 10000) / 100 : 0;
      
      const courseRow = courseSheet.addRow([
        course,
        stats.totalStudents,
        stats.totalAttempted,
        stats.totalPassed,
        stats.totalFailed,
        stats.totalAbsent,
        stats.averageScore,
        `${passRate}%`
      ]);
      
      courseRow.alignment = { horizontal: 'center', vertical: 'middle' };
      courseRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Auto-fit course sheet columns
    courseSheet.columns.forEach(column => {
      column.width = 15;
    });

    // Step 12: Save the file
    const timestamp = new Date().toISOString().split('T')[0];
    const fileNameParts = ['Student_Results_Export', timestamp];
    
    if (dateFilter) {
      fileNameParts.push(dateFilter);
    }
    if (courseFilter) {
      fileNameParts.push(courseFilter);
    }
    
    const fileName = `${fileNameParts.join('_')}.xlsx`;
    const filePath = path.join(__dirname, fileName);
    
    await workbook.xlsx.writeFile(filePath);

    console.log('\n✅ Export completed successfully!');
    console.log(`📁 File saved to: ${filePath}`);
    console.log(`📊 Total students: ${students.length}`);
    console.log(`📚 Total subjects: ${subjects.length}`);
    console.log(`📝 Total submissions: ${submissions.length}`);
    console.log(`📈 Average attendance: ${overallStats.averageAttendance}%`);
    console.log(`🎯 Overall pass rate: ${overallStats.overallPassRate}%`);

    return filePath;

  } catch (error) {
    console.error('❌ Error exporting student results:', error);
    throw error;
  }
};

// Function to update incorrect answer logic
const updateIncorrectAnswers = async () => {
  try {
    console.log('🔧 Starting incorrect answer logic update...\n');

    // Find all submissions with potentially incorrect answers
    const submissions = await Submission.find({})
      .populate({
        path: 'testId',
        select: 'questions subject'
      })
      .populate('userId', 'enrollmentNo fullName');

    console.log(`📝 Found ${submissions.length} submissions to analyze\n`);

    let questionsToUpdate = [];
    let affectedSubmissions = [];

    for (const submission of submissions) {
      if (!submission.testId || !submission.testId.questions || !submission.answers) {
        continue;
      }

      const test = submission.testId;
      
      // Check each answer in the submission
      submission.answers.forEach((answer, answerIndex) => {
        const questionIndex = answer.originalQuestionNumber - 1;
        
        if (questionIndex >= 0 && questionIndex < test.questions.length) {
          const question = test.questions[questionIndex];
          
          // Check if the answer logic seems incorrect
          let potentialIssue = false;
          let issueType = '';

          // Issue 1: correctAnswer is out of range
          if (question.correctAnswer < 0 || question.correctAnswer > 3) {
            potentialIssue = true;
            issueType = 'correctAnswer out of range (0-3)';
          }
          
          // Issue 2: correctAnswer is null/undefined
          if (question.correctAnswer === null || question.correctAnswer === undefined) {
            potentialIssue = true;
            issueType = 'correctAnswer is null/undefined';
          }
          
          // Issue 3: Most students got it wrong (more than 80% failure rate)
          // This requires analyzing multiple submissions for the same question
          
          if (potentialIssue) {
            const questionKey = `${test._id}_${questionIndex}`;
            const existingIssue = questionsToUpdate.find(q => q.key === questionKey);
            
            if (!existingIssue) {
              questionsToUpdate.push({
                key: questionKey,
                testId: test._id,
                questionIndex: questionIndex,
                questionText: question.question ? question.question.substring(0, 100) + '...' : 'No question text',
                currentCorrectAnswer: question.correctAnswer,
                issueType: issueType,
                subjectCode: test.subject ? test.subject.subjectCode : 'Unknown',
                affectedCount: 1
              });
            } else {
              existingIssue.affectedCount++;
            }
            
            affectedSubmissions.push({
              submissionId: submission._id,
              enrollmentNo: submission.enrollmentNo,
              studentName: submission.userId ? submission.userId.fullName : 'Unknown',
              testId: test._id,
              questionIndex: questionIndex
            });
          }
        }
      });
    }

    if (questionsToUpdate.length === 0) {
      console.log('✅ No questions found with obvious incorrect logic!');
      console.log('📊 All questions appear to have valid correctAnswer values.');
      return;
    }

    console.log(`⚠️ Found ${questionsToUpdate.length} questions with potential issues:`);
    console.log('━'.repeat(80));

    questionsToUpdate.forEach((q, index) => {
      console.log(`${index + 1}. Subject: ${q.subjectCode}`);
      console.log(`   Test ID: ${q.testId}`);
      console.log(`   Question Index: ${q.questionIndex}`);
      console.log(`   Question: ${q.questionText}`);
      console.log(`   Current Correct Answer: ${q.currentCorrectAnswer}`);
      console.log(`   Issue: ${q.issueType}`);
      console.log(`   Affected Submissions: ${q.affectedCount}`);
      console.log('─'.repeat(40));
    });

    console.log(`\n📝 Total affected submissions: ${affectedSubmissions.length}`);

    // Ask for confirmation before updating
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\n🔧 Do you want to proceed with fixes? This will:\n' +
                  '   1. Set invalid correctAnswer values to 0\n' +
                  '   2. Mark questions for manual review\n' +
                  '   3. Recalculate affected submission scores\n' +
                  'Continue? (y/n): ', async (answer) => {
        
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          console.log('\n🔄 Applying fixes...');
          
          let fixedQuestions = 0;
          let recalculatedSubmissions = 0;

          for (const questionInfo of questionsToUpdate) {
            try {
              // Fix the question
              const updateData = {};
              
              if (questionInfo.currentCorrectAnswer === null || 
                  questionInfo.currentCorrectAnswer === undefined ||
                  typeof questionInfo.currentCorrectAnswer !== 'number' ||
                  questionInfo.currentCorrectAnswer < 0 ||
                  questionInfo.currentCorrectAnswer > 3) {
                
                updateData[`questions.${questionInfo.questionIndex}.correctAnswer`] = 0;
                updateData[`questions.${questionInfo.questionIndex}.needsManualReview`] = true;
                updateData[`questions.${questionInfo.questionIndex}.fixedAt`] = new Date();
              }

              if (Object.keys(updateData).length > 0) {
                await Test.updateOne(
                  { _id: questionInfo.testId },
                  { $set: updateData }
                );
                fixedQuestions++;
                
                console.log(`✅ Fixed question ${questionInfo.questionIndex + 1} in test ${questionInfo.testId}`);
              }
            } catch (error) {
              console.error(`❌ Error fixing question in test ${questionInfo.testId}:`, error.message);
            }
          }

          // Recalculate scores for affected submissions
          console.log('\n🔄 Recalculating submission scores...');
          
          const affectedTestIds = [...new Set(affectedSubmissions.map(s => s.testId))];
          
          for (const testId of affectedTestIds) {
            try {
              const test = await Test.findById(testId);
              const submissionsForTest = await Submission.find({ testId: testId });
              
              for (const submission of submissionsForTest) {
                let newScore = 0;
                let correctAnswers = 0;
                
                if (submission.answers && submission.answers.length > 0) {
                  submission.answers.forEach(answer => {
                    const questionIndex = answer.originalQuestionNumber - 1;
                    if (questionIndex >= 0 && questionIndex < test.questions.length) {
                      const question = test.questions[questionIndex];
                      if (answer.selectedAnswer === question.correctAnswer) {
                        correctAnswers++;
                      }
                    }
                  });
                  
                  newScore = correctAnswers;
                }
                
                if (submission.score !== newScore) {
                  submission.score = newScore;
                  submission.recalculatedAt = new Date();
                  await submission.save();
                  recalculatedSubmissions++;
                }
              }
            } catch (error) {
              console.error(`❌ Error recalculating scores for test ${testId}:`, error.message);
            }
          }

          console.log(`\n✅ Fixed ${fixedQuestions} questions`);
          console.log(`✅ Recalculated ${recalculatedSubmissions} submission scores`);
          console.log('⚠️  Questions with fixes are marked for manual review');
          console.log('📝 Please review the fixed questions and set correct answers manually');
        } else {
          console.log('\n❌ Update cancelled');
        }
        
        rl.close();
        resolve();
      });
    });

  } catch (error) {
    console.error('❌ Error updating incorrect answers:', error);
  }
};

// Main execution function
const main = async () => {
  await connectDB();
  
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('🎓 STUDENT RESULTS EXPORT & ANSWER CORRECTION TOOL');
  console.log('=' .repeat(60));

  try {
    if (command === 'export') {
      const dateFilter = args[1]; // Optional: YYYY-MM-DD format
      const courseFilter = args[2]; // Optional: course code
      
      await exportStudentResults(dateFilter, courseFilter);
    } else if (command === 'fix-answers') {
      await updateIncorrectAnswers();
    } else {
      console.log('\n📋 Available commands:');
      console.log('  export [date] [course]     - Export student results to Excel');
      console.log('  fix-answers               - Update incorrect answer logic');
      console.log('\nExamples:');
      console.log('  node export-student-results.js export');
      console.log('  node export-student-results.js export 2025-08-25');
      console.log('  node export-student-results.js export 2025-08-25 DHSE');
      console.log('  node export-student-results.js fix-answers');
    }
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n👋 Script interrupted by user');
  mongoose.connection.close();
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main();
}
