require('dotenv').config();
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const SupplementaryResult = require('../models/SupplementaryResult');

// Subject filtering configuration
const subjectFilters = {
  'C23DD774069': ['P03'],
  'C24DD774020': ['P05', 'P06', 'P08'],
  'C24DD774034': ['P05'],
  'A23DC774015': ['P01', 'P02'],
  'A23DC774017': ['P01'],
  'A23DB774057': ['P01', 'P02', 'P03', 'P04'],
  'C24DB774022': ['P01'],
  'C24DB774068': ['P01'],
  'C24DB774113': ['P01', 'P02', 'P03', 'P04'],
  'C24DB774120': ['P01', 'P02', 'P03', 'P04'],
  'C24DB774121': ['P01', 'P02', 'P03', 'P04'],
  'C24DB774122': ['P01', 'P02', 'P03', 'P04']
};

// Function to filter subjects based on enrollment number
const filterSubjects = (enrollmentNo, subjects) => {
  const allowedSubjects = subjectFilters[enrollmentNo];
  if (!allowedSubjects) {
    // If no filter specified for this enrollment, show all subjects
    return subjects;
  }
  
  // Filter subjects based on subject code
  return subjects.filter(subject => {
    return allowedSubjects.some(allowed => subject.subjectCode.includes(allowed));
  });
};

// HTML template for the PDF
const generateHTMLTemplate = (students, courseInfo) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>August 2025 Examination Results</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background: white;
                color: black;
            }
            
            .page-break {
                page-break-before: always;
            }
            
            .student-result {
                margin-bottom: 50px;
                page-break-inside: avoid;
            }
            
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            
            .header h1 {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 8px;
            }
            
            .header h2 {
                font-size: 20px;
                font-weight: 600;
                margin-bottom: 8px;
            }
            
            .header h3 {
                font-size: 18px;
                font-weight: 600;
            }
            
            .student-info {
                margin-bottom: 30px;
                text-align: left;
            }
            
            .student-info div {
                margin-bottom: 4px;
                font-size: 16px;
            }
            
            .student-info .label {
                font-weight: bold;
            }
            
            .results-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 24px;
            }
            
            .results-table th,
            .results-table td {
                border: 1px solid black;
                padding: 12px;
            }
            
            .results-table th {
                background-color: #f8f9fa;
                font-weight: bold;
                text-align: left;
            }
            
            .results-table .text-center {
                text-align: center;
            }
            
            .grade-info {
                margin-bottom: 24px;
                font-size: 16px;
            }
            
            .grade-info .label {
                font-weight: bold;
            }
            
            .note {
                margin-bottom: 30px;
                font-size: 16px;
            }
            
            .note .label {
                font-weight: bold;
            }
            
            .signature {
                text-align: right;
                margin-top: 60px;
            }
            
            .signature div {
                font-weight: bold;
                line-height: 1.4;
            }
            
            @media print {
                body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                
                .page-break {
                    page-break-before: always;
                }
                
                .student-result {
                    page-break-inside: avoid;
                }
            }
        </style>
    </head>
    <body>
        ${students.map((student, index) => `
            <div class="student-result ${index > 0 ? 'page-break' : ''}">
                <!-- Header -->
                <div class="header">
                    <h1>Acharya Nagarjuna University</h1>
                    <h2>Centre for Distance Education - Online Diploma Programs</h2>
                    <h3>August-2025 Examination Results</h3>
                </div>
                
                <!-- Student Information -->
                <div class="student-info">
                    <div><span class="label">Enrollment No : </span>${student.enrollmentNo}</div>
                    <div><span class="label">Student Name : </span>${student.fullName}</div>
                    <div><span class="label">Father Name : </span>${student.fatherName || 'N/A'}</div>
                    <div><span class="label">Course : </span>${student.course.courseName}</div>
                </div>
                
                <!-- Results Table -->
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th class="text-center">Credits</th>
                            <th class="text-center">Grade Points</th>
                            <th class="text-center">Grade Letter</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filterSubjects(student.enrollmentNo, student.subjects).map(subject => {
                            return `
                                <tr>
                                    <td>${subject.subjectCode} ${subject.subjectName}</td>
                                    <td class="text-center">${subject.credits || 4}</td>
                                    <td class="text-center">${subject.gradePoints || 0}</td>
                                    <td class="text-center" style="font-weight: bold;">${subject.grade}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                
                <!-- Grade Point Average -->
                <div class="grade-info">
                    <span class="label">Grade Point Average: </span>${student.sgpa}
                </div>
                
                <!-- Note -->
                <div class="note">
                    <span class="label">Note : </span>Grade Letter 'W' - Absent, 'F' - Fail
                </div>
                
                <!-- Coordinator Signature -->
                <div class="signature">
                    <div>
                        Director<br/>
                        Centre for Distance Education
                    </div>
                </div>
            </div>
        `).join('')}
    </body>
    </html>
  `;
};

// Function to get all supplementary results grouped by course
async function getSupplementaryResultsByCourse() {
  try {
    console.log('Fetching all supplementary results from database...');
    
    const results = await SupplementaryResult.find({})
      .sort({ 'course.courseCode': 1, 'enrollmentNo': 1 });

    if (!results || results.length === 0) {
      console.log('No supplementary results found in database');
      return {};
    }

    // Group results by course code
    const groupedResults = {};
    
    results.forEach(result => {
      const courseCode = result.course.courseCode;
      if (!groupedResults[courseCode]) {
        groupedResults[courseCode] = {
          courseInfo: result.course,
          students: []
        };
      }
      groupedResults[courseCode].students.push(result);
    });

    console.log(`Found supplementary results for ${Object.keys(groupedResults).length} courses:`);
    Object.keys(groupedResults).forEach(courseCode => {
      console.log(`  ${courseCode}: ${groupedResults[courseCode].students.length} students`);
    });

    return groupedResults;
  } catch (error) {
    console.error('Error fetching supplementary results:', error);
    return {};
  }
}

// Function to generate combined PDF with all supplementary results
async function generateSupplementaryPDF(groupedResults, outputDir) {
  try {
    console.log('Generating combined supplementary PDF for all courses...');
    
    // Combine all students from all courses
    const allStudents = [];
    Object.keys(groupedResults).forEach(courseCode => {
      allStudents.push(...groupedResults[courseCode].students);
    });

    if (allStudents.length === 0) {
      console.log('No supplementary students to include in PDF');
      return null;
    }

    const html = generateHTMLTemplate(allStudents, { courseName: 'All Courses' });
    const fileName = `August_2025_Supplementary_Results.pdf`;
    const filePath = path.join(outputDir, fileName);

    // Launch puppeteer
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set the HTML content
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF
    await page.pdf({
      path: filePath,
      format: 'A4',
      margin: {
        top: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
        right: '0.5in'
      },
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: false
    });

    await browser.close();

    console.log(`Combined PDF generated successfully: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Error generating combined PDF:', error);
    return null;
  }
}

// Main function
async function exportSupplementaryPDF() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const groupedResults = await getSupplementaryResultsByCourse();
    
    if (Object.keys(groupedResults).length === 0) {
      console.log('No supplementary results found to export');
      return;
    }

    // Create exports directory if it doesn't exist
    const outputDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate combined PDF
    const pdfPath = await generateSupplementaryPDF(groupedResults, outputDir);
    
    if (pdfPath) {
      console.log(`\n✅ Supplementary results PDF exported successfully!`);
      console.log(`📄 File: ${pdfPath}`);
      
      // Show summary
      const totalStudents = Object.values(groupedResults)
        .reduce((total, group) => total + group.students.length, 0);
      console.log(`📊 Total supplementary students: ${totalStudents}`);
    }

  } catch (error) {
    console.error('Error exporting supplementary PDF:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run if called directly
if (require.main === module) {
  exportSupplementaryPDF()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Export failed:', err);
      process.exit(1);
    });
}

module.exports = { exportSupplementaryPDF, getSupplementaryResultsByCourse };