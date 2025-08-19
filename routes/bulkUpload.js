const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const { adminAuth } = require('../middleware/auth');
const DataCleanupUtility = require('../utils/dataCleanup');

const router = express.Router();

// Test endpoint to check if bulk upload routes are working
router.get('/test', (req, res) => {
  res.json({ message: 'Bulk upload routes are working!' });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'excel') {
      // Accept Excel files
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          file.mimetype === 'application/vnd.ms-excel') {
        cb(null, true);
      } else {
        cb(new Error('Only Excel files are allowed for student data'), false);
      }
    } else if (file.fieldname === 'photos') {
      // Accept image files
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for photos'), false);
      }
    } else {
      cb(new Error('Unexpected field'), false);
    }
  }
});

// Test POST endpoint without auth (for debugging)
router.post('/test-upload', upload.fields([
  { name: 'excel', maxCount: 1 },
  { name: 'photos', maxCount: 100 }
]), async (req, res) => {
  console.log('=== TEST UPLOAD ENDPOINT HIT ===');
  console.log('Files received:', req.files);
  res.json({ 
    message: 'Test upload endpoint reached successfully',
    files: req.files ? Object.keys(req.files) : 'No files',
    hasExcel: !!req.files?.excel,
    hasPhotos: !!req.files?.photos
  });
});

// Bulk upload students
router.post('/students', adminAuth, upload.fields([
  { name: 'excel', maxCount: 1 },
  { name: 'photos', maxCount: 100 }
]), async (req, res) => {
  
  try {
    if (!req.files.excel || !req.files.excel[0]) {
      return res.status(400).json({ message: 'Excel file is required' });
    }

    const excelFile = req.files.excel[0];
    const photos = req.files.photos || [];
    
    // Read Excel file
    let workbook, worksheet, students;
    try {
      workbook = XLSX.readFile(excelFile.path);
      const sheetName = workbook.SheetNames[0];
      worksheet = workbook.Sheets[sheetName];
      students = XLSX.utils.sheet_to_json(worksheet);
      
      if (students.length === 0) {
        return res.status(400).json({ message: 'Excel file is empty or has no valid data' });
      }
    } catch (excelError) {
      return res.status(400).json({ message: 'Error reading Excel file: ' + excelError.message });
    }

    // Validate Excel structure and provide helpful error messages
    const firstStudent = students[0];
    const availableColumns = Object.keys(firstStudent);
    
    // Check for required data patterns
    const hasEnrollmentData = availableColumns.some(col => 
      ['EnrollmentNo', 'enrollmentNo', 'EnrollMentNo', 'SrNo'].includes(col)
    );
    const hasNameData = availableColumns.some(col => 
      ['FullName', 'fullName', 'Firstname', 'firstname', 'Name'].includes(col)
    );
    const hasEmailData = availableColumns.some(col => 
      ['EmailID', 'emailId', 'Email', 'EmailId'].includes(col)
    );

    if (!hasEnrollmentData || !hasNameData || !hasEmailData) {
      const missingFields = [];
      if (!hasEnrollmentData) missingFields.push('Enrollment/Student ID (columns like: EnrollmentNo, SrNo)');
      if (!hasNameData) missingFields.push('Student Name (columns like: FullName, Firstname, Name)');
      if (!hasEmailData) missingFields.push('Email Address (columns like: EmailID, Email, EmailId)');
      
      return res.status(400).json({ 
        message: 'Excel file structure error: Missing required data columns',
        details: `Missing: ${missingFields.join(', ')}`,
        availableColumns: availableColumns,
        suggestion: 'Please ensure your Excel file has columns for student identification, names, and email addresses. You can download our template for the correct format.'
      });
    }

    // Create photo mapping (enrollment number -> photo file)
    const photoMap = {};
    photos.forEach(photo => {
      const enrollmentNo = path.parse(photo.originalname).name;
      photoMap[enrollmentNo] = photo.filename;
    });

    const results = {
      successful: [],
      failed: [],
      total: students.length
    };

    // Process each student
    for (const [index, studentData] of students.entries()) {
      try {
        // Map Excel columns to our schema - handle multiple column name variations
        
        // Handle EnrollmentNo variations
        let enrollmentNo = studentData.EnrollmentNo || studentData.enrollmentNo || studentData['Enrollment No'] || 
                          studentData.EnrollMentNo || studentData.enrollMentNo || studentData['Enroll Ment No'];
        
        // If no enrollment number found, generate one from SrNo
        if (!enrollmentNo && studentData.SrNo) {
          enrollmentNo = `STU${String(studentData.SrNo).padStart(6, '0')}`;
        }
        
        // Handle FullName - combine Firstname + Lastname if FullName not available
        let fullName = studentData.FullName || studentData.fullName || studentData['Full Name'] || studentData.Name;
        if (!fullName && (studentData.Firstname || studentData.Lastname)) {
          const firstName = studentData.Firstname || studentData.firstname || studentData['First Name'] || '';
          const lastName = studentData.Lastname || studentData.lastname || studentData['Last Name'] || '';
          fullName = `${firstName} ${lastName}`.trim();
        }
        
        const username = studentData.Username || studentData.username || enrollmentNo?.toLowerCase() || 
                        (studentData.Firstname ? studentData.Firstname.toLowerCase().replace(/\s+/g, '') + studentData.SrNo : null);
        const batchYear = studentData.BatchYear || studentData.batchYear || studentData['Batch Year'] || studentData.Batch_Year;
        const course = studentData.Course || studentData.course;
        const admissionDate = studentData.AdmissionDate || studentData.admissionDate || studentData['Admission Date'];
        const dateOfBirth = studentData.DateOfBirth || studentData.dateOfBirth || studentData['Date Of Birth'];
        const gender = studentData.Gender || studentData.gender;
        
        // Handle EmailId variations
        const emailId = studentData.EmailID || studentData.emailId || studentData.emailID || 
                       studentData['Email ID'] || studentData.Email || studentData['Email Id'];
        
        let mobileNo = studentData.MobileNo || studentData.mobileNo || studentData['Mobile No'] || studentData.Mobile;
        
        // New fields with variations
        const aadharNo = studentData.AadharNo || studentData.aadharNo || studentData['Aadhar No'] || 
                        studentData.Aadhar || studentData.AadhaarNo || studentData.aadhaarNo;
        const casteCategory = studentData.CasteCategory || studentData.casteCategory || studentData['Caste Category'] || 
                             studentData.Caste;
        const fatherName = studentData.FatherName || studentData.fatherName || studentData['Father Name'] || studentData.Father;
        const motherName = studentData.MotherName || studentData.motherName || studentData['Mother Name'] || studentData.Mother;
        const addressLine1 = studentData.AddressLine1 || studentData.addressLine1 || studentData['Address Line 1'] || 
                            studentData['Address 1'];
        const addressLine2 = studentData.AddressLine2 || studentData.addressLine2 || studentData['Address Line 2'] || 
                            studentData['Address 2'];
        const city = studentData.City || studentData.city;
        const state = studentData.State || studentData.state;
        const pincode = studentData.Pincode || studentData.pincode || studentData.PinCode || studentData.PIN;
        
        // Clean mobile number - handle multiple formats and multiple numbers
        if (mobileNo) {
          // Convert to string and handle multiple numbers separated by comma, newline, etc.
          let cleanMobile = String(mobileNo);
          
          // Remove any extra whitespace, newlines, carriage returns
          cleanMobile = cleanMobile.replace(/[\r\n\s,]+/g, ' ').trim();
          
          // Extract first mobile number if multiple are present
          const mobileNumbers = cleanMobile.split(/[,\s]+/);
          cleanMobile = mobileNumbers[0]; // Take the first number
          
          // Remove all non-digits
          cleanMobile = cleanMobile.replace(/\D/g, '');
          
          // Take first 10 digits if longer
          cleanMobile = cleanMobile.substring(0, 10);
          
          mobileNo = cleanMobile;
        }
        
        // Validate mobile number length
        if (!mobileNo || mobileNo.length !== 10 || !/^\d{10}$/.test(mobileNo)) {
          mobileNo = '0000000000'; // Default fallback
        }

        // Validate required fields with detailed error messages
        if (!enrollmentNo || !fullName || !emailId) {
          const missingFields = [];
          if (!enrollmentNo) missingFields.push('Enrollment Number');
          if (!fullName) missingFields.push('Student Name');
          if (!emailId) missingFields.push('Email Address');
          
          results.failed.push({
            data: studentData,
            error: `Missing required fields: ${missingFields.join(', ')}. Please check row ${index + 2} in your Excel file.`,
            suggestion: 'Ensure your Excel file has columns for enrollment number (or SrNo), student name (FullName or Firstname), and email address.'
          });
          continue;
        }

        // Validate email format
        const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
        if (!emailRegex.test(emailId)) {
          results.failed.push({
            data: studentData,
            error: `Invalid email format: "${emailId}" in row ${index + 2}. Please use format like: student@example.com`,
            suggestion: 'Check the email format and ensure it follows standard email conventions.'
          });
          continue;
        }

        // Validate mobile number (should be exactly 10 digits)
        if (!mobileNo || mobileNo.length !== 10 || !/^\d{10}$/.test(mobileNo)) {
          results.failed.push({
            data: studentData,
            error: `Invalid mobile number: "${mobileNo}" in row ${index + 2}. Should be exactly 10 digits.`,
            suggestion: 'Mobile number should contain only 10 digits without any special characters or country code.'
          });
          continue;
        }

        // Check if student already exists
        const existingStudent = await Student.findOne({
          $or: [
            { username: username },
            { enrollmentNo: enrollmentNo },
            { emailId: emailId }
          ]
        });

        if (existingStudent) {
          results.failed.push({
            data: studentData,
            error: `Student already exists in row ${index + 2}. Duplicate found: ${
              existingStudent.enrollmentNo === enrollmentNo ? 'Enrollment Number' :
              existingStudent.username === username ? 'Username' : 'Email Address'
            }`,
            suggestion: 'Each student must have unique enrollment number, username, and email address.'
          });
          continue;
        }

        // Create new student
        const studentObj = {
          username: username?.toLowerCase(),
          password: enrollmentNo, // Use plain password - model will hash it automatically
          enrollmentNo: enrollmentNo,
          batchYear: batchYear || '2024',  // Default to current year
          course: course || 'General',     // Default course
          admissionDate: admissionDate ? new Date(admissionDate) : new Date(),
          fullName: fullName,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date('2000-01-01'), // Default DOB
          gender: gender || 'Other',
          emailId: emailId?.toLowerCase(),
          mobileNo: mobileNo,
          aadharNo: aadharNo || null,
          casteCategory: casteCategory || null,
          fatherName: fatherName || null,
          motherName: motherName || null,
          addressLine1: addressLine1 || null,
          addressLine2: addressLine2 || null,
          city: city || null,
          state: state || null,
          pincode: pincode || null,
          studentPhoto: photoMap[enrollmentNo] || null
        };

        const newStudent = new Student(studentObj);
        
        // Validate before saving
        const validationError = newStudent.validateSync();
        if (validationError) {
          results.failed.push({
            data: studentData,
            error: `Data validation failed for row ${index + 2}: ${validationError.message}`,
            suggestion: 'Please check the data format and ensure all required fields meet the validation criteria.'
          });
          continue;
        }
        
        const savedStudent = await newStudent.save();

        results.successful.push({
          enrollmentNo,
          fullName,
          username: studentObj.username,
          emailId: studentObj.emailId,
          photo: photoMap[enrollmentNo] ? 'Uploaded' : 'Not found',
          _id: savedStudent._id
        });
        
      } catch (error) {
        results.failed.push({
          data: studentData,
          error: `Error processing row ${index + 2}: ${error.message}`,
          suggestion: 'Please check the data in this row and ensure all fields are properly formatted.'
        });
      }
    }

    // Clean up uploaded Excel file
    try {
      fs.unlinkSync(excelFile.path);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    const responseData = {
      message: `Upload completed: ${results.successful.length} successful, ${results.failed.length} failed`,
      successCount: results.successful.length,
      failureCount: results.failed.length,
      totalProcessed: results.total,
      results
    };
    
    res.json(responseData);

  } catch (error) {
    console.error('Critical error in bulk upload:', error.message);
    
    res.status(500).json({ 
      message: 'Server error during students data upload', 
      error: error.message,
      suggestion: 'Please try again. If the problem persists, contact the administrator.',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get upload template information
router.get('/students/template', (req, res) => {
  res.json({
    message: 'Complete Excel template structure for students data upload',
    version: '2.0 - Updated with additional fields',
    allColumns: [
      'SrNo - Serial number for reference',
      'EnrollmentNo - Unique student enrollment number',
      'BatchYear - Year of admission/batch (e.g., 2024)',
      'Course - Course code or name',
      'AdmissionDate - Date in YYYY-MM-DD format',
      'FullName - Complete name of the student', 
      'DateOfBirth - Date in YYYY-MM-DD format',
      'Gender - Male/Female/Other',
      'EmailID - Valid email address (must be unique)',
      'MobileNo - 10-digit mobile number',
      'AadhaarNo - 12-digit Aadhar card number',
      'CasteCategory - General/OBC/SC/ST/EWS/etc.',
      'FatherName - Father\'s full name',
      'MotherName - Mother\'s full name',
      'AddressLine1 - Primary address line',
      'AddressLine2 - Secondary address line/locality',
      'City - City name',
      'State - State name',
      'Pincode - 6-digit postal code'
    ],
    completeColumnOrder: [
      'SrNo', 'EnrollmentNo', 'BatchYear', 'Course', 'AdmissionDate',
      'FullName', 'DateOfBirth', 'Gender', 'EmailID', 'MobileNo',
      'AadhaarNo', 'CasteCategory', 'FatherName', 'MotherName',
      'AddressLine1', 'AddressLine2', 'City', 'State', 'Pincode'
    ],
    sampleData: [
      {
        'SrNo': '1',
        'EnrollmentNo': '2024001',
        'BatchYear': '2024',
        'Course': 'Computer Science',
        'AdmissionDate': '2024-08-15',
        'FullName': 'Rahul Sharma',
        'DateOfBirth': '2002-05-10',
        'Gender': 'Male',
        'EmailID': 'rahul.sharma@college.edu',
        'MobileNo': '9876543210',
        'AadhaarNo': '123456789012',
        'CasteCategory': 'General',
        'FatherName': 'Suresh Kumar Sharma',
        'MotherName': 'Priya Sharma',
        'AddressLine1': '123 MG Road, Sector 15',
        'AddressLine2': 'Near City Mall, Koramangala',
        'City': 'Mumbai',
        'State': 'Maharashtra',
        'Pincode': '400001'
      },
      {
        'SrNo': '2',
        'EnrollmentNo': '2024002',
        'BatchYear': '2024',
        'Course': 'Information Technology',
        'AdmissionDate': '2024-08-15',
        'FullName': 'Priya Patel',
        'DateOfBirth': '2002-03-22',
        'Gender': 'Female',
        'EmailID': 'priya.patel@college.edu',
        'MobileNo': '9876543211',
        'AadhaarNo': '234567890123',
        'CasteCategory': 'OBC',
        'FatherName': 'Kiran Bhai Patel',
        'MotherName': 'Meera Patel',
        'AddressLine1': '456 Park Street',
        'AddressLine2': 'Sector 5, Model Town',
        'City': 'Pune',
        'State': 'Maharashtra',
        'Pincode': '411001'
      }
    ],
    photoUploadInstructions: {
      format: 'Upload student photos as separate files',
      naming: 'Photo filename must match EnrollmentNo (e.g., 2024001.jpg, 2024002.png)',
      supportedFormats: ['jpg', 'jpeg', 'png', 'gif'],
      maxSize: '5MB per photo',
      recommendation: 'Use passport-size photos for best results'
    },
    importantNotes: [
      '✓ Password will be automatically set to EnrollmentNo for new students',
      '✓ Username will default to EnrollmentNo (lowercase) if not provided',
      '✓ All optional fields can be left empty - they will have default/null values',
      '✓ EnrollmentNo, Username, and EmailId must be unique across all students',
      '✓ Mobile number should be exactly 10 digits',
      '✓ Dates should be in YYYY-MM-DD format (e.g., 2024-08-15)',
      '✓ Aadhar number should be 12 digits (if provided)',
      '✓ Existing students with same EnrollmentNo/Username/Email will be skipped',
      '✗ Do not include headers in non-English characters',
      '✗ Do not merge cells or use complex formatting in Excel'
    ],
    validationRules: {
      EnrollmentNo: 'Required, must be unique, alphanumeric',
      FullName: 'Required, minimum 2 characters',
      EmailId: 'Required, must be valid email format, unique',
      MobileNo: 'Optional, must be exactly 10 digits if provided',
      AadharNo: 'Optional, must be exactly 12 digits if provided',
      Gender: 'Optional, accepts: Male, Female, Other',
      Pincode: 'Optional, should be 6 digits if provided'
    },
    troubleshooting: {
      commonIssues: [
        'Duplicate EnrollmentNo - Ensure all enrollment numbers are unique',
        'Invalid email format - Use proper email format (user@domain.com)',
        'Mobile number format - Use 10 digits without country code or special characters',
        'Date format issues - Use YYYY-MM-DD format only',
        'Photo not found - Ensure photo filename exactly matches EnrollmentNo'
      ],
      tips: [
        'Test upload with 2-3 sample records first',
        'Keep a backup of your original Excel file',
        'Verify all required fields are filled before upload',
        'Check for trailing spaces in enrollment numbers and emails'
      ]
    }
  });
});

// Download Excel template with proper format and instructions
router.get('/students/download-template', (req, res) => {
  try {
    const XLSX = require('xlsx');
    
    // Template headers
    const headers = [
      'SrNo', 'EnrollmentNo', 'BatchYear', 'Course', 'AdmissionDate',
      'FullName', 'DateOfBirth', 'Gender', 'EmailID', 'MobileNo',
      'AadhaarNo', 'CasteCategory', 'FatherName', 'MotherName',
      'AddressLine1', 'AddressLine2', 'City', 'State', 'Pincode'
    ];

    // Sample data
    const sampleData = [
      {
        'SrNo': '1',
        'EnrollmentNo': '2024001',
        'BatchYear': '2024',
        'Course': 'Computer Science',
        'AdmissionDate': '2024-08-15',
        'FullName': 'Rahul Sharma',
        'DateOfBirth': '2002-05-10',
        'Gender': 'Male',
        'EmailID': 'rahul.sharma@college.edu',
        'MobileNo': '9876543210',
        'AadhaarNo': '123456789012',
        'CasteCategory': 'General',
        'FatherName': 'Suresh Kumar Sharma',
        'MotherName': 'Priya Sharma',
        'AddressLine1': '123 MG Road, Sector 15',
        'AddressLine2': 'Near City Mall, Koramangala',
        'City': 'Mumbai',
        'State': 'Maharashtra',
        'Pincode': '400001'
      }
    ];

    // Instructions data
    const instructions = [
      { 'Field': 'SrNo', 'Description': 'Serial number for reference', 'Format': 'Number', 'Example': '1', 'Notes': 'Sequential numbering, used to generate EnrollmentNo if needed' },
      { 'Field': 'EnrollmentNo', 'Description': 'Unique student enrollment number', 'Format': 'Text/Number', 'Example': '2024001', 'Notes': 'Must be unique across all students' },
      { 'Field': 'BatchYear', 'Description': 'Year of admission', 'Format': 'Number', 'Example': '2024', 'Notes': 'Used for batch identification' },
      { 'Field': 'Course', 'Description': 'Course name or code', 'Format': 'Text', 'Example': 'Computer Science', 'Notes': 'Student enrolled course' },
      { 'Field': 'AdmissionDate', 'Description': 'Date of admission', 'Format': 'Date', 'Example': '2024-08-15', 'Notes': 'Format: YYYY-MM-DD only' },
      { 'Field': 'FullName', 'Description': 'Complete name of student', 'Format': 'Text', 'Example': 'Rahul Sharma', 'Notes': 'Minimum 2 characters required' },
      { 'Field': 'DateOfBirth', 'Description': 'Student birth date', 'Format': 'Date', 'Example': '2002-05-10', 'Notes': 'Format: YYYY-MM-DD only' },
      { 'Field': 'Gender', 'Description': 'Student gender', 'Format': 'Text', 'Example': 'Male/Female/Other', 'Notes': 'Accepts only these values' },
      { 'Field': 'EmailID', 'Description': 'Valid email address', 'Format': 'Email', 'Example': 'student@college.edu', 'Notes': 'Must be unique and valid format' },
      { 'Field': 'MobileNo', 'Description': '10-digit mobile number', 'Format': 'Number', 'Example': '9876543210', 'Notes': 'No country code or special chars' },
      { 'Field': 'AadhaarNo', 'Description': '12-digit Aadhar number', 'Format': 'Number', 'Example': '123456789012', 'Notes': 'Exactly 12 digits if provided' },
      { 'Field': 'CasteCategory', 'Description': 'Caste category', 'Format': 'Text', 'Example': 'General/OBC/SC/ST', 'Notes': 'As per government classification' },
      { 'Field': 'FatherName', 'Description': 'Father full name', 'Format': 'Text', 'Example': 'Suresh Kumar Sharma', 'Notes': 'Displayed in student list' },
      { 'Field': 'MotherName', 'Description': 'Mother full name', 'Format': 'Text', 'Example': 'Priya Sharma', 'Notes': 'For record keeping' },
      { 'Field': 'AddressLine1', 'Description': 'Primary address', 'Format': 'Text', 'Example': '123 MG Road, Sector 15', 'Notes': 'House/Flat, street details' },
      { 'Field': 'AddressLine2', 'Description': 'Secondary address', 'Format': 'Text', 'Example': 'Near City Mall', 'Notes': 'Locality, landmarks' },
      { 'Field': 'City', 'Description': 'City name', 'Format': 'Text', 'Example': 'Mumbai', 'Notes': 'Current residence city' },
      { 'Field': 'State', 'Description': 'State name', 'Format': 'Text', 'Example': 'Maharashtra', 'Notes': 'Current residence state' },
      { 'Field': 'Pincode', 'Description': '6-digit postal code', 'Format': 'Number', 'Example': '400001', 'Notes': 'Exactly 6 digits if provided' }
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Add instructions sheet
    const instructionSheet = XLSX.utils.json_to_sheet(instructions);
    XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');
    
    // Add sample data sheet
    const sampleSheet = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(workbook, sampleSheet, 'Sample Data');
    
    // Add empty template sheet with just headers
    const templateData = [{}];
    const templateSheet = XLSX.utils.json_to_sheet(templateData, { header: headers });
    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Upload Template');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Disposition', 'attachment; filename=Student_Bulk_Upload_Template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    res.send(buffer);
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ message: 'Error generating Excel template', error: error.message });
  }
});

// Get all students
router.get('/students/all', adminAuth, async (req, res) => {
  try {
    const students = await Student.find({})
      .sort({ enrollmentNo: 1 });
    
    // Map the fields to match frontend expectations while keeping all data for editing
    const mappedStudents = students.map(student => ({
      _id: student._id,
      name: student.fullName,
      enrollmentNumber: student.enrollmentNo,
      batchYear: student.batchYear,
      fatherName: student.fatherName,
      course: student.course,
      photoPath: student.studentPhoto,
      createdAt: student.createdAt,
      // Include all fields needed for editing
      fullName: student.fullName,
      enrollmentNo: student.enrollmentNo,
      username: student.username,
      emailId: student.emailId,
      mobileNo: student.mobileNo,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      admissionDate: student.admissionDate,
      addressLine1: student.addressLine1,
      motherName: student.motherName,
      aadharNo: student.aadharNo,
      casteCategory: student.casteCategory,
      addressLine2: student.addressLine2,
      city: student.city,
      state: student.state,
      pincode: student.pincode
    }));
    
    res.json({ 
      students: mappedStudents,
      total: mappedStudents.length 
    });
  } catch (error) {
    console.error('Error getting students:', error);
    res.status(500).json({ message: 'Error getting students', error: error.message });
  }
});

// Get students count
router.get('/students/count', async (req, res) => {
  try {
    const count = await Student.countDocuments();
    res.json({ count });
  } catch (error) {
    console.error('Error getting students count:', error);
    res.status(500).json({ message: 'Error getting students count', error: error.message });
  }
});

// Export students data as Excel
router.get('/students/export', adminAuth, async (req, res) => {
  try {
    const students = await Student.find({})
      .select('fullName enrollmentNo batchYear fatherName course studentPhoto createdAt')
      .sort({ enrollmentNo: 1 });

    // Create workbook and worksheet
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    
    // Prepare data for Excel
    const excelData = students.map(student => ({
      'Name': student.fullName,
      'Enrollment Number': student.enrollmentNo,
      'Batch Year': student.batchYear,
      'Father Name': student.fatherName,
      'Course': student.course,
      'Has Photo': student.studentPhoto ? 'Yes' : 'No',
      'Registration Date': student.createdAt ? student.createdAt.toLocaleDateString() : 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Disposition', 'attachment; filename=students_data.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting students:', error);
    res.status(500).json({ message: 'Error exporting students', error: error.message });
  }
});

// Update student
router.put('/students/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.__v;

    // Find and update the student
    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      updateData,
      { 
        new: true,
        runValidators: true
      }
    );

    if (!updatedStudent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    res.json({
      success: true,
      message: 'Student updated successfully',
      student: updatedStudent
    });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating student',
      error: error.message 
    });
  }
});

// Delete student
router.delete('/students/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // First, check if student exists
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    // Import required models for cascading deletion
    const Submission = require('../models/Submission');
    const InternalMarks = require('../models/InternalMarks');

    // Start a transaction for data consistency
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Delete all submissions associated with this student
      const deletedSubmissions = await Submission.deleteMany(
        { userId: id },
        { session }
      );

      // Delete all internal marks associated with this student
      const deletedInternalMarks = await InternalMarks.deleteMany(
        { studentId: id },
        { session }
      );

      // Finally delete the student
      const deletedStudent = await Student.findByIdAndDelete(id, { session });

      // Commit the transaction
      await session.commitTransaction();

      // Perform auto-cleanup to ensure data consistency
      const autoCleanupSummary = await DataCleanupUtility.autoCleanupAfterDeletion();

      res.json({
        success: true,
        message: 'Student and all associated data deleted successfully',
        deletionSummary: {
          student: deletedStudent,
          submissionsDeleted: deletedSubmissions.deletedCount,
          internalMarksDeleted: deletedInternalMarks.deletedCount
        },
        autoCleanup: autoCleanupSummary
      });

    } catch (transactionError) {
      // Rollback transaction on error
      await session.abortTransaction();
      throw transactionError;
    } finally {
      // End session
      session.endSession();
    }

  } catch (error) {
    console.error('Error deleting student and associated data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting student and associated data',
      error: error.message 
    });
  }
});

// Get single student by ID
router.get('/students/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id);

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    res.json({
      success: true,
      student: student
    });
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching student',
      error: error.message 
    });
  }
});

module.exports = router;