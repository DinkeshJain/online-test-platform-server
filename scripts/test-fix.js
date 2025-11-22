const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app')
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    });

const Submission = require('../models/Submission');
const Course = require('../models/Course');

async function testFix() {
    try {
        console.log('🧪 Testing fix for a small sample...\n');
        
        // Fix just 5 submissions as a test
        const objectIdSubmissions = await Submission.find({
            course: { $regex: /^[0-9a-fA-F]{24}$/ }
        }).limit(5);
        
        console.log(`Testing with ${objectIdSubmissions.length} submissions`);
        
        // Get course mapping
        const allCourses = await Course.find({});
        const courseMap = {};
        allCourses.forEach(course => {
            courseMap[course._id.toString()] = course.courseCode;
        });
        
        console.log('Available courses:', Object.values(courseMap));
        
        for (const submission of objectIdSubmissions) {
            console.log(`\nSubmission ${submission._id}:`);
            console.log(`- Current course: ${submission.course}`);
            
            const courseCode = courseMap[submission.course];
            if (courseCode) {
                console.log(`- Will change to: ${courseCode}`);
                // Uncomment to actually update:
                // await Submission.updateOne(
                //     { _id: submission._id },
                //     { course: courseCode }
                // );
                // console.log('✅ Updated');
            } else {
                console.log(`- ⚠️ No mapping found for ${submission.course}`);
            }
        }
        
        console.log('\n🧪 Test completed. Uncomment update lines to apply changes.');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        mongoose.disconnect();
    }
}

testFix();