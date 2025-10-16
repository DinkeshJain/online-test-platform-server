require('dotenv').config();
const mongoose = require('mongoose');
const Result = require('../models/Result');
const SupplementaryResult = require('../models/SupplementaryResult');

// List of supplementary student enrollment numbers
const SUPPLEMENTARY_STUDENTS = [
  'C24DB774120',
  'C24DB774122',
  'C24DB774113',
  'C24DB774121',
  'C24DB774022',
  'C24DD774034',
  'A23DB774057',
  'C23DD774069',
  'C24DD774020',
  'C24DB774068',
  'A23DC774017',
  'A23DC774015'
];

async function moveSupplementaryStudents() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected successfully');
    
    console.log(`Processing ${SUPPLEMENTARY_STUDENTS.length} supplementary students...`);
    
    let movedCount = 0;
    let notFoundCount = 0;
    let alreadySupplementaryCount = 0;
    
    for (const enrollmentNo of SUPPLEMENTARY_STUDENTS) {
      console.log(`\nProcessing ${enrollmentNo}...`);
      
      // Check if already in supplementary collection
      const existingSupplementary = await SupplementaryResult.findOne({ enrollmentNo });
      if (existingSupplementary) {
        console.log(`  ⚠️  Already in supplementary collection`);
        alreadySupplementaryCount++;
        continue;
      }
      
      // Find in regular results collection
      const regularResults = await Result.find({ enrollmentNo });
      
      if (regularResults.length === 0) {
        console.log(`  ❌ Not found in regular results`);
        notFoundCount++;
        continue;
      }
      
      console.log(`  📋 Found ${regularResults.length} record(s) in regular results`);
      
      // Debug: Show structure of first result
      if (regularResults.length > 0) {
        const sample = regularResults[0].toObject();
        console.log(`  🔍 Sample data structure:`, {
          enrollmentNo: sample.enrollmentNo,
          course: sample.course,
          semester: sample.semester,
          academicYear: sample.academicYear,
          subjectCount: sample.subjects?.length,
          firstSubject: sample.subjects?.[0]
        });
      }
      
      // Move each result to supplementary collection
      for (const result of regularResults) {
        const resultObj = result.toObject();
        
        // Calculate missing required fields
        let totalCredits = 0;
        let totalGradePoints = 0;
        
        // Process subjects to ensure all required fields exist
        const processedSubjects = resultObj.subjects.map(subject => {
          // Calculate total credits and grade points
          totalCredits += subject.credits || 0;
          totalGradePoints += (subject.gradePoints || 0) * (subject.credits || 0);
          
          return {
            ...subject,
            maxMarks: subject.maxMarks || 100, // Default to 100 if missing
            marksObtained: subject.marksObtained || subject.marks?.total || 0,
            marks: subject.marks || {
              internal: 0,
              external: 0,
              total: subject.marksObtained || 0
            }
          };
        });
        
        // Create supplementary result with all required fields
        const supplementaryData = {
          enrollmentNo: resultObj.enrollmentNo,
          fullName: resultObj.fullName,
          fatherName: resultObj.fatherName,
          course: {
            courseCode: resultObj.course.courseCode,
            courseName: resultObj.course.courseName,
            semester: resultObj.course.semester || resultObj.semester || '1',
            academicYear: resultObj.course.academicYear || resultObj.academicYear || '2024-25'
          },
          subjects: processedSubjects,
          semester: resultObj.semester || '1',
          academicYear: resultObj.academicYear || '2024-25',
          sgpa: resultObj.sgpa || 0,
          totalCredits: totalCredits,
          totalGradePoints: totalGradePoints,
          supplementaryType: 'REAPPEAR',
          supplementaryExamDate: new Date(),
          remarks: 'Moved from regular results - Supplementary student'
        };
        
        // Create in supplementary collection
        const supplementaryResult = new SupplementaryResult(supplementaryData);
        await supplementaryResult.save();
        
        console.log(`  ✅ Moved to supplementary collection (Course: ${result.course.courseCode}, Semester: ${supplementaryData.semester})`);
      }
      
      // Remove from regular collection
      const deleteResult = await Result.deleteMany({ enrollmentNo });
      console.log(`  🗑️  Removed ${deleteResult.deletedCount} record(s) from regular results`);
      
      movedCount++;
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY:');
    console.log(`✅ Successfully moved: ${movedCount} students`);
    console.log(`⚠️  Already supplementary: ${alreadySupplementaryCount} students`);
    console.log(`❌ Not found: ${notFoundCount} students`);
    console.log('='.repeat(50));
    
    // Verify the move
    console.log('\nVerifying supplementary collection...');
    const supplementaryCount = await SupplementaryResult.countDocuments({
      enrollmentNo: { $in: SUPPLEMENTARY_STUDENTS }
    });
    console.log(`Found ${supplementaryCount} supplementary students in new collection`);
    
    // Show sample supplementary records
    const samples = await SupplementaryResult.find({
      enrollmentNo: { $in: SUPPLEMENTARY_STUDENTS }
    }).limit(3);
    
    console.log('\nSample supplementary records:');
    samples.forEach(sample => {
      console.log(`  ${sample.enrollmentNo} - ${sample.fullName} (${sample.course.courseCode})`);
    });
    
  } catch (error) {
    console.error('Error moving supplementary students:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed.');
  }
}

// Main execution
if (require.main === module) {
  moveSupplementaryStudents()
    .then(() => {
      console.log('\n✅ Supplementary student migration completed!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { moveSupplementaryStudents, SUPPLEMENTARY_STUDENTS };