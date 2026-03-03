# Deploy Seguro (Backend + Banco + Vercel)

## 1) Backup local (ja gerado)
- Arquivo: `backups/cerebrum_db_backup_20260303_105604.sql`
- Hash SHA256: `AE64F454E5AF82F1D53F5F6D91FE09DFE1B541610B1DCA4FA933141B51B194BE`

## 2) Criar banco MySQL remoto
- Opcao recomendada: Railway (MySQL).
- Ao criar, copie: `host`, `port`, `database`, `user`, `password`.

## 3) Importar o backup no banco remoto
```powershell
C:\xampp\mysql\bin\mysql.exe -h <HOST_REMOTO> -P <PORTA> -u <USUARIO> -p <NOME_BANCO> < backups\cerebrum_db_backup_20260303_105604.sql
```

## 4) Deploy do backend Node (Railway ou Render)
- Suba a pasta `backend` como servico Node.
- Use `npm install` e start command `npm start`.
- Configure as variaveis com base em `backend/.env.example`.
- Garanta:
  - `NODE_ENV=production`
  - `DB_*` apontando para o banco remoto
  - `CORS_ALLOWED` com a URL do frontend Vercel
  - `SESSION_SECRET` e `JWT_SECRET` fortes

## 5) Deploy do frontend no Vercel
- No Vercel, importe o repo `HenriqueMirandaa/cerebrum`.
- Framework: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Variavel no Vercel:
  - `VITE_API_ORIGIN=https://URL_DO_BACKEND`

## 6) Validacao final
- Testar:
  - cadastro/login
  - listar materias
  - cronograma
  - logout
- Confirmar no navegador que chamadas `fetch` vao para o backend remoto (nao `localhost`).

## 7) Seguranca (obrigatorio)
- Revogar e gerar nova chave da OpenAI antes de producao.
- Nunca commitar `.env` com segredos.
