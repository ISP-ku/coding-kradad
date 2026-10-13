# Next.js frontend

See [KU_LOGIN_SETUP.md](../KU_LOGIN_SETUP.md) for the complete KU Google login setup.

Use Node 24, run npm ci, copy .env.local.example to .env.local and run npm run dev.
The FastAPI backend must also be running on http://localhost:8000.
Open http://localhost:3000. Keep UI_PREVIEW=0 for real @ku.th sign-in.

npm test runs frontend tests. npm run build checks the production build.
