import api from '../api.js';
import * as db from '../data.js';
import { formatDate, formatHours, showToast, escapeHtml } from '../utils/helpers.js';
import { startConfetti } from '../confetti.js';

async function renderMinhasDisciplinas() {
    try {
        document.getElementById('view').innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold mb-2">Minhas Disciplinas</h2>
                <p class="text-gray-600">Gerencie suas disciplinas de estudo.</p>
            </div>
            <div id="materiasContainer">
                <div class="text-center py-12">
                    <i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i>
                    <p class="mt-4 text-gray-500">Carregando suas disciplinas...</p>
                </div>
            </div>
        `;

        await loadAndRender();
    } catch (err) {
        console.error('renderMinhasMaterias', err);
        document.getElementById('materiasContainer').innerHTML = `<div class="text-center text-red-500">Erro ao carregar disciplinas</div>`;
    }
}

async function loadAndRender() {
    let container = document.getElementById('materiasContainer');
    try {
        const materias = await api.getMinhasMaterias();
        // If the user navigated away, the container may no longer exist — abort safely
        container = document.getElementById('materiasContainer');
        if (!container) return;
        console.debug('loadAndRender materias:', materias);
        if (!materias || materias.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-folder-open text-4xl mb-3 opacity-30"></i>
                    <p>Nenhuma disciplina encontrada. Adicione uma nova disciplina.</p>
                    <div class="mt-4">
                        <button class="btn btn-primary" onclick="window.router.navigate('/adicionar')">Adicionar Disciplina</button>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${materias.map(m => {
                    const completed = (m.progress || 0) >= 100;
                    const classes = `bg-white rounded-lg shadow p-6 ${completed ? 'completed-subject' : ''}`;
                    return `
                    <div class="${classes}" data-id="${m.id}">
                        <div class="flex items-start justify-between">
                            <div>
                                <h3 class="font-semibold text-lg">${escapeHtml(m.name)}</h3>
                                <div class="text-sm text-gray-500">Prova: ${formatDate(m.exam_date || '')} • ${m.total_hours || 0}h planejadas</div>
                            </div>
                            <div class="text-right">
                                <div class="text-2xl font-bold mb-1">${m.progress || 0}%</div>
                                <div class="text-sm ${ completed ? 'text-green-500' : 'text-orange-500' }">${ completed ? 'Concluída' : 'Em andamento'}</div>
                            </div>
                        </div>

                        <p class="mt-4 text-sm text-gray-700">${escapeHtml(m.description || '')}</p>

                        <div class="mt-4 flex items-center justify-end gap-2">
                            ${ completed ? `
                                <span class="badge-soft text-green-400">Concluído</span>
                                <button class="btn-text text-red-500" onclick="deleteMateriaConfirm(${m.id})"><i class="fas fa-trash"></i> Excluir</button>
                            ` : `
                                <button class="btn-text text-gray-500" onclick="openEditModal(${m.id})"><i class="fas fa-edit"></i> Editar</button>
                                <button class="btn-text text-red-500" onclick="deleteMateriaConfirm(${m.id})"><i class="fas fa-trash"></i> Excluir</button>
                            ` }
                        </div>
                    </div>
                `}).join('')}
            </div>

            <!-- Edit Modal -->
            <div id="editModal" class="modal hidden">
                <div class="modal-overlay"></div>
                <div class="modal-container">
                    <div class="modal-header">
                        <h3 class="text-xl font-semibold">Editar Matéria</h3>
                        <button class="modal-close">×</button>
                    </div>
                    <form id="editForm" class="modal-content space-y-4">
                        <div class="form-group">
                            <label class="form-label">Nome</label>
                            <input type="text" id="editName" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Descrição</label>
                            <textarea id="editDescription" class="form-input" rows="3"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Metas (separadas por vírgula)</label>
                            <input type="text" id="editGoals" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Progresso (%)</label>
                            <input type="number" id="editProgress" class="form-input" min="0" max="100" value="0">
                        </div>

                        <div class="flex justify-end gap-4">
                            <button type="button" class="btn-secondary modal-close">Cancelar</button>
                            <button type="submit" class="btn-primary">Salvar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Wire modal handlers
        // If container no longer exists (navigated away), do not attach handlers
        if (!document.getElementById('materiasContainer')) return;
        document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => {
            const modalEl = document.getElementById('editModal');
            try { if (window.SiteUI && typeof window.SiteUI.closeModal === 'function') window.SiteUI.closeModal(modalEl); else modalEl.classList.add('hidden'); } catch (e) { modalEl.classList.add('hidden'); }
        }));
        document.getElementById('editForm').addEventListener('submit', handleEditSubmit);

        // celebrate completed subjects
        try { console.debug('calling celebrateRenderedCompletions'); celebrateRenderedCompletions(materias); } catch(e) { console.warn('celebrateRenderedCompletions failed', e); }

    } catch (err) {
        console.error('loadAndRender error', err);
        container.innerHTML = `<div class="text-center text-red-500">Erro ao carregar disciplinas</div>`;
    }
}

async function openEditModal(id) {
    try {
        // Try to read from backend first
        let materias = [];
        try { materias = await api.getMinhasMaterias(); } catch (e) { materias = await db.getSubjects(); }
        const materia = materias.find(m => String(m.id) === String(id));
        if (!materia) return showToast('error', 'Matéria não encontrada');

        document.getElementById('editName').value = materia.name || '';
        document.getElementById('editDescription').value = materia.description || '';
        document.getElementById('editGoals').value = (materia.goals || []).join(', ');
        document.getElementById('editProgress').value = materia.progress || 0;
        // store id on form
        document.getElementById('editForm').dataset.editId = id;
    try { if (window.SiteUI && typeof window.SiteUI.openModal === 'function') window.SiteUI.openModal('editModal'); else document.getElementById('editModal').classList.remove('hidden'); } catch (e) { document.getElementById('editModal').classList.remove('hidden'); }
    } catch (err) {
        console.error('openEditModal', err);
        showToast('error', 'Erro ao abrir modal de edição');
    }
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editForm').dataset.editId;
    const name = document.getElementById('editName').value.trim();
    const description = document.getElementById('editDescription').value.trim();
    const goals = document.getElementById('editGoals').value.split(',').map(s => s.trim()).filter(Boolean);
    const progress = parseInt(document.getElementById('editProgress').value, 10) || 0;

    if (!name) return showToast('error', 'Nome é obrigatório');

    try {
        // Prevent editing progress for already completed subject
        const subjects = await db.getSubjects();
        const subj = subjects.find(s => String(s.id) === String(id));
        if (subj && Number(subj.progress || subj.progresso || 0) >= 100) {
            showToast('error', 'Disciplina já concluída — progresso bloqueado');
            try { if (window.SiteUI && typeof window.SiteUI.closeModal === 'function') window.SiteUI.closeModal('editModal'); else document.getElementById('editModal').classList.add('hidden'); } catch (e) { document.getElementById('editModal').classList.add('hidden'); }
            return;
        }

        if (subj) {
            subj.name = name;
            subj.description = description;
            subj.goals = goals;
            subj.progress = progress;
            await db.updateSubject(subj);
        } else {
            try { await api.atualizarProgresso(id, progress); } catch (e) { /* ignore */ }
        }

        try { await api.atualizarProgresso({ subject_id: id, hours_increment: progress, last_studied: new Date().toISOString() }); } catch (e) { console.warn('api update progress failed', e); }

        // If progress reached completion, mark celebrated and start confetti once
        if (progress >= 100) {
            const key = `__completed_celebrated_${id}`;
            try { localStorage.setItem(key, '1'); } catch(e){}
            try { startConfetti(3500, { colors: ['rgba(16,185,129,0.95)', 'rgba(124,58,237,0.95)'] }); } catch(e){}
            try { await db.markSubjectCompleted(id); } catch(e){ /* ignore */ }
        }

        showToast('success', 'Matéria atualizada');
        try { if (window.SiteUI && typeof window.SiteUI.closeModal === 'function') window.SiteUI.closeModal('editModal'); else document.getElementById('editModal').classList.add('hidden'); } catch (e) { document.getElementById('editModal').classList.add('hidden'); }
        await loadAndRender();
    } catch (err) {
        console.error('handleEditSubmit', err);
        showToast('error', 'Erro ao salvar alterações');
    }
}

async function deleteMateriaConfirm(id) {
    try {
        const ok = await (window.SiteUI && window.SiteUI.confirm ? window.SiteUI.confirm('Tem certeza que deseja remover esta matéria?') : Promise.resolve(confirm('Tem certeza que deseja remover esta matéria?')));
        if (!ok) return;
    } catch (e) {
        if (!confirm('Tem certeza que deseja remover esta matéria?')) return;
    }
    try {
        try { await api.removerMateria(id); } catch (e) { console.warn('api remover failed', e); }
        try { await db.deleteSubject(Number(id)); } catch (e) { console.warn('db delete failed', e); }
        showToast('success', 'Matéria removida');
        await loadAndRender();
    } catch (err) {
        console.error('deleteMateriaConfirm', err);
        showToast('error', 'Erro ao remover matéria');
    }
}

// Expose global helpers for onclick usage
window.openEditModal = openEditModal;
window.deleteMateriaConfirm = deleteMateriaConfirm;

// inject minimal styles for completed state (outline + glow)
(function injectCompletionStyles(){
    try {
        if (document.getElementById('completion-styles')) return;
        const s = document.createElement('style');
        s.id = 'completion-styles';
        s.textContent = `
            .completed-subject { border-color: #10b981 !important; box-shadow: 0 6px 30px rgba(16,185,129,0.12); position: relative; }
            .completed-subject:after { content: ''; position: absolute; inset: -2px; border-radius: 8px; box-shadow: 0 0 18px rgba(16,185,129,0.18); pointer-events: none; }
            .completion-banner { font-size:0.9rem; }
        `;
        document.head.appendChild(s);
    } catch(e){ console.warn('inject style failed', e); }
})();

// --- celebration helpers ---
function celebrateRenderedCompletions(materias){
    if (!Array.isArray(materias)) return;
    materias.forEach(m => {
        try{
            const prog = Number(m.progress || 0);
            if (prog >= 100) {
                const el = document.querySelector(`[data-id="${m.id}"]`);
                if (!el) return;
                if (!el.querySelector('.completion-banner')){
                    const banner = document.createElement('div');
                    banner.className = 'completion-banner';
                    banner.innerText = `Disciplina concluída`;
                    el.style.position = 'relative';
                    banner.style.position = 'absolute';
                    banner.style.left = '12px';
                    banner.style.top = '-18px';
                    banner.style.padding = '6px 10px';
                    banner.style.borderRadius = '8px';
                    banner.style.background = 'linear-gradient(90deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))';
                    banner.style.color = 'var(--text)';
                    banner.style.fontWeight = '700';
                    banner.style.boxShadow = '0 10px 30px rgba(16,185,129,0.08)';
                    el.appendChild(banner);
                }
                // trigger confetti only if not already celebrated
                const key = `__completed_celebrated_${m.id}`;
                if (!localStorage.getItem(key)) {
                    try { localStorage.setItem(key, '1'); startConfetti(3500, { colors: ['rgba(16,185,129,0.95)', 'rgba(124,58,237,0.95)'] }); } catch(e){ console.warn('confetti fail', e); }
                }
            }
        } catch(e){ console.warn('celebrate error', e); }
    });
}
