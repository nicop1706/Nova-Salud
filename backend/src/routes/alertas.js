const router = require('express').Router();
const { z } = require('../utils/schemas');
const validate = require('../middleware/validate');
const { authenticate, authorize, ADMIN } = require('../middleware/auth');
const Alerta = require('../models/alerta');
const alertService = require('../services/alertService');
const asyncHandler = require('../utils/asyncHandler');

router.use(authenticate);
router.get('/', validate({ query: z.object({
  estado: z.enum(['ACTIVA', 'RESUELTA']).optional(),
  tipo: z.enum(['STOCK_BAJO', 'AGOTADO', 'POR_VENCER', 'VENCIDO']).optional() }) }),
asyncHandler(async (req, res) => res.json(await Alerta.list(req.valid.query))));
router.get('/resumen', asyncHandler(async (_req, res) => res.json(await alertService.resumen())));
router.get('/reposicion', asyncHandler(async (_req, res) => res.json(await Alerta.reposicion())));
router.post('/sincronizar', authorize(ADMIN), asyncHandler(async (_req, res) => {
  const n = await alertService.syncAll();
  res.json({ message: `Alertas recalculadas para ${n} productos.`, resumen: await alertService.resumen() });
}));
module.exports = router;
