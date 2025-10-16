# PDF Export Script for Student Results

This script generates PDF reports for all student examination results, organized by course and formatted to match the official university results format displayed in the PublicResults frontend.

## Features

- **Course-wise PDFs**: Generates separate PDF files for each course
- **Combined PDF**: Creates a single PDF containing all students from all courses
- **Official Format**: Uses the same layout as the PublicResults page with proper headers, tables, and signatures
- **Professional Styling**: Includes proper page breaks, borders, and formatting for printing
- **Flexible Options**: Command-line options to customize export behavior

## Usage

### Basic Usage

```bash
# Generate all PDFs (separate for each course + combined)
npm run export:pdf

# Or run directly
node scripts/exportPDF.js
```

### Command Line Options

```bash
# Generate only combined PDF with all courses
npm run export:pdf:combined
node scripts/exportPDF.js --combined-only

# Generate only separate PDFs for each course
npm run export:pdf:separate
node scripts/exportPDF.js --separate-only

# Filter by specific course (generate PDF for one course only)
node scripts/exportPDF.js --course=ADFS

# Combine options
node scripts/exportPDF.js --course=DHSE --separate-only
```

## Output

### File Structure
```
server/exports/pdf_reports/
├── ADFS_Results_2024-01-15.pdf
├── DHSE_Results_2024-01-15.pdf
├── DFS_Results_2024-01-15.pdf
├── CCFS_Results_2024-01-15.pdf
└── All_Courses_Results_2024-01-15.pdf
```

### PDF Content

Each PDF contains:

1. **University Header**
   - Acharya Nagarjuna University :: International Students Cell
   - ANU MOOCs - Online Diploma Programs
   - January-2024 Examination Results

2. **Student Information** (for each student)
   - Student Register No
   - Student Name
   - Father Name
   - Course Name

3. **Results Table**
   - Subject Code and Name
   - Credits
   - Grade Points
   - Grade Letter

4. **Grade Point Average (SGPA)**

5. **Note**: Grade Letter explanations

6. **Official Signature**
   - Co-Ordinator, ANU MOOCs

## Requirements

- Node.js
- MongoDB connection
- Puppeteer (automatically installed)

## Dependencies

The script uses:
- `puppeteer`: For PDF generation from HTML
- `mongoose`: For database connectivity
- Built-in Node.js modules: `fs`, `path`

## Error Handling

- Validates MongoDB connection
- Handles missing data gracefully
- Provides detailed console logging
- Creates output directories automatically
- Graceful error handling for PDF generation failures

## Customization

### Modify PDF Layout
Edit the `generateHTMLTemplate()` function to change:
- Header text and styling
- Table structure
- Page margins and breaks
- Color schemes

### Add Filtering
Extend command-line options to filter by:
- Academic year
- Semester
- Date range
- Student enrollment patterns

### Change Output Format
Modify Puppeteer options to:
- Change page size (A4, Letter, etc.)
- Adjust margins
- Include/exclude background colors
- Change PDF metadata

## Troubleshooting

### Common Issues

1. **"No results found"**
   - Check MongoDB connection
   - Verify results exist in database
   - Check course codes in database

2. **"Puppeteer launch failed"**
   - Install Chrome/Chromium browser
   - Check system permissions
   - Try headless mode options

3. **"Permission denied" on file write**
   - Check folder permissions
   - Ensure output directory is writable
   - Run with appropriate user permissions

### Debug Mode

Add console.log statements in the script to debug:
- Database query results
- HTML template generation
- PDF creation process

## Performance Notes

- Large datasets may take several minutes to process
- Each PDF generation launches a browser instance
- Memory usage scales with number of students
- Consider processing in batches for very large datasets

## Integration

This script can be integrated with:
- Cron jobs for scheduled exports
- Admin dashboard for on-demand generation
- Email systems for automatic distribution
- File storage services for archiving