const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function safeCreate(model, where, data) {
  try {
    const existing = await model.findFirst({ where });
    if (existing) return existing;
    return await model.create({ data });
  } catch (e) {
    if (e.code === 'P2002') {
      return await model.findFirst({ where });
    }
    throw e;
  }
}

async function main() {
  console.log('🌱 Seeding database (safe mode)...');

  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await safeCreate(prisma.user, { email: 'admin@crm.com' }, {
    name: 'Administrador', email: 'admin@crm.com', password: adminPassword, role: 'ADMIN'
  });
  console.log('✅ Admin:', admin.name);

  const pastoraPassword = await bcrypt.hash('pastora123', 10);
  const pastora = await safeCreate(prisma.user, { email: 'pastora@crm.com' }, {
    name: 'Mónica González', email: 'pastora@crm.com', password: pastoraPassword,
    phone: '+1234567890', role: 'PASTORA'
  });
  console.log('✅ Pastora:', pastora.name);

  const memberPassword = await bcrypt.hash('member123', 10);
  const membersData = [
    { name: 'Juan', email: 'juan@crm.com', phone: '+1234567891' },
    { name: 'Ana', email: 'ana@crm.com', phone: '+1234567892' },
    { name: 'Carlos', email: 'carlos@crm.com', phone: '+1234567893' }
  ];
  const members = [];
  for (const m of membersData) {
    const user = await safeCreate(prisma.user, { email: m.email }, {
      name: m.name, email: m.email, password: memberPassword, phone: m.phone, role: 'MEMBER'
    });
    members.push(user);
  }
  console.log('✅ Members:', members.map(m => m.name).join(', '));

  const groupData = [
    { name: 'Músicos', description: 'Grupo de música y alabanza' },
    { name: 'Multimedia', description: 'Sonido, video y proyección' },
    { name: 'Predicadores', description: 'Equipo de predicación' },
    { name: 'Jóvenes', description: 'Ministerio de jóvenes' },
    { name: 'Danza', description: 'Grupo de danza y adoración' },
    { name: 'Varones', description: 'Grupo de varones' },
    { name: 'Mujeres', description: 'Grupo de mujeres' },
    { name: 'Portería', description: 'Equipo de recepción y seguridad' }
  ];

  const groups = [];
  for (const g of groupData) {
    const group = await safeCreate(prisma.group, { name: g.name }, {
      name: g.name, description: g.description
    });
    groups.push(group);
  }
  console.log('✅ Groups created/found');

  const assignments = [
    { userId: members[0].id, groupId: groups[0].id },
    { userId: members[1].id, groupId: groups[4].id },
    { userId: members[2].id, groupId: groups[3].id }
  ];
  for (const a of assignments) {
    await safeCreate(prisma.userGroup, { userId_groupId: a }, a);
  }
  console.log('✅ Group assignments done');

  console.log('\n🎉 Seed completed!');
  console.log('\n📧 Login credentials:');
  console.log('Admin:    admin@crm.com / admin123');
  console.log('Pastora:  pastora@crm.com / pastora123');
  console.log('Member:   juan@crm.com / member123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
