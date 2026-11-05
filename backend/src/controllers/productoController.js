const Producto = require('../models/producto');
const Categoria = require('../models/categoria');
const { withTransaction, pool } = require('../config/db');
const { applyMovement } = require('../services/inventoryService');
const { syncProduct } = require('../services/alertService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, pageResult } = require('../utils/pagination');

exports.list = asyncHandler(async (req, res) => {
  const q = req.valid.query;
  const pg = parsePagination(q, 15);
  const { rows, total } = await Producto.list(q, pg);
  res.json(pageResult(rows, total, pg));
});

exports.pos = asyncHandler(async (req, res) => {
  const term = (req.valid.query.q || '').trim();
  res.json(term ? await Producto.searchForPos(term) : []);
});

exports.get = asyncHandler(async (req, res) => {
  const p = await Producto.findById(req.params.id);
  if (!p) throw new AppError(404, 'Producto no encontrado.');
  res.json(p);
});

exports.create = asyncHandler(async (req, res) => {
  const d = req.body;
  const id = await withTransaction(async (conn) => {
    const newId = await Producto.create({ ...d, stock: 0 }, conn);
    if (d.stock > 0) {
      await applyMovement(conn, {
        productoId: newId, tipo: 'ENTRADA', motivo: 'INICIAL', cantidad: d.stock,
        observacion: 'Stock inicial al registrar el producto', usuarioId: req.user.id,
      });
    } else {
      await syncProduct(conn, newId);
    }
    return newId;
  });
  res.status(201).json(await Producto.findById(id));
});

exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!(await Producto.findById(id))) throw new AppError(404, 'Producto no encontrado.');
  await withTransaction(async (conn) => {
    await Producto.update(id, req.body, conn);
    await syncProduct(conn, id); // cambió stock mínimo / vencimiento => recalcular alertas
  });
  res.json(await Producto.findById(id));
});

exports.setActivo = (activo) => asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!(await Producto.findById(id))) throw new AppError(404, 'Producto no encontrado.');
  await withTransaction(async (conn) => {
    await Producto.setActivo(id, activo, conn);
    await syncProduct(conn, id);
  });
  res.json(await Producto.findById(id));
});

// ---- Categorías ----
exports.catList = asyncHandler(async (_req, res) => res.json(await Categoria.list()));
exports.catCreate = asyncHandler(async (req, res) => res.status(201).json(await Categoria.findById(await Categoria.create(req.body))));
exports.catUpdate = asyncHandler(async (req, res) => {
  if (!(await Categoria.findById(req.params.id))) throw new AppError(404, 'Categoría no encontrada.');
  await Categoria.update(req.params.id, req.body);
  res.json(await Categoria.findById(req.params.id));
});
exports.catRemove = asyncHandler(async (req, res) => {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM productos WHERE categoria_id = ?', [req.params.id]);
  if (n > 0) throw new AppError(409, `No se puede eliminar: ${n} producto(s) usan esta categoría.`);
  await Categoria.remove(req.params.id);
  res.json({ message: 'Categoría eliminada.' });
});
