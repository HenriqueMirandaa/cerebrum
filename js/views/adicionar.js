import api from '../api.js';
import * as db from '../data.js';
import { showToast, formatDate, formatHours, daysBetween, todayISO, escapeHtml } from '../utils/helpers.js';

// Make removerMateria available globally for onclick handlers
window.removerMateria = removerMateria;

// Cache for subjects
let minhasMaterias = [];
let materiasDisponiveis = [];

async function renderAdicionar() {
    try {
        document.getElementById('view').innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold mb-2">Gerenciar Disciplinas</h2>
                <p class="text-gray-600">Adicione e gerencie suas disciplinas de estudo.</p>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Form para adicionar disciplina -->
                <div class="lg:col-span-1">
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-xl font-semibold mb-4">Nova Disciplina</h3>
                        <form id="addForm" class="space-y-4">
                            <div class="form-group">
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    Selecione a Disciplina
                                </label>
                                <select id="materiaSelect" class="form-select w-full" required>
                                    <option value="">Carregando disciplinas...</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    Data da Prova
                                </label>
                                <input 
                                    type="date" 
                                    id="examDate" 
                                    class="form-input w-full" 
                                    required
                                    min="${new Date().toISOString().split('T')[0]}"
                                />
                            </div>

                            <div class="form-group">
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    Horas de Estudo Planejadas
                                </label>
                                <input 
                                    type="number" 
                                    id="totalHours" 
                                    class="form-input w-full" 
                                    min="1" 
                                    value="10"
                                    required
                                />
                            </div>

                            <button type="submit" class="btn-primary w-full">
                                <i class="fas fa-plus mr-2"></i>
                                Adicionar Disciplina
                            </button>
                        </form>

                        <div class="mt-6 pt-6 border-t">
                            <h4 class="font-medium text-gray-700 mb-2">Sugerir Nova Disciplina</h4>
                            <button id="btnSugerir" class="btn-secondary w-full">
                                <i class="fas fa-lightbulb mr-2"></i>
                                Sugerir Disciplina
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Lista de disciplinas -->
                <div class="lg:col-span-2">
                    <div class="bg-white rounded-lg shadow">
                        <div class="p-6 border-b flex justify-between items-center">
                            <h3 class="text-xl font-semibold">Minhas Disciplinas</h3>
                            <input 
                                type="text" 
                                id="searchInput" 
                                class="form-input text-sm" 
                                placeholder="Buscar disciplinas..."
                                style="width: 200px; color: inherit;"
                                autocomplete="off"
                                spellcheck="false"
                            />
                        </div>
                        <div id="materiasList" class="divide-y">
                            <div class="p-6 text-center text-gray-500">
                                <i class="fas fa-spinner fa-spin text-xl"></i>
                                <p class="mt-2">Carregando suas disciplinas...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal de sugestão -->
            <div id="sugerirModal" class="modal hidden">
                <div class="modal-overlay"></div>
                <div class="modal-container">
                    <div class="modal-header">
                        <h3 class="text-xl font-semibold">Sugerir Nova Disciplina</h3>
                        <button class="modal-close">×</button>
                    </div>
                    <form id="sugerirForm" class="modal-content space-y-4">
                        <div class="form-group">
                            <label class="form-label">Nome da Disciplina</label>
                            <input type="text" id="nomeSugestao" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Cor</label>
                            <input type="color" id="corSugestao" class="form-input h-12" value="#6366f1" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Ícone</label>
                            <select id="iconeSugestao" class="form-input">
                                <option value="fas fa-book">📚 Livro</option>
                                <option value="fas fa-calculator">🔢 Calculadora</option>
                                <option value="fas fa-flask">🧪 Laboratório</option>
                                <option value="fas fa-palette">🎨 Arte</option>
                                <option value="fas fa-music">🎵 Música</option>
                                <option value="fas fa-globe">🌍 Geografia</option>
                                <option value="fas fa-dna">🧬 Biologia</option>
                                <option value="fas fa-atom">⚛️ Física</option>
                                <option value="fas fa-keyboard">💻 Informática</option>
                                <option value="fas fa-language">🗣️ Línguas</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Data da Prova</label>
                            <input 
                                type="date" 
                                id="examDateSugestao" 
                                class="form-input"
                                required
                                min="${new Date().toISOString().split('T')[0]}"
                            >
                        </div>
                        <div class="form-group">
                            <label class="form-label">Horas de Estudo</label>
                            <input 
                                type="number" 
                                id="horasSugestao" 
                                class="form-input"
                                min="1" 
                                value="10"
                                required
                            >
                        </div>
                        <div class="flex justify-end gap-4">
                            <button type="button" class="btn-secondary modal-close">Cancelar</button>
                            <button type="submit" class="btn-primary">Enviar Sugestão</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Event Listeners
        const addForm = document.getElementById('addForm');
        const sugerirForm = document.getElementById('sugerirForm');
        const btnSugerir = document.getElementById('btnSugerir');
        const modal = document.getElementById('sugerirModal');
        const closeBtns = document.querySelectorAll('.modal-close');
        const searchInput = document.getElementById('searchInput');

        btnSugerir.addEventListener('click', () => {
            try { if (window.SiteUI && typeof window.SiteUI.openModal === 'function') window.SiteUI.openModal(modal); else modal.classList.remove('hidden'); } catch (e) { modal.classList.remove('hidden'); }
        });

        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                try { if (window.SiteUI && typeof window.SiteUI.closeModal === 'function') window.SiteUI.closeModal(modal); else modal.classList.add('hidden'); } catch (e) { modal.classList.add('hidden'); }
            });
        });

        addForm.addEventListener('submit', handleAdd);
        sugerirForm.addEventListener('submit', handleSugerir);
        
        if (searchInput) {
            // ensure value is a string (avoid undefined assignment from other scripts)
            if (typeof searchInput.value === 'undefined' || searchInput.value === null) searchInput.value = '';
            searchInput.addEventListener('input', () => {
                const query = String(searchInput.value || '').toLowerCase().trim();
                const filteredMaterias = minhasMaterias.filter(m => 
                    m.name.toLowerCase().includes(query)
                );
                renderMateriasList(filteredMaterias);
            });
        }

        // Initial data load
        await loadMaterias();

    } catch (error) {
        console.error('Error rendering adicionar:', error);
        showToast('Erro ao carregar a página', 'error');
    }
}

async function loadMaterias() {
    try {
        // Try to get from indexedDB first
        let [disponiveis, minhas] = await Promise.all([
            db.get('availableSubjects'),
            db.get('mySubjects')
        ]);

        // If not in indexedDB or forced refresh, fetch from API
        if (!disponiveis || !minhas) {
            [disponiveis, minhas] = await Promise.all([
                api.getMateriasDisponiveis(),
                api.getMinhasMaterias()
            ]);

            // Cache in IndexedDB
            await Promise.all([
                db.set('availableSubjects', disponiveis),
                db.set('mySubjects', minhas)
            ]);
        }

        materiasDisponiveis = disponiveis;
        minhasMaterias = minhas;

        // Update UI with fetched data
        const select = document.getElementById('materiaSelect');
        
        if (!disponiveis?.length) {
            select.innerHTML = `<option value="">Nenhuma disciplina disponível — peça ao administrador para criar disciplinas</option>`;
        } else {
            select.innerHTML = `<option value="">-- selecione uma disciplina --</option>` + disponiveis.map(s => 
                `<option value="${s.id}">${s.name}</option>`
            ).join('');
        }

        // Render the list of subjects
        await renderMateriasList(minhas);
    } catch (error) {
        console.error('Error loading materias:', error);
        showToast('Erro ao carregar disciplinas', 'error');
    }
}

async function handleAdd(event) {
    event.preventDefault();
    
    const subject_id = document.getElementById('materiaSelect').value;
    const exam_date = document.getElementById('examDate').value;
    const total_hours = document.getElementById('totalHours').value;

    if (!subject_id) {
        showToast('Selecione uma disciplina', 'error');
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        await api.adicionarMateria(subject_id, exam_date, total_hours);
        await loadMaterias(); // Reloads and updates UI
        showToast('Disciplina adicionada com sucesso!', 'success');
        event.target.reset();
        // Navigate to Minhas Matérias view
        try { window.router.navigate('/minhas'); } catch (e) { console.warn('navigate to /minhas failed', e); }
    } catch (error) {
        console.error('Error adding materia:', error);
        showToast(error.message || 'Erro ao adicionar disciplina', 'error');
        
        // Try to get from cache if offline
        const cached = await db.get('mySubjects');
        if (cached) {
            await renderMateriasList(cached);
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function handleSugerir(event) {
    event.preventDefault();
    
    const data = {
        name: document.getElementById('nomeSugestao').value,
        color: document.getElementById('corSugestao').value,
        icon: document.getElementById('iconeSugestao').value,
        exam_date: document.getElementById('examDateSugestao').value,
        total_hours: document.getElementById('horasSugestao').value
    };

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

        try {
        await api.sugerirMateria(data.name, data.color, data.icon, data.exam_date, data.total_hours);
        try { if (window.SiteUI && typeof window.SiteUI.closeModal === 'function') window.SiteUI.closeModal('sugerirModal'); else document.getElementById('sugerirModal').classList.add('hidden'); } catch(e) { document.getElementById('sugerirModal').classList.add('hidden'); }
        await loadMaterias(); // Reloads and updates UI
        showToast('Sugestão enviada com sucesso!', 'success');
        event.target.reset();
    } catch (error) {
        console.error('Error suggesting materia:', error);
        showToast(error.message || 'Erro ao sugerir disciplina', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function removerMateria(id) {
    try {
        const ok = await (window.SiteUI && window.SiteUI.confirm ? window.SiteUI.confirm('Tem certeza que deseja remover esta disciplina?') : Promise.resolve(confirm('Tem certeza que deseja remover esta disciplina?')));
        if (!ok) return;
    } catch (e) {
        if (!confirm('Tem certeza que deseja remover esta disciplina?')) return;
    }

    try {
        await api.removerMateria(id);
        await loadMaterias(); // Reloads and updates UI
        showToast('Disciplina removida com sucesso!', 'success');
    } catch (error) {
        console.error('Error removing materia:', error);
        showToast(error.message || 'Erro ao remover disciplina', 'error');
        
        // Try to get from cache if offline
        const cached = await db.get('mySubjects');
        if (cached) {
            const updated = cached.filter(m => m.id !== id);
            await db.set('mySubjects', updated);
            await renderMateriasList(updated);
        }
    }
}

async function renderMateriasList(materias) {
    const list = document.getElementById('materiasList');
    if (!list) return;

    if (!materias?.length) {
        list.innerHTML = `
            <div class="p-6 text-center text-gray-500">
                <i class="fas fa-folder-open text-3xl mb-2"></i>
                <p>Você ainda não tem disciplinas adicionadas</p>
            </div>
        `;
        return;
    }

    list.innerHTML = materias.map(materia => `
        <div class="p-6 flex items-center justify-between hover:bg-gray-50" data-id="${materia.id}">
            <div class="flex items-center gap-4">
                <i class="${materia.icon || 'fas fa-book'} text-xl" style="color: ${materia.color}"></i>
                <div>
                    <h4 class="font-medium">${materia.name}</h4>
                    <p class="text-sm text-gray-500">
                        ${materia.total_hours}h planejadas • Prova: ${formatDate(materia.exam_date)} 
                        • ${daysBetween(new Date(), new Date(materia.exam_date))} dias restantes
                    </p>
                </div>
            </div>
            <div class="flex items-center gap-4">
                <button 
                    class="btn-text text-gray-500 hover:text-indigo-600"
                    onclick="window.router.navigate('/cronograma?materia=${materia.id}')"
                >
                    <i class="fas fa-calendar"></i>
                </button>
                <button 
                    class="btn-text text-gray-500 hover:text-red-600"
                    onclick="removerMateria(${materia.id})"
                >
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

export default renderAdicionar;