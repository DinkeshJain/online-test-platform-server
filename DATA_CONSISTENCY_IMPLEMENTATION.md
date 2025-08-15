# Data Consistency & Cascading Deletes Implementation

## 🎯 Problem Solved

Fixed critical data consistency issues where deleting entities (students, tests, courses, etc.) left orphaned records in the database, causing inconsistent data counts and relationships.

## 🔧 Cascading Delete Implementations

### 1. **Student Deletion** (`/api/bulk/students/:id`)
**File:** `server/routes/bulkUpload.js`

**Cascades:**
- ✅ Submissions (`userId` reference)
- ✅ Internal Marks (`studentId` reference)
- ✅ Student record

**Transaction:** ✅ Atomic operation with rollback support

---

### 2. **Test Deletion** (`/api/tests/:id`)
**File:** `server/routes/tests.js`

**Cascades:**
- ✅ Submissions (`testId` reference)
- ✅ Internal Marks (`testId` reference)
- ✅ Test record

**Transaction:** ✅ Atomic operation with rollback support

---

### 3. **Course Deletion** (`/api/courses/:id`)
**File:** `server/routes/courses.js`

**Cascades:**
- ✅ All Tests in course
- ✅ All Submissions for course tests
- ✅ All Internal Marks for course
- ✅ Students in course (soft delete - deactivated)
- ✅ Course record (soft delete)

**Transaction:** ✅ Atomic operation with rollback support

---

### 4. **Subject Deletion** (`/api/courses/:id/subjects/:subjectId`)
**File:** `server/routes/courses.js`

**Cascades:**
- ✅ All Tests for subject
- ✅ All Submissions for subject tests
- ✅ All Internal Marks for subject
- ✅ Subject record from course

**Transaction:** ✅ Atomic operation with rollback support

---

### 5. **Evaluator Deletion** (`/api/evaluators/:id`)
**File:** `server/routes/evaluators.js`

**Cascades:**
- ✅ Internal Marks created by evaluator (`evaluatorId` reference)
- ✅ Evaluator record

**Transaction:** ✅ Atomic operation with rollback support

---

## 🛠️ Data Cleanup Utilities

### 1. **DataCleanupUtility Class**
**File:** `server/utils/dataCleanup.js`

**Features:**
- 🔍 **findOrphanedRecords()** - Scans for orphaned references
- 🧹 **cleanupOrphanedRecords()** - Removes orphaned data
- 🔧 **performDataConsistencyCheck()** - Full consistency analysis

### 2. **CLI Cleanup Script**
**File:** `server/scripts/cleanup-data.js`

**Usage:**
```bash
# Check for orphaned records only
npm run cleanup:check

# Preview cleanup (dry run)
npm run cleanup:dry

# Execute actual cleanup
npm run cleanup:execute
```

### 3. **Admin API Endpoints**
**File:** `server/routes/maintenance.js`

**Endpoints:**
- `GET /api/maintenance/consistency-report` - Get orphaned records report
- `POST /api/maintenance/cleanup-orphaned` - Cleanup orphaned records
- `POST /api/maintenance/full-consistency-check` - Full consistency check

### 4. **Admin UI Interface**
**File:** `admin/pages/DataMaintenance.jsx`

**Features:**
- 📊 Visual consistency dashboard
- 🔍 Real-time orphaned records detection
- 🧹 One-click cleanup with dry-run preview
- 📈 Detailed cleanup statistics

---

## 🔍 Data Relationships & Dependencies

```
Course
├── Students (soft delete on course deletion)
├── Tests
│   ├── Submissions (deleted when test/student deleted)
│   └── Internal Marks (deleted when test/student/course deleted)
└── Subjects
    └── Tests (deleted when subject deleted)

Student
├── Submissions (deleted when student deleted)
└── Internal Marks (deleted when student deleted)

Evaluator
└── Internal Marks (deleted when evaluator deleted)
```

---

## 🔒 Transaction Safety

All deletion operations use MongoDB transactions to ensure:
- ✅ **Atomicity** - All or nothing execution
- ✅ **Consistency** - Data integrity maintained
- ✅ **Rollback** - Automatic rollback on errors
- ✅ **Logging** - Detailed operation logging

---

## 📋 Orphaned Record Types Detected

1. **Submissions orphaned by deleted students**
2. **Submissions orphaned by deleted tests**
3. **Internal marks orphaned by deleted students**
4. **Internal marks orphaned by deleted tests**
5. **Internal marks orphaned by deleted courses**
6. **Tests orphaned by deleted courses**
7. **Students orphaned by deleted courses**

---

## 🚀 Usage Examples

### Manual Cleanup (CLI)
```bash
# Check what needs cleanup
npm run cleanup:check

# Preview cleanup
npm run cleanup:dry

# Execute cleanup
npm run cleanup:execute
```

### Programmatic Cleanup
```javascript
const DataCleanupUtility = require('./utils/dataCleanup');

// Check for orphaned records
const orphaned = await DataCleanupUtility.findOrphanedRecords();

// Cleanup (dry run)
await DataCleanupUtility.cleanupOrphanedRecords(orphaned, { dryRun: true });

// Actual cleanup
await DataCleanupUtility.cleanupOrphanedRecords(orphaned, { dryRun: false });
```

### Admin API Usage
```javascript
// Check consistency
const report = await api.get('/maintenance/consistency-report');

// Cleanup orphaned records
const result = await api.post('/maintenance/cleanup-orphaned', { dryRun: false });
```

---

## ✅ Benefits

1. **Data Integrity** - No more orphaned records
2. **Accurate Counts** - Consistent statistics in evaluator portal
3. **Clean Database** - Better performance and reliability
4. **Automated Prevention** - New deletions automatically cascade
5. **Manual Cleanup** - Tools to fix existing inconsistencies
6. **Safe Operations** - Transaction-based with rollback support
7. **Admin Visibility** - UI tools for monitoring and maintenance

---

## 🔄 Maintenance Schedule

**Recommended:**
- **Weekly** - Run consistency check
- **Monthly** - Execute cleanup if needed
- **After bulk operations** - Always check consistency
- **Before backups** - Ensure clean data state

**Automation:**
- Consider adding periodic cleanup to cron jobs
- Monitor consistency reports for trends
- Set up alerts for large numbers of orphaned records
