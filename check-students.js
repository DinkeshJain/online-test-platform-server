const mongoose = require('mongoose');
const Student = require('./models/Student');
require('dotenv').config();

async function checkStudents() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app');
    console.log('✅ Connected to MongoDB');
    
    const students = await Student.find().select('enrollmentNo fullName emailId createdAt');
    console.log(`📊 Total students: ${students.length}`);
    
    students.forEach(student => {
      console.log(`- ${student.enrollmentNo}: ${student.fullName} (${student.emailId}) - Created: ${student.createdAt}`);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  process.exit(0);
}

checkStudents();
