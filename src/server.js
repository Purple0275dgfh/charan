(cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/server.js b/src/server.js
new file mode 100644
index 0000000000000000000000000000000000000000..e0c9ebfca673a9946e7aeac1407b1c51e10ff002
--- /dev/null
+++ b/src/server.js
@@ -0,0 +1,263 @@
+const express = require('express');
+const multer = require('multer');
+const path = require('path');
+const fs = require('fs');
+const xlsx = require('xlsx');
+const { initializeDb, run, get, all } = require('./db');
+
+const app = express();
+const port = process.env.PORT || 3000;
+
+const uploadDir = path.join(__dirname, '..', 'uploads');
+if (!fs.existsSync(uploadDir)) {
+  fs.mkdirSync(uploadDir, { recursive: true });
+}
+
+const docStorage = multer.diskStorage({
+  destination: (_req, _file, cb) => cb(null, uploadDir),
+  filename: (_req, file, cb) => {
+    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
+    cb(null, `${Date.now()}-${safeName}`);
+  }
+});
+
+const documentUpload = multer({ storage: docStorage });
+const excelUpload = multer({ storage: multer.memoryStorage() });
+
+initializeDb();
+
+app.use(express.json());
+app.use(express.urlencoded({ extended: true }));
+app.use('/uploads', express.static(uploadDir));
+app.use(express.static(path.join(__dirname, '..', 'public')));
+
+const validStatuses = new Set(['Production', 'Testing', 'Completed']);
+
+function normalizeStatus(status) {
+  if (!status) return 'Production';
+  const trimmed = String(status).trim();
+  const normalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1).toLowerCase()}`;
+  return validStatuses.has(normalized) ? normalized : null;
+}
+
+function normalizeDate(dateValue) {
+  if (!dateValue) return null;
+  if (typeof dateValue === 'number') {
+    const parsed = xlsx.SSF.parse_date_code(dateValue);
+    if (parsed) {
+      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
+    }
+  }
+  return String(dateValue).slice(0, 10);
+}
+
+app.post('/api/bikes', async (req, res) => {
+  try {
+    const { bike_number: bikeNumber, model_name: modelName, engine_number: engineNumber, chassis_number: chassisNumber, mfg_date: mfgDate, color, status } = req.body;
+
+    if (!bikeNumber || !modelName) {
+      res.status(400).json({ error: 'bike_number and model_name are required.' });
+      return;
+    }
+
+    const normalizedStatus = normalizeStatus(status);
+    if (!normalizedStatus) {
+      res.status(400).json({ error: 'Invalid status. Use Production, Testing, or Completed.' });
+      return;
+    }
+
+    const result = await run(
+      `INSERT INTO bikes (bike_number, model_name, engine_number, chassis_number, mfg_date, color, status)
+       VALUES (?, ?, ?, ?, ?, ?, ?)`,
+      [bikeNumber.trim(), modelName.trim(), engineNumber || null, chassisNumber || null, normalizeDate(mfgDate), color || null, normalizedStatus]
+    );
+
+    const insertedBike = await get('SELECT * FROM bikes WHERE id = ?', [result.id]);
+    res.status(201).json({ message: 'Bike created successfully.', bike: insertedBike });
+  } catch (error) {
+    if (error.message.includes('UNIQUE constraint failed')) {
+      res.status(409).json({ error: 'bike_number must be unique.' });
+      return;
+    }
+    res.status(500).json({ error: 'Failed to create bike.', details: error.message });
+  }
+});
+
+app.post('/api/bikes/upload-excel', excelUpload.single('file'), async (req, res) => {
+  try {
+    if (!req.file) {
+      res.status(400).json({ error: 'Excel file is required.' });
+      return;
+    }
+
+    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
+    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
+    const rows = xlsx.utils.sheet_to_json(firstSheet, { defval: '' });
+
+    const report = { inserted: 0, errors: [] };
+
+    for (let i = 0; i < rows.length; i += 1) {
+      const row = rows[i];
+      const line = i + 2;
+
+      const bikeNumber = String(row.bike_number || row.BIKE_NUMBER || '').trim();
+      const modelName = String(row.model_name || row.MODEL_NAME || '').trim();
+      const engineNumber = String(row.engine_number || row.ENGINE_NUMBER || '').trim();
+      const chassisNumber = String(row.chassis_number || row.CHASSIS_NUMBER || '').trim();
+      const mfgDate = normalizeDate(row.mfg_date || row.MFG_DATE || '');
+      const color = String(row.color || row.COLOR || '').trim();
+      const status = normalizeStatus(row.status || row.STATUS || 'Production');
+
+      if (!bikeNumber || !modelName) {
+        report.errors.push({ line, bikeNumber, reason: 'bike_number and model_name are required.' });
+        continue;
+      }
+
+      if (!status) {
+        report.errors.push({ line, bikeNumber, reason: 'Invalid status value.' });
+        continue;
+      }
+
+      try {
+        await run(
+          `INSERT INTO bikes (bike_number, model_name, engine_number, chassis_number, mfg_date, color, status)
+           VALUES (?, ?, ?, ?, ?, ?, ?)`,
+          [bikeNumber, modelName, engineNumber || null, chassisNumber || null, mfgDate, color || null, status]
+        );
+        report.inserted += 1;
+      } catch (error) {
+        report.errors.push({ line, bikeNumber, reason: error.message });
+      }
+    }
+
+    res.status(200).json({
+      message: 'Excel processing completed.',
+      totalRows: rows.length,
+      insertedRows: report.inserted,
+      failedRows: report.errors.length,
+      errors: report.errors
+    });
+  } catch (error) {
+    res.status(500).json({ error: 'Failed to process Excel file.', details: error.message });
+  }
+});
+
+app.post('/api/testing', async (req, res) => {
+  try {
+    const { bike_id: bikeId, test_type: testType, test_date: testDate, result, remarks, report_file_path: reportFilePath } = req.body;
+    if (!bikeId || !testType) {
+      res.status(400).json({ error: 'bike_id and test_type are required.' });
+      return;
+    }
+
+    const bike = await get('SELECT id FROM bikes WHERE id = ?', [bikeId]);
+    if (!bike) {
+      res.status(404).json({ error: 'Bike not found.' });
+      return;
+    }
+
+    const created = await run(
+      `INSERT INTO testing (bike_id, test_type, test_date, result, remarks, report_file_path)
+       VALUES (?, ?, ?, ?, ?, ?)`,
+      [bikeId, testType, normalizeDate(testDate), result || null, remarks || null, reportFilePath || null]
+    );
+
+    res.status(201).json({ message: 'Testing record added.', id: created.id });
+  } catch (error) {
+    res.status(500).json({ error: 'Failed to add testing record.', details: error.message });
+  }
+});
+
+app.post('/api/modifications', async (req, res) => {
+  try {
+    const { bike_id: bikeId, part_name: partName, old_version: oldVersion, new_version: newVersion, reason, change_date: changeDate } = req.body;
+    if (!bikeId || !partName) {
+      res.status(400).json({ error: 'bike_id and part_name are required.' });
+      return;
+    }
+
+    const bike = await get('SELECT id FROM bikes WHERE id = ?', [bikeId]);
+    if (!bike) {
+      res.status(404).json({ error: 'Bike not found.' });
+      return;
+    }
+
+    const created = await run(
+      `INSERT INTO modifications (bike_id, part_name, old_version, new_version, reason, change_date)
+       VALUES (?, ?, ?, ?, ?, ?)`,
+      [bikeId, partName, oldVersion || null, newVersion || null, reason || null, normalizeDate(changeDate)]
+    );
+
+    res.status(201).json({ message: 'Modification record added.', id: created.id });
+  } catch (error) {
+    res.status(500).json({ error: 'Failed to add modification.', details: error.message });
+  }
+});
+
+app.post('/api/bikes/:bikeId/documents', documentUpload.single('document_file'), async (req, res) => {
+  try {
+    const bikeId = Number(req.params.bikeId);
+    const { document_name: documentName, document_type: documentType } = req.body;
+
+    if (!documentName || !req.file) {
+      res.status(400).json({ error: 'document_name and document_file are required.' });
+      return;
+    }
+
+    const bike = await get('SELECT id FROM bikes WHERE id = ?', [bikeId]);
+    if (!bike) {
+      res.status(404).json({ error: 'Bike not found.' });
+      return;
+    }
+
+    const relativePath = path.join('uploads', req.file.filename);
+    const created = await run(
+      `INSERT INTO documents (bike_id, document_name, document_type, file_path, uploaded_date)
+       VALUES (?, ?, ?, ?, ?)`,
+      [bikeId, documentName, documentType || null, relativePath, new Date().toISOString()]
+    );
+
+    res.status(201).json({
+      message: 'Document uploaded successfully.',
+      documentId: created.id,
+      filePath: `/${relativePath.replace(/\\/g, '/')}`
+    });
+  } catch (error) {
+    res.status(500).json({ error: 'Failed to upload document.', details: error.message });
+  }
+});
+
+app.get('/api/bikes/search', async (req, res) => {
+  try {
+    const bikeNumber = String(req.query.bike_number || '').trim();
+    if (!bikeNumber) {
+      res.status(400).json({ error: 'bike_number query parameter is required.' });
+      return;
+    }
+
+    const bike = await get('SELECT * FROM bikes WHERE bike_number = ?', [bikeNumber]);
+    if (!bike) {
+      res.status(404).json({ error: 'Bike not found.' });
+      return;
+    }
+
+    const [testing, modifications, documents] = await Promise.all([
+      all('SELECT * FROM testing WHERE bike_id = ? ORDER BY id DESC', [bike.id]),
+      all('SELECT * FROM modifications WHERE bike_id = ? ORDER BY id DESC', [bike.id]),
+      all('SELECT * FROM documents WHERE bike_id = ? ORDER BY id DESC', [bike.id])
+    ]);
+
+    res.json({ bike, testing, modifications, documents });
+  } catch (error) {
+    res.status(500).json({ error: 'Search failed.', details: error.message });
+  }
+});
+
+app.get('/api/health', (_req, res) => {
+  res.json({ ok: true });
+});
+
+app.listen(port, () => {
+  // eslint-disable-next-line no-console
+  console.log(`Bike system running on http://localhost:${port}`);
+});
 
EOF
)
