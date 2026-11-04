const router = require('express').Router();
const { z, id, idParams, posInt, money, isoDate, pageQuery } = require('../utils/schemas');
const validate = require('../middleware/validate');
const { authenticate, authorize, ADMIN } = require('../middleware/auth');
const c = require('../controllers/ventaController');

router.use(authenticate);

const createBody = z.object({
  cliente_id: z.preprocess((v) => (v === '' || v === 0 ? null : v), id.nullable().optional()),
  metodo_pago_id: id,
  descuento: money.optional(),
  monto_recibido: money.optional(),
  items: z.array(z.object({ producto_id: id, cantidad: posInt })).min(1, 'Agrega al menos un producto').max(100),
});

router.get('/metodos-pago', c.metodosPago);
router.get('/', validate({ query: z.object({
  search: z.string().max(100).optional(), desde: isoDate.optional(), hasta: isoDate.optional(),
  metodo_pago_id: id.optional(), estado: z.enum(['COMPLETADA', 'ANULADA']).optional(), ...pageQuery }) }), c.list);
router.get('/:id', validate({ params: idParams }), c.get);
router.post('/', validate({ body: createBody }), c.create);
router.post('/:id/anular', authorize(ADMIN), validate({ params: idParams }), c.anular);
module.exports = router;
