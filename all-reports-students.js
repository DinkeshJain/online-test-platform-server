require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');

// Import models
const Student = require('./models/Student');
const Test = require('./models/Test');
const Submission = require('./models/Submission');
const InternalMarks = require('./models/InternalMarks');
const Course = require('./models/Course');

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

async function exportStudentResults() {
  try {
    console.log('📊 Starting Excel export by subject with exam data format...');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
    console.log(process.env.MONGO_URI);

    // Get all students
    const students = await Student.find({})
      .select('enrollmentNo fullName course batchYear emailId')
      .sort({ course: 1, enrollmentNo: 1 });

    console.log(`Found ${students.length} students`);

    // Get all tests with subjects and questions
    const tests = await Test.find({})
      .select('subject questions courseCode courseName testType duration')
      .sort({ 'subject.subjectCode': 1 });

    // Get all courses to identify subjects without external exams
    const courses = await Course.find({})
      .select('courseName courseCode subjects')
      .sort({ courseCode: 1 });

    console.log(`Found ${courses.length} courses`);

    // Create subjects grouped by course
    const courseSubjects = {};
    const subjectTestMap = new Map();
    const noExternalExamSubjects = new Map(); // Track subjects without external exam
    
    // First, collect subjects from courses that don't have external exams
    courses.forEach(course => {
      if (course.subjects && Array.isArray(course.subjects)) {
        course.subjects.forEach(subject => {
          if (subject.hasExternalExam === false) {
            const subjectInfo = {
              code: subject.subjectCode,
              name: subject.subjectName,
              course: course.courseCode,
              hasExternalExam: false
            };
            noExternalExamSubjects.set(subject.subjectCode, subjectInfo);
            
            // Also add to courseSubjects
            if (!courseSubjects[course.courseCode]) {
              courseSubjects[course.courseCode] = [];
            }
            courseSubjects[course.courseCode].push(subjectInfo);
          }
        });
      }
    });
    
    tests.forEach(test => {
      if (test.subject && test.subject.subjectCode) {
        // Determine course from subject code (remove numbers to get course code)
        const courseCode = test.subject.subjectCode.replace(/\d+$/, '');
        
        if (!courseSubjects[courseCode]) {
          courseSubjects[courseCode] = [];
        }
        
        if (!subjectTestMap.has(test.subject.subjectCode)) {
          const subjectInfo = {
            code: test.subject.subjectCode,
            name: test.subject.subjectName,
            course: courseCode,
            tests: []
          };
          
          subjectTestMap.set(test.subject.subjectCode, subjectInfo);
          courseSubjects[courseCode].push(subjectInfo);
        }
        
        // Add test to subject
        subjectTestMap.get(test.subject.subjectCode).tests.push({
          _id: test._id,
          title: test.displayTitle || `${test.subject.subjectCode} Test`,
          totalQuestions: test.questions.length,
          duration: test.duration,
          testType: test.testType || 'official'
        });
      }
    });

    // Sort subjects within each course
    Object.keys(courseSubjects).forEach(course => {
      courseSubjects[course].sort((a, b) => a.code.localeCompare(b.code));
    });

    const allSubjects = Array.from(subjectTestMap.values());
    console.log(`Found ${allSubjects.length} subjects across ${Object.keys(courseSubjects).length} courses`);

    // Get all submissions with detailed information
    const submissions = await Submission.find({})
      .populate('testId', 'subject questions')
      .select('enrollmentNo score testId totalQuestions answers submittedAt testStartedAt timeSpent userId isDraft isCompleted')
      .sort({ submittedAt: -1 });

    console.log(`Found ${submissions.length} submissions`);

    // Get all internal marks
    const internalMarks = await InternalMarks.find({})
      .select('studentId courseId subjectCode internalMarks evaluatorId')
      .populate('studentId', 'enrollmentNo')
      .sort({ subjectCode: 1 });

    console.log(`Found ${internalMarks.length} internal marks records`);

    // Create lookup for internal marks by enrollment number and subject code
    const internalMarksLookup = {};
    internalMarks.forEach(mark => {
      if (mark.studentId && mark.studentId.enrollmentNo) {
        const key = `${mark.studentId.enrollmentNo}_${mark.subjectCode}`;
        internalMarksLookup[key] = mark.internalMarks;
      }
    });

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

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

    // Create a worksheet for each subject (organized by course)
    Object.keys(courseSubjects).sort().forEach(course => {
      const courseSubjectList = courseSubjects[course] || [];
      const courseStudents = studentsByCourse[course] || [];
      
      console.log(`Processing ${course} course with ${courseSubjectList.length} subjects and ${courseStudents.length} students`);
      
      // Create a sheet for each subject in this course
      courseSubjectList.forEach(subject => {
        console.log(`Creating sheet for ${subject.code} - ${subject.name}`);
        
        // Check if this is a subject without external exam
        if (subject.hasExternalExam === false) {
          // Handle subjects without external exam - simplified format
          console.log(`📝 Processing subject without external exam: ${subject.code}`);
          
          // Create simplified headers for subjects without external exam
          const headers = [
            'Enrollment Number',
            'Full Name', 
            'Student Email Address',
            'Grade Points',
            'Grade',
            'Total Marks/100'
          ];
          const rows = [headers];

          // Process each student for this course
          courseStudents.forEach(student => {
            // Get internal marks for this student and subject (these are the final marks)
            const internalMarksKey = `${student.enrollmentNo}_${subject.code}`;
            const finalMarks = internalMarksLookup[internalMarksKey] || '';

            const row = [
              student.enrollmentNo,
              student.fullName,
              student.emailId || '-',
              '', // Grade Points - will be formula
              '', // Grade - will be formula
              finalMarks
            ];
            rows.push(row);
          });

          // Create worksheet for no external exam subject
          const worksheet = XLSX.utils.aoa_to_sheet(rows);

          // Set column widths
          const colWidths = [
            { width: 20 }, // Enrollment Number
            { width: 30 }, // Full Name
            { width: 35 }, // Email
            { width: 15 }, // Grade Points
            { width: 10 }, // Grade
            { width: 20 }  // Final Marks
          ];
          worksheet['!cols'] = colWidths;

          // Header styling - simple border only
          const headerStyle = {
            font: { bold: true },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: 'thin', color: { rgb: "000000" } },
              left: { style: 'thin', color: { rgb: "000000" } },
              bottom: { style: 'thin', color: { rgb: "000000" } },
              right: { style: 'thin', color: { rgb: "000000" } }
            }
          };

          // Apply header styling
          for (let col = 0; col < headers.length; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
            if (!worksheet[cellRef]) worksheet[cellRef] = {};
            worksheet[cellRef].s = headerStyle;
          }

          // Add borders and center alignment to data cells
          for (let row = 1; row < rows.length; row++) {
            for (let col = 0; col < headers.length; col++) {
              const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
              if (!worksheet[cellRef]) {
                worksheet[cellRef] = { v: rows[row][col], t: typeof rows[row][col] === 'number' ? 'n' : 's' };
              }
              if (!worksheet[cellRef].s) worksheet[cellRef].s = {};
              worksheet[cellRef].s.border = {
                top: { style: 'thin', color: { rgb: "000000" } },
                left: { style: 'thin', color: { rgb: "000000" } },
                bottom: { style: 'thin', color: { rgb: "000000" } },
                right: { style: 'thin', color: { rgb: "000000" } }
              };
              // Add center alignment to all cells
              worksheet[cellRef].s.alignment = { horizontal: "center", vertical: "center" };
            }
          }

          // Add formulas for Grade Points and Grade columns for no external exam subjects
          const gradePointsCol = 3; // Grade Points column
          const gradeCol = 4; // Grade column  
          const totalMarksCol = 5; // Total Marks column

          for (let row = 1; row < rows.length; row++) {
            const totalMarksCellRef = XLSX.utils.encode_cell({ r: row, c: totalMarksCol });
            const gradePointsCellRef = XLSX.utils.encode_cell({ r: row, c: gradePointsCol });
            const gradeCellRef = XLSX.utils.encode_cell({ r: row, c: gradeCol });

            // For no external exam subjects, we use total marks directly for grading
            // Grade Points formula using nested IF statements based on total marks
            worksheet[gradePointsCellRef] = {
              f: `IF(${totalMarksCellRef}="","",IF(${totalMarksCellRef}>=90,10,IF(${totalMarksCellRef}>=80,9,IF(${totalMarksCellRef}>=70,8,IF(${totalMarksCellRef}>=60,7,IF(${totalMarksCellRef}>=50,6,IF(${totalMarksCellRef}>=40,5,"-")))))))`,
              t: 's'
            };

            // Grade formula using nested IF statements based on total marks
            worksheet[gradeCellRef] = {
              f: `IF(${totalMarksCellRef}="","",IF(${totalMarksCellRef}>=90,"O",IF(${totalMarksCellRef}>=80,"A",IF(${totalMarksCellRef}>=70,"B",IF(${totalMarksCellRef}>=60,"C",IF(${totalMarksCellRef}>=50,"D",IF(${totalMarksCellRef}>=40,"E","F")))))))`,
              t: 's'
            };
          }

          // Add worksheet to workbook
          const sheetName = `${subject.code} Report (No External)`;
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
          
          return; // Skip the regular test-based processing for this subject
        }
        
        // Regular processing for subjects with external exams
        // Filter tests to only include official tests
        const officialTests = subject.tests ? subject.tests.filter(test => test.testType === 'official') : [];
        
        if (officialTests.length === 0) {
          console.log(`⚠️ No official tests found for subject ${subject.code}, skipping...`);
          return;
        }

        // Get submissions for this subject's official tests only
        const officialTestIds = officialTests.map(test => test._id.toString());
        const subjectSubmissions = submissions.filter(sub => 
          sub.testId && officialTestIds.includes(sub.testId._id.toString()) &&
          !sub.isDraft && sub.isCompleted
        );

        // Group submissions by student enrollment number
        const submissionsByStudent = new Map();
        subjectSubmissions.forEach(submission => {
          if (!submissionsByStudent.has(submission.enrollmentNo)) {
            submissionsByStudent.set(submission.enrollmentNo, []);
          }
          submissionsByStudent.get(submission.enrollmentNo).push(submission);
        });

        // Find the test with maximum questions for this subject (official tests only)
        const maxQuestions = Math.max(...officialTests.map(test => test.totalQuestions), 0);

        // Build headers based on export-exam-data.js format
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

        // Process each student for this course only
        courseStudents.forEach(student => {
          const studentSubmissions = submissionsByStudent.get(student.enrollmentNo) || [];
          
          // Process each official test for this subject
          officialTests.forEach(test => {
            // Find submission for this test
            const submission = studentSubmissions.find(
              sub => sub.testId && sub.testId._id.toString() === test._id.toString()
            );

            const fullQuestionNumbers = Array.from({ length: maxQuestions }, (_, i) => i + 1);
            const answerMap = {};

            if (submission && submission.answers && Array.isArray(submission.answers)) {
              submission.answers.forEach(answer => {
                answerMap[answer.originalQuestionNumber] = answer.isCorrect ? '1.00' : '0.00';
              });
            }

            const questionStatuses = fullQuestionNumbers.map(qNum =>
              answerMap.hasOwnProperty(qNum) ? answerMap[qNum] : '-'
            );

            if (submission) {
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

              const gradeOutOfTotal = submission.score || 0;
              
              // Get internal marks for this student and subject
              const internalMarksKey = `${student.enrollmentNo}_${subject.code}`;
              const internalMarks = internalMarksLookup[internalMarksKey] || 0;
              
              // We'll use formulas for Total Marks, Grade Points, and Grade
              // For now, store the values for reference
              const totalMarks = gradeOutOfTotal + internalMarks;
              const { gradePoints, grade } = calculateGradeAndPoints(totalMarks, gradeOutOfTotal, maxQuestions);

              const row = [
                student.enrollmentNo,
                student.fullName,
                student.emailId || '-',
                'Finished',
                testStartedOn,
                testCompletedOn,
                formatTimeSpent(submission.timeSpent, test.duration,
                  submission.testStartedAt, submission.submittedAt),
                '', // Grade Points - will be formula
                '', // Grade - will be formula
                '', // Total Marks - will be formula
                internalMarks || 0,
                gradeOutOfTotal,
                ...questionStatuses.map(status => status === '-' ? '-' : parseFloat(status))
              ];
              rows.push(row);

            } else {
              // Absent students - but they might still have internal marks
              const questionStatuses = new Array(maxQuestions).fill('-');
              
              // Get internal marks for this student and subject
              const internalMarksKey = `${student.enrollmentNo}_${subject.code}`;
              const internalMarks = internalMarksLookup[internalMarksKey] || 0;
              const externalMarks = 0; // Absent, so no external marks
              const totalMarks = externalMarks + internalMarks;
              
              const { gradePoints, grade } = calculateGradeAndPoints(totalMarks, externalMarks, maxQuestions, true);

              const row = [
                student.enrollmentNo,
                student.fullName,
                student.emailId || '-',
                'Absent',
                '-', '-', '-',
                '', // Grade Points - will be formula
                '', // Grade - will be formula  
                '', // Total Marks - will be formula
                internalMarks || 0, 
                externalMarks,
                ...questionStatuses
              ];
              rows.push(row);
            }
          });
        });

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

        // Header styling - simple border only
        const headerStyle = {
          font: { bold: true },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: 'thin', color: { rgb: "000000" } },
            left: { style: 'thin', color: { rgb: "000000" } },
            bottom: { style: 'thin', color: { rgb: "000000" } },
            right: { style: 'thin', color: { rgb: "000000" } }
          }
        };

        for (let col = 0; col < headers.length; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
          if (!worksheet[cellRef]) worksheet[cellRef] = {};
          worksheet[cellRef].s = headerStyle;
        }

        // Simple cell styling with borders and center alignment
        const basicCellStyle = {
          border: {
            top: { style: 'thin', color: { rgb: "000000" } },
            left: { style: 'thin', color: { rgb: "000000" } },
            bottom: { style: 'thin', color: { rgb: "000000" } },
            right: { style: 'thin', color: { rgb: "000000" } }
          },
          alignment: { horizontal: "center", vertical: "center" }
        };

        const gradePointsCol = 7;
        const gradeCol = 8;
        const totalMarksCol = 9;
        const internalMarksCol = 10;
        const externalMarksCol = 11;

        // Add formulas and styling for each data row
        for (let row = 1; row < rows.length; row++) {
          // Add formulas for Total Marks, Grade Points, and Grade
          const internalMarksCellRef = XLSX.utils.encode_cell({ r: row, c: internalMarksCol });
          const externalMarksCellRef = XLSX.utils.encode_cell({ r: row, c: externalMarksCol });
          const totalMarksCellRef = XLSX.utils.encode_cell({ r: row, c: totalMarksCol });
          const gradePointsCellRef = XLSX.utils.encode_cell({ r: row, c: gradePointsCol });
          const gradeCellRef = XLSX.utils.encode_cell({ r: row, c: gradeCol });

          // Total Marks formula: Internal + External
          worksheet[totalMarksCellRef] = {
            f: `${internalMarksCellRef}+${externalMarksCellRef}`,
            t: 'n'
          };

          // Grade Points formula using nested IF statements
          worksheet[gradePointsCellRef] = {
            f: `IF(${externalMarksCellRef}=0,"W",IF((${externalMarksCellRef}/70)*100<35,"-",IF(${totalMarksCellRef}>=90,10,IF(${totalMarksCellRef}>=80,9,IF(${totalMarksCellRef}>=70,8,IF(${totalMarksCellRef}>=60,7,IF(${totalMarksCellRef}>=50,6,IF(${totalMarksCellRef}>=40,5,"-"))))))))`,
            t: 's'
          };

          // Grade formula using nested IF statements  
          worksheet[gradeCellRef] = {
            f: `IF(${externalMarksCellRef}=0,"W",IF((${externalMarksCellRef}/70)*100<35,"F",IF(${totalMarksCellRef}>=90,"O",IF(${totalMarksCellRef}>=80,"A",IF(${totalMarksCellRef}>=70,"B",IF(${totalMarksCellRef}>=60,"C",IF(${totalMarksCellRef}>=50,"D",IF(${totalMarksCellRef}>=40,"E","F"))))))))`,
            t: 's'
          };

          // Get calculated values for styling (we need to evaluate the external marks from the original data)
          const externalMarks = parseFloat(rows[row][externalMarksCol]) || 0;

          // Apply simple styling with center alignment to all cells
          for (let col = 0; col < headers.length; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
            if (!worksheet[cellRef]) {
              worksheet[cellRef] = { v: rows[row][col], t: typeof rows[row][col] === 'number' ? 'n' : 's' };
            }
            if (!worksheet[cellRef].s) worksheet[cellRef].s = {};
            worksheet[cellRef].s = basicCellStyle;
          }
        }

        // Add worksheet to workbook
        const sheetName = `${subject.code} Report`;
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      });
    });

    // Save file
    const fileName = `Student_Results_by_Subject_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    console.log(`✅ Excel file created: ${fileName}`);
    
    const externalExamSubjectsCount = allSubjects.length;
    const noExternalExamSubjectsCount = noExternalExamSubjects.size;
    const totalSubjects = externalExamSubjectsCount + noExternalExamSubjectsCount;
    
    console.log(`📊 Created ${totalSubjects} subject sheets:`);
    console.log(`   - ${externalExamSubjectsCount} subjects with external exam (official tests)`);
    console.log(`   - ${noExternalExamSubjectsCount} subjects without external exam (internal marks only)`);
    console.log('📋 Simple styling: Bold headers with borders, center-aligned data with borders');
    console.log('🧮 Formulas: Total Marks, Grade Points, and Grade columns use Excel formulas');

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the export
exportStudentResults();
