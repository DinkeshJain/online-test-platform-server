const axios = require('axios');

async function testAdminEndpoint() {
  try {
    console.log('🔍 Testing /tests/admin endpoint...');
    
    // Test the endpoint directly (without auth for now to see raw response)
    const response = await axios.get('http://localhost:5000/tests/admin', {
      headers: {
        'Authorization': 'Bearer fake-token-for-testing' // This might fail auth but let's see what happens
      }
    }).catch(error => {
      console.log('❌ Auth failed, trying without token...');
      return axios.get('http://localhost:5000/tests/admin').catch(authError => {
        console.log('❌ Endpoint failed:', authError.response?.status, authError.response?.data?.message);
        return null;
      });
    });

    if (response) {
      console.log('✅ Endpoint responded!');
      console.log('📊 Status:', response.status);
      console.log('📋 Tests count in response:', response.data.tests?.length || 'No tests array found');
      
      if (response.data.tests && response.data.tests.length > 0) {
        const sampleTest = response.data.tests[0];
        console.log('📝 Sample test structure:');
        console.log('- ID:', sampleTest._id);
        console.log('- Course Code:', sampleTest.courseCode || 'NOT SET');
        console.log('- Course Name:', sampleTest.courseName || 'NOT SET');
        console.log('- Subject:', sampleTest.subject?.subjectCode || 'NOT SET');
        console.log('- Questions:', sampleTest.questions?.length || 'NOT SET');
        console.log('- Test Type:', sampleTest.testType);
        console.log('- Is Active:', sampleTest.isActive);
      }
      
      console.log('📦 Full response structure:');
      console.log('Keys:', Object.keys(response.data));
    } else {
      console.log('❌ No response received');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

// Run the test
testAdminEndpoint()
  .then(() => {
    console.log('\n🎉 Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
