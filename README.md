# Cerebrum

Plataforma web full-stack para organizacao de estudo, gestao de materias, cronograma, estatisticas e assistente inteligente.

## Visao Geral

O Cerebrum junta num unico sistema:

- autenticacao de utilizadores
- painel de utilizador e painel administrativo
- gestao de materias e progresso
- cronograma de estudo
- assistente IA local para apoio ao estudo
- modo de funcionamento local/offline em partes do frontend

O frontend e publicado no Vercel e o backend corre em Node.js, normalmente com base de dados MySQL num servico externo como Railway.

## Stack

### Frontend

- HTML, CSS e JavaScript
- Vite
- TailwindCSS
- alguns componentes React

### Backend

- Node.js
- Express
- MySQL
- JWT + sessoes

### Integracoes

- EmailJS para email de boas-vindas no cadastro
- SMTP no backend para emails de redefinicao de senha

## Estrutura

```txt
.
|-- backend/                 API, autenticacao, base de dados, mailer
|-- css/                     estilos globais e componentes
|-- js/                      frontend principal
|-- assets/                  recursos estaticos
|-- public/                  ficheiros publicos
|-- dist/                    build final do frontend
|-- dashboard.html           dashboard do utilizador
|-- admin.html               painel administrativo
|-- index.html               login e registo
|-- start-dev.bat            arranque rapido local
|-- vercel.json              configuracao de deploy frontend
```

## Arranque Local

### Requisitos

- Node.js instalado
- MySQL disponivel
- base de dados configurada

### Forma mais simples no Windows

```bat
start-dev.bat
```

Isto inicia:

- backend em `http://localhost:3001`
- frontend em `http://localhost:5173`

### Manualmente

Frontend:

```bash
npm install
npm run dev
```

Backend:

```bash
cd backend
npm install
npm run dev
```

## Variaveis de Ambiente do Backend

Usa [backend/.env.example](/c:/xampp/htdocs/pap2326/backend/.env.example) como base.

Variaveis principais:

```env
NODE_ENV=production
PORT=3001

DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=cerebrum_db

JWT_SECRET=
JWT_EXPIRES_IN=7d
SESSION_KEY=cerebrum_sid
SESSION_SECRET=

CORS_ALLOWED=https://seu-frontend.vercel.app
FRONTEND_ORIGIN=https://seu-frontend.vercel.app
SITE_URL=https://seu-frontend.vercel.app

APP_URL=https://seu-frontend.vercel.app
APP_NAME=Cerebrum
```

## Emails

### 1. Boas-vindas no cadastro

O email de boas-vindas e enviado pelo frontend via EmailJS.

Variaveis necessarias no backend:

```env
EMAILJS_WELCOME_ENABLED=true
EMAILJS_SERVICE_ID=
EMAILJS_TEMPLATE_ID=
EMAILJS_PUBLIC_KEY=
```

O frontend le esta configuracao pela rota:

```txt
GET /api/public-config
```

Campos esperados no template do EmailJS:

```txt
{{to_name}}
{{user_name}}
{{user_email}}
{{app_name}}
{{login_url}}
```

### 2. Redefinicao de senha

A redefinicao de senha continua no backend e usa SMTP.

Variaveis necessarias:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=
RESET_PASSWORD_TOKEN_MINUTES=60
```

## Scripts

Frontend:

```bash
npm run dev
npm run build
npm run preview
```

Backend:

```bash
cd backend
npm run dev
npm start
npm run worker
npm run py-service
npm run migrate:ai
```

## Deploy

### Frontend

O frontend esta preparado para Vercel.

- framework: Vite
- build: `npm run build`
- output: `dist`

O ficheiro [vercel.json](/c:/xampp/htdocs/pap2326/vercel.json) faz rewrite de `/api/*` para o backend remoto.

### Backend

O backend pode ser publicado em Railway ou Render, desde que as variaveis de ambiente e a base de dados estejam corretamente configuradas.

## Rotas Relevantes

Autenticacao:

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/profile`
- `POST /api/forgot-password`
- `POST /api/reset-password`

Outras:

- `GET /api/health`
- `GET /api/public-config`

## Notas

- o menu da dashboard tem comportamento responsivo no mobile sem alterar a versao desktop
- o email de boas-vindas depende do EmailJS estar configurado
- o reset de senha depende do SMTP do backend
- o projeto pode continuar a evoluir sem mudar a arquitetura base

## Estado Atual

Neste momento o projeto ja inclui:

- autenticacao funcional
- dashboard de utilizador
- painel admin
- materias e progresso
- cronograma
- assistente IA
- fluxo de boas-vindas por EmailJS
- fluxo de reset de senha no backend

## Licenca

Uso academico / projeto PAP.
