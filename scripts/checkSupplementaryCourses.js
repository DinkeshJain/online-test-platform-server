require('dotenv').config();
const mongoose = require('mongoose');
const SupplementaryResult = require('../models/SupplementaryResult');

async function checkSupplementaryCourses() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const courses = await SupplementaryResult.distinct('course.courseCode');
    console.log('Course codes in supplementary collection:', courses);
    
    const counts = await SupplementaryResult.aggregate([
      {
        $group: {
          _id: '$course.courseCode',
          count: { $sum: 1 },
          courseName: { $first: '$course.courseName' }
        }
      }
    ]);
    
    console.log('\nCourse counts:');
    counts.forEach(course => {
      console.log(`${course._id}: ${course.count} students (${course.courseName})`);
    });
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSupplementaryCourses();