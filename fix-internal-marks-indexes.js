const mongoose = require('mongoose');
require('dotenv').config();

async function fixInternalMarksIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app');
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('internalmarks');

    // Get current indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Drop the problematic index if it exists
    try {
      await collection.dropIndex('studentId_1_testId_1');
      console.log('Dropped old studentId_1_testId_1 index');
    } catch (error) {
      console.log('studentId_1_testId_1 index not found or already dropped');
    }

    // Create the correct index
    try {
      await collection.createIndex(
        { studentId: 1, courseId: 1, subjectCode: 1, evaluatorId: 1 }, 
        { unique: true, name: 'studentId_1_courseId_1_subjectCode_1_evaluatorId_1' }
      );
      console.log('Created correct compound index');
    } catch (error) {
      console.log('Index already exists or error creating:', error.message);
    }

    // Show final indexes
    const finalIndexes = await collection.indexes();
    console.log('Final indexes:', JSON.stringify(finalIndexes, null, 2));

    console.log('Index migration completed successfully');
  } catch (error) {
    console.error('Error fixing indexes:', error);
  } finally {
    await mongoose.connection.close();
  }
}

fixInternalMarksIndexes();
