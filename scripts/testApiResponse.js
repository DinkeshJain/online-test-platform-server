const axios = require('axios');

async function testApiResponse() {
  try {
    console.log('🔍 Testing actual API response...');
    
    // Simulate admin login to get token
    const loginResponse = await axios.post('http://localhost:5000/auth/admin/login', {
      email: 'admin@test.com', // Replace with actual admin credentials
      password: 'admin123'     // Replace with actual admin password
    }).catch(error => {
      console.log('❌ Login failed - using test without authentication');
      return null;
    });

    let headers = {};
    if (loginResponse) {
      headers.Authorization = `Bearer ${loginResponse.data.token}`;
    }

    // Test the API endpoint
    const response = await axios.get('http://localhost:5000/tests/admin', { headers });
    
    console.log('\n📊 API Response Summary:');
    console.log('Total tests returned:', response.data.tests.length);
    
    if (response.data.tests.length > 0) {
      const sampleTest = response.data.tests[0];
      console.log('\n📝 Sample Test from API:');
      console.log('Test ID:', sampleTest._id);
      console.log('Course Code:', sampleTest.courseCode || 'NOT SET');
      console.log('Course Name:', sampleTest.courseName || 'NOT SET');
      console.log('Subject Code:', sampleTest.subject?.subjectCode || 'NOT SET');
      console.log('Subject Name:', sampleTest.subject?.subjectName || 'NOT SET');
      console.log('Test Type:', sampleTest.testType);
      console.log('Created By field present in API response:', 'createdBy' in sampleTest);
      console.log('Course reference field present in API response:', 'course' in sampleTest);
      
      console.log('\n🔑 All fields in API response:');
      console.log(Object.keys(sampleTest));
    }

  } catch (error) {
    console.error('\n❌ API test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
  }
}

// Run the test
testApiResponse()
  .then(() => {
    console.log('\n🎉 API test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 API test failed:', error);
    process.exit(1);
  });
