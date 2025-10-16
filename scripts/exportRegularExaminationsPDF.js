require('dotenv').config();
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const Result = require('../models/Result');

// Connect to MongoDB
if (!process.env.MONGO_URI) {
  console.error('Error: MONGO_URI environment variable is not set');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// HTML template for the PDF
const generateHTMLTemplate = (students, courseInfo) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>August 2025 Regular Examination Results</title>
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
                        ${student.subjects.map(subject => {
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
                        Director <br/>
                        Centre for Distance Education
                    </div>
                </div>
            </div>
        `).join('')}
    </body>
    </html>
  `;
};

// Function to get all results grouped by course
async function getResultsByCourse() {
  try {
    console.log('Fetching all results from database...');
    
    const results = await Result.find({})
      .populate('enrollmentNo', 'fullName fatherName')
      .sort({ 'course.courseCode': 1, 'enrollmentNo': 1 });

    if (!results || results.length === 0) {
      console.log('No results found in database');
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

    console.log(`Found results for ${Object.keys(groupedResults).length} courses:`);
    Object.keys(groupedResults).forEach(courseCode => {
      console.log(`  ${courseCode}: ${groupedResults[courseCode].students.length} students`);
    });

    return groupedResults;
  } catch (error) {
    console.error('Error fetching results:', error);
    return {};
  }
}

// Function to generate PDF for a specific course
async function generateCoursePDF(courseCode, courseData, outputDir) {
  try {
    console.log(`Generating PDF for course: ${courseCode}`);
    
    const html = generateHTMLTemplate(courseData.students, courseData.courseInfo);
    const fileName = `${courseCode}_Results_${new Date().toISOString().split('T')[0]}.pdf`;
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

    console.log(`PDF generated successfully: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`Error generating PDF for course ${courseCode}:`, error);
    return null;
  }
}

// Function to generate combined PDF with all courses
async function generateCombinedPDF(groupedResults, outputDir) {
  try {
    console.log('Generating combined PDF for all courses...');
    
    // Combine all students from all courses
    const allStudents = [];
    Object.keys(groupedResults).forEach(courseCode => {
      allStudents.push(...groupedResults[courseCode].students);
    });

    if (allStudents.length === 0) {
      console.log('No students to include in combined PDF');
      return null;
    }

    const html = generateHTMLTemplate(allStudents, { courseName: 'All Courses' });
    const fileName = `August_2025_Regular_Examination_Results.pdf`;
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

// Main export function
async function exportPDFReports() {
  try {
    console.log('Starting PDF export process...');
    
    // Create output directory
    const outputDir = path.join(__dirname, '..', 'exports');
    await fs.mkdir(outputDir, { recursive: true });
    
    console.log(`Output directory: ${outputDir}`);

    // Get all results grouped by course
    const groupedResults = await getResultsByCourse();
    
    if (Object.keys(groupedResults).length === 0) {
      console.log('No results found. Exiting...');
      return;
    }

    const generatedFiles = [];

    // Generate separate PDFs for each course only if specifically requested
    if (separateOnly || (!combinedOnly && !separateOnly && args.includes('--separate'))) {
      for (const [courseCode, courseData] of Object.entries(groupedResults)) {
        const filePath = await generateCoursePDF(courseCode, courseData, outputDir);
        if (filePath) {
          generatedFiles.push(filePath);
        }
      }
    }

    // Generate combined PDF (default behavior)
    if (!separateOnly) {
      const combinedFilePath = await generateCombinedPDF(groupedResults, outputDir);
      if (combinedFilePath) {
        generatedFiles.push(combinedFilePath);
      }
    }

    console.log(`\n✅ PDF export completed successfully!`);
    console.log(`Generated ${generatedFiles.length} files:`);
    generatedFiles.forEach(file => console.log(`  📄 ${path.basename(file)}`));
    console.log(`\nFiles saved in: ${outputDir}`);

  } catch (error) {
    console.error('Error in PDF export process:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Command line options
const args = process.argv.slice(2);
const courseFilter = args.find(arg => arg.startsWith('--course='))?.split('=')[1];
const combinedOnly = args.includes('--combined-only');
const separateOnly = args.includes('--separate-only');

// Modify the main function to handle command line options
async function main() {
  if (courseFilter) {
    console.log(`Filtering results for course: ${courseFilter}`);
  }
  
  if (combinedOnly) {
    console.log('Generating combined PDF only (default behavior)');
  } else if (separateOnly) {
    console.log('Generating separate PDFs only');
  } else {
    console.log('Generating combined PDF (default) - use --separate for individual course PDFs');
  }

  await exportPDFReports();
}

// Run the script
console.log('PDF Export Script for Student Results');
console.log('=====================================');
main()
  .then(() => {
    console.log('Export process completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Export process failed:', err);
    process.exit(1);
  });