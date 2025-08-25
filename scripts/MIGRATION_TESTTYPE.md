# Migration: Add testType to Submissions

## Overview
This migration script adds the `testType` field to submissions that don't have it by copying the value from their associated test records.

## Background
The `testType` field was added to the Submission schema to improve data consistency and query performance. Existing submissions may not have this field populated, so this migration ensures all submissions have the correct `testType` value.

## What it does
1. **Finds submissions without testType**: Identifies submissions where `testType` is missing, null, or empty
2. **Fetches test data**: Retrieves the `testType` from the associated Test record
3. **Updates submissions**: Copies the `testType` from the test to the submission
4. **Provides detailed reporting**: Shows what will be changed and verifies results

## Usage

### Preview Changes (Dry Run)
```bash
# Using npm script (recommended)
npm run migration:testtype:dry

# Direct execution
node scripts/add-testtype-to-submissions.js --dry-run
```

### Execute Migration
```bash
# Using npm script (recommended)
npm run migration:testtype:execute

# Direct execution
node scripts/add-testtype-to-submissions.js --execute
```

## Output Examples

### Dry Run Output
```
🚀 Starting testType migration for submissions...
📋 Mode: DRY RUN (preview only)

🔍 Finding submissions without testType field...
📊 Found 150 submissions without testType

🔍 Fetching test types from associated tests...
📊 Found 25 unique tests to check
📊 Retrieved test types for 25 tests

📊 Summary of testTypes to be assigned:
  - official: 120 submissions
  - demo: 20 submissions
  - practice: 10 submissions

📋 Preview of changes:
  - Submission 60f... (STU001, CS101) -> testType: official
  - Submission 60f... (STU002, CS101) -> testType: official
  ... and 148 more

🎉 Migration completed successfully!

🔄 To execute the migration, run:
node add-testtype-to-submissions.js --execute
```

### Execute Output
```
🚀 Starting testType migration for submissions...
📋 Mode: EXECUTE (will modify data)

🔍 Finding submissions without testType field...
📊 Found 150 submissions without testType

🔄 Updating 150 submissions...
✅ Updated 150 submissions

🔍 Verifying updates...
📊 Final status:
  - Total submissions: 1500
  - Submissions with testType: 1500
  - Submissions without testType: 0

✅ All submissions now have testType field!

🎉 Migration completed successfully!
```

## Safety Features

### 1. **Dry Run Mode**
- Always run with `--dry-run` first to preview changes
- No data is modified in dry run mode
- Shows exactly what will be updated

### 2. **Validation**
- Checks that referenced tests exist
- Reports orphaned submissions (submissions referencing non-existent tests)
- Verifies updates after execution

### 3. **Detailed Logging**
- Shows progress at each step
- Provides summaries of changes
- Logs any issues encountered

### 4. **Bulk Operations**
- Uses MongoDB bulk operations for efficiency
- Atomic updates to prevent partial failures

## Possible Issues

### Orphaned Submissions
If some submissions reference tests that no longer exist, they will be reported but not updated:
```
⚠️  Warning: 5 submissions have testIds that don't exist in tests collection
    - Submission 60f... references non-existent test 60e...
```

These submissions may need manual cleanup or different handling.

### Schema Validation
The migration respects the schema constraints:
- Only valid testType values: 'demo', 'official', 'practice'
- Maintains all existing submission data

## Rollback
If needed, you can remove the testType field from all submissions:
```javascript
// Connect to MongoDB and run:
db.submissions.updateMany(
  {},
  { $unset: { testType: "" } }
);
```

## Verification
After running the migration, verify the results:
```javascript
// Count submissions by testType
db.submissions.aggregate([
  { $group: { _id: "$testType", count: { $sum: 1 } } }
]);

// Check for submissions without testType
db.submissions.countDocuments({
  $or: [
    { testType: { $exists: false } },
    { testType: null },
    { testType: "" }
  ]
});
```
