const router = require('express').Router();
const { z, id, idParams, posInt, money, optText, optDate, isoDate, pageQuery } = require('../utils/schemas');
const validate = require('../middleware/validate');
const { authenticate, authorize, ADMIN } = require('../middleware/auth');
const c = require('../controllers/compraController');

router.use(authenticate, authorize(ADMIN));
const createBody = z.object({
  proveedor_id: id,
  observacion: optText(250),
  items: z.array(z.object({
    producto_id: id, cantidad: posInt, precio_unitario: money, fecha_vencimiento: optDate,
  })).min(1, 'Agrega al menos un producto').max(200),
});
router.get('/', validate({ query: z.object({
  search: z.string().max(100).optional(), proveedor_id: id.optional(), desde: isoDate.optional(), hasta: isoDate.optional(),
  estado: z.enum(['CONFIRMADA', 'ANULADA']).optional(), ...pageQuery }) }), c.list);
router.get('/:id', validate({ params: idParams }), c.get);
router.post('/', validate({ body: createBody }), c.create);
router.post('/:id/anular', validate({ params: idParams }), c.anular);
module.exports = router;
