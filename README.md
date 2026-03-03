# Configuração de Email (Breve)

Adicione as variáveis abaixo no seu `.env` (ou copie de .env.example):
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
- FROM_EMAIL
- APP_URL

Testes:
1. Preencha .env com credenciais SMTP (Mailtrap, Gmail app password, etc).
2. Rode a API e registre um utilizador via frontend/Postman.
3. O envio de e‑mail é assíncrono; erros são logados no servidor sem impedir o cadastro.
