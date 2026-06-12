# CRM - Gestión de Proyectos y WhatsApp

Sistema CRM para gestión de proyectos divididos en grupos, con integración WhatsApp Business API.

## Características

- **Gestión de Grupos**: Crear y administrar grupos de trabajo
- **Sugerencias Anónimas**: Los usuarios pueden hacer sugerencias de forma anónima
- **Aprobación de Pastora**: La pastora aprueba/rechaza sugerencias con plazos
- **Integración WhatsApp**: Notificaciones y creación de tickets por WhatsApp
- **Panel de Control**: Dashboard con estadísticas y tickets pendientes/vencidos

## Stack Tecnológico

- **Backend**: Node.js + Express + Prisma ORM
- **Frontend**: React + Tailwind CSS
- **Base de datos**: PostgreSQL
- **WhatsApp**: WhatsApp Business API (Cloud API)

## Instalación

### Requisitos

- Node.js 18+
- PostgreSQL
- Cuenta de WhatsApp Business API

### Backend

```bash
cd backend
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Generar cliente de Prisma
npm run db:generate

# Ejecutar migraciones
npm run db:migrate

# Sembrar datos de prueba
npm run db:seed

# Iniciar servidor
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Variables de Entorno

### Backend (.env)

```
DATABASE_URL="postgresql://user:password@localhost:5432/crm_database"
JWT_SECRET="tu-secreto-jwt"
WHATSAPP_TOKEN="token-de-whatsapp-business"
WHATSAPP_PHONE_NUMBER_ID="id-del-numero-de-telefono"
WHATSAPP_VERIFY_TOKEN="token-de-verificacion"
PORT=3001
```

## Estructura del Proyecto

```
proyecto-crm/
├── backend/
│   ├── src/
│   │   ├── routes/          # Rutas API
│   │   ├── controllers/     # Lógica de negocio
│   │   ├── services/        # Servicios (WhatsApp)
│   │   ├── middleware/      # Auth, validación
│   │   ├── prisma/          # Schema y migraciones
│   │   └── utils/           # Helpers
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Componentes React
│   │   ├── pages/           # Páginas
│   │   ├── hooks/           # Custom hooks
│   │   ├── services/        # API calls
│   │   └── utils/           # Helpers
│   └── package.json
└── README.md
```

## API Endpoints

### Autenticación
- `POST /api/auth/register` - Registro
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Usuario actual

### Grupos
- `GET /api/groups` - Listar grupos
- `POST /api/groups` - Crear grupo (solo pastora)
- `GET /api/groups/:id` - Detalle grupo
- `POST /api/groups/:id/members` - Agregar miembro

### Tickets
- `POST /api/tickets` - Crear sugerencia (anónima)
- `GET /api/tickets` - Listar tickets
- `GET /api/tickets/pastora` - Tickets para pastora
- `GET /api/tickets/:id` - Detalle ticket
- `PATCH /api/tickets/:id` - Actualizar estado (solo pastora)

### Notificaciones
- `GET /api/notifications` - Listar notificaciones
- `GET /api/notifications/unread-count` - Conteo no leídas
- `PATCH /api/notifications/:id/read` - Marcar como leída
- `PATCH /api/notifications/read-all` - Marcar todas como leídas

## Credenciales de Prueba

### Pastora
- Email: pastora@crm.com
- Contraseña: pastora123

### Miembro
- Email: juan@crm.com
- Contraseña: member123

## WhatsApp Business API

### Configuración

1. Crear cuenta en [Meta Developer](https://developers.facebook.com/)
2. Crear una aplicación con WhatsApp Business API
3. Obtener Phone Number ID y Access Token
4. Configurar webhook con la URL de tu servidor

### Comandos del Bot

- `ayuda` - Ver comandos disponibles
- `mis grupos` - Ver tus grupos
- `tickets [grupo]` - Ver tickets de un grupo

## License

MIT
