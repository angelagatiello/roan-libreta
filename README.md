# ROAN · Libreta de socios

Libreta compartida de Angel y Rodrigo (gastos, cobros, clientes, tareas, ideas, emprendimientos, notas de voz).
Los datos viven en **Supabase** y se sincronizan en tiempo real entre los dos socios.

- **Web / PWA:** `www/` se publica en GitHub Pages y se puede instalar desde el navegador.
- **APK Android:** se compila con GitHub Actions (Capacitor) y queda en *Releases → APK Android*.
- **Acceso:** solo entran los mails cargados en la tabla `allowed_emails` de Supabase (reglas RLS).

La clave que aparece en `www/cloud.js` es la clave pública (publishable) de Supabase. No es un secreto: la seguridad la dan las reglas de acceso por fila de la base de datos.

## Cómo actualizar
Cambiá archivos en `www/` y hacé commit en `main`: se republican la web y el APK solos.

## Sumar o sacar un socio
En Supabase → SQL Editor: `insert into public.allowed_emails (email) values ('nuevo@mail.com');` o `delete from public.allowed_emails where email = '...';`
