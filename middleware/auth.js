const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Evaluator = require('../models/Evaluator');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Try to find user in Admin collection first
    let user = await Admin.findById(decoded.id).select('-password');
    if (user) {
      req.user = { ...user.toObject(), role: 'admin' };
      req.userType = 'admin';
      return next();
    }
    
    // Try Evaluator collection next
    user = await Evaluator.findById(decoded.id).select('-password').populate('assignedCourses', 'courseCode courseName');
    if (user) {
      req.user = { ...user.toObject(), role: 'evaluator' };
      req.userType = 'evaluator';
      return next();
    }
    
    // If not found in Admin or Evaluator, try Student collection
    user = await Student.findById(decoded.id).select('-password');
    if (user) {
      req.user = { ...user.toObject(), role: 'student' };
      req.userType = 'student';
      return next();
    }
    
    return res.status(401).json({ message: 'Token is not valid' });
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret';
    
    const decoded = jwt.verify(token, jwtSecret);
    
    // Try to find user in Admin collection first
    let user = await Admin.findById(decoded.id).select('-password');
    if (user) {
      req.user = { ...user.toObject(), role: 'admin' };
      req.userType = 'admin';
      return next();
    }
    
    // Try Evaluator collection next
    user = await Evaluator.findById(decoded.id).select('-password').populate('assignedCourses', 'courseCode courseName');
    if (user) {
      req.user = { ...user.toObject(), role: 'evaluator' };
      req.userType = 'evaluator';
      return next();
    }
    
    // If not found in Admin or Evaluator, try Student collection
    user = await Student.findById(decoded.id).select('-password');
    if (user) {
      req.user = { ...user.toObject(), role: 'student' };
      req.userType = 'student';
      return next();
    }
    
    return res.status(401).json({ message: 'Token is not valid' });
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const evaluatorAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.userType !== 'evaluator') {
        return res.status(403).json({ message: 'Access denied. Evaluator role required.' });
      }
      next();
    });
  } catch (error) {
    res.status(401).json({ message: 'Authorization failed' });
  }
};

const adminOrEvaluatorAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.userType !== 'admin' && req.userType !== 'evaluator') {
        return res.status(403).json({ message: 'Access denied. Admin or Evaluator role required.' });
      }
      next();
    });
  } catch (error) {
    res.status(401).json({ message: 'Authorization failed' });
  }
};

module.exports = { auth, adminAuth, evaluatorAuth, adminOrEvaluatorAuth };

