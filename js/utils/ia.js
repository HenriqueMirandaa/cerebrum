// Serviços de IA
const IA_SERVICES = {
    HUGGING_FACE: 'huggingface',
    OPENROUTER: 'openrouter',
    LOCAL: 'local',
    TRANSFORMERS: 'transformers'
};

// Configuração
const IA_CONFIG = {
    activeService: IA_SERVICES.TRANSFORMERS, // Priorizar Transformers.js local
    fallbackEnabled: true,
    timeout: 45000, // Aumentado para modelos locais
    useLocalFirst: true
};

// Função principal para chamar IA
async function callIA(disciplina, pergunta) {
    try {
        let resposta;
        
        // Tentar serviço local primeiro se configurado
        if (IA_CONFIG.useLocalFirst && window.LocalAIService) {
            try {
                resposta = await callTransformersLocal(disciplina, pergunta);
                IA_CONFIG.activeService = IA_SERVICES.TRANSFORMERS;
                return resposta;
            } catch (localError) {
                console.log('IA local falhou, tentando serviços online...', localError);
            }
        }
        
        switch (IA_CONFIG.activeService) {
            case IA_SERVICES.TRANSFORMERS:
                resposta = await callTransformersLocal(disciplina, pergunta);
                break;
            case IA_SERVICES.HUGGING_FACE:
                resposta = await callHuggingFace(disciplina, pergunta);
                break;
            case IA_SERVICES.OPENROUTER:
                resposta = await callOpenRouter(disciplina, pergunta);
                break;
            default:
                resposta = localIAResponder(disciplina, pergunta);
        }
        
        return resposta;
    } catch (error) {
        console.error('Erro ao chamar IA:', error);
        
        if (IA_CONFIG.fallbackEnabled) {
            return localIAResponder(disciplina, pergunta);
        }
        
        throw error;
    }
}

// Transformers.js Local (NOVO)
async function callTransformersLocal(disciplina, pergunta) {
    if (!window.LocalAIService) {
        throw new Error('Serviço de IA local não disponível');
    }
    
    try {
        const resposta = await window.LocalAIService.generateResponse(disciplina, pergunta);
        return resposta;
    } catch (error) {
        console.error('Erro no Transformers.js:', error);
        throw error;
    }
}

// Hugging Face Inference API
async function callHuggingFace(disciplina, pergunta) {
    const prompt = createPrompt(disciplina, pergunta);
    
    try {
        const models = [
            'microsoft/DialoGPT-medium',
            'microsoft/DialoGPT-small',
            'facebook/blenderbot-400M-distill'
        ];
        
        for (const model of models) {
            try {
                const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        inputs: prompt,
                        parameters: {
                            max_length: 500,
                            temperature: 0.7,
                            do_sample: true
                        }
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    return processHuggingFaceResponse(data, disciplina);
                }
            } catch (e) {
                console.log(`Modelo ${model} falhou, tentando próximo...`);
                continue;
            }
        }
        
        throw new Error('Todos os modelos do Hugging Face falharam');
        
    } catch (error) {
        console.error('Erro no Hugging Face:', error);
        throw error;
    }
}

// OpenRouter
async function callOpenRouter(disciplina, pergunta) {
    const prompt = createPrompt(disciplina, pergunta);
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer free',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'Cerebrum Study Assistant'
            },
            body: JSON.stringify({
                model: 'google/gemma-7b-it:free',
                messages: [
                    {
                        role: 'system',
                        content: `Você é um tutor especializado em ${disciplina}. Forneça explicações educativas e úteis.`
                    },
                    {
                        role: 'user',
                        content: pergunta
                    }
                ],
                max_tokens: 500,
                temperature: 0.7
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.choices[0].message.content;
        } else {
            throw new Error('OpenRouter API error');
        }
    } catch (error) {
        console.error('Erro no OpenRouter:', error);
        throw error;
    }
}

// Criar prompt otimizado (função auxiliar)
function createPrompt(disciplina, pergunta) {
    const prompts = {
        'Matemática': `Você é um tutor especialista em Matemática. Forneça explicações claras, passo a passo, com exemplos práticos quando possível. Seja preciso com fórmulas e conceitos.

Pergunta: ${pergunta}

Resposta:`,
        
        'História': `Você é um historiador especializado. Forneça contextos históricos, datas importantes, causas e consequências. Seja factual e educativo.

Pergunta: ${pergunta}

Resposta:`,
        
        'Física': `Você é um físico experiente. Explique conceitos físicos com clareza, usando analogias quando útil. Forneça fórmulas relevantes e suas aplicações.

Pergunta: ${pergunta}

Resposta:`,
        
        'Química': `Você é um químico especializado. Explique reações, elementos e conceitos químicos de forma precisa. Use a tabela periódica quando relevante.

Pergunta: ${pergunta}

Resposta:`,
        
        'Biologia': `Você é um biólogo. Explique sistemas biológicos, processos e terminologia científica de forma clara e acessível.

Pergunta: ${pergunta}

Resposta:`,
        
        'Português': `Você é um especialista em Língua Portuguesa. Ajude com gramática, literatura, interpretação de texto e redação.

Pergunta: ${pergunta}

Resposta:`,
        
        'Inglês': `You are an English language expert. Provide clear explanations about grammar, vocabulary, and help with translations when needed.

Question: ${pergunta}

Answer:`
    };
    
    return prompts[disciplina] || `Como tutor educacional, responda de forma clara e educativa:

Pergunta sobre ${disciplina}: ${pergunta}

Resposta:`;
}

// Processar resposta do Hugging Face
function processHuggingFaceResponse(data, disciplina) {
    if (data.error) {
        throw new Error(data.error);
    }
    
    if (Array.isArray(data) && data[0] && data[0].generated_text) {
        return cleanResponse(data[0].generated_text);
    }
    
    if (data.generated_text) {
        return cleanResponse(data.generated_text);
    }
    
    throw new Error('Formato de resposta não reconhecido');
}

// Limpar resposta
function cleanResponse(text) {
    if (!text) return 'Desculpe, não consegui gerar uma resposta. Tente reformular sua pergunta.';
    
    const lines = text.split('\n');
    const responseIndex = lines.findIndex(line => 
        line.includes('Resposta:') || line.includes('Answer:')
    );
    
    if (responseIndex !== -1) {
        return lines.slice(responseIndex + 1).join('\n').trim();
    }
    
    if (text.length > 1500) {
        text = text.substring(0, 1500) + '...';
    }
    
    return text.trim();
}

// IA Local (Fallback básico)
function localIAResponder(disciplina, pergunta) {
    pergunta = pergunta.toLowerCase();
    
    const responses = {
        'Matemática': {
            'equação.*segundo': 'Para resolver uma equação do 2º grau ax²+bx+c=0: 1) Calcule o discriminante Δ=b²−4ac. 2) Se Δ<0: não há raízes reais. 3) Se Δ=0: há uma raiz real x=−b/(2a). 4) Se Δ>0: há duas raízes reais x=(−b±√Δ)/(2a). Exemplo: x²-5x+6=0 → Δ=1 → x=(5±1)/2 → x₁=3, x₂=2.',
            'derivada': 'A derivada representa a taxa de variação instantânea de uma função. Regras básicas: 1) Derivada de constante: 0. 2) Derivada de xⁿ: n*xⁿ⁻¹. 3) Derivada de sen(x): cos(x). 4) Derivada de cos(x): -sen(x). A derivada é fundamental no cálculo diferencial.',
            'integral': 'A integral é o oposto da derivada e representa a área sob uma curva. Integral indefinida: ∫xⁿ dx = xⁿ⁺¹/(n+1) + C. Integral definida calcula área entre pontos. Exemplo: ∫x² dx = x³/3 + C.',
            'teorema.*pitágoras': 'Em um triângulo retângulo: a² = b² + c², onde "a" é a hipotenusa e "b", "c" são os catetos. Exemplo: catetos 3 e 4 → hipotenusa = √(3²+4²) = √25 = 5.',
            'default': 'Em Matemática, posso ajudar com: álgebra, geometria, cálculo, trigonometria, estatística. Para uma resposta mais específica, tente: "Como resolver equações do segundo grau?" ou "Explique o que é uma derivada".'
        },
        'História': {
            'revolução.*francesa': 'A Revolução Francesa (1789-1799) marcou o fim do absolutismo na França. Principais eventos: Queda da Bastilha (14/07/1789), Declaração dos Direitos do Homem e do Cidadão, Período do Terror sob Robespierre. Resultou na ascensão de Napoleão Bonaparte.',
            'idade média': 'A Idade Média (séculos V-XV) caracterizou-se pelo feudalismo, poder da Igreja Católica, cavalaria e Cruzadas. Dividida em Alta Idade Média (séc. V-X) e Baixa Idade Média (séc. XI-XV). Terminou com a Queda de Constantinopla (1453).',
            'descobrimento.*brasil': 'O Brasil foi descoberto por Pedro Álvares Cabral em 22 de abril de 1500. A frota portuguesa chegou em Porto Seguro, Bahia. O evento marcou o início da colonização portuguesa na América.',
            'default': 'Posso ajudar com: Idade Antiga, Medieval, Moderna, Contemporânea; Revoluções; Grandes Guerras; História do Brasil. Especifique: "Revolução Francesa" ou "Idade Média".'
        },
        'Física': {
            'leis.*newton': 'As três leis de Newton: 1) Inércia: corpo em repouso/movimento mantém estado sem força externa. 2) F=ma: força resultante = massa × aceleração. 3) Ação e Reação: forças sempre em pares iguais e opostos.',
            'energia cinética': 'Energia cinética (Ec) é a energia do movimento: Ec = ½ × m × v², onde m=massa e v=velocidade. Exemplo: objeto de 2kg a 3m/s → Ec = ½×2×9 = 9 joules.',
            'circuitos.*elétricos': 'Lei de Ohm: V = R × I (Tensão = Resistência × Corrente). Circuito série: resistências somam. Circuito paralelo: inversos das resistências somam.',
            'default': 'Áreas da Física: mecânica, termodinâmica, eletromagnetismo, óptica, física moderna. Pergunte sobre: "Leis de Newton" ou "Energia cinética".'
        }
    };
    
    const disciplinaResponses = responses[disciplina];
    if (!disciplinaResponses) {
        return `Como assistente de ${disciplina}, posso ajudar com conceitos fundamentais da disciplina. Para uma resposta mais precisa, formule sua pergunta mencionando tópicos específicos.`;
    }
    
    for (const [pattern, response] of Object.entries(disciplinaResponses)) {
        if (pattern !== 'default' && new RegExp(pattern).test(pergunta)) {
            return response;
        }
    }
    
    return disciplinaResponses.default;
}

// Testar conectividade com serviços de IA
async function testIAServices() {
    const services = [
        { 
            name: 'Transformers.js Local', 
            test: async () => {
                if (!window.LocalAIService) return false;
                const info = window.LocalAIService.getModelInfo();
                return info.initialized || info.initializing;
            }
        },
        { 
            name: 'Hugging Face', 
            test: () => callHuggingFace('Matemática', 'Quanto é 2+2?').then(() => true).catch(() => false)
        },
        { 
            name: 'OpenRouter', 
            test: () => callOpenRouter('Matemática', 'Quanto é 2+2?').then(() => true).catch(() => false)
        }
    ];
    
    for (const service of services) {
        try {
            const result = await Promise.race([
                service.test(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 10000)
                )
            ]);
            
            if (result) {
                console.log(`✅ ${service.name}: Disponível`);
                return service.name;
            }
        } catch (error) {
            console.log(`❌ ${service.name}: Indisponível -`, error.message);
        }
    }
    
    console.log('⚠️ Usando IA local básica como fallback');
    return 'local';
}

// Inicializar melhor serviço disponível
async function initializeIAService() {
    const bestService = await testIAServices();
    IA_CONFIG.activeService = bestService === 'Transformers.js Local' ? IA_SERVICES.TRANSFORMERS : bestService;
    console.log(`Serviço de IA ativo: ${bestService}`);
    return bestService;
}

// Exportar funções
window.IA = {
    callIA,
    callHuggingFace,
    callOpenRouter,
    callTransformersLocal,
    localIAResponder,
    initializeIAService,
    testIAServices,
    config: IA_CONFIG
};