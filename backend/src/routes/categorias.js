const router = require('express').Router();
const { z, idParams, optText, reqText } = require('../utils/schemas');
const validate = require('../middleware/validate');
const { authenticate, authorize, ADMIN } = require('../middleware/auth');
const c = require('../controllers/productoController');

router.use(authenticate);
const body = z.object({ nombre: reqText(80, 2), descripcion: optText(200) });
router.get('/', c.catList);
router.post('/', authorize(ADMIN), validate({ body }), c.catCreate);
router.put('/:id', authorize(ADMIN), validate({ params: idParams, body }), c.catUpdate);
router.delete('/:id', authorize(ADMIN), validate({ params: idParams }), c.catRemove);
module.exports = router;
