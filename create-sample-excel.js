const XLSX = require('xlsx');

// Sample data with all the new fields
const sampleStudents = [
  {
    'EnrollmentNo': '2024001',
    'FullName': 'Rahul Sharma',
    'Username': 'rahulsharma',
    'BatchYear': '2024',
    'Course': 'Computer Science',
    'AdmissionDate': '2024-08-15',
    'DateOfBirth': '2002-05-10',
    'Gender': 'Male',
    'EmailId': 'rahul.sharma@example.com',
    'MobileNo': '9876543210',
    'AadharNo': '123456789012',
    'CasteCategory': 'General',
    'FatherName': 'Suresh Sharma',
    'MotherName': 'Priya Sharma',
    'AddressLine1': '123 MG Road',
    'AddressLine2': 'Near City Mall',
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
    'EmailId': 'priya.patel@example.com',
    'MobileNo': '9876543211',
    'AadharNo': '234567890123',
    'CasteCategory': 'OBC',
    'FatherName': 'Kiran Patel',
    'MotherName': 'Meera Patel',
    'AddressLine1': '456 Park Street',
    'AddressLine2': 'Sector 5',
    'City': 'Pune',
    'State': 'Maharashtra',
    'Pincode': '411001'
  },
  {
    'EnrollmentNo': '2024003',
    'FullName': 'Amit Kumar',
    'Username': 'amitkumar',
    'BatchYear': '2024',
    'Course': 'Electronics',
    'AdmissionDate': '2024-08-15',
    'DateOfBirth': '2002-07-15',
    'Gender': 'Male',
    'EmailId': 'amit.kumar@example.com',
    'MobileNo': '9876543212',
    'AadharNo': '345678901234',
    'CasteCategory': 'SC',
    'FatherName': 'Rajesh Kumar',
    'MotherName': 'Sunita Kumar',
    'AddressLine1': '789 Ring Road',
    'AddressLine2': 'Phase 2',
    'City': 'Delhi',
    'State': 'Delhi',
    'Pincode': '110001'
  }
];

// Create workbook and worksheet
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(sampleStudents);

// Add the worksheet to the workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

// Write the file
XLSX.writeFile(workbook, 'sample_students_with_new_fields.xlsx');

console.log('Sample Excel file created: sample_students_with_new_fields.xlsx');
console.log('This file contains the new format with all additional fields:');
console.log('- AadharNo');
console.log('- CasteCategory');
console.log('- FatherName');
console.log('- MotherName');
console.log('- AddressLine1');
console.log('- AddressLine2');
console.log('- City');
console.log('- State');
console.log('- Pincode');
