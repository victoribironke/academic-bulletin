module.exports = {
  apps: [
    {
      name: "academic-bulletin",
      cwd: "/var/www/bulletin/academic-bulletin/.next/standalone",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",

        NEXT_PUBLIC_SITE_URL: "http://bulletin.babcock.edu.ng",
        SUPABASE_URL: "http://bulletin.babcock.edu.ng",
        NEXT_PUBLIC_SUPABASE_URL: "http://bulletin.babcock.edu.ng",
        INTERNAL_SUPABASE_URL: "http://127.0.0.1:3000",

        // === GRACE Vision AI (FastAPI) ===
        GOOGLE_API_KEY: "AIzaSyArvx2hr8wqfLw5-u_KYE9V6C9_MAavZnU",
        GRACE_VISION_SPACE_URL: "http://localhost:7860",

        // === Database (Local PostgreSQL on Host) ===
        POSTGRES_USER: "abrms_user",
        POSTGRES_PASSWORD: "20bulletin_db26#",
        POSTGRES_DB: "abrms_db",
        DATABASE_URL: "postgresql://abrms_user:20bulletin_db26%23@localhost:5432/abrms_db?sslmode=disable",
        DIRECT_URL: "postgresql://abrms_user:20bulletin_db26%23@localhost:5432/abrms_db?sslmode=disable",

        // === Supabase Auth & Storage (Self-Hosted) ===
        JWT_SECRET: "AIzaSyArvx2hr8wqfLw5-u_KYE9V6C9_MAavZnU",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWxvY2FsIiwiaWF0IjoxNzg0NTM4NzU2LCJleHAiOjMyNTAzNjgwMDAwfQ.HkDDHeOvx-wWtEfBsL9IJA1Mk98lRpERiFyAlkxuFD8",
        SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbG9jYWwiLCJpYXQiOjE3ODQ1Mzg3NTYsImV4cCI6MzI1MDM2ODAwMDB9.hJ4gsVKaWPpX2k9BC48n9x28BNYGRzj_EUgojOSF2XU",
      },
    },
  ],
};

