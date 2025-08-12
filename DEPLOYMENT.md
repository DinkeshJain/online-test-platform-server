# Production Deployment Guide

## Server Setup on nifsserver.bah.in

### 1. Clone the Repository
```bash
git clone https://github.com/DinkeshJain/online-test-platform-server.git
cd online-test-platform-server
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
cp .env.sample .env
nano .env  # or use your preferred editor
```

Configure the following in `.env`:
```
MONGO_URI=your_production_mongodb_connection_string
JWT_SECRET=your_super_secure_jwt_secret_key
PORT=5000
```

### 4. Create Uploads Directory (if needed)
```bash
mkdir -p uploads
chmod 755 uploads
```

### 5. Start the Server
For production, use PM2 or similar process manager:
```bash
# Install PM2 globally
npm install -g pm2

# Start the server
pm2 start index.js --name "online-test-platform"

# Save PM2 configuration
pm2 save

# Setup auto-restart on server reboot
pm2 startup
```

Or for simple start:
```bash
npm start
```

### 6. Verify CORS Configuration
The server is configured to accept requests from:
- https://anuadmin.bah.in
- https://anuevaluator.bah.in
- https://anustudent.bah.in

If you need to add more domains, edit the CORS configuration in `index.js`.

### 7. Database Migration (if updating)
If you're updating from a previous version, run any necessary migrations:
```bash
node fix-internal-marks-indexes.js  # If needed for internal marks issues
```

## Updating the Server

### Pull Latest Changes
```bash
git pull origin main
npm install  # Install any new dependencies
```

### Restart Server
```bash
pm2 restart online-test-platform
# or
npm start
```

## Monitoring

### Check Server Status
```bash
pm2 status
pm2 logs online-test-platform
```

### Check Server Logs
```bash
pm2 logs online-test-platform --lines 100
```

## Troubleshooting

### CORS Issues
- Verify the domain is in the allowed origins list
- Check that the server is running on the correct port
- Ensure SSL certificates are valid for HTTPS domains

### Database Connection
- Verify MongoDB is running and accessible
- Check MONGO_URI format and credentials
- Test connection manually if needed

### File Upload Issues
- Ensure uploads directory exists and has write permissions
- Check available disk space
- Verify file size limits
