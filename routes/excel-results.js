const express = require('express');
const path = require('path');
const { readExcelFile } = require('../lib/excel-reader');
const router = express.Router();

// GET /api/excel-results
router.get('/', async (req, res) => {
    try {
        const excelPath = path.join(__dirname, '..', 'Students Final Reports with Internal Marks.xlsx');
        const results = readExcelFile(excelPath);
        res.json({ results });
    } catch (error) {
        console.error('Error reading Excel results:', error);
        res.status(500).json({ error: 'Failed to fetch results from Excel' });
    }
});

// GET /api/excel-results/:enrollmentNo
router.get('/:enrollmentNo', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;
        const excelPath = path.join(__dirname, '..', 'Students Final Reports with Internal Marks.xlsx');
        const allResults = readExcelFile(excelPath);
        
        const studentResults = allResults.find(r => r.enrollmentNo === enrollmentNo);
        if (!studentResults) {
            return res.status(404).json({ message: 'No results found for this enrollment number' });
        }
        
        res.json({ results: studentResults });
    } catch (error) {
        console.error('Error reading Excel results:', error);
        res.status(500).json({ error: 'Failed to fetch results from Excel' });
    }
});

module.exports = router;