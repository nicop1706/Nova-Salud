const router = require('express').Router();
const { z, isoDate } = require('../utils/schemas');
const validate = require('../middleware/validate');
const { authenticate, authorize, ADMIN } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const reportService = require('../services/reportService');
const exportService = require('../services/exportService');

router.use(authenticate, authorize(ADMIN));

router.get('/', (_req, res) => res.json(reportService.TIPOS));

router.get('/:tipo', validate({
  params: z.object({ tipo: z.string().max(40) }),
  query: z.object({ desde: isoDate.optional(), hasta: isoDate.optional(), formato: z.enum(['json', 'xlsx', 'pdf']).optional() }),
}), asyncHandler(async (req, res) => {
  const { desde, hasta, formato = 'json' } = req.valid.query;
  const rep = await reportService.build(req.params.tipo, desde, hasta);
  const base = `reporte-${rep.tipo}${rep.desde ? `-${rep.desde}_${rep.hasta}` : ''}`;
  if (formato === 'xlsx') {
    const buf = await exportService.toXlsx(rep);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    return res.send(buf);
  }
  if (formato === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
    return exportService.toPdf(rep, res);
  }
  res.json(rep);
}));

module.exports = router;
