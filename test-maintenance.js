const axios = require('axios');

async function testMaintenanceEndpoint() {
  try {
    console.log('🔍 Testing maintenance endpoint...');
    
    // Use environment variable for API URL, fallback to localhost for development
    const API_URL = process.env.API_URL || 'http://localhost:5000';
    
    // Test without auth first to see the error response
    const response = await axios.get(`${API_URL}/api/maintenance/quick-check`);
    console.log('✅ Response:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('📝 Status:', error.response?.status);
    
    // This should show 401 unauthorized, which means the endpoint is working
    if (error.response?.status === 401) {
      console.log('✅ Endpoint is working - returns 401 as expected (auth required)');
    }
  }
}

testMaintenanceEndpoint();
