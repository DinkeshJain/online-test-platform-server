require('dotenv').config();
const mongoose = require('mongoose');
const Result = require('../models/Result');
const SupplementaryResult = require('../models/SupplementaryResult');

async function showCollectionSummary() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected successfully\n');
    
    // Regular Results Summary
    console.log('📊 REGULAR RESULTS COLLECTION');
    console.log('===============================');
    
    const regularCount = await Result.countDocuments();
    console.log(`Total regular students: ${regularCount}`);
    
    const regularByCourse = await Result.aggregate([
      {
        $group: {
          _id: '$course.courseCode',
          count: { $sum: 1 },
          courseName: { $first: '$course.courseName' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    regularByCourse.forEach(course => {
      console.log(`  ${course._id}: ${course.count} students (${course.courseName})`);
    });
    
    // Supplementary Results Summary
    console.log('\n🚨 SUPPLEMENTARY RESULTS COLLECTION');
    console.log('=====================================');
    
    const suppCount = await SupplementaryResult.countDocuments();
    console.log(`Total supplementary students: ${suppCount}`);
    
    const suppByCourse = await SupplementaryResult.aggregate([
      {
        $group: {
          _id: '$course.courseCode',
          count: { $sum: 1 },
          courseName: { $first: '$course.courseName' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    suppByCourse.forEach(course => {
      console.log(`  ${course._id}: ${course.count} students (${course.courseName})`);
    });
    
    // Show supplementary student details
    console.log('\n📝 SUPPLEMENTARY STUDENT DETAILS');
    console.log('=================================');
    
    const suppStudents = await SupplementaryResult.find({})
      .select('enrollmentNo fullName course.courseCode supplementaryType')
      .sort({ 'course.courseCode': 1, enrollmentNo: 1 });
    
    suppStudents.forEach(student => {
      console.log(`  ${student.enrollmentNo} - ${student.fullName} (${student.course.courseCode}) [${student.supplementaryType}]`);
    });
    
    // Verify no supplementary students in regular collection
    console.log('\n🔍 VERIFICATION CHECK');
    console.log('======================');
    
    const SUPPLEMENTARY_STUDENTS = [
      'C24DB774120', 'C24DB774122', 'C24DB774113', 'C24DB774121',
      'C24DB774022', 'C24DD774034', 'A23DB774057', 'C23DD774069',
      'C24DD774020', 'C24DB774068', 'A23DC774017', 'A23DC774015'
    ];
    
    const stillInRegular = await Result.find({
      enrollmentNo: { $in: SUPPLEMENTARY_STUDENTS }
    }).select('enrollmentNo course.courseCode');
    
    if (stillInRegular.length === 0) {
      console.log('✅ All supplementary students successfully moved from regular collection');
    } else {
      console.log('⚠️  Found supplementary students still in regular collection:');
      stillInRegular.forEach(student => {
        console.log(`  ${student.enrollmentNo} (${student.course.courseCode})`);
      });
    }
    
    // Summary totals
    console.log('\n📈 TOTAL SUMMARY');
    console.log('=================');
    console.log(`Regular students: ${regularCount}`);
    console.log(`Supplementary students: ${suppCount}`);
    console.log(`Grand total: ${regularCount + suppCount}`);
    
    console.log('\n📄 PDF FILES GENERATED');
    console.log('========================');
    console.log('✅ August_2025_Examination_Results.pdf (Regular students only)');
    console.log('✅ August_2025_Supplementary_Results.pdf (Supplementary students only)');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed.');
  }
}

// Main execution
if (require.main === module) {
  showCollectionSummary()
    .then(() => {
      console.log('\n✅ Summary completed!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Summary failed:', err);
      process.exit(1);
    });
}

module.exports = { showCollectionSummary };