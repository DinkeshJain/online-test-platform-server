const mongoose = require('mongoose');

/**
 * Migration script to permanently remove all title fields from tests
 * This ensures all tests use only the auto-generated title format
 */

async function removeTestTitlesCompletely() {
  try {
    console.log('Starting complete title field removal migration...');
    
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/online-test-platform');
      console.log('Connected to database');
    }

    // Count tests that have a title field
    const testsWithTitles = await mongoose.connection.db.collection('tests').countDocuments({ 
      title: { $exists: true } 
    });
    
    console.log(`Found ${testsWithTitles} tests with title fields that will be removed`);

    if (testsWithTitles === 0) {
      console.log('No tests with title fields found. Migration not needed.');
      return;
    }

    // Show some examples of what will be changed
    const sampleTests = await mongoose.connection.db.collection('tests').find({ 
      title: { $exists: true } 
    }).limit(5).toArray();

    console.log('\nExample tests that will be updated:');
    sampleTests.forEach((test, index) => {
      const newTitle = test.subject && test.subject.subjectCode && test.subject.subjectName 
        ? `${test.subject.subjectCode}: ${test.subject.subjectName} (Paper ${test.subject.subjectCode.slice(-1)})`
        : 'Auto-generated from subject info';
      
      console.log(`${index + 1}. "${test.title}" -> "${newTitle}"`);
    });

    if (testsWithTitles > 5) {
      console.log(`... and ${testsWithTitles - 5} more tests`);
    }

    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      readline.question(`\nThis will permanently remove title fields from ${testsWithTitles} tests. Continue? (yes/no): `, resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Migration cancelled by user.');
      return;
    }

    // Remove title field from all tests permanently
    const result = await mongoose.connection.db.collection('tests').updateMany(
      { title: { $exists: true } },
      { $unset: { title: "" } }
    );

    console.log(`\n✅ Migration completed successfully!`);
    console.log(`Removed title field from ${result.modifiedCount} tests`);
    console.log('All tests will now use auto-generated titles based on subject information.');
    console.log('Title field has been completely eliminated from the database.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('Database connection closed');
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  removeTestTitlesCompletely()
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = removeTestTitlesCompletely;
