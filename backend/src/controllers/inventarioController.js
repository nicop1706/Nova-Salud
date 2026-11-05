const Producto = require('../models/producto');
const Movimiento = require('../models/movimiento');
const { pool, withTransaction } = require('../config/db');
const { applyMovement, setStock } = require('../services/inventoryService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { parsePagination, pageResult } = require('../utils/pagination');

exports.existencias = asyncHandler(async (req, res) => {
  const q = { ...req.valid.query, activo: 1 };
  const pg = parsePagination(q, 15);
  const { rows, total } = await Producto.list(q, pg);
  res.json(pageResult(rows, total, pg));
});

exports.resumen = asyncHandler(async (_req, res) => {
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS productos, COALESCE(SUM(stock),0) AS unidades,
            COALESCE(SUM(stock * precio_compra),0) AS valor_costo, COALESCE(SUM(stock * precio_venta),0) AS valor_venta,
            SUM(stock > 0 AND stock <= stock_minimo) AS bajo, SUM(stock = 0) AS agotados,
            SUM(fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURDATE()) AS vencidos
       FROM productos WHERE activo = 1`);
  res.json({ ...r, bajo: Number(r.bajo || 0), agotados: Number(r.agotados || 0), vencidos: Number(r.vencidos || 0) });
});

exports.movimientos = asyncHandler(async (req, res) => {
  const pg = parsePagination(req.valid.query, 20);
  const { rows, total } = await Movimiento.list(req.valid.query, pg);
  res.json(pageResult(rows, total, pg));
});

const MOTIVOS = { ENTRADA: ['AJUSTE', 'DEVOLUCION'], SALIDA: ['AJUSTE', 'MERMA', 'VENCIMIENTO'] };

exports.registrarMovimiento = asyncHandler(async (req, res) => {
  const { producto_id, tipo, motivo, cantidad, observacion } = req.body;
  if (!MOTIVOS[tipo].includes(motivo)) {
    throw new AppError(400, `Motivo "${motivo}" no válido para una ${tipo.toLowerCase()}. Permitidos: ${MOTIVOS[tipo].join(', ')}.`);
  }
  const r = await withTransaction((conn) => applyMovement(conn, {
    productoId: producto_id, tipo, motivo, cantidad, observacion, usuarioId: req.user.id }));
  res.status(201).json({ ...r, producto: await Producto.findById(producto_id) });
});

exports.ajustar = asyncHandler(async (req, res) => {
  const { producto_id, stock_nuevo, observacion } = req.body;
  const r = await withTransaction((conn) => setStock(conn, {
    productoId: producto_id, stockNuevo: stock_nuevo, observacion, usuarioId: req.user.id }));
  res.status(201).json({ ...r, producto: await Producto.findById(producto_id) });
});
