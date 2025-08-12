const XLSX = require('xlsx');

// Create a comprehensive Excel template with detailed instructions
function createBulkUploadTemplate() {
  // Template headers with proper column names
  const headers = [
    'EnrollmentNo', 'FullName', 'Username', 'BatchYear', 'Course',
    'AdmissionDate', 'DateOfBirth', 'Gender', 'EmailId', 'MobileNo',
    'AadharNo', 'CasteCategory', 'FatherName', 'MotherName',
    'AddressLine1', 'AddressLine2', 'City', 'State', 'Pincode'
  ];

  // Sample data rows
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
    },
    {
      'EnrollmentNo': '2024003',
      'FullName': 'Amit Kumar Singh',
      'Username': 'amitkumar',
      'BatchYear': '2024',
      'Course': 'Electronics Engineering',
      'AdmissionDate': '2024-08-15',
      'DateOfBirth': '2002-07-15',
      'Gender': 'Male',
      'EmailId': 'amit.singh@college.edu',
      'MobileNo': '9876543212',
      'AadharNo': '345678901234',
      'CasteCategory': 'SC',
      'FatherName': 'Rajesh Kumar Singh',
      'MotherName': 'Sunita Devi',
      'AddressLine1': '789 Ring Road',
      'AddressLine2': 'Phase 2, Residential Area',
      'City': 'Delhi',
      'State': 'Delhi',
      'Pincode': '110001'
    }
  ];

  // Instructions sheet data
  const instructions = [
    { 'Section': 'REQUIRED FIELDS', 'Field': 'EnrollmentNo', 'Description': 'Unique student enrollment number', 'Example': '2024001', 'Notes': 'Must be unique across all students' },
    { 'Section': '', 'Field': 'FullName', 'Description': 'Complete name of the student', 'Example': 'Rahul Sharma', 'Notes': 'Minimum 2 characters' },
    { 'Section': '', 'Field': 'EmailId', 'Description': 'Valid email address', 'Example': 'student@college.edu', 'Notes': 'Must be unique and valid format' },
    { 'Section': '', 'Field': '', 'Description': '', 'Example': '', 'Notes': '' },
    { 'Section': 'BASIC INFO (Optional)', 'Field': 'Username', 'Description': 'Login username', 'Example': 'rahulsharma', 'Notes': 'Defaults to EnrollmentNo if empty' },
    { 'Section': '', 'Field': 'BatchYear', 'Description': 'Year of admission', 'Example': '2024', 'Notes': 'Used for batch identification' },
    { 'Section': '', 'Field': 'Course', 'Description': 'Course name or code', 'Example': 'Computer Science', 'Notes': 'Course student is enrolled in' },
    { 'Section': '', 'Field': 'AdmissionDate', 'Description': 'Date of admission', 'Example': '2024-08-15', 'Notes': 'Format: YYYY-MM-DD' },
    { 'Section': '', 'Field': 'DateOfBirth', 'Description': 'Student date of birth', 'Example': '2002-05-10', 'Notes': 'Format: YYYY-MM-DD' },
    { 'Section': '', 'Field': 'Gender', 'Description': 'Student gender', 'Example': 'Male/Female/Other', 'Notes': 'Accepts these three values' },
    { 'Section': '', 'Field': 'MobileNo', 'Description': '10-digit mobile number', 'Example': '9876543210', 'Notes': 'No country code or special chars' },
    { 'Section': '', 'Field': '', 'Description': '', 'Example': '', 'Notes': '' },
    { 'Section': 'PERSONAL INFO (Optional)', 'Field': 'AadharNo', 'Description': '12-digit Aadhar number', 'Example': '123456789012', 'Notes': 'Exactly 12 digits if provided' },
    { 'Section': '', 'Field': 'CasteCategory', 'Description': 'Caste category', 'Example': 'General/OBC/SC/ST', 'Notes': 'As per government norms' },
    { 'Section': '', 'Field': 'FatherName', 'Description': 'Father\'s full name', 'Example': 'Suresh Kumar Sharma', 'Notes': 'Will be displayed in student list' },
    { 'Section': '', 'Field': 'MotherName', 'Description': 'Mother\'s full name', 'Example': 'Priya Sharma', 'Notes': 'For record keeping' },
    { 'Section': '', 'Field': '', 'Description': '', 'Example': '', 'Notes': '' },
    { 'Section': 'ADDRESS INFO (Optional)', 'Field': 'AddressLine1', 'Description': 'Primary address', 'Example': '123 MG Road, Sector 15', 'Notes': 'House/Flat number, street' },
    { 'Section': '', 'Field': 'AddressLine2', 'Description': 'Secondary address', 'Example': 'Near City Mall, Koramangala', 'Notes': 'Locality, landmarks' },
    { 'Section': '', 'Field': 'City', 'Description': 'City name', 'Example': 'Mumbai', 'Notes': 'Current city of residence' },
    { 'Section': '', 'Field': 'State', 'Description': 'State name', 'Example': 'Maharashtra', 'Notes': 'Current state of residence' },
    { 'Section': '', 'Field': 'Pincode', 'Description': '6-digit postal code', 'Example': '400001', 'Notes': 'Exactly 6 digits if provided' }
  ];

  // Photo instructions
  const photoInstructions = [
    { 'Topic': 'PHOTO UPLOAD INSTRUCTIONS', 'Details': '', 'Example': '', 'Important': '' },
    { 'Topic': '', 'Details': '', 'Example': '', 'Important': '' },
    { 'Topic': 'File Naming', 'Details': 'Photo filename must match EnrollmentNo', 'Example': '2024001.jpg, 2024002.png', 'Important': 'EXACT match required' },
    { 'Topic': 'Supported Formats', 'Details': 'JPG, JPEG, PNG, GIF', 'Example': 'student.jpg, photo.png', 'Important': 'Other formats not supported' },
    { 'Topic': 'File Size', 'Details': 'Maximum 5MB per photo', 'Example': 'Compress large files', 'Important': 'Upload will fail if >5MB' },
    { 'Topic': 'Image Quality', 'Details': 'Use passport-size photos for best results', 'Example': 'Clear, front-facing photo', 'Important': 'Avoid blurry images' },
    { 'Topic': 'Upload Process', 'Details': 'Select photos separately during upload', 'Example': 'Excel file + Photo files', 'Important': 'Both required for complete upload' },
    { 'Topic': '', 'Details': '', 'Example': '', 'Important': '' },
    { 'Topic': 'VALIDATION RULES', 'Details': '', 'Example': '', 'Important': '' },
    { 'Topic': '', 'Details': '', 'Example': '', 'Important': '' },
    { 'Topic': 'Unique Fields', 'Details': 'EnrollmentNo, Username, EmailId must be unique', 'Example': 'No duplicates allowed', 'Important': 'Duplicates will be rejected' },
    { 'Topic': 'Required Fields', 'Details': 'EnrollmentNo, FullName, EmailId are mandatory', 'Example': 'Cannot be empty', 'Important': 'Upload will fail if missing' },
    { 'Topic': 'Date Format', 'Details': 'All dates must be in YYYY-MM-DD format', 'Example': '2024-08-15', 'Important': 'Other formats will cause errors' },
    { 'Topic': 'Number Fields', 'Details': 'Mobile: 10 digits, Aadhar: 12 digits, PIN: 6 digits', 'Example': '9876543210', 'Important': 'Exact digit count required' },
    { 'Topic': 'Password Setup', 'Details': 'Password automatically set to EnrollmentNo', 'Example': 'If EnrollmentNo is 2024001, password is 2024001', 'Important': 'Students can change later' }
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Add instructions sheet
  const instructionSheet = XLSX.utils.json_to_sheet(instructions);
  XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');

  // Add photo instructions sheet
  const photoSheet = XLSX.utils.json_to_sheet(photoInstructions);
  XLSX.utils.book_append_sheet(workbook, photoSheet, 'Photo Guidelines');

  // Add sample data sheet
  const sampleSheet = XLSX.utils.json_to_sheet(sampleData);
  XLSX.utils.book_append_sheet(workbook, sampleSheet, 'Sample Data');

  // Add empty template sheet
  const templateSheet = XLSX.utils.json_to_sheet([{}]);
  // Add headers manually
  const headerRow = headers.map(header => ({ v: header, t: 's' }));
  const ws = {};
  headers.forEach((header, index) => {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
    ws[cellAddress] = { v: header, t: 's' };
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } });
  
  XLSX.utils.book_append_sheet(workbook, ws, 'Empty Template');

  // Write the file
  XLSX.writeFile(workbook, 'Student_Bulk_Upload_Template_v2.xlsx');

  console.log('✅ Complete Excel template created: Student_Bulk_Upload_Template_v2.xlsx');
  console.log('📋 The template includes:');
  console.log('   • Instructions sheet with detailed field descriptions');
  console.log('   • Photo Guidelines sheet with upload instructions');
  console.log('   • Sample Data sheet with example records');
  console.log('   • Empty Template sheet ready for data entry');
  console.log('');
  console.log('🆕 New fields added:');
  console.log('   • AadharNo - 12-digit Aadhar number');
  console.log('   • CasteCategory - Caste category information');
  console.log('   • FatherName - Father\'s full name (shown in display)');
  console.log('   • MotherName - Mother\'s full name');
  console.log('   • AddressLine1 - Primary address line');
  console.log('   • AddressLine2 - Secondary address line');
  console.log('   • City - City name');
  console.log('   • State - State name');
  console.log('   • Pincode - 6-digit postal code');
}

createBulkUploadTemplate();
