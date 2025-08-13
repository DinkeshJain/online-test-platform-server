# Online Test Platform - Server

Backend server for the Online Test Platform with comprehensive student management, testing, and evaluation features.

## Features

- **Multi-role Authentication**: Admin, Evaluator, and Student roles with JWT-based authentication
- **Student Management**: Bulk upload with comprehensive student data including personal and address information
- **Test Management**: Create and manage tests with automatic activation/deactivation
- **Internal Marks Evaluation**: Evaluator interface for internal marks entry
- **Advanced Reporting**: Comprehensive reports with grading system and Excel export
- **File Upload**: Student photo management with secure file handling
- **Demo/Regular Exam Support**: Separate handling for demo and regular examinations

## Tech Stack

- **Framework**: Node.js with Express 4.x
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **File Processing**: Multer for uploads, XLSX for Excel processing
- **Scheduling**: Node-cron for automated tasks
- **CORS**: Configured for production deployment

## Installation

1. Clone the repository:
```bash
git clone https://github.com/DinkeshJain/online-test-platform-server.git
cd online-test-platform-server
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.sample .env
```

4. Configure environment variables in `.env`:
```
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
PORT=5000
```

5. Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register/admin` - Register admin
- `POST /api/auth/login` - Login (admin/evaluator/student)
- `GET /api/auth/me` - Get current user info

### Student Management
- `POST /api/bulk/students` - Bulk upload students
- `GET /api/bulk/students/all` - Get all students
- `GET /api/bulk/students/template` - Download Excel template
- `GET /api/bulk/students/export` - Export students to Excel

### Test Management
- `GET /api/tests` - Get all tests
- `POST /api/tests` - Create new test
- `PUT /api/tests/:id` - Update test
- `DELETE /api/tests/:id` - Delete test

### Evaluator Functions
- `GET /api/evaluators` - Get all evaluators
- `POST /api/evaluators` - Create evaluator
- `GET /api/evaluators/submissions/:courseId/:subjectCode` - Get submissions for evaluation
- `POST /api/evaluators/internal-marks` - Submit internal marks

### Course Management
- `GET /api/courses` - Get all courses
- `POST /api/courses` - Create course
- `POST /api/courses/:id/subjects` - Add subjects to course

## Database Models

### Student
- Personal information (name, enrollment, batch year)
- Contact details (mobile, email, address)
- Family information (father's name, mother's name)
- Identity information (Aadhar number, caste category)
- Academic information (course, photo)

### Test
- Test metadata (title, subject, course)
- Timing (duration, activation period)
- Configuration (demo/regular, questions)

### InternalMarks
- Student-evaluator-course relationship
- Marks entry with validation
- Timestamp tracking

## Production Deployment

### CORS Configuration
The server is configured to accept requests from:
- `https://anuadmin.bah.in` (Admin frontend)
- `https://anuevaluator.bah.in` (Evaluator frontend)
- `https://anustudent.bah.in` (Student frontend)
- Local development origins

### Environment Setup
1. Set `MONGO_URI` to your production MongoDB connection string
2. Set `JWT_SECRET` to a secure random string
3. Configure `PORT` if needed (default: 5000)

### Server Start
```bash
npm start
```

## Features Implementation

### Bulk Upload Enhancement
- Added 9 new student fields: AadharNo, CasteCategory, FatherName, MotherName, AddressLine1, AddressLine2, City, State, Pincode
- Enhanced Excel template generation
- Improved data validation and error handling

### Grading System
- 10-point grading scale (O/A/B/C/D/E/F/W)
- Grade point calculation based on external marks
- Visual highlighting for failed students in Excel exports
- Minimum external marks requirement (35%) for passing
- **Absence Handling**: Students who don't attempt tests receive 'W' grade with 0 grade points
- Color-coded Excel exports: Red for 'F' (failed), Orange for 'W' (absent)

### Demo/Regular Exam Support
- Separate filtering and display for demo and regular exams
- Different Excel export sheets for each exam type
- Exam type indication in reports: "(Demo)[Subject_Name]"

### Internal Marks Evaluation
- Enhanced error handling and validation
- Database index optimization for performance
- Comprehensive logging for debugging

## Security Features

- JWT-based authentication with role-based access control
- CORS configuration for production domains
- File upload validation and sanitization
- Environment-based configuration management

## Development

### File Structure
```
├── index.js              # Main server file
├── package.json          # Dependencies and scripts
├── middleware/           # Authentication middleware
├── models/              # Database models
├── routes/              # API route handlers
├── uploads/             # File upload directory
├── migrations/          # Database migration scripts
└── scripts/             # Utility scripts
```

### Adding New Features
1. Create model in `models/` if database changes needed
2. Add routes in `routes/` for new endpoints
3. Update middleware if authentication changes needed
4. Test locally before deploying

## Troubleshooting

### CORS Issues
- Ensure production domains are added to CORS origin list
- Check that preflight requests are handled correctly
- Verify Express version compatibility (use 4.x)

### Database Connection
- Verify MONGO_URI format and credentials
- Check network connectivity to MongoDB server
- Review MongoDB logs for connection errors

### File Upload Issues
- Ensure uploads directory exists and has write permissions
- Check file size limits in multer configuration
- Verify supported file types

## Support

For issues and questions, please create an issue in the GitHub repository.

## License

ISC License
