require('dotenv').config();
const mongoose = require('mongoose');
const SupplementaryResult = require('../models/SupplementaryResult');

async function calculateAndUpdateSGPA() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected successfully\n');
    
    // Find all students in supplementary results
    const supplementaryStudents = await SupplementaryResult.find({});
    
    console.log(`Found ${supplementaryStudents.length} students in supplementary results collection`);
    
    if (supplementaryStudents.length === 0) {
      console.log('No students found in supplementary collection');
      return;
    }
    
    console.log('\n=== CALCULATING AND UPDATING SGPA ===');
    
    let updatedCount = 0;
    let errors = [];
    
    for (const student of supplementaryStudents) {
      console.log(`\nProcessing ${student.enrollmentNo} - ${student.fullName} (${student.course.courseCode})`);
      
      let totalCredits = 0;
      let totalGradePoints = 0;
      let validSubjects = 0;
      
      // Calculate totals from subjects
      student.subjects.forEach((subject, index) => {
        const credits = subject.credits || 4; // Default to 4 if not set
        const gradePoints = subject.gradePoints || 0;
        
        totalCredits += credits;
        totalGradePoints += (gradePoints * credits);
        validSubjects++;
        
        console.log(`  Subject ${index + 1}: ${subject.subjectCode} - Credits: ${credits}, Grade Points: ${gradePoints}, Weighted: ${gradePoints * credits}`);
      });
      
      // Calculate SGPA
      let calculatedSGPA = 0;
      if (totalCredits > 0) {
        calculatedSGPA = parseFloat((totalGradePoints / totalCredits).toFixed(2));
      }
      
      console.log(`  📊 Total Credits: ${totalCredits}`);
      console.log(`  📊 Total Grade Points: ${totalGradePoints}`);
      console.log(`  📊 Current SGPA: ${student.sgpa}`);
      console.log(`  📊 Calculated SGPA: ${calculatedSGPA}`);
      
      // Check if update is needed
      if (Math.abs(student.sgpa - calculatedSGPA) > 0.01 || 
          student.totalCredits !== totalCredits || 
          student.totalGradePoints !== totalGradePoints) {
        
        try {
          // Update the student record
          await SupplementaryResult.findByIdAndUpdate(
            student._id,
            { 
              sgpa: calculatedSGPA,
              totalCredits: totalCredits,
              totalGradePoints: totalGradePoints
            },
            { new: true }
          );
          
          console.log(`  ✅ Updated SGPA: ${student.sgpa} → ${calculatedSGPA}`);
          updatedCount++;
        } catch (updateError) {
          console.log(`  ❌ Error updating ${student.enrollmentNo}: ${updateError.message}`);
          errors.push({
            enrollmentNo: student.enrollmentNo,
            error: updateError.message
          });
        }
      } else {
        console.log(`  ✓ SGPA already correct, no update needed`);
      }
    }
    
    console.log(`\n✅ Successfully updated ${updatedCount} students`);
    
    if (errors.length > 0) {
      console.log(`\n❌ Errors encountered for ${errors.length} students:`);
      errors.forEach(error => {
        console.log(`  - ${error.enrollmentNo}: ${error.error}`);
      });
    }
    
    // Verification - show summary by course
    console.log('\n=== VERIFICATION SUMMARY ===');
    const courses = await SupplementaryResult.distinct('course.courseCode');
    
    for (const courseCode of courses) {
      const courseStudents = await SupplementaryResult.find({ 'course.courseCode': courseCode });
      const avgSGPA = courseStudents.reduce((sum, s) => sum + s.sgpa, 0) / courseStudents.length;
      
      console.log(`\n${courseCode} (${courseStudents.length} students):`);
      console.log(`  Average SGPA: ${avgSGPA.toFixed(2)}`);
      
      courseStudents.forEach(student => {
        console.log(`  ${student.enrollmentNo}: SGPA ${student.sgpa} (${student.totalCredits} credits)`);
      });
    }
    
    await mongoose.connection.close();
    console.log('\nDatabase connection closed.');
    
  } catch (error) {
    console.error('Error calculating SGPA:', error);
  }
}

console.log('🧮 CALCULATING SUPPLEMENTARY RESULTS SGPA');
console.log('=========================================');
calculateAndUpdateSGPA()
  .then(() => {
    console.log('\n✅ SGPA calculation and update completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });