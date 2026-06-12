# 🚀 CRM con Docker y PostgreSQL

## Opciones de Docker para Windows

### Opción 1: Docker Desktop (Recomendado)
- **Descarga**: https://www.docker.com/products/docker-desktop/
- **Pros**: GUI amigable, fácil de usar, todo incluido
- **Contras**: Usa ~2GB de espacio, consume más recursos
- **Requiere**: Windows 10/11 con WSL2 o Hyper-V

### Opción 2: Podman Desktop (Alternativa más ligera)
- **Descarga**: https://podman-desktop.io/
- **Pros**: Más liviano, no requiere daemon corriendo
- **Contras**: Menos popular, menos documentación
- **Compatible**: Misma sintaxis que Docker

### Opción 3: Docker CLI + WSL2 (Solo comandos)
- **Pros**: Más liviano, sin GUI
- **Contras**: Más complejo de configurar
- **Requiere**: Habilitar WSL2 en Windows

---

## Instalación de Docker Desktop

### Paso 1: Descargar
1. Ve a https://www.docker.com/products/docker-desktop/
2. Haz clic en "Download for Windows"
3. Ejecuta el instalador

### Paso 2: Instalar
1. Sigue el asistente de instalación
2. Acepta los términos
3. Selecciona "Use WSL 2 instead of Hyper-V" (recomendado)
4. Completa la instalación

### Paso 3: Configurar
1. Abre Docker Desktop
2. Ve a Settings > General
3. Marca "Start Docker Desktop when you sign in to Windows"
4. Ve a Settings > Resources > WSL Integration
5. Habilita tu distribución de WSL

### Paso 4: Verificar
```powershell
docker --version
docker-compose --version
```

---

## Inicio Rápido

### Paso 1: Abrir PowerShell
```powershell
cd C:\Users\Note\proyecto-crm
```

### Paso 2: Ejecutar
```powershell
.\iniciar.bat
```

### Paso 3: Esperar
- Primera vez: 3-5 minutos (descarga imágenes)
- Times posteriores: 30 segundos

### Paso 4: Abrir navegador
```
http://localhost:3000
```

---

## Credenciales de Prueba

| Usuario | Email | Contraseña | Rol |
|---------|-------|------------|-----|
| Pastora María | pastora@crm.com | pastora123 | PASTORA |
| Juan | juan@crm.com | member123 | MEMBER |

---

## Comandos Útiles

### Ver estado
```powershell
docker-compose ps
```

### Ver logs
```powershell
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f db
```

### Detener
```powershell
docker-compose down
```

### Eliminar todo (incluyendo datos)
```powershell
docker-compose down -v
```

### Reiniciar
```powershell
docker-compose restart
```

### Acceder a PostgreSQL
```powershell
docker-compose exec db psql -U crm_user -d crm_database
```

---

## Solución de Problemas

### "Docker no está instalado"
1. Descargar Docker Desktop
2. Instalar y reiniciar la PC
3. Asegurarse de que Docker Desktop esté ejecutándose

### "Puerto 5432 ya en uso"
```powershell
# Detener cualquier otro PostgreSQL
# O cambiar el puerto en docker-compose.yml:
ports:
  - "5433:5432"
```

### "No se puede conectar a la base de datos"
```powershell
# Verificar que PostgreSQL esté corriendo
docker-compose ps

# Ver logs
docker-compose logs db
```

### "Docker no arranca"
1. Verificar que WSL2 esté habilitado
2. Ejecutar: `wsl --install`
3. Reiniciar la PC
4. Intentar de nuevo

### "Imágenes no se descargan"
1. Verificar conexión a internet
2. Verificar configuración de proxy
3. Intentar con VPN si es necesario

---

## Estructura del Proyecto

```
proyecto-crm/
├── docker-compose.yml      # Configuración de contenedores
├── iniciar.bat             # Iniciar todo
├── detener.bat             # Detener todo
├── backend/
│   ├── Dockerfile
│   ├── .env                # Variables de entorno
│   └── src/
│       ├── prisma/
│       │   └── schema.prisma  # Modelo de BD
│       └── routes/         # API endpoints
├── frontend/
│   ├── Dockerfile
│   └── src/
│       ├── pages/          # Páginas web
│       └── services/       # Llamadas API
└── GUIA-LOCAL.md           # Esta guía
```

---

## ¿Qué es Docker?

Docker crea **contenedores** aislados que:
- ✅ **No afectan tu sistema** - todo está contenido
- ✅ **Son portátiles** - funcionan en cualquier PC
- ✅ **Son fáciles de eliminar** - `docker-compose down -v`
- ✅ **Incluyen todo** - base de datos, backend, frontend

### Analogía simple:
- **Docker** = una máquina virtual ligera
- **Contenedor** = una aplicación aislada dentro de Docker
- **Imagen** = el plano para crear un contenedor
- **Volume** = almacenamiento persistente (los datos se guardan)

---

## Próximos Pasos

1. ✅ Instalar Docker Desktop
2. ✅ Ejecutar `.\iniciar.bat`
3. ✅ Probar la aplicación en `http://localhost:3000`
4. 🔜 Configurar WhatsApp Business API
5. 🔜 Deploy a producción (Vercel/Railway)
