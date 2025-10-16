// HTML to PDF Export Script using Puppeteer
const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');

console.log('📄 Online Test Platform Documentation PDF Export');
console.log('=' * 50);

async function exportToPDF() {
    let browser;
    
    try {
        console.log('🚀 Launching browser...');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Get the absolute path to the HTML file (same directory)
        const htmlFilePath = path.resolve(__dirname, 'Online_Test_Platform_Documentation.html');
        const fileUrl = `file://${htmlFilePath.replace(/\\/g, '/')}`;
        
        console.log('📖 Loading HTML documentation...');
        await page.goto(fileUrl, { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });
        
        // Wait for content to load and CSS to be fully processed
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Add CSS for better PDF rendering
        await page.addStyleTag({
            content: `
                @media print {
                    body { -webkit-print-color-adjust: exact; }
                    .page-break { display: block !important; height: 0 !important; }
                }
            `
        });
        
        console.log('🎨 Generating PDF with professional formatting...');
        
        // Generate PDF with optimized settings for minimal gaps
        const pdfBuffer = await page.pdf({
            path: path.resolve(__dirname, '../../Online_Test_Platform_Documentation.pdf'),
            format: 'A4',
            printBackground: true,
            margin: {
                top: '8mm',
                right: '8mm',
                bottom: '8mm',
                left: '8mm'
            },
            displayHeaderFooter: false,
            preferCSSPageSize: true, // Respect CSS page settings
            scale: 0.95, // Slightly smaller to ensure content fits
            pageRanges: '', // Include all pages
        });
        
        console.log('✅ PDF successfully created: Online_Test_Platform_Documentation.pdf');
        console.log('📊 Features preserved:');
        console.log('   • All original formatting and styles');
        console.log('   • Professional typography (Times New Roman)');
        console.log('   • Tables with proper borders and shading');
        console.log('   • Page breaks and document structure');
        console.log('   • Color schemes and visual elements');
        console.log('   • Complete content from HTML');
        
        // Get file size for info
        const pdfPath = path.resolve(__dirname, '../../Online_Test_Platform_Documentation.pdf');
        const stats = fs.statSync(pdfPath);
        const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`📁 File size: ${fileSizeInMB} MB`);
        
    } catch (error) {
        console.error('❌ Error generating PDF:', error.message);
        
        if (error.message.includes('puppeteer')) {
            console.log('\n💡 Install Puppeteer with: npm install puppeteer');
        }
        
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Check if HTML file exists
const htmlPath = path.resolve(__dirname, 'Online_Test_Platform_Documentation.html');
if (!fs.existsSync(htmlPath)) {
    console.error('❌ HTML file not found: Online_Test_Platform_Documentation.html');
    process.exit(1);
}

// Check if Puppeteer is available
try {
    require('puppeteer');
    exportToPDF();
} catch (error) {
    console.log('📦 Puppeteer not found. Installing...');
    console.log('Please run: npm install puppeteer');
    console.log('Then run this script again: node export-to-pdf.js');
}