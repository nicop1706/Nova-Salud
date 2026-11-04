const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const money = (n) => `S/ ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (v, tipo) => {
  if (v === null || v === undefined) return '';
  if (tipo === 'moneda') return money(v);
  if (tipo === 'porcentaje') return `${Number(v).toFixed(2)}%`;
  if (tipo === 'entero') return String(v);
  if (tipo === 'fechahora') return String(v).slice(0, 16);
  return String(v);
};
const periodo = (rep) => (rep.desde ? `Período: ${rep.desde} al ${rep.hasta}` : 'Situación actual del inventario');

async function toXlsx(rep) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NOVA SALUD';
  wb.created = new Date();
  const ws = wb.addWorksheet(rep.titulo.slice(0, 28).replace(/[\\/?*[\]:]/g, ''));
  const n = rep.columnas.length;

  ws.mergeCells(1, 1, 1, n);
  ws.getCell(1, 1).value = 'NOVA SALUD — Botica';
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FF0B4F9C' } };
  ws.mergeCells(2, 1, 2, n);
  ws.getCell(2, 1).value = rep.titulo;
  ws.getCell(2, 1).font = { bold: true, size: 13 };
  ws.mergeCells(3, 1, 3, n);
  ws.getCell(3, 1).value = `${periodo(rep)}  ·  Generado: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`;
  ws.getCell(3, 1).font = { italic: true, color: { argb: 'FF666666' } };

  const headerRow = ws.getRow(5);
  rep.columnas.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4F9C' } };
    cell.alignment = { horizontal: ['moneda', 'entero', 'porcentaje'].includes(c.tipo) ? 'right' : 'left', vertical: 'middle' };
  });
  headerRow.height = 22;

  rep.filas.forEach((f, r) => {
    const row = ws.getRow(6 + r);
    rep.columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = f[c.key];
      if (c.tipo === 'moneda') { cell.value = Number(v || 0); cell.numFmt = '"S/" #,##0.00'; }
      else if (c.tipo === 'entero') { cell.value = Number(v || 0); cell.numFmt = '#,##0'; }
      else if (c.tipo === 'porcentaje') { cell.value = Number(v || 0) / 100; cell.numFmt = '0.00%'; }
      else cell.value = c.tipo === 'fechahora' ? String(v ?? '').slice(0, 16) : (v ?? '');
    });
    if (r % 2 === 1) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F6FB' } }; });
  });

  let rr = 6 + rep.filas.length + 1;
  for (const [label, val, tipo] of rep.resumen || []) {
    ws.getCell(rr, 1).value = label;
    ws.getCell(rr, 1).font = { bold: true };
    const c = ws.getCell(rr, 2);
    c.value = tipo === 'porcentaje' ? Number(val) / 100 : Number(val);
    c.numFmt = tipo === 'moneda' ? '"S/" #,##0.00' : tipo === 'porcentaje' ? '0.00%' : '#,##0';
    c.font = { bold: true, color: { argb: 'FF0F7B4A' } };
    c.alignment = { horizontal: 'left' };
    rr += 1;
  }

  rep.columnas.forEach((c, i) => {
    const max = Math.max(c.label.length, ...rep.filas.slice(0, 200).map((f) => fmt(f[c.key], c.tipo).length));
    ws.getColumn(i + 1).width = Math.min(45, Math.max(12, max + 3));
  });
  ws.views = [{ state: 'frozen', ySplit: 5 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toPdf(rep, res) {
  const landscape = rep.columnas.length > 6;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true });
  doc.pipe(res);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc.fillColor('#0B4F9C').fontSize(20).font('Helvetica-Bold').text('NOVA SALUD', left, 36);
  doc.fillColor('#0F7B4A').fontSize(9).font('Helvetica').text('Botica · Sistema de gestión de inventario y ventas');
  doc.moveDown(0.6).fillColor('#111').fontSize(14).font('Helvetica-Bold').text(rep.titulo);
  doc.fontSize(9).font('Helvetica').fillColor('#555')
    .text(`${periodo(rep)}   ·   Generado: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`);
  doc.moveDown(0.8);

  // Anchos de columna proporcionales al contenido
  const weights = rep.columnas.map((c) => {
    const max = Math.max(c.label.length, ...rep.filas.slice(0, 100).map((f) => fmt(f[c.key], c.tipo).length));
    return Math.min(34, Math.max(7, max));
  });
  const totalW = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / totalW) * width);
  const rowH = 18;
  const drawHeader = (y) => {
    doc.rect(left, y, width, rowH).fill('#0B4F9C');
    let x = left;
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
    rep.columnas.forEach((c, i) => {
      doc.text(c.label, x + 4, y + 5, { width: widths[i] - 8, align: ['moneda', 'entero', 'porcentaje'].includes(c.tipo) ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    return y + rowH;
  };

  let y = drawHeader(doc.y);
  rep.filas.forEach((f, r) => {
    if (y + rowH > doc.page.height - doc.page.margins.bottom - 20) { doc.addPage(); y = drawHeader(doc.page.margins.top); }
    if (r % 2 === 1) doc.rect(left, y, width, rowH).fill('#F1F6FB');
    let x = left;
    doc.fillColor('#222').font('Helvetica').fontSize(8);
    rep.columnas.forEach((c, i) => {
      doc.text(fmt(f[c.key], c.tipo), x + 4, y + 5, { width: widths[i] - 8, align: ['moneda', 'entero', 'porcentaje'].includes(c.tipo) ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    y += rowH;
  });
  if (!rep.filas.length) doc.fillColor('#777').fontSize(10).text('Sin datos para el período seleccionado.', left, y + 8);

  y += 10;
  if (y + 14 * (rep.resumen || []).length > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top; }
  for (const [label, val, tipo] of rep.resumen || []) {
    doc.fillColor('#0F7B4A').font('Helvetica-Bold').fontSize(10).text(`${label}: ${fmt(val, tipo)}`, left, y);
    y += 14;
  }
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor('#999').font('Helvetica').fontSize(8)
      .text(`Página ${i + 1} de ${range.count}`, left, doc.page.height - 28, { width, align: 'right', lineBreak: false });
  }
  doc.end();
}

module.exports = { toXlsx, toPdf };
