const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI);

async function checkTimeSpentData() {
  try {
    const Submission = require('./models/Submission');
    
    // Find submissions and check timeSpent field
    const submissions = await Submission.find({}).limit(5);
    
    console.log('Total submissions:', await Submission.countDocuments());
    console.log('Sample submissions with timeSpent:');
    
    submissions.forEach((sub, index) => {
      console.log(`Submission ${index + 1}:`);
      console.log('- _id:', sub._id);
      console.log('- timeSpent:', sub.timeSpent);
      console.log('- submittedAt:', sub.submittedAt);
      console.log('- createdAt:', sub.createdAt);
      console.log('- isCompleted:', sub.isCompleted);
      
      // Calculate time difference between created and submitted
      if (sub.submittedAt && sub.createdAt) {
        const timeDiff = Math.floor((sub.submittedAt - sub.createdAt) / 1000);
        console.log('- calculated time diff (seconds):', timeDiff);
      }
      console.log('---');
    });
    
    // Check if any submissions have timeSpent > 0
    const withTimeSpent = await Submission.find({ timeSpent: { $gt: 0 } }).limit(3);
    console.log('Submissions with timeSpent > 0:', withTimeSpent.length);
    
    if (withTimeSpent.length > 0) {
      console.log('Sample submission with valid timeSpent:');
      console.log('- timeSpent:', withTimeSpent[0].timeSpent);
      console.log('- submittedAt:', withTimeSpent[0].submittedAt);
      console.log('- createdAt:', withTimeSpent[0].createdAt);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTimeSpentData();
