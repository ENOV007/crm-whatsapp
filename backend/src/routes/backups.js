const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isAdmin } = require('../middleware/auth');
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { Client: PgClient } = require('pg');

const execAsync = promisify(exec);
const router = express.Router();
const prisma = new PrismaClient();

router.use(auth, isAdmin);

const BACKUP_DIR = '/tmp/crm-backups';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function dumpRow(tableName, cols, row) {
  const values = cols.map(c => {
    const v = row[c];
    if (v === null) return 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return String(v);
    if (v instanceof Date) return `'${v.toISOString()}'`;
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    return `'${String(v).replace(/'/g, "''")}'`;
  });
  return `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${values.join(',')});`;
}

async function dumpDBToFile(filePath) {
  const conn = new PgClient({ connectionString: process.env.DATABASE_URL });
  await conn.connect();
  try {
    const tables = await conn.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    let sql = `-- CRM Database Backup\n-- Date: ${new Date().toISOString()}\n\n`;
    let rowCount = 0;

    for (const { tablename } of tables.rows) {
      try {
        const data = await conn.query(`SELECT * FROM "${tablename}"`);
        if (data.rows.length === 0) {
          sql += `-- Table: ${tablename} (empty)\n\n`;
          continue;
        }
        const cols = Object.keys(data.rows[0]);
        sql += `-- Table: ${tablename} (${data.rows.length} rows)\n`;
        sql += `TRUNCATE TABLE "${tablename}" CASCADE;\n`;
        for (const row of data.rows) {
          sql += dumpRow(tablename, cols, row) + '\n';
        }
        sql += '\n';
        rowCount += data.rows.length;
      } catch (e) {
        sql += `-- Error reading ${tablename}: ${e.message}\n\n`;
      }
    }

    sql += `\n-- Total: ${rowCount} rows across ${tables.rows.length} tables\n`;
    fs.writeFileSync(filePath, sql);
    return { tables: tables.rows.length, rows: rowCount };
  } finally {
    await conn.end();
  }
}

router.get('/logs', async (req, res) => {
  try {
    const { limit = 20, status, type } = req.query;
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    const logs = await prisma.backupLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });
    res.json(logs);
  } catch (error) {
    console.error('Error fetching backup logs:', error);
    res.status(500).json({ error: 'Error al obtener logs de backup.' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [total, successful, failed, lastBackup] = await Promise.all([
      prisma.backupLog.count(),
      prisma.backupLog.count({ where: { status: 'success' } }),
      prisma.backupLog.count({ where: { status: 'error' } }),
      prisma.backupLog.findFirst({
        where: { status: 'success' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, fileName: true, fileSize: true, type: true }
      })
    ]);
    const last7days = await prisma.backupLog.groupBy({
      by: ['status'],
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      _count: { id: true }
    });
    res.json({
      total, successful, failed, lastBackup,
      last7days: last7days.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching backup stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de backup.' });
  }
});

router.get('/drive-files', async (req, res) => {
  try {
    const result = await new Promise((resolve) => {
      exec('rclone ls gdrive:CRM-Backups/ --max-age 30d', { timeout: 15000 }, (err, stdout) => {
        resolve(stdout || '');
      });
    });
    if (!result.trim()) return res.json([]);
    const files = result.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      const size = parseInt(parts[0]);
      const filePath = parts.slice(1).join(' ');
      const fileName = filePath.split('/').pop();
      return { size, path: filePath, name: fileName };
    });
    res.json(files);
  } catch (error) {
    console.error('Error listing drive files:', error.message);
    res.json([]);
  }
});

router.post('/download', async (req, res) => {
  const tmpId = `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpDir = path.join(BACKUP_DIR, tmpId);

  const logEntry = await prisma.backupLog.create({
    data: {
      type: 'manual',
      status: 'running',
      triggeredBy: req.user.name || req.user.email,
      message: 'Generando backup para descarga...'
    }
  });

  const startTime = Date.now();

  try {
    ensureDir(tmpDir);
    ensureDir(path.join(tmpDir, 'db'));
    ensureDir(path.join(tmpDir, 'code'));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupName = `crm-backup-${timestamp}`;

    let dbInfo = { tables: 0, rows: 0 };
    const dbFile = path.join(tmpDir, 'db', 'database.sql');
    try {
      dbInfo = await dumpDBToFile(dbFile);
      console.log(`DB dump: ${dbInfo.tables} tables, ${dbInfo.rows} rows`);
    } catch (dbErr) {
      console.error('DB dump error:', dbErr.message);
      fs.writeFileSync(dbFile, `-- Error: ${dbErr.message}\n`);
    }

    const codeDir = path.join(tmpDir, 'code');
    try {
      const appDir = '/app';
      const copies = ['src', 'scripts', 'prisma', 'package.json', 'Dockerfile', 'entrypoint.sh'];
      for (const item of copies) {
        const src = path.join(appDir, item);
        if (fs.existsSync(src)) {
          const dest = path.join(codeDir, item);
          if (fs.statSync(src).isDirectory()) {
            await execAsync(`cp -r "${src}" "${dest}"`);
          } else {
            fs.copyFileSync(src, dest);
          }
        }
      }
      console.log('Code files copied:', fs.readdirSync(codeDir));
    } catch (codeErr) {
      console.error('Code copy error:', codeErr.message);
      fs.writeFileSync(path.join(codeDir, 'error.txt'), codeErr.message || 'code copy failed');
    }

    const finalArchive = path.join(BACKUP_DIR, `${backupName}.tar.gz`);
    await execAsync(`tar -czf "${finalArchive}" -C "${tmpDir}" db code`);

    const stats = fs.statSync(finalArchive);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    const duration = Math.round((Date.now() - startTime) / 1000);

    await prisma.backupLog.update({
      where: { id: logEntry.id },
      data: {
        status: 'success',
        fileName: `${backupName}.tar.gz`,
        fileSize: `${fileSizeMB} MB`,
        duration,
        message: `Backup: ${dbInfo.tables} tablas, ${dbInfo.rows} filas, ${fileSizeMB} MB`
      }
    });

    res.download(finalArchive, `${backupName}.tar.gz`, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Error al descargar backup.' });
      }
      setTimeout(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
        try { fs.unlinkSync(finalArchive); } catch (e) {}
      }, 60000);
    });
  } catch (error) {
    console.error('Error creating backup:', error);
    await prisma.backupLog.update({
      where: { id: logEntry.id },
      data: { status: 'error', message: error.message || 'Error al generar backup' }
    }).catch(() => {});
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    res.status(500).json({ error: 'Error al crear backup.' });
  }
});

router.post('/trigger-auto', async (req, res) => {
  try {
    const { type = 'auto-db' } = req.body;
    const logEntry = await prisma.backupLog.create({
      data: {
        type,
        status: 'running',
        triggeredBy: 'system',
        message: `Backup automático ${type} en progreso...`
      }
    });

    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (type === 'auto-db') {
      const tmpDir = path.join(BACKUP_DIR, `auto_db_${Date.now()}`);
      ensureDir(tmpDir);
      const dumpFile = path.join(tmpDir, `crm_db_${timestamp}.sql`);

      try {
        const info = await dumpDBToFile(dumpFile);
        console.log(`[backup] DB dump: ${info.tables} tables, ${info.rows} rows`);
        await execAsync(`gzip -9 "${dumpFile}"`);
        const gzFile = `${dumpFile}.gz`;
        console.log(`[backup] Uploading ${gzFile} to Drive...`);
        const { stdout, stderr } = await execAsync(`rclone copy "${gzFile}" "gdrive:CRM-Backups/daily/" --checksum -v`, { timeout: 120000 });
        console.log(`[backup] rclone stdout: ${stdout}`);
        if (stderr) console.log(`[backup] rclone stderr: ${stderr}`);
        const duration = Math.round((Date.now() - startTime) / 1000);
        await prisma.backupLog.update({
          where: { id: logEntry.id },
          data: { status: 'success', fileName: `crm_db_${timestamp}.sql.gz`, duration, message: `DB backup a Drive: ${info.tables} tablas, ${info.rows} filas` }
        });
        res.json({ message: 'Backup DB completado', logId: logEntry.id });
      } catch (error) {
        console.error('[backup] Auto DB backup error:', error.message);
        console.error('[backup] Full error:', error);
        await prisma.backupLog.update({ where: { id: logEntry.id }, data: { status: 'error', message: error.message } });
        res.status(500).json({ error: 'Error en backup DB: ' + error.message });
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
      }
    } else if (type === 'auto-code') {
      const tmpDir = path.join(BACKUP_DIR, `auto_code_${Date.now()}`);
      ensureDir(tmpDir);
      const codeArchive = path.join(tmpDir, `crm_code_${timestamp}.tar.gz`);

      try {
        const appDir = fs.existsSync('/app/src') ? '/app' : path.join(__dirname, '../../..');
        const hasGit = fs.existsSync(path.join(appDir, '.git'));
        console.log(`[backup] appDir: ${appDir}, hasGit: ${hasGit}`);
        const dirs = ['backend/src', 'frontend/src', 'scripts'].filter(d => fs.existsSync(path.join(appDir, d)));
        if (hasGit) {
          await execAsync(`git archive HEAD | gzip > "${codeArchive}"`, { cwd: appDir });
        } else if (dirs.length > 0) {
          await execAsync(`tar -czf "${codeArchive}" -C "${appDir}" ${dirs.join(' ')}`);
        } else {
          await execAsync(`tar -czf "${codeArchive}" -C "${appDir}" .`);
        }
        console.log(`[backup] Uploading ${codeArchive} to Drive...`);
        const { stdout, stderr } = await execAsync(`rclone copy "${codeArchive}" "gdrive:CRM-Backups/weekly/" --checksum -v`, { timeout: 120000 });
        console.log(`[backup] rclone stdout: ${stdout}`);
        if (stderr) console.log(`[backup] rclone stderr: ${stderr}`);
        const duration = Math.round((Date.now() - startTime) / 1000);
        await prisma.backupLog.update({
          where: { id: logEntry.id },
          data: { status: 'success', fileName: `crm_code_${timestamp}.tar.gz`, duration, message: 'Código backup a Drive' }
        });
        res.json({ message: 'Backup código completado', logId: logEntry.id });
      } catch (error) {
        console.error('[backup] Auto code backup error:', error.message);
        console.error('[backup] Full error:', error);
        await prisma.backupLog.update({ where: { id: logEntry.id }, data: { status: 'error', message: error.message } });
        res.status(500).json({ error: 'Error en backup código: ' + error.message });
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
      }
    } else if (type === 'auto-cleanup') {
      try {
        await execAsync('rclone delete gdrive:CRM-Backups/daily/ --max-age 7d --min-age 1d 2>&1 || true');
        await execAsync('rclone delete gdrive:CRM-Backups/weekly/ --max-age 28d --min-age 1d 2>&1 || true');
        const duration = Math.round((Date.now() - startTime) / 1000);
        await prisma.backupLog.update({
          where: { id: logEntry.id },
          data: { status: 'success', duration, message: 'Limpieza completada' }
        });
        res.json({ message: 'Cleanup completado', logId: logEntry.id });
      } catch (error) {
        await prisma.backupLog.update({ where: { id: logEntry.id }, data: { status: 'error', message: error.message } });
        res.status(500).json({ error: 'Error en cleanup.' });
      }
    } else {
      res.status(400).json({ error: `Tipo desconocido: ${type}` });
    }
  } catch (error) {
    console.error('Error in auto backup:', error);
    res.status(500).json({ error: 'Error en backup automático.' });
  }
});

router.get('/available', async (req, res) => {
  try {
    const result = await new Promise((resolve) => {
      exec('rclone ls gdrive:CRM-Backups/daily/ --include "*.dump.gz" --include "*.sql.gz"', { timeout: 15000 }, (err, stdout) => {
        resolve(stdout || '');
      });
    });
    if (!result.trim()) return res.json([]);
    const backups = result.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      const size = parseInt(parts[0]);
      const filePath = parts.slice(1).join(' ');
      const fileName = filePath.split('/').pop();
      const dateMatch = fileName.match(/(\d{8})_(\d{6})/);
      let date = null;
      if (dateMatch) {
        const d = dateMatch[1];
        const t = dateMatch[2];
        date = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)} ${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`;
      }
      return { size, path: filePath, name: fileName, date, isDump: fileName.includes('.dump') };
    });
    backups.sort((a, b) => b.name.localeCompare(a.name));
    res.json(backups);
  } catch (error) {
    console.error('Error listing available backups:', error.message);
    res.json([]);
  }
});

router.post('/restore', async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: 'Se requiere fileName del backup a restaurar.' });

  const tmpDir = path.join(BACKUP_DIR, `restore_${Date.now()}`);
  const logEntry = await prisma.backupLog.create({
    data: {
      type: 'restore',
      status: 'running',
      triggeredBy: req.user.name || req.user.email,
      message: `Restaurando ${fileName}...`
    }
  });

  const startTime = Date.now();

  try {
    ensureDir(tmpDir);
    const localFile = path.join(tmpDir, fileName);
    await execAsync(`rclone copy "gdrive:CRM-Backups/daily/${fileName}" "${tmpDir}/"`);
    if (!fs.existsSync(localFile)) {
      throw new Error('Archivo no encontrado después de descargar');
    }

    let sqlFile = localFile;
    if (fileName.endsWith('.gz')) {
      await execAsync(`gunzip "${localFile}"`);
      sqlFile = localFile.replace('.gz', '');
    }

    const conn = new PgClient({ connectionString: process.env.DATABASE_URL });
    await conn.connect();
    try {
      const sql = fs.readFileSync(sqlFile, 'utf8');
      const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));
      let executed = 0;
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;
        try {
          await conn.query(trimmed);
          executed++;
        } catch (e) {
          if (!e.message.includes('does not exist') && !e.message.includes('already exists')) {
            console.error('Restore statement error:', e.message);
          }
        }
      }
      const duration = Math.round((Date.now() - startTime) / 1000);
      await prisma.backupLog.update({
        where: { id: logEntry.id },
        data: {
          status: 'success',
          fileName,
          fileSize: `${(fs.statSync(localFile).size / 1024 / 1024).toFixed(2)} MB`,
          duration,
          message: `Restore completado: ${executed} sentencias ejecutadas`
        }
      });
      res.json({ message: 'Base de datos restaurada exitosamente.', executed, duration });
    } finally {
      await conn.end();
    }
  } catch (error) {
    console.error('Restore error:', error);
    await prisma.backupLog.update({
      where: { id: logEntry.id },
      data: { status: 'error', message: error.message || 'Error durante restore' }
    });
    res.status(500).json({ error: 'Error al restaurar backup.' });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
});

module.exports = router;
