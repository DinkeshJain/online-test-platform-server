const xlsx = require('xlsx');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './.env' });

async function updateInternalMarksInResults() {
    const client = new MongoClient(process.env.MONGO_URI);
    
    try {
        // Read Excel file
        console.log('📁 Reading Excel file...');
        const workbook = xlsx.readFile('Student_Internl_Extenl_Mrks_Results_by_Subject_2025-09-03.xlsx');
        
        console.log(`📊 Found ${workbook.SheetNames.length} sheets in Excel file`);
        
        // Collect all data from all sheets
        let allExcelData = [];
        let subjectSheetMap = new Map(); // Map to track which subject each record belongs to
        
        workbook.SheetNames.forEach((sheetName, index) => {
            console.log(`📋 Processing sheet ${index + 1}: ${sheetName}`);
            const worksheet = workbook.Sheets[sheetName];
            const sheetData = xlsx.utils.sheet_to_json(worksheet);
            
            // Extract subject code from sheet name (e.g., "ADFS01 Report" -> "ADFS01")
            const subjectCode = sheetName.replace(' Report', '').replace(' (No External)', '');
            
            // Add subject code to each record
            const dataWithSubject = sheetData.map(record => ({
                ...record,
                subjectCode: subjectCode,
                sheetName: sheetName
            }));
            
            allExcelData = allExcelData.concat(dataWithSubject);
            console.log(`   📊 ${sheetData.length} records from ${subjectCode}`);
        });
        
        console.log(`📊 Total records across all sheets: ${allExcelData.length}`);
        
        // Connect to MongoDB
        await client.connect();
        console.log('🔌 Connected to MongoDB');
        
        const db = client.db('online-test-app');
        const resultsCollection = db.collection('results');
        
        // Get current results from database
        console.log('\n📊 Fetching current results from database...');
        const currentResults = await resultsCollection.find({}).toArray();
        console.log(`📋 Found ${currentResults.length} results records in database`);
        
        // Create a map for quick lookup by enrollment number
        const resultsMap = new Map();
        currentResults.forEach(record => {
            if (record.enrollmentNo) {
                resultsMap.set(record.enrollmentNo, record);
            }
        });
        
        console.log('\n🔄 Processing internal marks updates in results...');
        console.log('='.repeat(60));
        
        let updatedCount = 0;
        let skippedCount = 0;
        let notFoundCount = 0;
        let errorCount = 0;
        
        const bulkOperations = [];
        
        // Group records by enrollment number and subject
        const studentSubjectMap = new Map();
        
        for (const excelRecord of allExcelData) {
            const enrollmentNo = excelRecord['Enrollment Number'];
            const excelInternalMarks = parseInt(excelRecord['Internal Marks']);
            const excelStudentName = excelRecord['Full Name'];
            const subjectCode = excelRecord.subjectCode;
            
            if (!enrollmentNo || isNaN(excelInternalMarks) || !subjectCode) {
                console.log(`⚠️  Skipping invalid record: ${enrollmentNo || 'No enrollment'} - ${subjectCode || 'No subject'}`);
                errorCount++;
                continue;
            }
            
            if (!studentSubjectMap.has(enrollmentNo)) {
                studentSubjectMap.set(enrollmentNo, new Map());
            }
            
            studentSubjectMap.get(enrollmentNo).set(subjectCode, {
                internalMarks: excelInternalMarks,
                studentName: excelStudentName
            });
        }
        
        console.log(`👥 Processing ${studentSubjectMap.size} unique students...`);
        
        // Process each student's results
        for (const [enrollmentNo, subjects] of studentSubjectMap) {
            const resultRecord = resultsMap.get(enrollmentNo);
            
            if (resultRecord) {
                // Check if the result has subjects array to update internal marks
                if (resultRecord.subjects && Array.isArray(resultRecord.subjects)) {
                    let needsUpdate = false;
                    const updatedSubjects = resultRecord.subjects.map(subject => {
                        const excelSubjectData = subjects.get(subject.subjectCode);
                        
                        // Check if we need to update marks.internal
                        if (excelSubjectData && subject.marks && subject.marks.internal !== excelSubjectData.internalMarks) {
                            needsUpdate = true;
                            return {
                                ...subject,
                                marks: {
                                    ...subject.marks,
                                    internal: excelSubjectData.internalMarks,
                                    total: (subject.marks.external || 0) + excelSubjectData.internalMarks
                                }
                            };
                        }
                        return subject;
                    });
                    
                    if (needsUpdate) {
                        bulkOperations.push({
                            updateOne: {
                                filter: { enrollmentNo: enrollmentNo },
                                update: { 
                                    $set: { 
                                        subjects: updatedSubjects,
                                        updatedAt: new Date()
                                    }
                                }
                            }
                        });
                        
                        const subjectsUpdated = updatedSubjects.filter((subject, index) => {
                            const excelSubjectData = subjects.get(subject.subjectCode);
                            const originalSubject = resultRecord.subjects[index];
                            return excelSubjectData && originalSubject.marks && originalSubject.marks.internal !== excelSubjectData.internalMarks;
                        });
                        
                        console.log(`🔧 ${enrollmentNo}: ${resultRecord.studentName}`);
                        console.log(`   Updated internal marks in ${subjectsUpdated.length} subjects`);
                        subjectsUpdated.forEach(subject => {
                            const excelData = subjects.get(subject.subjectCode);
                            console.log(`   - ${subject.subjectCode}: → ${excelData.internalMarks}`);
                        });
                        updatedCount++;
                    } else {
                        console.log(`✅ ${enrollmentNo}: ${resultRecord.studentName} - All marks already current`);
                        skippedCount++;
                    }
                } else {
                    console.log(`⚠️  ${enrollmentNo}: No subjects array found in result`);
                    errorCount++;
                }
            } else {
                const sampleSubject = subjects.values().next().value;
                console.log(`❌ ${enrollmentNo}: ${sampleSubject.studentName} - Not found in results collection`);
                notFoundCount++;
            }
            
            console.log('-'.repeat(40));
        }
        
        // Execute bulk operations if any
        if (bulkOperations.length > 0) {
            console.log(`\n🚀 Executing ${bulkOperations.length} database operations...`);
            const result = await resultsCollection.bulkWrite(bulkOperations);
            console.log('✅ Bulk operations completed successfully');
            console.log(`📊 Modified: ${result.modifiedCount}, Matched: ${result.matchedCount}`);
        }
        
        // Summary
        console.log('\n📊 INTERNAL MARKS UPDATE SUMMARY');
        console.log('='.repeat(50));
        console.log(`📝 Total records in Excel: ${allExcelData.length}`);
        console.log(`🔧 Records updated: ${updatedCount}`);
        console.log(`✅ Records skipped (same): ${skippedCount}`);
        console.log(`❌ Records not found: ${notFoundCount}`);
        console.log(`⚠️  Records with errors: ${errorCount}`);
        console.log(`🚀 Total operations: ${bulkOperations.length}`);
        
        console.log('\n✅ Internal marks update in results completed successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
        console.log('🔌 Database connection closed');
    }
}

updateInternalMarksInResults();