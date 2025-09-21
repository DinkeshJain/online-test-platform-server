const XLSX = require('xlsx');
const path = require('path');

const readExcelFile = (filePath) => {
    try {
        // Read the Excel file
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        // Process and format the data
        return data.map(row => ({
            enrollmentNo: row['Enrollment No'] || row['Roll Number'] || '',
            studentName: row['Student Name'] || '',
            fatherName: row['Father Name'] || '',
            course: row['Course'] || '',
            subjects: Object.keys(row)
                .filter(key => key.includes('Grade') || key.includes('Points'))
                .reduce((acc, key) => {
                    const baseKey = key.replace(' Grade', '').replace(' Points', '');
                    if (!acc.find(s => s.subjectCode === baseKey)) {
                        acc.push({
                            subjectCode: baseKey,
                            subjectName: row[baseKey] || '',
                            credits: row[baseKey + ' Credits'] || 3,
                            gradePoints: row[baseKey + ' Points'] || '-',
                            grade: row[baseKey + ' Grade'] || '-'
                        });
                    }
                    return acc;
                }, []),
            sgpa: row['SGPA'] || '-'
        }));
    } catch (error) {
        console.error('Error reading Excel file:', error);
        throw error;
    }
};

module.exports = {
    readExcelFile
};