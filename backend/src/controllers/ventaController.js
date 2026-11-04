const { pool } = require('../config/db');
const Venta = require('../models/venta');
const ventaService = require('../services/ventaService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parsePagination } = require('../utils/pagination');

exports.metodosPago = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT id, nombre FROM metodos_pago ORDER BY id');
  res.json(rows);
});

exports.list = asyncHandler(async (req, res) => {
  const pg = parsePagination(req.valid.query, 15);
  const own = req.user.rol === 'administrador' ? null : req.user.id; // el vendedor ve solo sus ventas
  const { rows, total, monto } = await Venta.list(req.valid.query, pg, own);
  res.json({ data: rows, meta: { total, page: pg.page, limit: pg.limit, pages: Math.max(1, Math.ceil(total / pg.limit)), monto } });
});

exports.get = asyncHandler(async (req, res) => {
  const v = await ventaService.findById(pool, req.params.id);
  if (!v) throw new AppError(404, 'Venta no encontrada.');
  if (req.user.rol !== 'administrador' && v.usuario_id !== req.user.id) throw new AppError(403, 'No puedes ver ventas de otros usuarios.');
  res.json(v);
});

exports.create = asyncHandler(async (req, res) => res.status(201).json(await ventaService.crear(req.user, req.body)));
exports.anular = asyncHandler(async (req, res) => res.json(await ventaService.anular(req.user, req.params.id)));
