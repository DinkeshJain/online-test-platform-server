/**
 * Migration script to add hasExternalExam field to existing course subjects
 * This ensures all subjects have the hasExternalExam field properly set
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import Course model
const Course = require('../models/Course');

async function migrateCourseSubjects() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app');
    console.log('✅ Connected to MongoDB');

    // Find all courses
    const courses = await Course.find({});
    console.log(`📚 Found ${courses.length} courses to check`);

    let updatedCount = 0;

    for (const course of courses) {
      let courseUpdated = false;
      const updatedSubjects = course.subjects.map(subject => {
        if (subject.hasExternalExam === undefined) {
          console.log(`🔧 Adding hasExternalExam=true to subject: ${subject.subjectCode} in course: ${course.courseCode}`);
          courseUpdated = true;
          return {
            ...subject,
            hasExternalExam: true
          };
        }
        return subject;
      });

      if (courseUpdated) {
        course.subjects = updatedSubjects;
        await course.save();
        updatedCount++;
        console.log(`✅ Updated course: ${course.courseCode} (${course.courseName})`);
      }
    }

    console.log(`\n🎉 Migration completed!`);
    console.log(`📊 Updated ${updatedCount} courses`);
    
    // Verify the migration
    console.log('\n🔍 Verifying migration...');
    const verificationCourses = await Course.find({});
    let totalSubjects = 0;
    let subjectsWithExternalExam = 0;
    let subjectsWithoutExternalExam = 0;

    for (const course of verificationCourses) {
      for (const subject of course.subjects) {
        totalSubjects++;
        if (subject.hasExternalExam === true) {
          subjectsWithExternalExam++;
        } else if (subject.hasExternalExam === false) {
          subjectsWithoutExternalExam++;
        } else {
          console.log(`⚠️  Found subject without hasExternalExam field: ${subject.subjectCode} in ${course.courseCode}`);
        }
      }
    }

    console.log(`📈 Total subjects: ${totalSubjects}`);
    console.log(`✅ Subjects with external exam: ${subjectsWithExternalExam}`);
    console.log(`❌ Subjects without external exam: ${subjectsWithoutExternalExam}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📴 Disconnected from MongoDB');
  }
}

// Run the migration if this script is called directly
if (require.main === module) {
  migrateCourseSubjects()
    .then(() => {
      console.log('🏁 Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = migrateCourseSubjects;
