const { pool } = require('../config/db');
module.exports = {
  async list() {
    const [rows] = await pool.query(
      `SELECT c.id, c.nombre, c.descripcion, c.activo, COUNT(p.id) AS productos
         FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id AND p.activo = 1
        GROUP BY c.id ORDER BY c.nombre`);
    return rows;
  },
  async findById(id) { const [r] = await pool.query('SELECT * FROM categorias WHERE id = ?', [id]); return r[0] || null; },
  async create(d) { const [r] = await pool.query('INSERT INTO categorias (nombre, descripcion) VALUES (?,?)', [d.nombre, d.descripcion ?? null]); return r.insertId; },
  async update(id, d) { await pool.query('UPDATE categorias SET nombre=?, descripcion=? WHERE id=?', [d.nombre, d.descripcion ?? null, id]); },
  async remove(id) { await pool.query('DELETE FROM categorias WHERE id = ?', [id]); },
};
