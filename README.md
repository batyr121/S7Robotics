# S7 Robotics CRM

CRM interface for an educational robotics center.

## Current Build

- Frontend: `index.html`, `styles.css`, `app.js`
- Backend: `api/index.php`
- Database: SQLite file created automatically in `api/.storage/crm.sqlite`
- Clean start: no demo students, payments, mentors, or attendance
- First registered account becomes the admin
- Admin can see all sections
- Mentor can see only assigned groups
- Public registration closes after the first admin account
- New accounts are created only by an admin inside CRM

## Important Production Note

This version now needs PHP hosting. GitHub Pages can host only static files, so the real backend will not run there.

The PHP backend uses server-side sessions, password hashing, and a shared SQLite database.

Recommended production stack:

- Simple hosting: Nginx/Apache + PHP with PDO SQLite enabled
- Stronger database option: Supabase/Postgres using `supabase/schema.sql`
- Tables: users, students, groups, payments, attendance, feedback, schedule
- Row-level security: admins see all rows, mentors see only their groups

The starter SQL schema is in `supabase/schema.sql`.

## Local Run

Static fallback only:

```bash
python3 -m http.server 5174
```

Open:

```text
http://localhost:5174
```

Backend mode requires PHP:

```bash
php -S localhost:8080
```

Open:

```text
http://localhost:8080
```

## Deploy Checklist

1. Push this folder to GitHub.
2. Upload all files to PHP hosting document root.
3. Make sure PHP has PDO SQLite enabled.
4. Make sure `api/.storage` is writable by PHP.
5. Point `s7robotics.space` DNS to the hosting server.
6. Open the site and create the first admin account.

## Ubuntu VPS Deploy

On Ubuntu 22.04 with root access:

```bash
sudo DOMAIN=s7robotics.space bash deploy/ubuntu-nginx-php.sh
```

The script installs Nginx, PHP-FPM, SQLite support, clones this repo to `/var/www/s7robotics`, and configures the domain.
