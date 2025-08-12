const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const Student = require('../models/Student');
const { adminAuth } = require('../middleware/auth');

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
    const workbook = XLSX.readFile(excelFile.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const students = XLSX.utils.sheet_to_json(worksheet);

    // Create photo mapping (enrollment number -> photo file)
    const photoMap = {};
    photos.forEach(photo => {
      // Extract enrollment number from filename (remove extension)
      const enrollmentNo = path.parse(photo.originalname).name;
      photoMap[enrollmentNo] = photo.filename;
    });

    const results = {
      successful: [],
      failed: [],
      total: students.length
    };

    // Process each student
    for (const studentData of students) {
      try {
        // Map Excel columns to our schema - adjust these field names based on your Excel structure
        const enrollmentNo = studentData.EnrollmentNo || studentData.enrollmentNo || studentData['Enrollment No'];
        const fullName = studentData.FullName || studentData.fullName || studentData['Full Name'] || studentData.Name;
        const username = studentData.Username || studentData.username || enrollmentNo?.toLowerCase();
        const batchYear = studentData.BatchYear || studentData.batchYear || studentData['Batch Year'];
        const course = studentData.Course || studentData.course;
        const admissionDate = studentData.AdmissionDate || studentData.admissionDate || studentData['Admission Date'];
        const dateOfBirth = studentData.DateOfBirth || studentData.dateOfBirth || studentData['Date Of Birth'];
        const gender = studentData.Gender || studentData.gender;
        const emailId = studentData.EmailID || studentData.emailId || studentData.emailID || studentData['Email ID'] || studentData.Email;
        let mobileNo = studentData.MobileNo || studentData.mobileNo || studentData['Mobile No'] || studentData.Mobile;
        
        // New fields
        const aadharNo = studentData.AadharNo || studentData.aadharNo || studentData['Aadhar No'] || studentData.Aadhar;
        const casteCategory = studentData.CasteCategory || studentData.casteCategory || studentData['Caste Category'] || studentData.Caste;
        const fatherName = studentData.FatherName || studentData.fatherName || studentData['Father Name'] || studentData.Father;
        const motherName = studentData.MotherName || studentData.motherName || studentData['Mother Name'] || studentData.Mother;
        const addressLine1 = studentData.AddressLine1 || studentData.addressLine1 || studentData['Address Line 1'] || studentData['Address 1'];
        const addressLine2 = studentData.AddressLine2 || studentData.addressLine2 || studentData['Address Line 2'] || studentData['Address 2'];
        const city = studentData.City || studentData.city;
        const state = studentData.State || studentData.state;
        const pincode = studentData.Pincode || studentData.pincode || studentData.PinCode || studentData.PIN;
        
        // Clean mobile number - extract first 10 digits if multiple numbers present
        if (typeof mobileNo === 'string') {
          mobileNo = mobileNo.replace(/\D/g, '').substring(0, 10);
        }
        
        if (!mobileNo || mobileNo.length !== 10) {
          mobileNo = '0000000000'; // Default fallback
        }

        if (!enrollmentNo || !fullName || !emailId) {
          results.failed.push({
            data: studentData,
            error: 'Missing required fields: EnrollmentNo, FullName, or EmailId'
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
            error: `Student already exists with username: ${username}, enrollment: ${enrollmentNo}, or email: ${emailId}`
          });
          continue;
        }

        // Create new student
        const studentObj = {
          username: username?.toLowerCase(),
          password: enrollmentNo, // Use enrollment number as password
          enrollmentNo: enrollmentNo,
          batchYear: batchYear || 'Unknown',
          course: course || 'Unknown',
          admissionDate: admissionDate ? new Date(admissionDate) : new Date(),
          fullName: fullName,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date(),
          gender: gender || 'Other',
          emailId: emailId,
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
        await newStudent.save();

        results.successful.push({
          enrollmentNo,
          fullName,
          username,
          emailId,
          photo: photoMap[enrollmentNo] ? 'Uploaded' : 'Not found'
        });      } catch (error) {
        console.error('Error saving student:', error);
        results.failed.push({
          data: studentData,
          error: error.message
        });
      }
    }

    // Clean up uploaded Excel file
    fs.unlinkSync(excelFile.path);

    res.json({
      message: 'Students data upload completed',
      results
    });

  } catch (error) {
    console.error('Students data upload error:', error);
    res.status(500).json({ message: 'Server error during students data upload', error: error.message });
  }
});

// Get upload template information
router.get('/students/template', (req, res) => {
  res.json({
    message: 'Complete Excel template structure for students data upload',
    version: '2.0 - Updated with additional fields',
    requiredColumns: [
      'EnrollmentNo (required) - Unique student enrollment number',
      'FullName (required) - Complete name of the student', 
      'EmailId (required) - Valid email address (must be unique)'
    ],
    optionalColumns: [
      'Username (optional) - Login username, defaults to EnrollmentNo if not provided',
      'BatchYear (optional) - Year of admission/batch (e.g., 2024)',
      'Course (optional) - Course code or name',
      'AdmissionDate (optional) - Date in YYYY-MM-DD format',
      'DateOfBirth (optional) - Date in YYYY-MM-DD format',
      'Gender (optional) - Male/Female/Other',
      'MobileNo (optional) - 10-digit mobile number'
    ],
    newPersonalFields: [
      'AadharNo (optional) - 12-digit Aadhar card number',
      'CasteCategory (optional) - General/OBC/SC/ST/EWS/etc.',
      'FatherName (optional) - Father\'s full name',
      'MotherName (optional) - Mother\'s full name'
    ],
    newAddressFields: [
      'AddressLine1 (optional) - Primary address line',
      'AddressLine2 (optional) - Secondary address line/locality',
      'City (optional) - City name',
      'State (optional) - State name',
      'Pincode (optional) - 6-digit postal code'
    ],
    completeColumnOrder: [
      'EnrollmentNo', 'FullName', 'Username', 'BatchYear', 'Course', 
      'AdmissionDate', 'DateOfBirth', 'Gender', 'EmailId', 'MobileNo',
      'AadharNo', 'CasteCategory', 'FatherName', 'MotherName',
      'AddressLine1', 'AddressLine2', 'City', 'State', 'Pincode'
    ],
    sampleData: [
      {
        'EnrollmentNo': '2024001',
        'FullName': 'Rahul Sharma',
        'Username': 'rahulsharma',
        'BatchYear': '2024',
        'Course': 'Computer Science',
        'AdmissionDate': '2024-08-15',
        'DateOfBirth': '2002-05-10',
        'Gender': 'Male',
        'EmailId': 'rahul.sharma@college.edu',
        'MobileNo': '9876543210',
        'AadharNo': '123456789012',
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
        'EnrollmentNo': '2024002',
        'FullName': 'Priya Patel',
        'Username': 'priyapatel',
        'BatchYear': '2024',
        'Course': 'Information Technology',
        'AdmissionDate': '2024-08-15',
        'DateOfBirth': '2002-03-22',
        'Gender': 'Female',
        'EmailId': 'priya.patel@college.edu',
        'MobileNo': '9876543211',
        'AadharNo': '234567890123',
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
      'EnrollmentNo', 'FullName', 'Username', 'BatchYear', 'Course',
      'AdmissionDate', 'DateOfBirth', 'Gender', 'EmailId', 'MobileNo',
      'AadharNo', 'CasteCategory', 'FatherName', 'MotherName',
      'AddressLine1', 'AddressLine2', 'City', 'State', 'Pincode'
    ];

    // Sample data
    const sampleData = [
      {
        'EnrollmentNo': '2024001',
        'FullName': 'Rahul Sharma',
        'Username': 'rahulsharma',
        'BatchYear': '2024',
        'Course': 'Computer Science',
        'AdmissionDate': '2024-08-15',
        'DateOfBirth': '2002-05-10',
        'Gender': 'Male',
        'EmailId': 'rahul.sharma@college.edu',
        'MobileNo': '9876543210',
        'AadharNo': '123456789012',
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
      { 'Field': 'REQUIRED FIELDS', 'Description': '', 'Format': '', 'Example': '', 'Notes': '' },
      { 'Field': 'EnrollmentNo', 'Description': 'Unique student enrollment number', 'Format': 'Text/Number', 'Example': '2024001', 'Notes': 'Must be unique across all students' },
      { 'Field': 'FullName', 'Description': 'Complete name of student', 'Format': 'Text', 'Example': 'Rahul Sharma', 'Notes': 'Minimum 2 characters required' },
      { 'Field': 'EmailId', 'Description': 'Valid email address', 'Format': 'Email', 'Example': 'student@college.edu', 'Notes': 'Must be unique and valid format' },
      { 'Field': '', 'Description': '', 'Format': '', 'Example': '', 'Notes': '' },
      { 'Field': 'OPTIONAL FIELDS', 'Description': '', 'Format': '', 'Example': '', 'Notes': '' },
      { 'Field': 'Username', 'Description': 'Login username', 'Format': 'Text', 'Example': 'rahulsharma', 'Notes': 'Defaults to EnrollmentNo if empty' },
      { 'Field': 'BatchYear', 'Description': 'Year of admission', 'Format': 'Number', 'Example': '2024', 'Notes': 'Used for batch identification' },
      { 'Field': 'Course', 'Description': 'Course name or code', 'Format': 'Text', 'Example': 'Computer Science', 'Notes': 'Student enrolled course' },
      { 'Field': 'AdmissionDate', 'Description': 'Date of admission', 'Format': 'Date', 'Example': '2024-08-15', 'Notes': 'Format: YYYY-MM-DD only' },
      { 'Field': 'DateOfBirth', 'Description': 'Student birth date', 'Format': 'Date', 'Example': '2002-05-10', 'Notes': 'Format: YYYY-MM-DD only' },
      { 'Field': 'Gender', 'Description': 'Student gender', 'Format': 'Text', 'Example': 'Male/Female/Other', 'Notes': 'Accepts only these values' },
      { 'Field': 'MobileNo', 'Description': '10-digit mobile number', 'Format': 'Number', 'Example': '9876543210', 'Notes': 'No country code or special chars' },
      { 'Field': 'AadharNo', 'Description': '12-digit Aadhar number', 'Format': 'Number', 'Example': '123456789012', 'Notes': 'Exactly 12 digits if provided' },
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
      .select('fullName enrollmentNo batchYear fatherName course studentPhoto createdAt')
      .sort({ enrollmentNo: 1 });
    
    // Map the fields to match frontend expectations
    const mappedStudents = students.map(student => ({
      _id: student._id,
      name: student.fullName,
      enrollmentNumber: student.enrollmentNo,
      batchYear: student.batchYear,
      fatherName: student.fatherName,
      course: student.course,
      photoPath: student.studentPhoto,
      createdAt: student.createdAt
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

module.exports = router;
