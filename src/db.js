(cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/db.js b/src/db.js
new file mode 100644
index 0000000000000000000000000000000000000000..3a034789c02644744fbb78627577f69e6f267485
--- /dev/null
+++ b/src/db.js
@@ -0,0 +1,105 @@
+const path = require('path');
+const sqlite3 = require('sqlite3').verbose();
+
+const dbPath = path.join(__dirname, '..', 'data', 'bike_system.db');
+const db = new sqlite3.Database(dbPath);
+
+function initializeDb() {
+  db.serialize(() => {
+    db.run('PRAGMA foreign_keys = ON');
+
+    db.run(`
+      CREATE TABLE IF NOT EXISTS bikes (
+        id INTEGER PRIMARY KEY AUTOINCREMENT,
+        bike_number TEXT NOT NULL UNIQUE,
+        model_name TEXT NOT NULL,
+        engine_number TEXT,
+        chassis_number TEXT,
+        mfg_date TEXT,
+        color TEXT,
+        status TEXT CHECK(status IN ('Production', 'Testing', 'Completed')) NOT NULL DEFAULT 'Production'
+      )
+    `);
+
+    db.run(`
+      CREATE TABLE IF NOT EXISTS testing (
+        id INTEGER PRIMARY KEY AUTOINCREMENT,
+        bike_id INTEGER NOT NULL,
+        test_type TEXT NOT NULL,
+        test_date TEXT,
+        result TEXT,
+        remarks TEXT,
+        report_file_path TEXT,
+        FOREIGN KEY (bike_id) REFERENCES bikes (id) ON DELETE CASCADE
+      )
+    `);
+
+    db.run(`
+      CREATE TABLE IF NOT EXISTS modifications (
+        id INTEGER PRIMARY KEY AUTOINCREMENT,
+        bike_id INTEGER NOT NULL,
+        part_name TEXT NOT NULL,
+        old_version TEXT,
+        new_version TEXT,
+        reason TEXT,
+        change_date TEXT,
+        FOREIGN KEY (bike_id) REFERENCES bikes (id) ON DELETE CASCADE
+      )
+    `);
+
+    db.run(`
+      CREATE TABLE IF NOT EXISTS documents (
+        id INTEGER PRIMARY KEY AUTOINCREMENT,
+        bike_id INTEGER NOT NULL,
+        document_name TEXT NOT NULL,
+        document_type TEXT,
+        file_path TEXT NOT NULL,
+        uploaded_date TEXT NOT NULL,
+        FOREIGN KEY (bike_id) REFERENCES bikes (id) ON DELETE CASCADE
+      )
+    `);
+  });
+}
+
+function run(query, params = []) {
+  return new Promise((resolve, reject) => {
+    db.run(query, params, function onRun(err) {
+      if (err) {
+        reject(err);
+        return;
+      }
+      resolve({ id: this.lastID, changes: this.changes });
+    });
+  });
+}
+
+function get(query, params = []) {
+  return new Promise((resolve, reject) => {
+    db.get(query, params, (err, row) => {
+      if (err) {
+        reject(err);
+        return;
+      }
+      resolve(row);
+    });
+  });
+}
+
+function all(query, params = []) {
+  return new Promise((resolve, reject) => {
+    db.all(query, params, (err, rows) => {
+      if (err) {
+        reject(err);
+        return;
+      }
+      resolve(rows);
+    });
+  });
+}
+
+module.exports = {
+  initializeDb,
+  run,
+  get,
+  all
+};
 
EOF
)
