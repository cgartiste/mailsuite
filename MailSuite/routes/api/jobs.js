const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');

router.get('/:id/status', requireAuth, (req, res) => {
  try {
    const job = getDb().prepare('SELECT * FROM dns_jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    
    res.json({
      success: true,
      status: job.status,
      logs: JSON.parse(job.log || '[]'),
      progress: job.progress || 0
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
