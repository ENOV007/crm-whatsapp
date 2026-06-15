const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isAdmin } = require('../middleware/auth');
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');

const execAsync = promisify(exec);
const router = express.Router();
const prisma = new PrismaClient();

router.use(auth, isAdmin);

const BACKUP_DIR = '/tmp/crm-backups';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
      total,
      successful,
      failed,
      lastBackup,
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

  try {
    ensureDir(tmpDir);
    ensureDir(path.join(tmpDir, 'db'));
    ensureDir(path.join(tmpDir, 'code'));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupName = `crm-backup-${timestamp}`;

    const dbFile = path.join(tmpDir, 'db', 'database.sql');

    try {
      const pgUrl = process.env.DATABASE_URL;
      await execAsync(
        `pg_dump "${pgUrl}" --no-owner --no-privileges --no-acl -f "${dbFile}" 2>&1 || true`
      );
    } catch (pgErr) {
      const errOutput = pgErr.stdout || pgErr.stderr || '';
      if (errOutput.includes('version mismatch')) {
        const conn = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
        await conn.connect();

        const tables = await conn.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        );

        let sql = '-- CRM Database Backup\n';
        sql += `-- Date: ${new Date().toISOString()}\n\n`;

        for (const { tablename } of tables.rows) {
          try {
            const data = await conn.query(`SELECT * FROM "${tablename}"`);
            if (data.rows.length === 0) continue;

            const cols = Object.keys(data.rows[0]);
            sql += `-- Table: ${tablename} (${data.rows.length} rows)\n`;
            sql += `TRUNCATE TABLE "${tablename}" CASCADE;\n`;

            for (const row of data.rows) {
              const values = cols.map(c => {
                const v = row[c];
                if (v === null) return 'NULL';
                if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
                if (typeof v === 'number') return String(v);
                if (v instanceof Date) return `'${v.toISOString()}'`;
                if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
                return `'${String(v).replace(/'/g, "''")}'`;
              });
              sql += `INSERT INTO "${tablename}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${values.join(',')});\n`;
            }
            sql += '\n';
          } catch (e) {
            sql += `-- Error reading ${tablename}: ${e.message}\n\n`;
          }
        }

        await conn.end();
        fs.writeFileSync(dbFile, sql);
      } else {
        throw pgErr;
      }
    }

    const codeArchive = path.join(tmpDir, 'code', 'source.tar.gz');
    try {
      await execAsync(
        `git archive HEAD | tar -x -C "${path.join(tmpDir, 'code')}" 2>&1 || true`,
        { cwd: path.join(__dirname, '../../..') }
      );
      const codeDir = path.join(tmpDir, 'code');
      const codeFiles = fs.readdirSync(codeDir).filter(f => f !== 'source.tar.gz');
      if (codeFiles.length > 0) {
        await execAsync(
          `tar -czf "${codeArchive}" -C "${codeDir}" ${codeFiles.join(' ')}`
        );
        codeFiles.forEach(f => {
          const fp = path.join(codeDir, f);
          if (fs.statSync(fp).isDirectory()) {
            execSync(`rm -rf "${fp}"`);
          } else {
            fs.unlinkSync(fp);
          }
        });
      }
    } catch (gitErr) {
      fs.writeFileSync(path.join(tmpDir, 'code', 'git-error.txt'), gitErr.message || 'git archive failed');
    }

    const finalArchive = path.join(BACKUP_DIR, `${backupName}.tar.gz`);
    await execAsync(
      `tar -czf "${finalArchive}" -C "${tmpDir}" db code`
    );

    const stats = fs.statSync(finalArchive);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    await prisma.backupLog.update({
      where: { id: logEntry.id },
      data: {
        status: 'success',
        fileName: `${backupName}.tar.gz`,
        fileSize: `${fileSizeMB} MB`,
        duration: Math.round((Date.now() - new Date(logEntry.createdAt).getTime()) / 1000),
        message: `Backup generado: ${fileSizeMB} MB`
      }
    });

    res.download(finalArchive, `${backupName}.tar.gz`, async (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Error al descargar backup.' });
      }
      setTimeout(() => {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          fs.unlinkSync(finalArchive);
        } catch (e) { /* cleanup best effort */ }
      }, 60000);
    });
  } catch (error) {
    console.error('Error creating backup:', error);
    await prisma.backupLog.update({
      where: { id: logEntry.id },
      data: {
        status: 'error',
        message: error.message || 'Error al generar backup'
      }
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
    const tmpDir = path.join(BACKUP_DIR, `auto_${Date.now()}`);
    ensureDir(tmpDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (type === 'auto-db') {
      const dumpFile = path.join(tmpDir, `crm_db_${timestamp}.sql`);
      try {
        await execAsync(
          `pg_dump "${process.env.DATABASE_URL}" --no-owner --no-privileges --no-acl -f "${dumpFile}" 2>&1`
        );
      } catch (pgErr) {
        const errOutput = pgErr.stdout || pgErr.stderr || '';
        if (errOutput.includes('version mismatch')) {
          const conn = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
          await conn.connect();
          const tables = await conn.query(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
          );
          let sql = `-- CRM Auto Backup DB: ${new Date().toISOString()}\n\n`;
          for (const { tablename } of tables.rows) {
            try {
              const data = await conn.query(`SELECT * FROM "${tablename}"`);
              if (data.rows.length === 0) continue;
              const cols = Object.keys(data.rows[0]);
              sql += `TRUNCATE TABLE "${tablename}" CASCADE;\n`;
              for (const row of data.rows) {
                const values = cols.map(c => {
                  const v = row[c];
                  if (v === null) return 'NULL';
                  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
                  if (typeof v === 'number') return String(v);
                  if (v instanceof Date) return `'${v.toISOString()}'`;
                  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
                  return `'${String(v).replace(/'/g, "''")}'`;
                });
                sql += `INSERT INTO "${tablename}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${values.join(',')});\n`;
              }
              sql += '\n';
            } catch (e) { sql += `-- Error: ${tablename}: ${e.message}\n\n`; }
          }
          await conn.end();
          fs.writeFileSync(dumpFile, sql);
        } else {
          throw pgErr;
        }
      }

      const gzFile = `${dumpFile}.gz`;
      await execAsync(`gzip -9 "${dumpFile}"`);
      await execAsync(`rclone copy "${gzFile}" "gdrive:CRM-Backups/daily/" --checksum`);
      fs.rmSync(tmpDir, { recursive: true, force: true });

      const duration = Math.round((Date.now() - startTime) / 1000);
      const fileName = `crm_db_${timestamp}.sql.gz`;
      await prisma.backupLog.update({
        where: { id: logEntry.id },
        data: { status: 'success', fileName, duration, message: 'Backup DB subido a Google Drive' }
      });

      res.json({ message: 'Backup DB completado', logId: logEntry.id });
    } else if (type === 'auto-code') {
      const codeArchive = path.join(tmpDir, `crm_code_${timestamp}.tar.gz`);
      await execAsync(
        `git archive HEAD | gzip > "${codeArchive}"`,
        { cwd: path.join(__dirname, '../../..') }
      );
      await execAsync(`rclone copy "${codeArchive}" "gdrive:CRM-Backups/weekly/" --checksum`);
      fs.rmSync(tmpDir, { recursive: true, force: true });

      const duration = Math.round((Date.now() - startTime) / 1000);
      const fileName = `crm_code_${timestamp}.tar.gz`;
      await prisma.backupLog.update({
        where: { id: logEntry.id },
        data: { status: 'success', fileName, duration, message: 'Backup código subido a Google Drive' }
      });

      res.json({ message: 'Backup código completado', logId: logEntry.id });
    } else if (type === 'auto-cleanup') {
      const ret7 = await execAsync('rclone delete gdrive:CRM-Backups/daily/ --max-age 7d 2>&1 || true');
      const ret28 = await execAsync('rclone delete gdrive:CRM-Backups/weekly/ --max-age 28d 2>&1 || true');
      const duration = Math.round((Date.now() - startTime) / 1000);

      await prisma.backupLog.update({
        where: { id: logEntry.id },
        data: { status: 'success', duration, message: 'Limpieza de backups antiguos completada' }
      });

      res.json({ message: 'Cleanup completado', logId: logEntry.id });
    } else {
      res.status(400).json({ error: `Tipo desconocido: ${type}` });
    }
  } catch (error) {
    console.error('Error in auto backup:', error);
    res.status(500).json({ error: 'Error en backup automático.' });
  }
});

module.exports = router;
