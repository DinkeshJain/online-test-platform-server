require('dotenv').config();
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Result = require('../models/Result');
const Student = require('../models/Student');
const Course = require('../models/Course');
const path = require('path');

// Validation functions
function validateStudent(student) {
  if (!student.enrollmentNo || !student.fullName) {
    console.error(`Invalid student data: Missing enrollment number or name`);
    return false;
  }
  
  if (!student.subjects || student.subjects.length === 0) {
    console.error(`Invalid student data: No subjects for ${student.enrollmentNo}`);
    return false;
  }
  
  return true;
}

function validateSubject(subject) {
  if (!subject.subjectCode || !subject.subjectName) {
    console.error(`Invalid subject data: Missing code or name`);
    return false;
  }
  
  if (subject.credits <= 0) {
    console.warn(`Warning: Invalid credits (${subject.credits}) for subject ${subject.subjectCode}`);
    return false;
  }
  
  return true;
}

// Enhanced logging function
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = data ? 
    `[${timestamp}] ${level}: ${message}\n${JSON.stringify(data, null, 2)}` :
    `[${timestamp}] ${level}: ${message}`;
  console.log(logEntry);
}

// Connect to MongoDB
if (!process.env.MONGO_URI) {
  console.error('Error: MONGO_URI environment variable is not set');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Grade point mapping
const GRADE_POINTS = {
  'O': 10,
  'A': 9,
  'B': 8,
  'C': 7,
  'D': 6,
  'E': 5,
  'F': 0,
  'W': 0
};

// Function to calculate SGPA
function calculateSGPA(subjects) {
  let totalCredits = 0;
  let totalGradePoints = 0;

  subjects.forEach(subject => {
    totalCredits += subject.credits;
    totalGradePoints += (subject.credits * subject.gradePoints);
  });

  return totalCredits > 0 ? (totalGradePoints / totalCredits).toFixed(2) : 0;
}

// Function to fetch student details from database
async function getStudentDetails(enrollmentNo) {
  try {
    const student = await Student.findOne({ enrollmentNo });
    if (!student) {
      console.warn(`Warning: Student not found for enrollment number: ${enrollmentNo}`);
      return null;
    }
    return {
      fatherName: student.fatherName,
      fullName: student.fullName || null
    };
  } catch (error) {
    console.error(`Error fetching student details for ${enrollmentNo}:`, error);
    return null;
  }
}

// Function to get subject code from sheet name
function getSubjectCodeFromSheet(sheetName) {
  if (!sheetName) {
    console.warn('Empty sheet name provided');
    return null;
  }
  
  // Try different patterns
  const patterns = [
    /^([A-Z0-9]+)\s+Report/, // Format: "CODE Report"
    /^([A-Z0-9]+)_/, // Format: "CODE_something"
    /^([A-Z0-9]+)\s/, // Format: "CODE anything"
    /([A-Z]{2,}[0-9]{2,})/ // Format: at least 2 letters followed by at least 2 numbers
  ];

  for (const pattern of patterns) {
    const match = sheetName.match(pattern);
    if (match && match[1]) {
      const code = match[1].trim();
      console.log(`Extracted subject code '${code}' from sheet '${sheetName}'`);
      return code;
    }
  }

  console.warn(`Could not extract subject code from sheet name: ${sheetName}`);
  return null;
}

// Function to get subject details from Course model
async function getSubjectDetails(subjectCode, courseCode) {
  try {
    // Find the course that contains this subject
    const course = await Course.findOne({
      courseCode: courseCode,
      'subjects.subjectCode': subjectCode
    });

    if (!course) {
      console.warn(`Warning: Subject ${subjectCode} not found in course ${courseCode}`);
      return {
        subjectCode,
        subjectName: `Unknown Subject (${subjectCode})`,
        credits: 4  // Default credits
      };
    }

    // Find the specific subject in the course's subjects array
    const subject = course.subjects.find(s => s.subjectCode === subjectCode);
    
    return {
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      credits: 4, // Since credits are not stored in Course model, using default
      courseCode: course.courseCode,
      courseName: course.courseName
    };
  } catch (error) {
    console.error(`Error fetching subject details for ${subjectCode}:`, error);
    return null;
  }
}

// Function to process a single subject sheet
async function processSubjectSheet(worksheet, sheetName, courseInfo) {
  try {
    log('INFO', `Processing sheet: ${sheetName}`);
    
    // Convert sheet to JSON
    const data = xlsx.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: ''
    });
    
    if (!data || data.length === 0) {
      log('WARN', `Empty or invalid worksheet: ${sheetName}`);
      return null;
    }
    
    // Get subject code from sheet name
    const subjectCode = getSubjectCodeFromSheet(sheetName);
    if (!subjectCode) {
      log('WARN', `Could not extract subject code from sheet name: ${sheetName}`);
      return null;
    }
    
    // Validate courseInfo
    if (!courseInfo) {
      log('ERROR', `Missing courseInfo object`);
      return null;
    }

    // Extract course code from the first sheet if not already set
    if (!courseInfo.courseCode) {
      const courseCodeMatch = subjectCode.match(/^([A-Z]+)/);
      if (courseCodeMatch) {
        courseInfo.courseCode = courseCodeMatch[1];
        log('INFO', `Extracted course code: ${courseInfo.courseCode} from subject code: ${subjectCode}`);
      } else {
        log('ERROR', `Could not extract course code from subject code: ${subjectCode}`);
        return null;
      }
    }

    // Get subject details from Course model
    const subjectInfo = await getSubjectDetails(subjectCode, courseInfo.courseCode);
    if (!subjectInfo) {
      log('WARN', `Could not get subject details for: ${subjectCode} in course: ${courseInfo.courseCode}`);
      return null;
    }
    
    if (!validateSubject(subjectInfo)) {
      log('ERROR', `Invalid subject information`, subjectInfo);
      return null;
    }
    
    log('INFO', `Processing ${sheetName}`, { 
      subjectCode: subjectInfo.subjectCode,
      subjectName: subjectInfo.subjectName,
      totalRecords: data.length 
    });

    // Process student results
    const studentResults = data
      .filter(row => row['Enrollment Number']) // Skip empty rows
      .map(row => {
        const result = {
          enrollmentNo: row['Enrollment Number'],
          fullName: row['Full Name'],
          grade: row['Grade'] || 'F',
          gradePoints: Number(row['Grade Points']) || 0,
          marks: {
            internal: Number(row['Internal Marks']) || 0,
            external: Number(row['External Marks/70.00']) || 0,
            total: Number(row['Total Marks']) || 0
          }
        };
        
        if (!result.enrollmentNo || !result.fullName) {
          log('WARN', `Skipping row with missing data`, row);
          return null;
        }
        
        return result;
      })
      .filter(result => result !== null);

    return { subjectInfo, studentResults };
  } catch (error) {
    console.error(`Error processing sheet ${sheetName}:`, error);
    return null;
  }
}

// Main function to process Excel file
async function processExcelFile(filePath) {
  try {
    console.log('Reading Excel file...');
    const workbook = xlsx.readFile(filePath);
    
    // Log workbook structure
    console.log('\nWorkbook sheets:', workbook.SheetNames);
    
    // Initialize course info
    let courseInfo = {
      courseCode: null, // Will be set based on subject codes
      courseName: null, // Will be updated from Course model
      semester: null,   // Will be determined from sheet names
      academicYear: '2025-26'
    };

    // Try to extract course and semester info from first sheet name
    const firstSheet = workbook.SheetNames[0];
    const courseMatch = firstSheet.match(/([A-Z]+)(\d+)/);
    if (courseMatch) {
      courseInfo.courseCode = courseMatch[1];
      courseInfo.semester = parseInt(courseMatch[2], 10);
      
      // Try to get course details
      try {
        const course = await Course.findOne({ courseCode: courseInfo.courseCode });
        if (course) {
          courseInfo.courseName = course.courseName;
        }
      } catch (error) {
        log('WARN', `Could not fetch course details for ${courseInfo.courseCode}`, error);
      }
    }
    console.log('\nCourse Info:', courseInfo);

    const results = new Map(); // Map to store results by enrollment number

    // Process each subject sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const processed = await processSubjectSheet(worksheet, sheetName, courseInfo);
      
      if (!processed) {
        console.warn(`Skipping sheet: ${sheetName} - Could not process`);
        continue;
      }
      
      const { subjectInfo, studentResults } = processed;

      // Group results by student
      for (const studentResult of studentResults) {
        if (!results.has(studentResult.enrollmentNo)) {
          // Fetch student details from database
          const studentDetails = await getStudentDetails(studentResult.enrollmentNo);
          
          if (!studentDetails) {
            console.warn(`Skipping student ${studentResult.enrollmentNo} - not found in database`);
            continue;
          }

          results.set(studentResult.enrollmentNo, {
            enrollmentNo: studentResult.enrollmentNo,
            fullName: studentDetails.fullName || studentResult.fullName,
            fatherName: studentDetails.fatherName,
            course: courseInfo,
            subjects: []
          });
        }

        const student = results.get(studentResult.enrollmentNo);
        student.subjects.push({
          ...subjectInfo,
          grade: studentResult.grade,
          gradePoints: studentResult.gradePoints,
          marks: studentResult.marks
        });
      }
    }

    // Calculate SGPA and create final results
    const finalResults = Array.from(results.values())
      .filter(student => student.fatherName) // Only include students with complete information
      .map(student => ({
        ...student,
        sgpa: calculateSGPA(student.subjects),
        semester: courseInfo.semester,
        academicYear: courseInfo.academicYear
      }));

    // Check for existing results and save to database
    if (finalResults.length > 0) {
      console.log(`\nProcessing ${finalResults.length} results for database import...`);
      
      const batchSize = 50;
      const results = [];
      
      for (let i = 0; i < finalResults.length; i += batchSize) {
        const batch = finalResults.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(finalResults.length/batchSize)}...`);
        
        for (const result of batch) {
          try {
            // Check for existing result
            const existing = await Result.findOne({
              enrollmentNo: result.enrollmentNo,
              'course.semester': result.semester,
              academicYear: result.academicYear
            });

            if (existing) {
              console.log(`Skipping duplicate result for ${result.enrollmentNo} - Semester ${result.semester}`);
              continue;
            }

            // Insert new result
            const saved = await Result.create(result);
            results.push(saved);
            console.log(`Saved result for ${result.enrollmentNo} - SGPA: ${result.sgpa}`);
          } catch (error) {
            console.error(`Error processing result for ${result.enrollmentNo}:`, error.message);
          }
        }
      }

      console.log(`\nSuccessfully imported ${results.length} results`);
      if (results.length > 0) {
        console.log('Sample result:', {
          enrollmentNo: results[0].enrollmentNo,
          fullName: results[0].fullName,
          semester: results[0].semester,
          sgpa: results[0].sgpa,
          subjectCount: results[0].subjects.length
        });
      }
    } else {
      console.log('No valid results to import');
    }
  } catch (error) {
    console.error('Error processing Excel file:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Check if file path is provided
const excelFilePath = process.argv[2] || 'testing/Students Final Reports with Internal Marks.xlsx';

// Convert to absolute path if relative
const absolutePath = path.isAbsolute(excelFilePath) 
  ? excelFilePath 
  : path.resolve(process.cwd(), excelFilePath);

// Check if file exists
if (!require('fs').existsSync(absolutePath)) {
  console.error(`Error: File not found: ${absolutePath}`);
  console.error('Please check the file path and try again');
  process.exit(1);
}

// Run the script
console.log(`Processing file: ${absolutePath}`);
processExcelFile(absolutePath)
  .then(() => {
    console.log('Import completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });