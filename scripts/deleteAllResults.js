require('dotenv').config();
const mongoose = require('mongoose');
const Result = require('../models/Result');

async function deleteAllResults() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected successfully');
    
    // Count existing records
    const count = await Result.countDocuments();
    console.log(`Found ${count} existing result records.`);
    
    if (count === 0) {
      console.log('No records to delete.');
      return 0;
    }

    // Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n⚠️  WARNING: This will permanently delete ALL result records!');
    const answer = await new Promise(resolve => {
      rl.question(`Are you sure you want to delete all ${count} result records? (type "DELETE" to confirm): `, resolve);
    });
    rl.close();

    if (answer !== 'DELETE') {
      console.log('Operation cancelled. No records were deleted.');
      return 0;
    }

    console.log('Deleting all result records...');
    const result = await Result.deleteMany({});
    
    console.log(`Successfully deleted ${result.deletedCount} records.`);
    console.log('Database is now clean and ready for fresh import.');
    
    return result.deletedCount;
    
  } catch (error) {
    console.error('Error deleting records:', error);
    return 0;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

// Main execution
if (require.main === module) {
  deleteAllResults()
    .then((count) => {
      if (count > 0) {
        console.log('\n✅ All records deleted successfully!');
        console.log('You can now run the import script to add fresh data:');
        console.log('   node scripts/importResults.js "path/to/your/excel/file.xlsx"');
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Script failed:', err);
      process.exit(1);
    });
}

module.exports = { deleteAllResults };