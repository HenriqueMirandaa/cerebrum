// admin.js - Sistema de Administração do Cerebrum (conectado ao backend real)

// Configuração da API
const API_BASE_URL = '/api';

// Estado global
let currentUsers = [];
let currentSubjects = [];
let currentStatistics = {};

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminPanel();
    loadAllData();
    setupEventListeners();
});

function initializeAdminPanel() {
    console.log('🛠️ Painel administrativo inicializado (API real)');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.tab-link').forEach(link => link.classList.remove('active-tab'));
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active-tab');

    const titles = { dashboard: 'Dashboard', users: 'Gerenciar Utilizadores', subjects: 'Gerenciar Disciplinas', statistics: 'Estatísticas Gerais' };
    document.getElementById('page-title').textContent = titles[tabName];

    if (tabName === 'users') loadUsers();
    if (tabName === 'subjects') loadSubjects();
    if (tabName === 'statistics') loadStatistics();
}

function setupEventListeners() {
    document.querySelectorAll('.tab-link').forEach(link => link.addEventListener('click', function(e){ e.preventDefault(); switchTab(this.dataset.tab); }));
    document.getElementById('search-users').addEventListener('input', function(e){ filterUsers(e.target.value); });
    document.getElementById('add-subject-form').addEventListener('submit', function(e){ e.preventDefault(); addNewSubject(); });
}

async function apiCall(endpoint, options = {}) {
    return await api.request(endpoint, options);
}

async function loadAllData() {
    try {
        await Promise.all([loadDashboardData(), loadUsers(), loadSubjects(), loadStatistics()]);
    } catch (error) {
        showError('Erro ao carregar dados do sistema');
    }
}

async function loadDashboardData() {
    try {
        const stats = await api.request('/statistics');
        document.getElementById('total-users').textContent = stats.users || 0;
        document.getElementById('total-subjects').textContent = stats.subjects || 0;
        document.getElementById('total-hours').textContent = stats.total_hours || 0;
        loadRecentActivity();
    } catch (error) {
        document.getElementById('total-users').textContent = 'Erro';
    }
}

async function loadRecentActivity() {
    // Optional endpoint; if not implemented fallback to empty
    try {
        const activity = await api.request('/activity/recent');
        const container = document.getElementById('recent-activity');
        container.innerHTML = (activity || []).map(item => `...`).join('');
    } catch (error) {
        // ignore
    }
}

// Gerenciar Utilizadores
async function loadUsers() {
    try {
        const res = await api.getAllUsers();
        currentUsers = res.users || res;
        renderUsers(currentUsers);
    } catch (error) {
        document.getElementById('users-table-body').innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">Erro ao carregar utilizadores</td></tr>`;
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('users-table-body');
    if (!users || users.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-500">Nenhum utilizador encontrado</td></tr>`; return; }
    tbody.innerHTML = users.map(user => `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-3 px-4"><div class="flex items-center space-x-3"><div class="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center"><i class="fas fa-user text-indigo-600 text-sm"></i></div><span class="font-medium">${user.name}</span></div></td>
            <td class="py-3 px-4 text-gray-600">${user.email}</td>
            <td class="py-3 px-4"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${user.status}</span></td>
            <td class="py-3 px-4 text-gray-600">${new Date(user.created_at).toLocaleDateString()}</td>
            <td class="py-3 px-4"><div class="flex space-x-2"><button onclick="openEditUserModal(${user.id})" class="text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button><button onclick="deleteUser(${user.id})" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button></div></td>
        </tr>
    `).join('');
}

function filterUsers(searchTerm) { const filtered = currentUsers.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase())); renderUsers(filtered); }

async function deleteUser(userId) {
    try {
        const ok = await (window.SiteUI && window.SiteUI.confirm ? window.SiteUI.confirm('Tem certeza que deseja excluir este utilizador?') : Promise.resolve(confirm('Tem certeza que deseja excluir este utilizador?')));
        if (!ok) return;
    } catch (e) {
        if (!confirm('Tem certeza que deseja excluir este utilizador?')) return;
    }
    try { await api.deleteUser(userId); showSuccess('Utilizador excluído com sucesso'); loadUsers(); } catch (error) { showError('Erro ao excluir utilizador'); }
}

function openEditUserModal(userId) {
    const user = currentUsers.find(u => u.id === userId);
    if (!user) return showToast('error', 'Utilizador não encontrado');
    // Preencher modal (assuma elementos existam)
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-name').value = user.name;
    document.getElementById('edit-user-email').value = user.email;
    document.getElementById('edit-user-role').value = user.role;
    document.getElementById('edit-user-status').value = user.status;
    try { if (window.SiteUI && typeof window.SiteUI.openModal === 'function') window.SiteUI.openModal('edit-user-modal'); else document.getElementById('edit-user-modal').classList.remove('hidden'); } catch (e) { document.getElementById('edit-user-modal').classList.remove('hidden'); }
}

async function submitEditUserForm() {
    const id = document.getElementById('edit-user-id').value;
    const name = document.getElementById('edit-user-name').value;
    const email = document.getElementById('edit-user-email').value;
    const role = document.getElementById('edit-user-role').value;
    const status = document.getElementById('edit-user-status').value;
    try { await api.updateUser(id, { name, email, role, status }); showSuccess('Utilizador atualizado'); try { if (window.SiteUI && typeof window.SiteUI.closeModal === 'function') window.SiteUI.closeModal('edit-user-modal'); else document.getElementById('edit-user-modal').classList.add('hidden'); } catch(e){ document.getElementById('edit-user-modal').classList.add('hidden'); } loadUsers(); } catch (error) { showError('Erro ao atualizar utilizador'); }
}

// Gerenciar Disciplinas
async function loadSubjects() {
    try {
        const res = await api.getAllMaterias();
        currentSubjects = res.subjects || res;
        renderSubjects(currentSubjects);
    } catch (error) {
        document.getElementById('subjects-container').innerHTML = `<div class="text-center py-8 text-red-500">Erro ao carregar disciplinas</div>`;
    }
}

function renderSubjects(subjects) {
    const container = document.getElementById('subjects-container');
    if (!subjects || subjects.length === 0) { container.innerHTML = `<div class="text-center py-8 text-gray-500">Nenhuma disciplina cadastrada</div>`; return; }
    container.innerHTML = subjects.map(s => `<div class="bg-white border p-4 rounded">...` ).join('');
}

async function addNewSubject() {
    const name = document.getElementById('subject-name').value;
    const description = document.getElementById('subject-description').value;
    const colorEl = document.getElementById('subject-color');
    const color = colorEl ? colorEl.value : null;
    try { await api.createMateria({ name, description, color }); showSuccess('Disciplina adicionada'); closeAddSubjectModal(); loadSubjects(); loadDashboardData(); } catch (error) { showError('Erro ao adicionar disciplina'); }
}

async function deleteSubject(subjectId) { 
    try {
        const ok = await (window.SiteUI && window.SiteUI.confirm ? window.SiteUI.confirm('Tem certeza que deseja excluir esta disciplina?') : Promise.resolve(confirm('Tem certeza que deseja excluir esta disciplina?')));
        if (!ok) return;
    } catch (e) {
        if (!confirm('Tem certeza que deseja excluir esta disciplina?')) return;
    }
    try { await api.deleteMateria(subjectId); showSuccess('Disciplina excluída'); loadSubjects(); loadDashboardData(); } catch (error) { showError('Erro ao excluir disciplina'); }
}

async function editSubject(subjectId) { const subj = currentSubjects.find(s => s.id === subjectId); if (!subj) return showToast('error', 'Disciplina não encontrada'); document.getElementById('edit-subject-id').value = subj.id; document.getElementById('edit-subject-name').value = subj.name; document.getElementById('edit-subject-desc').value = subj.description || ''; try { if (window.SiteUI && typeof window.SiteUI.openModal === 'function') window.SiteUI.openModal('edit-subject-modal'); else document.getElementById('edit-subject-modal').classList.remove('hidden'); } catch(e) { document.getElementById('edit-subject-modal').classList.remove('hidden'); } }

async function submitEditSubjectForm() { const id = document.getElementById('edit-subject-id').value; const name = document.getElementById('edit-subject-name').value; const description = document.getElementById('edit-subject-desc').value; try { await api.updateMateria(id, { name, description }); showSuccess('Disciplina atualizada'); try { if (window.SiteUI && typeof window.SiteUI.closeModal === 'function') window.SiteUI.closeModal('edit-subject-modal'); else document.getElementById('edit-subject-modal').classList.add('hidden'); } catch(e) { document.getElementById('edit-subject-modal').classList.add('hidden'); } loadSubjects(); } catch (error) { showError('Erro ao atualizar disciplina'); } }

// Estatísticas - simplificado
async function loadStatistics() {
    try {
        const stats = await api.request('/statistics');
        currentStatistics = stats;
        document.getElementById('stats-total-users').textContent = stats.users || 0;
        document.getElementById('stats-total-subjects').textContent = stats.subjects || 0;
        document.getElementById('stats-total-hours').textContent = stats.total_hours || 0;
    } catch (error) {
        document.getElementById('detailed-stats').innerHTML = `<div class="text-center py-8 text-red-500">Erro ao carregar estatísticas</div>`;
    }
}

function showSuccess(message) { showToast('success', `✅ ${message}`); }
function showError(message) { showToast('error', `❌ ${message}`); }

function closeAddSubjectModal() { try { if (window.SiteUI && typeof window.SiteUI.closeModal === 'function') window.SiteUI.closeModal('add-subject-modal'); else document.getElementById('add-subject-modal').classList.add('hidden'); } catch(e) { document.getElementById('add-subject-modal').classList.add('hidden'); } document.getElementById('add-subject-form').reset(); }

// Logout
async function logout() {
    try {
        const ok = await (window.SiteUI && window.SiteUI.confirm ? window.SiteUI.confirm('Deseja sair do painel administrativo?') : Promise.resolve(confirm('Deseja sair do painel administrativo?')));
        if (!ok) return;
    } catch (e) {
        if (!confirm('Deseja sair do painel administrativo?')) return;
    }
    try {
        await api.logout();
    } catch (err) {
        // ignore
    }
    window.location.href = 'index.html';
}

// Export functions for inline event handlers
window.openEditUserModal = openEditUserModal;
window.submitEditUserForm = submitEditUserForm;
window.addNewSubject = addNewSubject;
window.editSubject = editSubject;
window.submitEditSubjectForm = submitEditSubjectForm;
window.deleteUser = deleteUser;
window.deleteSubject = deleteSubject;