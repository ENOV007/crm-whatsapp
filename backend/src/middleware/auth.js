const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, role: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido.' });
  }
};

const isPastora = (req, res, next) => {
  if (req.user.role !== 'PASTORA') {
    return res.status(403).json({ error: 'Acceso denegado. Solo para pastora.' });
  }
  next();
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acceso denegado. Solo para administradores.' });
  }
  next();
};

const isLeaderOfGroup = async (userId, groupId) => {
  const membership = await prisma.userGroup.findFirst({
    where: { userId, groupId, isLeader: true }
  });
  return !!membership;
};

module.exports = { auth, isPastora, isAdmin, isLeaderOfGroup };
