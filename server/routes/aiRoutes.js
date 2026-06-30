const express = require('express');
const jwt = require('jsonwebtoken');
const { generateSummary, analyzeMeetingFull, translateText } = require('../controllers/aiController');
const router = express.Router();

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

router.post('/summary', auth, generateSummary);
router.post('/analyze', auth, analyzeMeetingFull);
router.post('/translate', auth, translateText);

module.exports = router;