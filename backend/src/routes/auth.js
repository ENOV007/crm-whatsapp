const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get available groups for registration (public)
router.get('/groups', async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' }
    });
    res.json(groups);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener grupos.' });
  }
});

// Register — always creates MEMBER, role cannot be self-assigned
router.post('/register', async (req, res) => {
  try {
    const { name, apellido, password, phone, groupId } = req.body;

    if (!name || !apellido || !password) {
      return res.status(400).json({ error: 'Nombre, apellido y contraseña son requeridos.' });
    }

    if (name.length < 3 || apellido.length < 3) {
      return res.status(400).json({ error: 'Nombre y apellido deben tener al menos 3 caracteres.' });
    }

    // Generate email: 3 letters name + 3 letters apellido + @crm.com
    const baseEmail = (name.substring(0, 3) + apellido.substring(0, 3)).toLowerCase() + '@crm.com';
    let email = baseEmail;
    let counter = 2;

    // Check if email exists, add number if needed
    while (await prisma.user.findUnique({ where: { email } })) {
      email = baseEmail.replace('@crm.com', `${counter}@crm.com`);
      counter++;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      name: `${name} ${apellido}`,
      email,
      password: hashedPassword,
      phone,
      role: 'MEMBER'
    };

    if (groupId) {
      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (group) {
        userData.groups = {
          create: { groupId }
        };
      }
    }

    const user = await prisma.user.create({
      data: userData,
      select: { id: true, name: true, email: true, role: true }
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ user, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar usuario.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    if (user.mustChangePassword) {
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: true
        },
        token
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: false
      },
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        mustChangePassword: true,
        groups: {
          select: {
            group: {
              select: { id: true, name: true, description: true }
            }
          }
        }
      }
    });

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener usuario.' });
  }
});

// Change password (for users with mustChangePassword)
router.post('/change-password', auth, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false
      }
    });

    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cambiar contraseña.' });
  }
});

module.exports = router;
