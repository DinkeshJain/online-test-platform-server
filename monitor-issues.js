// Real-time monitoring script for null selectedAnswers issue
// Run this during exam to monitor the problem

const https = require('https');

const API_BASE = 'https://online-test-platform-server-1q1h.onrender.com';

// You'll need to replace this with an actual admin JWT token
const ADMIN_TOKEN = 'YOUR_ADMIN_JWT_TOKEN_HERE';

function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'online-test-platform-server-1q1h.onrender.com',
      path: endpoint,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function monitorIssues() {
  try {
    console.log('\n=== REAL-TIME MONITORING ===');
    console.log('Time:', new Date().toLocaleString());
    
    // Check live issues (last 2 hours)
    const liveIssues = await makeRequest('/api/submissions/monitor/null-answers-live');
    console.log('\n📊 LIVE ISSUES (Last 2 hours):');
    console.log(`Total submissions: ${liveIssues.total}`);
    console.log(`Issues detected: ${liveIssues.withNullIssues} (${liveIssues.issueRate}%)`);
    
    if (liveIssues.affectedStudents.length > 0) {
      console.log('\n🚨 AFFECTED STUDENTS:');
      liveIssues.affectedStudents.forEach(student => {
        console.log(`  - ${student.enrollmentNo} (${student.testSubject}): ${student.nullCount}/${student.totalAnswers} null (${student.issuePercentage}%)`);
      });
    }
    
    // Check today's summary
    const todaySummary = await makeRequest('/api/submissions/dashboard/issue-summary');
    console.log('\n📈 TODAY\'S SUMMARY:');
    console.log(`Total submissions: ${todaySummary.totalSubmissions}`);
    console.log(`Issues detected: ${todaySummary.issuesDetected} (${todaySummary.issueRate}%)`);
    console.log(`Critical issues: ${todaySummary.criticalIssues}`);
    
    // Alert if issue rate is high
    if (parseFloat(liveIssues.issueRate) > 5.0) {
      console.log('\n🚨🚨🚨 HIGH ISSUE RATE DETECTED! 🚨🚨🚨');
      console.log('Consider immediate intervention!');
    }
    
  } catch (error) {
    console.error('Monitoring failed:', error.message);
  }
}

// Run monitoring every 5 minutes
console.log('Starting real-time monitoring...');
console.log('Checking every 5 minutes...');
console.log('Press Ctrl+C to stop');

// Initial check
monitorIssues();

// Then check every 5 minutes
setInterval(monitorIssues, 5 * 60 * 1000);
