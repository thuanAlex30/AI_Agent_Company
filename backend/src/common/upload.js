const multer = require('multer');

// Upload CSV ≤2MB — dung cho bank statement import (02b)
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /csv$/i.test(file.originalname) || file.mimetype.includes('csv') || file.mimetype.includes('text');
    if (!ok) return cb(new Error('Chi nhan file CSV'));
    cb(null, true);
  },
});

module.exports = { uploadCsv };
