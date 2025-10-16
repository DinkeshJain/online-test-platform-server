require('dotenv').config();
const mongoose = require('mongoose');
const Result = require('../models/Result');

// Subject name mapping for all courses
const subjectMapping = {
  // Certificate Course in Fire and Safety (CCFS)
  'CCFS01': 'Fundamentals of Fire and Safety',
  'CCFS02': 'Safety in Construction',
  'CCFS03': 'Emergency Response & Environment Pollution',
  
  // Diploma in Health Safety Environment (DHSE)
  'DHSE01': 'Industrial Safety',
  'DHSE02': 'Safety in Construction Industry',
  'DHSE03': 'Occupational Health',
  'DHSE04': 'Environment & Pollution',
  'DHSE05': 'Internship Skill Test and Project Work Report',
  
  // Advance Diploma in Quality Health Safety Environment (ADQHSE)
  'ADQHSE01': 'Quality Control in HSE',
  'ADQHSE02': 'Industrial Safety',
  'ADQHSE03': 'Construction Safety',
  'ADQHSE04': 'Safety and the Legislation',
  'ADQHSE05': 'Occupational Health & Environment',
  'ADQHSE06': 'Internship Skill Test and Project Work Report',
  
  // Advance Diploma in Fire and Safety (ADFS) - already have proper names, but including for completeness
  'ADFS01': 'Fire Engineering',
  'ADFS02': 'Safety Management',
  'ADFS03': 'Safety in Construction',
  'ADFS04': 'Safety and the Law',
  'ADFS05': 'Industrial Hygiene & Occupational Health',
  'ADFS06': 'Internship Skill Test and Project Work Report',
  
  // Advance Diploma in Industrial Safety Supplementary (ADISS)
  'ADISS03': 'SAFETY ENGINEERING',
  'ADISS05': 'SAFETY HEALTH AND ENVIRONMENT LEGISLATION',
  'ADISS06': 'INDUSTRIAL HYGIENE AND OCCUPATIONAL HEALTH',
  'ADISS08': 'SAFETY IN CONSTRUCTION INDUSTRY',
  
  // Diploma in Fire and Safety (DFS)
  'DFS01': 'Fundamentals of Fire and Safety',
  'DFS02': 'Industrial Safety Techniques',
  'DFS03': 'Construction Safety',
  'DFS04': 'Safety in Chemical Industry',
  'DFS05': 'Internship Skill Test and Project Work Report',
  
  // Advance Diploma in Industrial Safety (ADIS)
  'ADIS01': 'Health Safety and Environment (HSE) Management',
  'ADIS02': 'Safety Engineering',
  'ADIS03': 'Safety, Health and Environment Legislation',
  'ADIS04': 'Safety in Chemical & Petrochemical Industry',
  'ADIS05': 'Safety in Construction Industry',
  'ADIS06': 'Internship and Project Report',
};

async function updateSubjectNames() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all results with "Unknown Subject" entries
    const results = await Result.find({
      'subjects.subjectName': { $regex: /^Unknown Subject/ }
    });

    console.log(`Found ${results.length} results with unknown subjects`);

    let updatedCount = 0;

    for (const result of results) {
      let hasUpdates = false;
      
      // Update subjects with known names
      result.subjects.forEach(subject => {
        if (subject.subjectName.startsWith('Unknown Subject')) {
          const mappedName = subjectMapping[subject.subjectCode];
          if (mappedName) {
            console.log(`Updating ${subject.subjectCode}: ${subject.subjectName} -> ${mappedName}`);
            subject.subjectName = mappedName;
            hasUpdates = true;
          } else {
            console.warn(`No mapping found for subject code: ${subject.subjectCode}`);
          }
        }
      });

      if (hasUpdates) {
        await result.save();
        updatedCount++;
        console.log(`Updated result for ${result.enrollmentNo}`);
      }
    }

    console.log(`\nUpdate completed! Updated ${updatedCount} results.`);
    
    // Show a sample of updated results
    const sampleResult = await Result.findOne({}).select('enrollmentNo subjects.subjectCode subjects.subjectName');
    if (sampleResult) {
      console.log('\nSample updated result:');
      console.log(`Student: ${sampleResult.enrollmentNo}`);
      sampleResult.subjects.forEach(sub => {
        console.log(`  ${sub.subjectCode}: ${sub.subjectName}`);
      });
    }

  } catch (error) {
    console.error('Error updating subject names:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

updateSubjectNames();