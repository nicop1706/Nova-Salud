const router = require('express').Router();
const { z, id, optText, posInt, nonNegInt, isoDate, pageQuery } = require('../utils/schemas');
const validate = require('../middleware/validate');
const { authenticate, authorize, ADMIN } = require('../middleware/auth');
const c = require('../controllers/inventarioController');

router.use(authenticate);

router.get('/', validate({ query: z.object({
  search: z.string().max(100).optional(), categoria_id: id.optional(),
  estado: z.enum(['bajo', 'agotado', 'reposicion', 'por_vencer', 'vencido', 'ok']).optional(), ...pageQuery }) }), c.existencias);
router.get('/resumen', c.resumen);
router.get('/movimientos', validate({ query: z.object({
  producto_id: id.optional(), tipo: z.enum(['ENTRADA', 'SALIDA']).optional(),
  motivo: z.enum(['COMPRA', 'VENTA', 'AJUSTE', 'MERMA', 'DEVOLUCION', 'VENCIMIENTO', 'INICIAL']).optional(),
  desde: isoDate.optional(), hasta: isoDate.optional(), ...pageQuery }) }), c.movimientos);

router.post('/movimientos', authorize(ADMIN), validate({ body: z.object({
  producto_id: id, tipo: z.enum(['ENTRADA', 'SALIDA']),
  motivo: z.enum(['AJUSTE', 'MERMA', 'DEVOLUCION', 'VENCIMIENTO']),
  cantidad: posInt, observacion: optText(250) }) }), c.registrarMovimiento);

router.post('/ajustar', authorize(ADMIN), validate({ body: z.object({
  producto_id: id, stock_nuevo: nonNegInt, observacion: optText(250) }) }), c.ajustar);

module.exports = router;
