require('dotenv').config();
const mongoose = require('mongoose');
const Result = require('../models/Result');

// Function to remove duplicate results
async function removeDuplicateResults() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected successfully');
    
    console.log('Checking for duplicate results...');
    
    const duplicates = await Result.aggregate([
      {
        $group: {
          _id: {
            enrollmentNo: '$enrollmentNo'
          },
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', createdAt: '$createdAt', course: '$course.courseCode', semester: '$semester' } }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    if (duplicates.length === 0) {
      console.log('No duplicate results found.');
      return 0;
    }

    console.log(`Found ${duplicates.length} sets of duplicate results.`);
    console.log('Duplicate summary:');
    
    let totalDuplicates = 0;
    duplicates.forEach(duplicate => {
      const student = duplicate._id;
      totalDuplicates += (duplicate.count - 1); // Subtract 1 to keep one copy
      const courses = [...new Set(duplicate.docs.map(doc => doc.course))].join(', ');
      const semesters = [...new Set(duplicate.docs.map(doc => doc.semester))].join(', ');
      console.log(`  Student ${student.enrollmentNo} (Courses: ${courses}, Semesters: ${semesters}): ${duplicate.count} copies`);
    });

    console.log(`\nTotal duplicate records to remove: ${totalDuplicates}`);
    
    // Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('Do you want to proceed with removing duplicates? (y/N): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('Operation cancelled.');
      return 0;
    }

    let removedCount = 0;
    for (const duplicate of duplicates) {
      // Sort by createdAt to keep the oldest record (or newest if you prefer)
      const sortedDocs = duplicate.docs.sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
      
      // Keep the first document, remove the rest
      const [keep, ...remove] = sortedDocs;
      
      if (remove.length > 0) {
        const idsToRemove = remove.map(doc => doc.id);
        const result = await Result.deleteMany({ _id: { $in: idsToRemove } });
        removedCount += result.deletedCount;
        
        const student = duplicate._id;
        console.log(`Removed ${result.deletedCount} duplicate(s) for student ${student.enrollmentNo}`);
      }
    }

    console.log(`\nCleanup completed successfully!`);
    console.log(`Total duplicate records removed: ${removedCount}`);
    return removedCount;
    
  } catch (error) {
    console.error('Error removing duplicates:', error);
    return 0;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

// Main execution
if (require.main === module) {
  removeDuplicateResults()
    .then((count) => {
      process.exit(0);
    })
    .catch(err => {
      console.error('Script failed:', err);
      process.exit(1);
    });
}

module.exports = { removeDuplicateResults };