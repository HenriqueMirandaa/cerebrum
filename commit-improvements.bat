@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo Cerebrum AI Improvements - Commit Script
echo ==========================================
echo.

cd /d c:\xampp\htdocs\pap2326

echo [1] Verificando status do repositorio...
git status
echo.

echo [2] Adicionando alteracoes...
git add backend/services/aiAssistantService.js
echo Added aiAssistantService.js
echo.

echo [3] Criando commit com melhorias...
git commit -m "feat: melhorar confiabilidade e precisao do chatbot de IA

MELHORIAS:
- Sistema de retry automatico (ate 3 tentativas) com exponential backoff
- Timeout adaptativo de 60s com retry automático em caso de timeout
- Extração de JSON robusta com múltiplas estratégias de parsing
- Detecção automática de datas de exame no contexto do usuario
- Prompts mais especificos e instruções claras em caps lock
- Melhor compreensão de instruções e contexto
- Logs informativos para diagnostico de problemas

PROBLEMAS RESOLVIDOS:
- Responde JSON raw em vez de interpretado -> Parsing melhorado
- Signal abort sem motivo -> Retry automático
- Resposta genérica 'posso ajudar com...' -> Prompts melhores
- Não detecta data de exame -> Detecção automática

CONFIGURAÇÃO (em .env):
- HF_API_TIMEOUT=60000 (timeout em ms)
- HF_MAX_RETRIES=2 (retries adicionais)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

echo.
echo [4] Status pos-commit...
git status
echo.

echo [5] Ultimos commits...
git log --oneline -3
echo.

echo [6] Fazendo push para GitHub...
git push
echo.

echo ==========================================
echo Commit realizado com sucesso!
echo ==========================================
pause
