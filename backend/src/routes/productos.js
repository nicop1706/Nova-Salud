const router = require('express').Router();
const { z, idParams, optText, reqText, money, nonNegInt, optDate, boolish, id, pageQuery } = require('../utils/schemas');
const validate = require('../middleware/validate');
const { authenticate, authorize, ADMIN } = require('../middleware/auth');
const c = require('../controllers/productoController');

router.use(authenticate);

const productoBody = z.object({
  codigo_barras: reqText(30).regex(/^[A-Za-z0-9\-]+$/, 'Solo letras, números y guiones'),
  nombre: reqText(150, 2),
  categoria_id: id,
  descripcion: optText(300),
  laboratorio: optText(120),
  precio_compra: money,
  precio_venta: money,
  stock: nonNegInt.optional(),            // solo se usa al crear (stock inicial)
  stock_minimo: nonNegInt,
  fecha_vencimiento: optDate,
}).refine((d) => d.precio_venta >= d.precio_compra, {
  message: 'El precio de venta no puede ser menor al precio de compra', path: ['precio_venta'],
});

const listQuery = z.object({
  search: z.string().max(100).optional(),
  categoria_id: id.optional(),
  activo: boolish.optional(),
  estado: z.enum(['bajo', 'agotado', 'reposicion', 'por_vencer', 'vencido', 'ok']).optional(),
  ...pageQuery,
});

router.get('/', validate({ query: listQuery }), c.list);
router.get('/pos', validate({ query: z.object({ q: z.string().max(100).optional() }) }), c.pos);
router.get('/:id', validate({ params: idParams }), c.get);
router.post('/', authorize(ADMIN), validate({ body: productoBody }), c.create);
router.put('/:id', authorize(ADMIN), validate({ params: idParams, body: productoBody }), c.update);
router.delete('/:id', authorize(ADMIN), validate({ params: idParams }), c.setActivo(0));       // desactivar
router.patch('/:id/reactivar', authorize(ADMIN), validate({ params: idParams }), c.setActivo(1));

module.exports = router;
