# Consulta RUI - Plataforma de Consulta Social

Esta es una aplicación web moderna, rápida y profesional para realizar consultas de información del Registro Único de Información (RUI) relacionado con la información social (anteriormente consultado mediante SISBÉN).

## Configuración y Entorno

### Variables de Entorno
Copia el archivo `.env.example` y renómbralo a `.env`. Configura las siguientes variables:
- `RUI_BASE_URL`: URL base del servicio oficial.
- `RUI_MOCK_MODE`: Establecer a `"true"` en entornos de desarrollo donde no se cuenta con autorización oficial para realizar consultas o el servicio no es accesible. En `"false"`, conectará con la API real.

### Comandos
- Instalar dependencias: `npm install`
- Compilar para producción: `npm run build`
- Iniciar el servidor: `npm run start`

## Configuración de DNS y Dominio

La aplicación está preparada para operar en infraestructura de producción y tras dominios personalizados (ej. `consultarui.com`).

### Configuración DNS (Google Public DNS)
Para asegurar que los servidores que ejecutan la aplicación resuelven las peticiones a APIs externas de manera rápida y segura, se recomienda configurar la resolución de nombres del sistema operativo o contenedor usando los DNS de Google:
- **Principal:** `8.8.8.8`
- **Secundario:** `8.8.4.4`

**Nota:** Esta configuración debe realizarse a nivel de sistema operativo (ej. `/etc/resolv.conf` en Linux), infraestructura de Cloud, o en la red local. No es posible ni seguro intentar modificar los servidores DNS desde el código JavaScript/navegador del cliente.

### Dominio Personalizado y HTTPS
1. Accede al panel de administración de tu proveedor de dominios.
2. Crea un registro `A` apuntando a la IP pública de tu servidor o balanceador de carga.
3. Configura el certificado SSL/TLS (puede ser gratuito mediante Let's Encrypt o el proveedor Cloud) para forzar redirecciones `HTTP -> HTTPS`.
4. Garantizar que tanto el subdominio `www` como la raíz dirijan de manera correcta a la aplicación.

## Arquitectura de Seguridad y Privacidad
El frontend jamás se comunica de manera directa con las APIs gubernamentales para prevenir la exposición de cookies y tokens CSRF. Toda consulta pasa a través de la capa de adaptación segura `POST /api/rui/consulta`. Los números de documento son ofuscados de manera predeterminada para maximizar la privacidad.
