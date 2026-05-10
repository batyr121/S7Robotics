# S7 Robotics CRM

CRM interface for an educational robotics center.

## Current Build

- Static frontend: `index.html`, `styles.css`, `app.js`
- Clean start: no demo students, payments, mentors, or attendance
- First registered account becomes the admin
- Admin can see all sections
- Mentor can see only assigned groups
- Data currently persists in browser `localStorage`

## Important Production Note

This version is ready as a frontend prototype and can be hosted on GitHub Pages, Netlify, or Vercel.

For a real education center, connect a backend database and server-side authentication before collecting real children, parents, payment, or attendance data. Browser `localStorage` is not a shared database and is not secure for production passwords.

Recommended production stack:

- Frontend hosting: Vercel or Netlify
- Database and auth: Supabase
- Tables: users, students, groups, payments, attendance, feedback, schedule
- Row-level security: admins see all rows, mentors see only their groups

## Local Run

```bash
python3 -m http.server 5174
```

Open:

```text
http://localhost:5174
```

## Deploy Checklist

1. Push this folder to GitHub.
2. Deploy the repo to hosting.
3. Connect the domain in hosting DNS settings.
4. Add a real backend and migrate storage from `localStorage` to the database.
5. Create the first admin account.

