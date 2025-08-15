const mongoose = require('mongoose');
const dotenv = require('dotenv');

async function forceRemoveFields() {
  try {
    dotenv.config();
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app');
    console.log('Connected to MongoDB\n');
    
    // Use direct collection access
    const collection = mongoose.connection.db.collection('tests');
    
    // Check which documents have these fields
    const docsWithFields = await collection.find({
      $or: [
        { entryGracePeriod: { $exists: true } },
        { extensionPeriod: { $exists: true } }
      ]
    }).toArray();
    
    console.log(`Found ${docsWithFields.length} documents with grace/extension period fields:`);
    docsWithFields.forEach(doc => {
      console.log(`- ${doc._id}: entryGracePeriod=${doc.entryGracePeriod}, extensionPeriod=${doc.extensionPeriod}`);
    });
    console.log('');
    
    if (docsWithFields.length > 0) {
      // Force remove the fields
      const result = await collection.updateMany(
        {
          $or: [
            { entryGracePeriod: { $exists: true } },
            { extensionPeriod: { $exists: true } }
          ]
        },
        {
          $unset: {
            entryGracePeriod: "",
            extensionPeriod: ""
          }
        }
      );
      
      console.log(`Force removal completed:`);
      console.log(`- Matched: ${result.matchedCount} documents`);
      console.log(`- Modified: ${result.modifiedCount} documents`);
      console.log('');
      
      // Verify removal
      const remainingDocs = await collection.find({
        $or: [
          { entryGracePeriod: { $exists: true } },
          { extensionPeriod: { $exists: true } }
        ]
      }).toArray();
      
      console.log(`Verification: ${remainingDocs.length} documents still have the fields`);
      if (remainingDocs.length === 0) {
        console.log('✅ All fields successfully removed!');
      }
    }
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('Force removal failed:', error);
  }
}

forceRemoveFields();
