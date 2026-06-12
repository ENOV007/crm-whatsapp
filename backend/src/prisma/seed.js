const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  console.log('🗑️  Clearing existing data...');
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Database cleared');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      name: 'Administrador',
      email: 'admin@crm.com',
      password: adminPassword,
      role: 'ADMIN'
    }
  });
  console.log('✅ Admin created:', admin.name);

  // Create pastora user
  const pastoraPassword = await bcrypt.hash('pastora123', 10);
  const pastora = await prisma.user.create({
    data: {
      name: 'Mónica González',
      email: 'pastora@crm.com',
      password: pastoraPassword,
      phone: '+1234567890',
      role: 'PASTORA'
    }
  });
  console.log('✅ Pastora created:', pastora.name);

  // Create member users
  const memberPassword = await bcrypt.hash('member123', 10);
  const members = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Juan',
        email: 'juan@crm.com',
        password: memberPassword,
        phone: '+1234567891',
        role: 'MEMBER'
      }
    }),
    prisma.user.create({
      data: {
        name: 'Ana',
        email: 'ana@crm.com',
        password: memberPassword,
        phone: '+1234567892',
        role: 'MEMBER'
      }
    }),
    prisma.user.create({
      data: {
        name: 'Carlos',
        email: 'carlos@crm.com',
        password: memberPassword,
        phone: '+1234567893',
        role: 'MEMBER'
      }
    })
  ]);
  console.log('✅ Members created:', members.map(m => m.name).join(', '));

  // Create 8 hardcoded groups
  const groupNames = [
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
  for (const g of groupNames) {
    const group = await prisma.group.create({
      data: {
        name: g.name,
        description: g.description
      }
    });
    groups.push(group);
    console.log('✅ Group created:', group.name);
  }

  // Assign each member to ONE group only (pastora supervises all)
  await prisma.userGroup.create({ data: { userId: members[0].id, groupId: groups[0].id } }); // Juan → Músicos
  await prisma.userGroup.create({ data: { userId: members[1].id, groupId: groups[4].id } }); // Ana → Danza
  await prisma.userGroup.create({ data: { userId: members[2].id, groupId: groups[3].id } }); // Carlos → Jóvenes
  console.log('✅ Group assignments created (1 group per member)');

  // Create sample tickets
  const ticket1 = await prisma.ticket.create({
    data: {
      title: 'Necesitamos un tecladista',
      description: 'El grupo necesita un tecladista para los servicios del domingo.',
      status: 'PENDIENTE_PASTORA',
      groupId: groups[0].id,
      createdById: members[0].id,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });
  console.log('✅ Ticket created:', ticket1.title);

  const ticket2 = await prisma.ticket.create({
    data: {
      title: 'Organizar retiro de jóvenes',
      description: 'Planificar el retiro para el próximo mes.',
      status: 'APROBADO',
      groupId: groups[3].id,
      createdById: members[2].id,
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }
  });
  console.log('✅ Ticket created:', ticket2.title);

  // Create notifications
  await prisma.notification.create({
    data: {
      userId: pastora.id,
      ticketId: ticket1.id,
      message: `Nueva sugerencia en ${groups[0].name}: "${ticket1.title}"`
    }
  });
  console.log('✅ Notification created');

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
