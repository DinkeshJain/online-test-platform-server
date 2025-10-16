require('dotenv').config();
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Result = require('../models/Result');
const SupplementaryResult = require('../models/SupplementaryResult');
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

// Function to remove duplicate results
async function removeDuplicateResults() {
  try {
    console.log('Checking for duplicate results...');
    
    const duplicates = await Result.aggregate([
      {
        $group: {
          _id: {
            enrollmentNo: '$enrollmentNo',
            semester: '$semester',
            academicYear: '$academicYear',
            courseCode: '$course.courseCode'
          },
          count: { $sum: 1 },
          docs: { $push: '$_id' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    if (duplicates.length === 0) {
      console.log('No duplicate results found.');
      return 0;
    }

    console.log(`Found ${duplicates.length} sets of duplicate results.`);

    let removedCount = 0;
    for (const duplicate of duplicates) {
      // Keep the first document, remove the rest
      const [keep, ...remove] = duplicate.docs;
      
      if (remove.length > 0) {
        await Result.deleteMany({ _id: { $in: remove } });
        removedCount += remove.length;
        console.log(`Removed ${remove.length} duplicate(s) for student ${duplicate._id.enrollmentNo}`);
      }
    }

    console.log(`Total duplicates removed: ${removedCount}`);
    return removedCount;
  } catch (error) {
    console.error('Error removing duplicates:', error);
    return 0;
  }
}

// List of known supplementary students
const SUPPLEMENTARY_STUDENTS = [
  'C24DB774120', 'C24DB774122', 'C24DB774113', 'C24DB774121',
  'C24DB774022', 'C24DD774034', 'A23DB774057', 'C23DD774069',
  'C24DD774020', 'C24DB774068', 'A23DC774017', 'A23DC774015'
];

// Function to check if a student is supplementary
function isSupplementaryStudent(enrollmentNo) {
  return SUPPLEMENTARY_STUDENTS.includes(enrollmentNo);
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
  // Validate input
  if (!subjects || subjects.length === 0) {
    console.warn('Warning: No subjects provided for SGPA calculation');
    return 0;
  }

  // Check if any subject has grade 'F' - if so, SGPA should be 0
  const hasFailingGrade = subjects.some(subject => subject.gradePoints === 0);
  if (hasFailingGrade) {
    return 0;
  }

  let totalCredits = 0;
  let totalGradePoints = 0;

  subjects.forEach(subject => {
    const credits = Number(subject.credits) || 4; // Default to 4 if invalid
    const gradePoints = Number(subject.gradePoints) || 0;
    
    totalCredits += credits;
    totalGradePoints += (credits * gradePoints);
  });

  return totalCredits > 0 ? parseFloat((totalGradePoints / totalCredits).toFixed(2)) : 0;
}

// Function to check if update is needed by comparing Excel fields with existing record
function checkIfUpdateNeeded(existingRecord, newRecord) {
  const changedFields = [];
  
  // Compare SGPA (handle potential NaN/null values)
  const existingSgpa = parseFloat(existingRecord.sgpa) || 0;
  const newSgpa = parseFloat(newRecord.sgpa) || 0;
  if (existingSgpa !== newSgpa) {
    changedFields.push('sgpa');
  }
  
  // Compare subjects array
  if (!existingRecord.subjects || existingRecord.subjects.length !== newRecord.subjects.length) {
    changedFields.push('subjects (count)');
  } else {
    // Compare each subject
    for (let i = 0; i < newRecord.subjects.length; i++) {
      const existingSubject = existingRecord.subjects.find(s => s.subjectCode === newRecord.subjects[i].subjectCode);
      const newSubject = newRecord.subjects[i];
      
      if (!existingSubject) {
        changedFields.push(`subjects (${newSubject.subjectCode} - new)`);
        continue;
      }
      
      // Compare grade
      if (existingSubject.grade !== newSubject.grade) {
        changedFields.push(`subjects (${newSubject.subjectCode} - grade)`);
      }
      
      // Compare gradePoints
      if (existingSubject.gradePoints !== newSubject.gradePoints) {
        changedFields.push(`subjects (${newSubject.subjectCode} - gradePoints)`);
      }
      
      // Compare marks
      if (existingSubject.marks) {
        if (existingSubject.marks.internal !== newSubject.marks.internal) {
          changedFields.push(`subjects (${newSubject.subjectCode} - internal marks)`);
        }
        if (existingSubject.marks.external !== newSubject.marks.external) {
          changedFields.push(`subjects (${newSubject.subjectCode} - external marks)`);
        }
        if (existingSubject.marks.total !== newSubject.marks.total) {
          changedFields.push(`subjects (${newSubject.subjectCode} - total marks)`);
        }
      } else {
        changedFields.push(`subjects (${newSubject.subjectCode} - marks structure)`);
      }
    }
  }
  
  // Compare course information
  if (existingRecord.course) {
    if (existingRecord.course.courseCode !== newRecord.course.courseCode) {
      changedFields.push('course.courseCode');
    }
    if (existingRecord.course.courseName !== newRecord.course.courseName) {
      changedFields.push('course.courseName');
    }
  } else {
    changedFields.push('course (structure)');
  }
  
  // Compare root-level semester and academicYear (required by Result model)
  const existingSemester = String(existingRecord.semester || '');
  const newSemester = String(newRecord.semester || '');
  if (existingSemester !== newSemester) {
    changedFields.push('semester');
  }
  
  const existingYear = String(existingRecord.academicYear || '');
  const newYear = String(newRecord.academicYear || '');
  if (existingYear !== newYear) {
    changedFields.push('academicYear');
  }
  
  return {
    required: changedFields.length > 0,
    changedFields: changedFields
  };
}

// Function to fetch student details from database
async function getStudentDetails(enrollmentNo) {
  try {
    const student = await Student.findOne({ enrollmentNo });
    if (!student) {
      console.warn(`Warning: Student not found for enrollment number: ${enrollmentNo}`);
      return null;
    }
    if (!student.fullName) {
      console.warn(`Warning: Student ${enrollmentNo} found but missing fullName in database`);
      return null;
    }
    if (!student.fatherName) {
      console.warn(`Warning: Student ${enrollmentNo} found but missing fatherName in database`);
      return null;
    }
    return {
      fatherName: student.fatherName,
      fullName: student.fullName
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
async function getSubjectDetails(subjectCode, preferredCourseCode) {
  try {
    // First try to find the subject in the preferred course
    let course = await Course.findOne({
      courseCode: preferredCourseCode,
      'subjects.subjectCode': subjectCode
    });

    // If not found in preferred course, search across all courses
    if (!course) {
      console.log(`Subject ${subjectCode} not found in course ${preferredCourseCode}, searching all courses...`);
      course = await Course.findOne({
        'subjects.subjectCode': subjectCode
      });
    }

    if (!course) {
      console.warn(`Warning: Subject ${subjectCode} not found in any course`);
      return {
        subjectCode,
        subjectName: `Unknown Subject (${subjectCode})`,
        credits: 4,  // Default credits
        courseCode: preferredCourseCode,
        courseName: 'Unknown Course'
      };
    }

    // Find the specific subject in the course's subjects array
    const subject = course.subjects.find(s => s.subjectCode === subjectCode);
    
    if (!subject) {
      console.warn(`Warning: Subject ${subjectCode} not found in course ${course.courseCode} subjects array`);
      return {
        subjectCode,
        subjectName: `Unknown Subject (${subjectCode})`,
        credits: 4,  // Default credits
        courseCode: course.courseCode,
        courseName: course.courseName
      };
    }
    
    console.log(`Found subject ${subjectCode} in course ${course.courseCode}: ${subject.subjectName}`);
    
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

    // Extract course code from current subject code (each subject may have different course)
    const courseCodeMatch = subjectCode.match(/^([A-Z]+)/);
    let currentCourseCode;
    if (courseCodeMatch) {
      currentCourseCode = courseCodeMatch[1];
      log('INFO', `Extracted course code: ${currentCourseCode} from subject code: ${subjectCode}`);
    } else {
      log('ERROR', `Could not extract course code from subject code: ${subjectCode}`);
      return null;
    }

    // Get subject details from Course model using the current subject's course code
    const subjectInfo = await getSubjectDetails(subjectCode, currentCourseCode);
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
        // Handle potential variations in column names
        const enrollmentNo = row['Enrollment Number'] || row['Enrollment'] || row['EnrollmentNo'];
        const fullName = row['Full Name'] || row['Name'] || row['Student Name'];
        const grade = row['Grade'] || 'F';
        
        // Handle NaN for grade points - convert NaN to 0 for database storage
        let gradePoints = Number(row['Grade Points'] || row['GradePoints'] || 0);
        if (isNaN(gradePoints)) {
          gradePoints = 0;
        }
        
        // Handle NaN for marks - convert NaN to 0 for database storage
        let internalMarks = Number(row['Internal Marks'] || row['Internal'] || 0);
        if (isNaN(internalMarks)) internalMarks = 0;
        
        let externalMarks = Number(row['External Marks/70.00'] || row['External Marks'] || row['External'] || 0);
        if (isNaN(externalMarks)) externalMarks = 0;
        
        let totalMarks = Number(row['Total Marks'] || row['Total'] || 0);
        if (isNaN(totalMarks)) totalMarks = 0;

        const result = {
          enrollmentNo: enrollmentNo,
          fullName: fullName,
          grade: grade,
          gradePoints: gradePoints,
          marks: {
            internal: internalMarks,
            external: externalMarks,
            total: totalMarks
          }
        };
        
        if (!result.enrollmentNo) {
          log('WARN', `Skipping row with missing enrollment number`, row);
          return null;
        }
        
        // Validate numeric fields to prevent database errors
        if (isNaN(result.gradePoints) || isNaN(result.marks.internal) || 
            isNaN(result.marks.external) || isNaN(result.marks.total)) {
          log('WARN', `Skipping row with invalid numeric data for ${enrollmentNo}`, {
            gradePoints: result.gradePoints,
            marks: result.marks
          });
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
            fullName: studentDetails.fullName,
            fatherName: studentDetails.fatherName,
            course: {
              courseCode: subjectInfo.courseCode,
              courseName: subjectInfo.courseName,
              semester: courseInfo.semester,
              academicYear: courseInfo.academicYear
            },
            subjects: []
          });
        }

        const student = results.get(studentResult.enrollmentNo);
        
        // Update course info if this subject belongs to a different course
        if (student.course.courseCode !== subjectInfo.courseCode) {
          console.log(`Student ${studentResult.enrollmentNo} has subjects from multiple courses: ${student.course.courseCode} and ${subjectInfo.courseCode}`);
          // Update to the most recent course encountered (could be changed to keep first if preferred)
          student.course = {
            courseCode: subjectInfo.courseCode,
            courseName: subjectInfo.courseName,
            semester: courseInfo.semester,
            academicYear: courseInfo.academicYear
          };
        }
        
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
        semester: student.course.semester,  // Required at root level for Result model
        academicYear: student.course.academicYear  // Required at root level for Result model
      }));

    // Check for existing results and save to database
    if (finalResults.length > 0) {
      console.log(`\nProcessing ${finalResults.length} results for database import...`);
      
      const batchSize = 50;
      const results = [];
      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let supplementarySkippedCount = 0;
      
      for (let i = 0; i < finalResults.length; i += batchSize) {
        const batch = finalResults.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(finalResults.length/batchSize)}...`);
        
        for (const result of batch) {
          try {
            const isSupplementary = isSupplementaryStudent(result.enrollmentNo);
            
            // Skip supplementary students - do not add them to results collection
            if (isSupplementary) {
              // Silent skip for supplementary students to reduce noise
              supplementarySkippedCount++;
              continue;
            }
            
            const Model = Result;
            const collectionName = 'regular';
            
            // Check if student already has results for this specific semester, academic year, and course
            const existingResult = await Model.findOne({
              enrollmentNo: result.enrollmentNo,
              semester: result.semester,
              academicYear: result.academicYear,
              'course.courseCode': result.course.courseCode
            });

            let saved;
            if (existingResult) {
              // Compare fields that come from Excel sheet to determine if update is needed
              const needsUpdate = checkIfUpdateNeeded(existingResult, result);
              
              if (needsUpdate.required) {
                // Update existing record with only the changed fields
                const updateData = {
                  ...result,
                  updatedAt: new Date()
                };
                
                saved = await Model.findOneAndUpdate(
                  {
                    enrollmentNo: result.enrollmentNo,
                    semester: result.semester,
                    academicYear: result.academicYear,
                    'course.courseCode': result.course.courseCode
                  },
                  updateData,
                  {
                    new: true,
                    runValidators: true
                  }
                );
                console.log(`Updated ${collectionName} result for ${result.enrollmentNo} - Course: ${result.course.courseCode}, SGPA: ${result.sgpa}`);
                console.log(`  Changed fields: ${needsUpdate.changedFields.join(', ')}`);
                updatedCount++;
              } else {
                // No changes needed, skip update
                saved = existingResult;
                // Silent skip - no console log to reduce noise
                skippedCount++;
              }
            } else {
              // Create new record
              saved = await Model.create(result);
              console.log(`Created ${collectionName} result for ${result.enrollmentNo} - Course: ${result.course.courseCode}, SGPA: ${result.sgpa}`);
              createdCount++;
            }

            results.push(saved);
          } catch (error) {
            console.error(`Error processing result for ${result.enrollmentNo}:`, error.message);
          }
        }
      }

      console.log(`\n📊 IMPORT SUMMARY`);
      console.log('='.repeat(50));
      console.log(`✅ Total processed: ${results.length} results`);
      console.log(`🆕 Created: ${createdCount} new records`);
      console.log(`🔄 Updated: ${updatedCount} existing records`);
      console.log(`⏭️  Skipped: ${skippedCount} unchanged records`);
      console.log(`🚫 Supplementary students excluded: ${supplementarySkippedCount} records`);
      
      if (results.length > 0) {
        console.log('\n📋 Sample result:', {
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
const excelFilePath = process.argv[2] || 'Student_Internl_Extenl_Mrks_Results_by_Subject_2025-09-03.xlsx';

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

// First remove any existing duplicates, then process the file
removeDuplicateResults()
  .then((removedCount) => {
    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} duplicate records before import.`);
    }
    return processExcelFile(absolutePath);
  })
  .then(() => {
    console.log('Import completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });