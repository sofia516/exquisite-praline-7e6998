(() => {
  'use strict';

  const STORAGE_KEY = 'ledgerly.records.v1';
  const CURRENCIES = new Set(['INR', 'USD', 'EUR', 'GBP']);
  const PALETTE = [['#eaf4ed', '#478563'], ['#f2ecfa', '#856bb7'], ['#fbefea', '#bb785e'], ['#eaf0fb', '#6280bd'], ['#fbf2e2', '#ac8850'], ['#e8f4f3', '#4d918b']];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let loans = [];
  let activeView = 'overview';
  let activeFilter = 'all';
  let searchTerm = '';
  let selectedLoanId = null;
  let toastTimer;
  let storageAvailable = true;
  let storageCorrupt = false;

  function isDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) && localDate(new Date(`${value}T12:00:00`)) === value;
  }
  function newId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
  function validateLoan(loan) {
    const paymentsValid = !loan?.payments || (
      Array.isArray(loan.payments) && loan.payments.every(payment => payment &&
        Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0 &&
        isDate(payment.date) && (!payment.note || typeof payment.note === 'string'))
    );
    return loan && typeof loan === 'object' &&
      typeof loan.person === 'string' && loan.person.trim().length > 0 && loan.person.length <= 60 &&
      ['lent', 'borrowed'].includes(loan.direction) && CURRENCIES.has(loan.currency) &&
      Number.isFinite(Number(loan.principal)) && Number(loan.principal) > 0 &&
      Number.isFinite(Number(loan.paid)) && Number(loan.paid) >= 0 && Number(loan.paid) <= Number(loan.principal) &&
      Number.isFinite(Number(loan.emi || 0)) && Number(loan.emi || 0) >= 0 &&
      (!loan.nextDate || isDate(loan.nextDate)) &&
      (!loan.notes || (typeof loan.notes === 'string' && loan.notes.length <= 180)) &&
      paymentsValid;
  }
  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length > 10000 || !parsed.every(validateLoan)) throw new Error('Stored records are invalid.');
      return parsed.map(l => ({ ...l, id: String(l.id || newId()), paid: Number(l.paid), principal: Number(l.principal), emi: Number(l.emi || 0), payments: l.payments || [], createdAt: Number(l.createdAt) || Date.now() }));
    } catch (error) {
      if (error?.name === 'SecurityError' || error?.name === 'QuotaExceededError') storageAvailable = false;
      else if (error instanceof SyntaxError || error?.message === 'Stored records are invalid.') storageCorrupt = true;
      return [];
    }
  }
  function storageStatus() {
    const el = $('#storage-status');
    if (!el) return;
    if (!storageAvailable) el.textContent = 'Browser storage unavailable — export or keep this tab open';
    else if (storageCorrupt) el.textContent = 'Saved records need recovery — import a backup before editing';
    else el.innerHTML = 'Your data stays in this browser <span class="privacy-dot">●</span>';
  }
  function save() {
    if (!storageAvailable || storageCorrupt) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loans));
      storageStatus();
      return true;
    } catch {
      storageAvailable = false;
      storageStatus();
      return false;
    }
  }
  function snapshot() { return JSON.parse(JSON.stringify(loans)); }
  function saveOrRestore(before) {
    if (save()) return true;
    loans = before;
    render();
    toast(storageCorrupt ? 'Saved data needs recovery. Import a backup before making changes.' : 'Could not save this change. Check browser storage and try again.');
    return false;
  }
  function localDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function formatMoney(amount, currency = 'INR') {
    try { return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount) || 0); }
    catch { return `${currency} ${Number(amount) || 0}`; }
  }
  function formatTotals(entries) {
    const byCurrency = new Map();
    entries.forEach(([currency, amount]) => byCurrency.set(currency, (byCurrency.get(currency) || 0) + amount));
    if (!byCurrency.size) return formatMoney(0, 'INR');
    return [...byCurrency].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => formatMoney(amount, currency)).join(' · ');
  }
  function formatDate(value, options = { day: 'numeric', month: 'short' }) {
    if (!value) return 'Not scheduled';
    return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, options);
  }
  function balance(loan) { return Math.max(0, Number(loan.principal) - Number(loan.paid)); }
  function initials(value) { return value.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function active(direction) { return loans.filter(l => l.direction === direction && balance(l) > 0); }

  function renderHeader() {
    const hour = new Date().getHours();
    $('#greeting').textContent = hour < 12 ? 'A FRESH START TO YOUR DAY' : hour < 17 ? 'YOUR FINANCIAL SNAPSHOT' : 'A CLEARER PICTURE, EVERY DAY';
    $('#heading').innerHTML = `Your money at a glance <span class="wave">✳</span>`;
    $('#today-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function renderMetrics() {
    const lent = active('lent');
    const borrowed = active('borrowed');
    const due = loans.filter(l => balance(l) > 0 && l.nextDate && new Date(`${l.nextDate}T12:00:00`).getMonth() === new Date().getMonth() && new Date(`${l.nextDate}T12:00:00`).getFullYear() === new Date().getFullYear());
    $('#owed-to-you').textContent = formatTotals(lent.map(l => [l.currency, balance(l)]));
    $('#you-owe').textContent = formatTotals(borrowed.map(l => [l.currency, balance(l)]));
    const net = new Map();
    lent.forEach(l => net.set(l.currency, (net.get(l.currency) || 0) + balance(l)));
    borrowed.forEach(l => net.set(l.currency, (net.get(l.currency) || 0) - balance(l)));
    $('#net-position').textContent = formatTotals([...net]);
    $('#net-foot').textContent = 'Net amount by currency';
    $('#lent-foot').textContent = `Across ${lent.length} active loans`;
    $('#borrowed-foot').textContent = `Across ${borrowed.length} active loans`;
    $('#due-month').textContent = formatTotals(due.map(l => [l.currency, Math.min(balance(l), Number(l.emi) || balance(l))]));
    $('#due-foot').textContent = due.length ? `${due.length} payment${due.length === 1 ? '' : 's'} due this month` : 'No payments due';
    $('#due-progress-fill').style.width = due.length ? `${Math.min(100, Math.max(16, due.length / 4 * 100))}%` : '0%';
    $('#lent-count').textContent = lent.length;
    $('#borrowed-count').textContent = borrowed.length;
  }
  function filteredLoans() {
    let result = [...loans];
    if (activeView === 'lent') result = result.filter(l => l.direction === 'lent');
    if (activeView === 'borrowed') result = result.filter(l => l.direction === 'borrowed');
    if (activeView === 'payments') result = result.filter(l => l.payments.length);
    if (activeView === 'overview' && activeFilter !== 'all') result = result.filter(l => l.direction === activeFilter);
    if (searchTerm) result = result.filter(l => `${l.person} ${l.notes || ''}`.toLowerCase().includes(searchTerm.toLowerCase()));
    return result.sort((a, b) => balance(b) - balance(a));
  }
  function renderLoans() {
    const list = $('#loan-list');
    const rows = filteredLoans();
    list.innerHTML = '';
    const visible = activeView === 'overview' ? rows.slice(0, 5) : rows;
    visible.forEach((loan, index) => {
      const remaining = balance(loan);
      const paidPercent = loan.principal ? Math.round(loan.paid / loan.principal * 100) : 0;
      const [background, foreground] = PALETTE[index % PALETTE.length];
      const row = document.createElement('article');
      row.className = `loan-row ${loan.direction === 'borrowed' ? 'is-borrowed' : ''}`;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `${loan.person}, ${loan.direction}, balance ${formatMoney(remaining, loan.currency)}`);
      row.innerHTML = `<div class="person-cell"><span class="person-avatar" style="background:${background};color:${foreground}">${escapeHtml(initials(loan.person))}</span><span class="person-meta"><strong>${escapeHtml(loan.person)}</strong><small>${loan.direction === 'lent' ? 'You lent' : 'You borrowed'} · ${remaining === 0 ? 'Settled' : loan.nextDate ? `Due ${formatDate(loan.nextDate)}` : 'No due date'}</small></span></div><div class="amount-cell"><strong>${formatMoney(remaining, loan.currency)}</strong><small>of ${formatMoney(loan.principal, loan.currency)}</small></div><div class="progress-cell"><div class="progress-label"><span>Paid back</span><span>${paidPercent}%</span></div><div class="progress-line"><span style="width:${Math.min(100, paidPercent)}%"></span></div></div><div class="row-actions"><button class="tiny-action record-action" title="Record payment" aria-label="Record payment">＋</button><button class="tiny-action remind-action" title="Send reminder" aria-label="Send reminder">↗</button></div>`;
      row.addEventListener('click', event => {
        if (event.target.closest('.record-action')) { event.stopPropagation(); openPayment(loan.id); return; }
        if (event.target.closest('.remind-action')) { event.stopPropagation(); openReminder(loan.id); return; }
        openDetails(loan.id);
      });
      row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetails(loan.id); } });
      list.append(row);
    });
    const empty = !rows.length;
    $('#empty-state').classList.toggle('hidden', !empty);
    list.style.display = empty ? 'none' : 'grid';
    $('#view-all').style.display = activeView === 'overview' ? 'inline' : 'none';
    if (empty && searchTerm) $('#empty-state').querySelector('strong').textContent = 'No matching loans';
    else $('#empty-state').querySelector('strong').textContent = 'No loans here yet';
  }
  function relativeDate(value) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const date = new Date(`${value}T00:00:00`);
    const days = Math.round((date - today) / 86400000);
    return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 0 ? `${Math.abs(days)}d overdue` : `In ${days} days`;
  }
  function renderUpcoming() {
    const container = $('#upcoming-list');
    container.innerHTML = '';
    const items = loans.filter(l => balance(l) > 0 && l.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 3);
    if (!items.length) { container.innerHTML = '<div class="empty-upcoming">Nothing scheduled right now.<br>Add a due date to any loan.</div>'; return; }
    items.forEach(loan => {
      const date = new Date(`${loan.nextDate}T12:00:00`);
      const item = document.createElement('div');
      item.className = 'upcoming-item';
      item.innerHTML = `<div class="date-tile"><small>${date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</small><strong>${date.getDate()}</strong></div><div class="upcoming-meta"><strong>${escapeHtml(loan.person)}</strong><small>${loan.direction === 'lent' ? 'Expected back' : 'EMI payment'}</small></div><div class="upcoming-amount">${formatMoney(Math.min(balance(loan), Number(loan.emi) || balance(loan)), loan.currency)}<small>${relativeDate(loan.nextDate)}</small></div>`;
      item.addEventListener('click', () => openDetails(loan.id));
      container.append(item);
    });
  }
  function render() { renderMetrics(); renderLoans(); renderUpcoming(); storageStatus(); }

  function resetLoanForm() {
    const form = $('#loan-form');
    form.reset();
    form.elements.loanId.value = '';
    form.elements.paid.value = '0';
    $('#loan-modal-title').textContent = 'Add a loan';
    $('#loan-modal-description').textContent = 'Keep the details handy. You can update them anytime.';
    $('#loan-submit').innerHTML = 'Save loan <span>→</span>';
    $('#initial-paid-wrap').style.display = '';
  }
  function startEdit(id) {
    const loan = loans.find(item => item.id === id);
    if (!loan) return;
    $('#detail-modal').close();
    const form = $('#loan-form');
    form.elements.loanId.value = loan.id;
    form.elements.person.value = loan.person;
    form.elements.direction.value = loan.direction;
    form.elements.currency.value = loan.currency;
    form.elements.principal.value = loan.principal;
    form.elements.paid.value = loan.paid;
    form.elements.emi.value = loan.emi || '';
    form.elements.nextDate.value = loan.nextDate || '';
    form.elements.notes.value = loan.notes || '';
    $('#initial-paid-wrap').style.display = 'none';
    $('#loan-modal-title').textContent = 'Edit loan';
    $('#loan-modal-description').textContent = 'Update the loan details. Payments already recorded are kept.';
    $('#loan-submit').innerHTML = 'Save changes <span>→</span>';
    $('#loan-modal').showModal();
  }
  function openPayment(id) {
    const loan = loans.find(item => item.id === id);
    if (!loan || balance(loan) <= 0) return;
    const form = $('#payment-form');
    form.elements.loanId.value = id;
    form.elements.amount.max = balance(loan);
    form.elements.amount.value = '';
    form.elements.date.value = localDate(new Date());
    form.elements.note.value = '';
    $('#payment-context').textContent = `${loan.person} has ${formatMoney(balance(loan), loan.currency)} remaining.`;
    $('#payment-modal').showModal();
  }
  function openReminder(id) {
    const eligible = loans.filter(loan => loan.direction === 'lent' && balance(loan) > 0);
    if (!eligible.length) { toast('Add an active loan you’ve lent to draft a reminder.'); return; }
    const select = $('#reminder-loan');
    select.innerHTML = eligible.map(loan => `<option value="${escapeHtml(loan.id)}">${escapeHtml(loan.person)} · ${formatMoney(balance(loan), loan.currency)} remaining</option>`).join('');
    if (id && eligible.some(loan => loan.id === id)) select.value = id;
    composeReminder();
    $('#reminder-modal').showModal();
  }
  function composeReminder() {
    const loan = loans.find(item => item.id === $('#reminder-loan').value);
    if (!loan) return;
    const next = loan.emi ? ` The next agreed payment is ${formatMoney(Math.min(loan.emi, balance(loan)), loan.currency)}${loan.nextDate ? ` by ${formatDate(loan.nextDate, { day: 'numeric', month: 'long' })}` : ''}.` : '';
    $('#reminder-message').value = `Hi ${loan.person.split(' ')[0]}, just a friendly note about the ${formatMoney(balance(loan), loan.currency)} still remaining from the ${formatMoney(loan.principal, loan.currency)} I lent you.${next} Whenever you get a chance, could you let me know when might work? Thanks!`;
  }
  function openDetails(id) {
    const loan = loans.find(item => item.id === id);
    if (!loan) return;
    selectedLoanId = id;
    $('#detail-type').textContent = loan.direction === 'lent' ? 'MONEY YOU LENT' : 'MONEY YOU BORROWED';
    $('#detail-name').textContent = loan.person;
    $('#detail-meta').textContent = `Added ${formatDate(localDate(loan.createdAt || Date.now()), { day: 'numeric', month: 'long', year: 'numeric' })}${loan.nextDate ? ` · Next payment ${formatDate(loan.nextDate)}` : ''}`;
    $('#detail-balance').textContent = formatMoney(balance(loan), loan.currency);
    $('#detail-principal').textContent = formatMoney(loan.principal, loan.currency);
    $('#detail-paid').textContent = formatMoney(loan.paid, loan.currency);
    $('#detail-progress-fill').style.width = `${Math.min(100, loan.principal ? 100 * loan.paid / loan.principal : 0)}%`;
    $('#detail-notes').textContent = loan.notes || '';
    $('#detail-notes').style.display = loan.notes ? 'block' : 'none';
    const history = $('#detail-payments'); history.innerHTML = '';
    const payments = [...loan.payments].sort((a, b) => b.date.localeCompare(a.date));
    if (!payments.length) history.innerHTML = '<div class="no-history">No payments recorded yet.</div>';
    payments.slice(0, 8).forEach(payment => {
      const row = document.createElement('div'); row.className = 'history-row';
      row.innerHTML = `<span>${formatDate(payment.date, { day: 'numeric', month: 'short', year: 'numeric' })}${payment.note ? ` · ${escapeHtml(payment.note)}` : ''}</span><strong>${loan.direction === 'lent' ? 'Received' : 'Paid'} ${formatMoney(payment.amount, loan.currency)}</strong>`;
      history.append(row);
    });
    $('#detail-remind').style.display = loan.direction === 'lent' && balance(loan) > 0 ? '' : 'none';
    $('#detail-record').style.display = balance(loan) > 0 ? '' : 'none';
    $('#detail-modal').showModal();
  }
  function updateView(view) {
    activeView = view; activeFilter = 'all';
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    const labels = { overview: ['Overview', 'Your money at a glance ✳', 'Here’s where things stand with your money.', 'Your loans', 'A quick look at everything in motion.'], lent: ['Money lent', 'Money you’ve lent ↗', 'Keep track of what’s coming back to you.', 'Money lent', 'What friends and family still owe you.'], borrowed: ['Money borrowed', 'Money you owe ↙', 'Stay on top of every repayment and EMI.', 'Money borrowed', 'The balances and repayments you’re managing.'], payments: ['Payments', 'Payment history ◷', 'Every payment, recorded in one place.', 'Loans with payments', 'Tap any loan to see its repayment history.'] }[view];
    $('#page-title').textContent = labels[0];
    $('#heading').textContent = labels[1];
    $('#subtitle').textContent = labels[2];
    $('#list-heading').textContent = labels[3];
    $('#list-description').textContent = labels[4];
    $('#filter-tabs').style.display = view === 'overview' ? 'flex' : 'none';
    $('#view-all').textContent = view === 'overview' ? 'View all →' : 'View overview';
    $('#view-all').style.display = view === 'overview' ? 'inline' : 'none';
    renderLoans();
  }

  $('#loan-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const id = String(data.get('loanId') || '');
    const principal = Number(data.get('principal'));
    const paid = id ? Number(loans.find(loan => loan.id === id)?.paid) : Number(data.get('paid') || 0);
    if (!Number.isFinite(principal) || principal <= 0 || paid > principal) { toast('Total amount must be positive and at least the amount already paid.'); return; }
    const before = snapshot();
    const fields = { person: String(data.get('person')).trim(), direction: data.get('direction'), currency: data.get('currency'), principal, emi: Number(data.get('emi') || 0), nextDate: String(data.get('nextDate') || ''), notes: String(data.get('notes') || '').trim() };
    if (id) {
      const index = loans.findIndex(loan => loan.id === id);
      if (index < 0) { toast('This loan is no longer available.'); return; }
      loans[index] = { ...loans[index], ...fields };
    } else {
      loans.unshift({ id: newId(), ...fields, paid, payments: [], createdAt: Date.now() });
    }
    if (!saveOrRestore(before)) return;
    $('#loan-modal').close(); resetLoanForm(); render();
    toast(id ? 'Loan details updated.' : 'Loan added and saved.');
  });
  $('#payment-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const loan = loans.find(item => item.id === form.elements.loanId.value);
    const amount = Number(form.elements.amount.value);
    if (!loan || !Number.isFinite(amount) || amount <= 0 || amount > balance(loan)) { toast('Enter a payment up to the remaining balance.'); return; }
    const before = snapshot();
    loan.paid = Math.min(loan.principal, loan.paid + amount);
    loan.payments.push({ amount, date: form.elements.date.value, note: form.elements.note.value.trim() });
    if (loan.emi && balance(loan) > 0 && loan.nextDate) {
      const date = new Date(`${loan.nextDate}T12:00:00`);
      const day = date.getDate(); date.setDate(1); date.setMonth(date.getMonth() + 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(day, lastDay)); loan.nextDate = localDate(date);
    }
    if (!saveOrRestore(before)) return;
    $('#payment-modal').close(); render();
    toast(balance(loan) === 0 ? `${loan.person}’s loan is fully paid.` : 'Payment recorded. Your balance is up to date.');
    if ($('#detail-modal').open && selectedLoanId === loan.id) openDetails(loan.id);
  });

  $('#reminder-loan').addEventListener('change', composeReminder);
  $('#copy-reminder').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#reminder-message').value); toast('Message copied to clipboard.'); }
    catch { $('#reminder-message').select(); document.execCommand('copy'); toast('Message copied to clipboard.'); }
  });
  $('#share-reminder').addEventListener('click', async () => {
    const text = $('#reminder-message').value;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Message copied. Paste it into your chat.'); } }
    catch (error) { if (error.name !== 'AbortError') toast('Copy the message and paste it into your chat.'); }
  });
  $('#detail-record').addEventListener('click', () => { const id = selectedLoanId; $('#detail-modal').close(); if (id) openPayment(id); });
  $('#detail-remind').addEventListener('click', () => { const id = selectedLoanId; $('#detail-modal').close(); if (id) openReminder(id); });
  $('#detail-edit').addEventListener('click', () => { if (selectedLoanId) startEdit(selectedLoanId); });
  $('#detail-delete').addEventListener('click', () => {
    const loan = loans.find(item => item.id === selectedLoanId);
    if (!loan || !window.confirm(`Delete the loan record for ${loan.person}? This also removes its payment history.`)) return;
    const before = snapshot(); loans = loans.filter(item => item.id !== selectedLoanId);
    if (!saveOrRestore(before)) return;
    $('#detail-modal').close(); selectedLoanId = null; render(); toast('Loan and its payment history deleted.');
  });
  $('#add-loan').addEventListener('click', () => { resetLoanForm(); $('#loan-modal').showModal(); });
  $('#empty-add').addEventListener('click', () => { resetLoanForm(); $('#loan-modal').showModal(); });
  $('#reminder-button').addEventListener('click', () => openReminder());
  $('#calendar-button').addEventListener('click', () => updateView('payments'));
  $('#help-button').addEventListener('click', () => $('#info-modal').showModal());
  $('#profile-button').addEventListener('click', () => $('#info-modal').showModal());
  $('#view-all').addEventListener('click', () => updateView(activeView === 'overview' ? 'lent' : 'overview'));
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('.nav-item').forEach(button => button.addEventListener('click', () => updateView(button.dataset.view)));
  $$('.filter-tab').forEach(button => button.addEventListener('click', () => { activeFilter = button.dataset.filter; $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab === button)); renderLoans(); }));
  $('#search-input').addEventListener('input', event => { searchTerm = event.target.value; renderLoans(); });
  $('#export-data').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ format: 'ledgerly-backup', version: 1, exportedAt: new Date().toISOString(), loans }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `ledgerly-backup-${localDate(new Date())}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Your backup is ready.');
  });
  $('#import-data').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const records = Array.isArray(raw) ? raw : raw?.format === 'ledgerly-backup' && raw.version === 1 ? raw.loans : null;
      if (!Array.isArray(records) || records.length > 10000 || !records.every(validateLoan)) throw new Error('Invalid backup');
      if (!window.confirm(`Replace the ${loans.length} current loan record${loans.length === 1 ? '' : 's'} with ${records.length} record${records.length === 1 ? '' : 's'} from this backup?`)) return;
      const before = snapshot();
      loans = records.map(loan => ({ ...loan, id: String(loan.id || newId()), person: loan.person.trim(), principal: Number(loan.principal), paid: Number(loan.paid), emi: Number(loan.emi || 0), payments: loan.payments || [], createdAt: Number(loan.createdAt) || Date.now() }));
      storageCorrupt = false; storageAvailable = true;
      if (!saveOrRestore(before)) return;
      $('#info-modal').close(); render(); toast('Backup imported successfully.');
    } catch { toast('That file is not a valid Ledgerly version 1 backup.'); }
    finally { event.target.value = ''; }
  });

  loans = readStore();
  renderHeader(); render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
})();
