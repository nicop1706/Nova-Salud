const { pool } = require('../config/db');
const Compra = require('../models/compra');
const compraService = require('../services/compraService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parsePagination } = require('../utils/pagination');

exports.list = asyncHandler(async (req, res) => {
  const pg = parsePagination(req.valid.query, 15);
  const { rows, total, monto } = await Compra.list(req.valid.query, pg);
  res.json({ data: rows, meta: { total, page: pg.page, limit: pg.limit, pages: Math.max(1, Math.ceil(total / pg.limit)), monto } });
});
exports.get = asyncHandler(async (req, res) => {
  const c = await compraService.findById(pool, req.params.id);
  if (!c) throw new AppError(404, 'Compra no encontrada.');
  res.json(c);
});
exports.create = asyncHandler(async (req, res) => res.status(201).json(await compraService.crear(req.user, req.body)));
exports.anular = asyncHandler(async (req, res) => res.json(await compraService.anular(req.user, req.params.id)));
