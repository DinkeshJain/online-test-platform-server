const XLSX = require('xlsx');

// Sample student data for testing
const sampleStudents = [
  {
    'EnrollmentNo': '2024001',
    'FullName': 'John Doe',
    'Username': 'johndoe',
    'BatchYear': '2024',
    'Course': 'Computer Science',
    'AdmissionDate': '2024-08-15',
    'DateOfBirth': '2002-05-10',
    'Gender': 'Male',
    'EmailId': 'john.doe@college.edu',
    'MobileNo': '9876543210',
    'AadharNo': '123456789012',
    'CasteCategory': 'General',
    'FatherName': 'Robert Doe',
    'MotherName': 'Jane Doe',
    'AddressLine1': '123 Main Street',
    'AddressLine2': 'Apartment 4B',
    'City': 'Mumbai',
    'State': 'Maharashtra',
    'Pincode': '400001'
  },
  {
    'EnrollmentNo': '2024002',
    'FullName': 'Alice Smith',
    'Username': 'alicesmith',
    'BatchYear': '2024',
    'Course': 'Information Technology',
    'AdmissionDate': '2024-08-15',
    'DateOfBirth': '2002-03-22',
    'Gender': 'Female',
    'EmailId': 'alice.smith@college.edu',
    'MobileNo': '9876543211',
    'AadharNo': '234567890123',
    'CasteCategory': 'OBC',
    'FatherName': 'Mark Smith',
    'MotherName': 'Sarah Smith',
    'AddressLine1': '456 Oak Avenue',
    'AddressLine2': 'Suite 2A',
    'City': 'Pune',
    'State': 'Maharashtra',
    'Pincode': '411001'
  }
];

// Create workbook and worksheet
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(sampleStudents);

// Add worksheet to workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

// Write to file
XLSX.writeFile(workbook, 'test-students.xlsx');

console.log('✅ Test Excel file created: test-students.xlsx');
console.log('📋 Sample data:');
sampleStudents.forEach(student => {
  console.log(`- ${student.EnrollmentNo}: ${student.FullName} (${student.EmailId})`);
});
