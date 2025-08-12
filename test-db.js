const mongoose = require('mongoose');
const Student = require('./models/Student');
require('dotenv').config();

async function testBulkUpload() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app');
    console.log('✅ Connected to MongoDB');
    
    // Test creating a single student manually
    console.log('\n🧪 Testing single student creation...');
    
    const testStudent = new Student({
      username: 'test123',
      password: 'test123', // Will be hashed by model
      enrollmentNo: 'TEST123',
      batchYear: '2024',
      course: 'Test Course',
      admissionDate: new Date(),
      fullName: 'Test Student',
      dateOfBirth: new Date('2000-01-01'),
      gender: 'Other',
      emailId: 'test123@example.com',
      mobileNo: '1234567890'
    });
    
    // Check validation first
    const validationError = testStudent.validateSync();
    if (validationError) {
      console.error('❌ Validation failed:', validationError.message);
      return;
    }
    
    // Try to save
    await testStudent.save();
    console.log('✅ Test student created successfully!');
    
    // Count total students
    const studentCount = await Student.countDocuments();
    console.log(`📊 Total students in database: ${studentCount}`);
    
    // Clean up test student
    await Student.deleteOne({ username: 'test123' });
    console.log('🧹 Cleaned up test student');
    
    console.log('\n✅ Database test completed successfully!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testBulkUpload();
