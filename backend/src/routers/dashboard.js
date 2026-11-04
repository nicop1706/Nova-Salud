const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const c = require('../controllers/dashboardController');
router.use(authenticate);
router.get('/', c.get);
module.exports = router;
