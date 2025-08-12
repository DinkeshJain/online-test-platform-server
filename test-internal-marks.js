// Test internal marks API
const axios = require('axios');

// Test data - you'll need to replace these with actual IDs from your database
const testData = {
  studentId: '507f1f77bcf86cd799439011', // Replace with actual student ID
  courseId: '507f1f77bcf86cd799439012',  // Replace with actual course ID
  subjectCode: 'CS101',
  subjectName: 'Computer Science',
  internalMarks: 25
};

// Replace with actual evaluator JWT token
const token = 'your-evaluator-jwt-token-here';

async function testInternalMarks() {
  try {
    console.log('Testing internal marks API...');
    console.log('Test data:', testData);
    
    const response = await axios.post('http://localhost:5000/api/evaluators/internal-marks', testData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Success:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    console.error('Status:', error.response?.status);
  }
}

// Uncomment and run with actual data
// testInternalMarks();

console.log('Test file ready. Update the testData and token, then uncomment the function call to test.');
