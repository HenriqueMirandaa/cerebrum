import api from '../api.js';
import { showToast } from '../utils/helpers.js';

let viewState = {
    mode: 'week', // or 'month'
    reference: new Date()
};

let events = [];
let materias = [];

function toISODateTimeLocal(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoForQuery(d) {
    // produce ISO-like without timezone for server (server parses ISO)
    const dt = new Date(d);
    return dt.toISOString().slice(0,19).replace('T',' ');
}

function startOfWeek(ref) {
    const d = new Date(ref);
    const day = d.getDay();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - day);
    return d;
}

function endOfWeek(ref) {
    const s = startOfWeek(ref);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    e.setHours(23,59,59,999);
    return e;
}

function startOfMonth(ref) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
    d.setHours(0,0,0,0);
    return d;
}

function endOfMonth(ref) {
    const d = new Date(ref.getFullYear(), ref.getMonth()+1, 0);
    d.setHours(23,59,59,999);
    return d;
}

async function fetchMaterias() {
    materias = await api.getMinhasMaterias();
}

async function fetchEvents() {
    try {
        let from, to;
        if (viewState.mode === 'week') {
            from = startOfWeek(viewState.reference);
            to = endOfWeek(viewState.reference);
        } else {
            from = startOfMonth(viewState.reference);
            to = endOfMonth(viewState.reference);
        }

        const rows = await api.getCronograma(from.toISOString(), to.toISOString());
        events = (rows || []).map(r => ({
            ...r,
            start: new Date(r.start_iso),
            end: new Date(r.end_iso)
        }));
    } catch (err) {
        console.error('Erro ao buscar eventos', err);
        showToast('Erro ao carregar eventos', 'error');
    }
}

function renderControls() {
    return `
        <div class="flex items-center justify-between mb-4">
            <div>
                <h2 class="text-2xl font-semibold">Cronograma</h2>
                <div class="text-sm text-gray-500">Visualize e gerencie seus eventos</div>
                <div id="calendarPeriodLabel" class="text-sm font-medium text-gray-700 mt-1">${getCurrentPeriodLabel()}</div>
            </div>
            <div class="flex items-center gap-2">
                <button id="prevBtn" class="btn-icon" aria-label="Anterior"><i class="fas fa-chevron-left"></i></button>
                <button id="nextBtn" class="btn-icon" aria-label="Próximo"><i class="fas fa-chevron-right"></i></button>
                <select id="viewMode" class="form-select" aria-label="Modo de visualização">
                    <option value="week">Semanal</option>
                    <option value="month">Mensal</option>
                </select>
                <button id="newEventBtn" class="btn-primary">Novo Evento</button>
            </div>
        </div>
    `;
}

function getCurrentPeriodLabel() {
    if (viewState.mode === 'month') {
        return viewState.reference.toLocaleDateString('pt-PT', {
            month: 'long',
            year: 'numeric'
        });
    }

    const start = startOfWeek(viewState.reference);
    const end = endOfWeek(viewState.reference);
    return `${start.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

function syncPeriodLabel() {
    const label = document.getElementById('calendarPeriodLabel');
    if (!label) return;
    label.textContent = getCurrentPeriodLabel();
}

function renderGrid() {
    if (viewState.mode === 'week') return renderWeekGrid();
    return renderMonthGrid();
}

function renderWeekGrid() {
    const start = startOfWeek(viewState.reference);
    const days = [];
    for (let i=0;i<7;i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
    }

    const htmlDays = days.map(d => {
        const dayEvents = events.filter(ev => ev.start.toDateString() === d.toDateString());
        return `
            <div class="p-2 border rounded" role="gridcell" aria-label="${d.toLocaleDateString()}">
                <div class="font-medium mb-2">${d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'numeric' })}</div>
                <div class="space-y-2">
                    ${dayEvents.map(ev => renderEventTile(ev)).join('') || '<div class="text-sm text-gray-400">Nenhum evento</div>'}
                </div>
            </div>
        `;
    }).join('');

    return `<div class="cronograma-grid-wrapper"><div class="grid grid-cols-7 gap-3 cronograma-week-grid">${htmlDays}</div></div>`;
}

function renderMonthGrid() {
    const start = new Date(viewState.reference.getFullYear(), viewState.reference.getMonth(), 1);
    const end = endOfMonth(viewState.reference);
    const cells = [];
    const startDay = start.getDay();
    // pad start
    for (let i=0;i<startDay;i++) cells.push(null);
    for (let d=1; d<=end.getDate(); d++) cells.push(new Date(viewState.reference.getFullYear(), viewState.reference.getMonth(), d));

    const html = cells.map((date, idx) => {
        if (!date) return `<div class="p-2 border bg-gray-50"></div>`;
        const dayEvents = events.filter(ev => ev.start.toDateString() === date.toDateString());
        return `
            <div class="p-2 border rounded h-32 overflow-hidden" role="gridcell" aria-label="${date.toLocaleDateString()}">
                <div class="text-sm font-medium mb-1">${date.getDate()}</div>
                <div class="text-xs space-y-1 overflow-y-auto">
                    ${dayEvents.map(ev => renderEventTile(ev)).join('')}
                </div>
            </div>
        `;
    }).join('');

    return `<div class="cronograma-grid-wrapper"><div class="grid grid-cols-7 gap-2 cronograma-month-grid">${html}</div></div>`;
}

function renderEventTile(ev) {
    const materia = materias.find(m => String(m.id) === String(ev.materia_id));
    const color = ev.color || (materia ? (materia.color || materia.cor || '#6366f1') : '#6366f1');
    const title = ev.title || '';
    const time = ev.all_day ? 'Dia todo' : `${ev.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - ${ev.end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
    // store event id on data- attribute for click handling
    return `
        <div class="p-1 rounded cursor-pointer cronograma-event-tile" style="border-left:4px solid ${color}; padding-left:8px;" data-event-id="${ev.id}" tabindex="0" role="button" aria-pressed="false">
            <div class="text-sm font-semibold cronograma-event-tile__title">${escapeHtml(title)}</div>
            <div class="text-xs text-gray-500 cronograma-event-tile__meta">${time}${materia ? ' • ' + (materia.name || materia.nome) : ''}</div>
        </div>
    `;
}

function escapeHtml(s){ return String(s || '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function bindGridActions(container) {
    container.querySelectorAll('[data-event-id]').forEach(el => {
        el.addEventListener('click', async (e) => {
            const id = el.getAttribute('data-event-id');
            const ev = events.find(x => String(x.id) === String(id));
            if (ev) openEventModal(ev);
        });
        el.addEventListener('keypress', (e) => { if (e.key === 'Enter') el.click(); });
    });

    // clicking on empty cell to create event
    container.querySelectorAll('[role="gridcell"]').forEach(cell => {
        cell.addEventListener('dblclick', (e) => {
            // derive date from aria-label
            const label = cell.getAttribute('aria-label');
            if (!label) return;
            const date = new Date(label);
            const start = new Date(date); start.setHours(10,0,0,0);
            const end = new Date(date); end.setHours(11,0,0,0);
            openEventModal({ start, end, all_day: 0 });
        });
    });
}

function renderModalHtml() {
    return `
        <div class="modal hidden" id="eventModal" aria-hidden="true">
            <div class="modal-overlay">
                <div class="modal-container cronograma-modal-container" role="dialog" aria-modal="true" aria-labelledby="eventModalTitle">
                    <div class="modal-header cronograma-modal-header">
                        <h3 id="eventModalTitle" class="text-lg font-semibold">Evento</h3>
                        <button id="closeModal" class="modal-close" aria-label="Fechar">×</button>
                    </div>
                    <div class="modal-content cronograma-modal-content">
                        <form id="eventForm" class="cronograma-event-form">
                            <input type="hidden" id="eventId">
                            <div class="form-group">
                                <label for="eventTitle">Título</label>
                                <input id="eventTitle" class="form-input w-full" required />
                            </div>
                            <div class="form-group">
                                <label for="eventMateria">Disciplina</label>
                                <select id="eventMateria" class="form-select w-full"><option value="">(nenhuma)</option></select>
                            </div>
                            <div class="form-group">
                                <label for="eventStart">Início</label>
                                <input id="eventStart" type="datetime-local" class="form-input w-full" required />
                            </div>
                            <div class="form-group">
                                <label for="eventEnd">Término</label>
                                <input id="eventEnd" type="datetime-local" class="form-input w-full" required />
                            </div>
                            <div class="form-group">
                                <label for="eventAllDay" class="cronograma-checkbox">
                                    <input id="eventAllDay" type="checkbox" />
                                    <span class="cronograma-checkbox__box" aria-hidden="true"></span>
                                    <span class="cronograma-checkbox__label">Dia todo</span>
                                </label>
                            </div>
                            <div class="form-group">
                                <label for="eventNotes">Notas</label>
                                <textarea id="eventNotes" class="form-input w-full" rows="3"></textarea>
                            </div>
                            <div class="flex justify-end gap-2 mt-4 cronograma-modal-actions">
                                <button type="button" id="deleteEventBtn" class="btn-secondary">Excluir</button>
                                <button type="button" id="cancelBtn" class="btn-secondary">Cancelar</button>
                                <button type="submit" class="btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function openModal() {
    const modal = document.getElementById('eventModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden','false');
}

function closeModal() {
    const modal = document.getElementById('eventModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = '';
    modal.setAttribute('aria-hidden','true');
}

function populateMateriaSelect() {
    const sel = document.getElementById('eventMateria');
    if (!sel) return;
    sel.innerHTML = `<option value="">(nenhuma)</option>` + (materias || []).map(m => `<option value="${m.id}">${m.name || m.nome}</option>`).join('');
}

async function openEventModal(ev) {
    // ev can be existing event object or partial with start/end
    try {
        const form = document.getElementById('eventForm');
        if (!form) return;

        // ensure materias loaded so select is populated
        if (!materias || materias.length === 0) {
            try { await fetchMaterias(); } catch (e) { /* ignore */ }
        }
        populateMateriaSelect();

        document.getElementById('eventId').value = ev.id || '';
        document.getElementById('eventTitle').value = ev.title || '';
        document.getElementById('eventMateria').value = ev.materia_id || '';
        document.getElementById('eventStart').value = ev.start ? toISODateTimeLocal(ev.start) : '';
        document.getElementById('eventEnd').value = ev.end ? toISODateTimeLocal(ev.end) : '';
        document.getElementById('eventAllDay').checked = !!ev.all_day;
        document.getElementById('eventNotes').value = ev.notes || '';
        const delBtn = document.getElementById('deleteEventBtn'); if (delBtn) delBtn.style.display = ev.id ? '' : 'none';
        openModal();
        // focus title for accessibility
        try { document.getElementById('eventTitle').focus(); } catch (e) { /* ignore */ }
    } catch (err) {
        console.error('openEventModal error', err);
        showToast('Erro ao abrir modal', 'error');
    }
}

async function saveEvent(e) {
    e.preventDefault();
    const id = document.getElementById('eventId').value;
    const title = document.getElementById('eventTitle').value.trim();
    const materia_id = document.getElementById('eventMateria').value || null;
    const start_iso = document.getElementById('eventStart').value;
    const end_iso = document.getElementById('eventEnd').value;
    const all_day = document.getElementById('eventAllDay').checked ? 1 : 0;
    const notes = document.getElementById('eventNotes').value || null;

    if (!title) return showToast('Título é obrigatório', 'error');
    if (!start_iso || !end_iso) return showToast('Datas são obrigatórias', 'error');

    const startDate = new Date(start_iso);
    let endDate = new Date(end_iso);

    if (!all_day && startDate >= endDate) {
        const sameDay =
            startDate.getFullYear() === endDate.getFullYear()
            && startDate.getMonth() === endDate.getMonth()
            && startDate.getDate() === endDate.getDate();

        if (sameDay) {
            endDate.setDate(endDate.getDate() + 1);
            const endInput = document.getElementById('eventEnd');
            if (endInput) endInput.value = toISODateTimeLocal(endDate);
        }
    }

    if (startDate >= endDate) return showToast('Início deve ser antes do término', 'error');

    try {
        const payload = { title, materia_id, start_iso: startDate.toISOString(), end_iso: endDate.toISOString(), all_day, notes };
        if (id) {
            await api.updateEvent(id, payload);
            showToast('Evento atualizado', 'success');
        } else {
            await api.createEvent(payload);
            showToast('Evento criado', 'success');
        }
        await refreshAndRender();
        closeModal();
    } catch (err) {
        console.error('Erro salvar evento', err);
        showToast(err.message || 'Erro ao salvar evento', 'error');
    }
}

async function deleteEvent() {
    const id = document.getElementById('eventId').value;
    if (!id) return;
    const confirmed = window.SiteUI && typeof window.SiteUI.confirm === 'function'
        ? await window.SiteUI.confirm({
            title: 'Excluir evento',
            message: 'Deseja excluir este evento?',
            okText: 'Excluir',
            cancelText: 'Cancelar'
        })
        : window.confirm('Deseja excluir este evento?');
    if (!confirmed) return;
    try {
        await api.deleteEvent(id);
        showToast('Evento excluído', 'success');
        closeModal();
        await refreshAndRender();
    } catch (err) {
        console.error('Erro ao excluir evento', err);
        showToast('Erro ao excluir evento', 'error');
    }
}

async function refreshAndRender() {
    await fetchMaterias();
    await fetchEvents();
    syncPeriodLabel();
    const grid = document.getElementById('calendarGrid');
    // If the user navigated away, the grid may no longer exist — abort safely
    if (!grid) return;
    grid.innerHTML = renderGrid();
    bindGridActions(grid);
}

export default async function renderCronograma() {
    const root = document.getElementById('view');
    root.innerHTML = `
        <div class="cronograma-root">
            ${renderControls()}
            <div id="calendarGrid" class="mb-6"></div>
            ${renderModalHtml()}
        </div>
    `;

    // wire controls
    document.getElementById('viewMode').value = viewState.mode;
    document.getElementById('viewMode').addEventListener('change', async (e) => {
        viewState.mode = e.target.value;
        await refreshAndRender();
    });
    document.getElementById('prevBtn').addEventListener('click', async () => {
        if (viewState.mode === 'week') viewState.reference.setDate(viewState.reference.getDate() - 7);
        else viewState.reference.setMonth(viewState.reference.getMonth() - 1);
        await refreshAndRender();
    });
    document.getElementById('nextBtn').addEventListener('click', async () => {
        if (viewState.mode === 'week') viewState.reference.setDate(viewState.reference.getDate() + 7);
        else viewState.reference.setMonth(viewState.reference.getMonth() + 1);
        await refreshAndRender();
    });
    document.getElementById('newEventBtn').addEventListener('click', () => {
        // ensure modal elements still belong to this view when opening
        const gridEl = document.getElementById('calendarGrid');
        if (!gridEl) return;
        openEventModal({ start: new Date(), end: new Date(new Date().getTime()+60*60*1000) });
    });

    // modal actions
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('deleteEventBtn').addEventListener('click', deleteEvent);
    document.getElementById('eventForm').addEventListener('submit', saveEvent);

    // initial load
    await refreshAndRender();
    // only populate select if the modal/select still exists
    if (document.getElementById('eventMateria')) populateMateriaSelect();
}
