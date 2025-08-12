const mongoose = require('mongoose');

// Simple script to remove all test titles
async function removeAllTestTitles() {
  try {
    // Connect to your database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/online-test-platform');
    
    console.log('Connected to database');
    
    // Remove title field from all tests in the collection
    const result = await mongoose.connection.db.collection('tests').updateMany(
      {}, // Match all documents
      { $unset: { title: "" } } // Remove the title field
    );
    
    console.log(`✅ Removed titles from ${result.modifiedCount} tests`);
    console.log('All tests will now use auto-generated titles');
    
    await mongoose.disconnect();
    console.log('Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

removeAllTestTitles();
