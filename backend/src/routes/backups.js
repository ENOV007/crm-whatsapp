const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isAdmin } = require('../middleware/auth');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const prisma = new PrismaClient();

router.use(auth, isAdmin);

const SCRIPTS_DIR = path.join(__dirname, '../../scripts');

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
    const result = await new Promise((resolve, reject) => {
      exec('rclone ls gdrive:CRM-Backups/ --max-age 30d', { timeout: 15000 }, (err, stdout, stderr) => {
        if (err && !stdout) return reject(err);
        resolve(stdout || '');
      });
    });

    if (!result.trim()) {
      return res.json([]);
    }

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

router.post('/trigger', async (req, res) => {
  try {
    const { type = 'manual' } = req.body;
    const scriptName = 'backup-all.sh';
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);

    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: 'Script de backup no encontrado.' });
    }

    const logEntry = await prisma.backupLog.create({
      data: {
        type,
        status: 'running',
        triggeredBy: req.user.name || req.user.email,
        message: 'Backup en progreso...'
      }
    });

    const startTime = Date.now();

    exec(`bash "${scriptPath}"`, {
      timeout: 300000,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
    }, async (error, stdout, stderr) => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      const output = stdout || stderr || '';

      const fileMatch = output.match(/backup.*?(\d{8}_\d{6})/i);
      const fileName = fileMatch ? `crm_db_${fileMatch[1]}.dump.gz` : null;

      const sizeMatch = output.match(/([\d.]+[KMG]?)\s*(?:backup|dump)/i);
      const fileSize = sizeMatch ? sizeMatch[1] : null;

      try {
        await prisma.backupLog.update({
          where: { id: logEntry.id },
          data: {
            status: error ? 'error' : 'success',
            fileName,
            fileSize,
            duration,
            message: error ? (stderr || error.message) : 'Backup completado exitosamente'
          }
        });
      } catch (dbError) {
        console.error('Error updating backup log:', dbError);
      }
    });

    res.json({ message: 'Backup iniciado', logId: logEntry.id });
  } catch (error) {
    console.error('Error triggering backup:', error);
    res.status(500).json({ error: 'Error al iniciar backup.' });
  }
});

module.exports = router;
