# CRM + WhatsApp (WPPConnect Server)

CRM con integración WhatsApp usando WPPConnect Server (open source).

## Requisitos
- Docker Desktop corriendo
- Node.js 18+
- Un número de WhatsApp dedicado (no usar tu número personal)

## Setup Rápido

### 1. Configurar WPPConnect
```bash
# Ejecutar setup (genera token)
.\setup-whatsapp.bat
```

Copia el token generado en `backend\.env` como `WPPCONNECT_TOKEN`.

### 2. Iniciar todo
```bash
.\iniciar.bat
```

### 3. Conectar WhatsApp
1. Abrí `http://localhost:3001/api/whatsapp/qr`
2. Escaneá el QR con tu WhatsApp
3. ¡Listo! El bot está conectado

## URLs
- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- WPPConnect API: http://localhost:21465
- WPPConnect Swagger: http://localhost:21465/api-docs
- WhatsApp QR: http://localhost:3001/api/whatsapp/qr

## Configurar Grupos de WhatsApp

Para vincular un grupo del CRM con un grupo de WhatsApp:

1. Creá el grupo en WhatsApp (o usá uno existente)
2. Copiá el ID del grupo de WhatsApp (desde la API o群 info)
3. Actualizá el grupo en el admin panel con el `whatsappGroupId`

O vía API:
```bash
curl -X PATCH http://localhost:3001/api/admin/groups/GROUP_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"whatsappGroupId": "120363XXX@g.us"}'
```

## API de WhatsApp

### Enviar mensaje personal
```bash
curl -X POST http://localhost:3001/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"phone": "541130901676", "message": "Hola!"}'
```

### Enviar a grupo
```bash
curl -X POST http://localhost:3001/api/whatsapp/send-group \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"groupId": "120363XXX@g.us", "message": "Mensaje al grupo"}'
```

### Verificar estado
```bash
curl http://localhost:3001/api/whatsapp/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Notas Importantes

### Riesgo de Ban
- **Usar número dedicado** — No tu número personal
- **Limitar mensajes** — 50-100/día inicialmente
- **Patrones humanos** — Variar horarios, no enviar en ráfagas
- **Monitorear** — Si WhatsApp pide re-verificación, reducir actividad

### Variables de Entorno
```env
WPPCONNECT_URL=http://whatsapp:21465
WPPCONNECT_SESSION=crm-session
WPPCONNECT_TOKEN=tu-token-aqui
WPPCONNECT_SECRET=tu-secret-key
FRONTEND_URL=http://localhost:3000
```

## Arquitectura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend  │────▶│   Backend    │────▶│  WPPConnect     │
│  (React)    │     │  (Node.js)   │     │  Server (Docker)│
└─────────────┘     └──────────────┘     └─────────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐        ┌──────────────┐
                    │  PostgreSQL  │        │  WhatsApp    │
                    │  (Docker)    │        │  (Web)       │
                    └──────────────┘        └──────────────┘
```

## Credenciales de Prueba
- Admin: admin@crm.com / admin123
- Pastora: pastora@crm.com / pastora123
- Miembro: juan@crm.com / member123
