const mongoose = require('mongoose');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/onlinetest', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const testSchema = new mongoose.Schema({}, { strict: false });
const Test = mongoose.model('Test', testSchema);

async function analyzeTestData() {
  try {
    console.log('🔍 ANALYZING TEST DATA FOR isCorrect ISSUES');
    console.log('═'.repeat(60));
    
    const tests = await Test.find({}).limit(5); // Check first 5 tests
    
    console.log(`📊 Found ${tests.length} tests to analyze\n`);
    
    let totalQuestions = 0;
    let issuesFound = 0;
    const issues = [];
    
    tests.forEach((test, testIndex) => {
      console.log(`🧪 Test ${testIndex + 1}: ${test.title || 'Untitled'}`);
      console.log(`   Course: ${test.courseName || 'Unknown'}`);
      console.log(`   Questions: ${test.questions?.length || 0}`);
      
      if (!test.questions || !Array.isArray(test.questions)) {
        console.log(`   ❌ No questions array found`);
        return;
      }
      
      test.questions.forEach((question, qIndex) => {
        totalQuestions++;
        const qNum = qIndex + 1;
        
        // Check correctAnswer
        if (question.correctAnswer === undefined || question.correctAnswer === null) {
          issues.push(`Test ${testIndex + 1}, Q${qNum}: Missing correctAnswer`);
          issuesFound++;
        } else if (typeof question.correctAnswer !== 'number') {
          issues.push(`Test ${testIndex + 1}, Q${qNum}: correctAnswer is not a number (${typeof question.correctAnswer})`);
          issuesFound++;
        } else if (question.correctAnswer < 0 || question.correctAnswer > 3) {
          issues.push(`Test ${testIndex + 1}, Q${qNum}: correctAnswer out of range (${question.correctAnswer})`);
          issuesFound++;
        }
        
        // Check shuffledToOriginal
        if (question.shuffledToOriginal) {
          if (!Array.isArray(question.shuffledToOriginal)) {
            issues.push(`Test ${testIndex + 1}, Q${qNum}: shuffledToOriginal is not an array`);
            issuesFound++;
          } else if (question.shuffledToOriginal.length !== 4) {
            issues.push(`Test ${testIndex + 1}, Q${qNum}: shuffledToOriginal length is ${question.shuffledToOriginal.length}, expected 4`);
            issuesFound++;
          } else {
            // Check for undefined/null values in array
            question.shuffledToOriginal.forEach((val, idx) => {
              if (val === undefined || val === null) {
                issues.push(`Test ${testIndex + 1}, Q${qNum}: shuffledToOriginal[${idx}] is ${val}`);
                issuesFound++;
              } else if (typeof val !== 'number') {
                issues.push(`Test ${testIndex + 1}, Q${qNum}: shuffledToOriginal[${idx}] is not a number (${typeof val})`);
                issuesFound++;
              } else if (val < 0 || val > 3) {
                issues.push(`Test ${testIndex + 1}, Q${qNum}: shuffledToOriginal[${idx}] out of range (${val})`);
                issuesFound++;
              }
            });
          }
        }
        
        // Check options array
        if (!question.options || !Array.isArray(question.options)) {
          issues.push(`Test ${testIndex + 1}, Q${qNum}: Missing or invalid options array`);
          issuesFound++;
        } else if (question.options.length !== 4) {
          issues.push(`Test ${testIndex + 1}, Q${qNum}: Expected 4 options, found ${question.options.length}`);
          issuesFound++;
        }
      });
      
      console.log(`   Status: ${issues.length === 0 ? '✅ Clean' : `⚠️ ${issues.length} issues`}\n`);
    });
    
    console.log('📈 ANALYSIS SUMMARY:');
    console.log('═'.repeat(40));
    console.log(`Total questions analyzed: ${totalQuestions}`);
    console.log(`Total issues found: ${issuesFound}`);
    console.log(`Issue rate: ${totalQuestions > 0 ? ((issuesFound / totalQuestions) * 100).toFixed(2) : 0}%`);
    
    if (issues.length > 0) {
      console.log('\n❌ ISSUES FOUND:');
      console.log('-'.repeat(30));
      issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
      
      console.log('\n🔧 RECOMMENDED FIXES:');
      console.log('1. Run database migration to fix malformed data');
      console.log('2. Add validation to prevent future bad data');
      console.log('3. Implement fallback logic for corrupt shuffledToOriginal');
    } else {
      console.log('\n🎉 NO ISSUES FOUND - Data looks clean!');
    }
    
  } catch (error) {
    console.error('❌ Error analyzing test data:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the analysis
analyzeTestData();
