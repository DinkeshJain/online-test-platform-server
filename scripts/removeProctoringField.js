// Script to remove the 'proctoring' field from all Submission documents in MongoDB
// Usage: node removeProctoringField.js
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Submission = require('../models/Submission'); // Corrected path

const MONGODB_URI = process.env.MONGO_URI; // Uses .env MONGO_URI

async function removeProctoringField() {
    try {
        await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        const result = await Submission.updateMany({}, { $unset: { proctoring: "" } });
        console.log(`Removed 'proctoring' field from ${result.nModified || result.modifiedCount} documents.`);
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error removing proctoring field:', err);
        process.exit(1);
    }
}

removeProctoringField();