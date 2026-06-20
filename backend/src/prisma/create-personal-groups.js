const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createPersonalGroups() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['PASTORA', 'ADMIN'] } },
    select: { id: true, name: true, role: true }
  });

  for (const user of users) {
    const existing = await prisma.userGroup.findFirst({
      where: { userId: user.id, group: { isPersonal: true } }
    });

    if (!existing) {
      await prisma.group.create({
        data: {
          name: `Personal - ${user.name}`,
          description: 'Grupo personal - solo visible para ti',
          isPersonal: true,
          isPrivate: true,
          members: { create: { userId: user.id } }
        }
      });
      console.log(`Created personal group for ${user.name} (${user.role})`);
    } else {
      console.log(`Personal group already exists for ${user.name}`);
    }
  }
}

createPersonalGroups()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
