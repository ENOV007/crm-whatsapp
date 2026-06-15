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

function dumpRow(cols, row) {
  const values = cols.map(c => {
    const v = row[c];
    if (v === null) return 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return String(v);
    if (v instanceof Date) return `'${v.toISOString()}'`;
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    return `'${String(v).replace(/'/g, "''")}'`;
  });
  return `INSERT INTO "${cols.join('","')}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${values.join(',')});`;
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
          sql += dumpRow(cols, row) + '\n';
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
    const codeArchive = path.join(tmpDir, 'code-archive.tar.gz');
    try {
      const repoRoot = path.join(__dirname, '../../..');
      const hasGit = fs.existsSync(path.join(repoRoot, '.git'));
      if (hasGit) {
        await execAsync(`git archive HEAD | tar -x -C "${codeDir}"`, { cwd: repoRoot });
        const codeFiles = fs.readdirSync(codeDir);
        if (codeFiles.length > 0) {
          await execAsync(`tar -czf "${codeArchive}" -C "${codeDir}" .`);
          fs.rmSync(codeDir, { recursive: true, force: true });
          fs.mkdirSync(codeDir);
        }
      } else {
        const srcDir = path.join(repoRoot, 'src');
        if (fs.existsSync(srcDir)) {
          await execAsync(`cp -r "${srcDir}" "${codeDir}/src"`);
          const pkgFile = path.join(repoRoot, 'package.json');
          if (fs.existsSync(pkgFile)) {
            fs.copyFileSync(pkgFile, path.join(codeDir, 'package.json'));
          }
          await execAsync(`tar -czf "${codeArchive}" -C "${codeDir}" .`);
          fs.rmSync(codeDir, { recursive: true, force: true });
          fs.mkdirSync(codeDir);
        }
      }
    } catch (codeErr) {
      console.error('Code archive error:', codeErr.message);
      fs.writeFileSync(path.join(codeDir, 'error.txt'), codeErr.message || 'code archive failed');
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
        await execAsync(`gzip -9 "${dumpFile}"`);
        const gzFile = `${dumpFile}.gz`;
        await execAsync(`rclone copy "${gzFile}" "gdrive:CRM-Backups/daily/" --checksum`);
        const duration = Math.round((Date.now() - startTime) / 1000);
        await prisma.backupLog.update({
          where: { id: logEntry.id },
          data: { status: 'success', fileName: `crm_db_${timestamp}.sql.gz`, duration, message: `DB backup a Drive: ${info.tables} tablas, ${info.rows} filas` }
        });
        res.json({ message: 'Backup DB completado', logId: logEntry.id });
      } catch (error) {
        console.error('Auto DB backup error:', error);
        await prisma.backupLog.update({ where: { id: logEntry.id }, data: { status: 'error', message: error.message } });
        res.status(500).json({ error: 'Error en backup DB.' });
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
      }
    } else if (type === 'auto-code') {
      const tmpDir = path.join(BACKUP_DIR, `auto_code_${Date.now()}`);
      ensureDir(tmpDir);
      const codeArchive = path.join(tmpDir, `crm_code_${timestamp}.tar.gz`);

      try {
        const repoRoot = path.join(__dirname, '../../..');
        const hasGit = fs.existsSync(path.join(repoRoot, '.git'));
        if (hasGit) {
          await execAsync(`git archive HEAD | gzip > "${codeArchive}"`, { cwd: repoRoot });
        } else {
          await execAsync(`tar -czf "${codeArchive}" -C "${repoRoot}" backend/src frontend/src scripts`);
        }
        await execAsync(`rclone copy "${codeArchive}" "gdrive:CRM-Backups/weekly/" --checksum`);
        const duration = Math.round((Date.now() - startTime) / 1000);
        await prisma.backupLog.update({
          where: { id: logEntry.id },
          data: { status: 'success', fileName: `crm_code_${timestamp}.tar.gz`, duration, message: 'Código backup a Drive' }
        });
        res.json({ message: 'Backup código completado', logId: logEntry.id });
      } catch (error) {
        console.error('Auto code backup error:', error);
        await prisma.backupLog.update({ where: { id: logEntry.id }, data: { status: 'error', message: error.message } });
        res.status(500).json({ error: 'Error en backup código.' });
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

module.exports = router;
