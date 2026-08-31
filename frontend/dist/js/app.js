/**
 * PC Supervisor Store Visit Checklist — Frontend App
 * Mobile-first SPA with vanilla JS
 */

// ========== Configuration ==========
const API = window.API_BASE || '';  // Set via Cloudflare Pages env var or same-origin proxy
let adminToken = localStorage.getItem('adminToken') || '';
let selectedSupervisor = null;
let selectedCustomer = null;
let selectedShop = null;
let currentVisitId = null;  // For resubmission
let photos = {};  // { cat1: [File, ...], cat2: [File, ...], ... }

// ========== Navigation ==========
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function togglePage() {
  if (document.getElementById('pageAdminDashboard').classList.contains('active')) {
    adminLogout();
  } else {
    showLanding();
  }
}

// ========== Landing Page ==========
async function loadLandingData() {
  try {
    showLoading(true);
    const [supRes, custRes] = await Promise.all([
      fetch(`${API}/api/supervisors`),
      fetch(`${API}/api/customers`),
    ]);
    const supData = await supRes.json();
    const custData = await custRes.json();

    const supSelect = document.getElementById('landingSupervisor');
    supSelect.innerHTML = '<option value="">— เลือกชื่อ —</option>';
    (supData.supervisors || []).forEach(s => {
      supSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });

    const custSelect = document.getElementById('landingCustomer');
    custSelect.innerHTML = '<option value="">— เลือก Customer —</option>';
    (custData.customers || []).forEach(c => {
      custSelect.innerHTML += `<option value="${c.customer_code}">${c.customer_name}</option>`;
    });
  } catch (err) {
    console.error('Failed to load landing data:', err);
    showToast('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่', 'error');
  } finally {
    showLoading(false);
  }
}

function onSupervisorChange() {
  const select = document.getElementById('landingSupervisor');
  selectedSupervisor = select.value ? { id: parseInt(select.value), name: select.options[select.selectedIndex].text } : null;
  checkStartEnabled();
}

function onCustomerChange() {
  const select = document.getElementById('landingCustomer');
  selectedCustomer = select.value || null;
  loadShops();
  checkStartEnabled();
}

async function loadShops() {
  const shopSelect = document.getElementById('landingShop');
  shopSelect.innerHTML = '<option value="">— เลือกร้าน —</option>';
  if (!selectedCustomer) return;

  try {
    const res = await fetch(`${API}/api/stores?customer_code=${encodeURIComponent(selectedCustomer)}`);
    const data = await res.json();
    (data.stores || []).forEach(s => {
      shopSelect.innerHTML += `<option value="${s.shop_code}">${s.shop_name}</option>`;
    });
  } catch (err) {
    console.error('Failed to load shops:', err);
  }
}

function checkStartEnabled() {
  const shop = document.getElementById('landingShop').value;
  document.getElementById('btnStart').disabled = !(selectedSupervisor && selectedCustomer && shop);
}

// Called when shop dropdown changes
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('landingShop').addEventListener('change', function() {
    selectedShop = this.value || null;
    checkStartEnabled();
  });
});

function startVisit() {
  const shopCode = document.getElementById('landingShop').value;
  if (!selectedSupervisor || !shopCode) return;

  // Reset form
  document.getElementById('checklistForm').reset();
  resetConditionalFields();
  photos = {};
  currentVisitId = null;

  // Set header info
  document.getElementById('formSupervisor').textContent = selectedSupervisor.name;
  const shopName = document.getElementById('landingShop').options[document.getElementById('landingShop').selectedIndex].text;
  document.getElementById('formShop').textContent = shopName;

  // Set defaults
  const now = new Date();
  const localISO = now.toISOString().slice(0, 16);
  document.getElementById('fVisitDatetime').value = localISO;
  document.getElementById('fSignatureSupervisor').value = selectedSupervisor.name;
  document.getElementById('fSignatureDate').value = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

  // Auto-fill channel/zone from shop data
  fetch(`${API}/api/store/${encodeURIComponent(shopCode)}`)
    .then(r => r.json())
    .then(data => {
      if (data.store) {
        const s = data.store;
        document.getElementById('fChannelZone').value = `${s.channel_lv1 || ''} / ${s.channel_lv2 || ''} / ${s.region || ''}`;
      }
    })
    .catch(() => {});

  showPage('pageForm');
  window.scrollTo(0, 0);
  document.getElementById('headerTitle').textContent = 'แบบตรวจเยี่ยม';
  document.getElementById('headerBtn').style.display = 'block';
}

// ========== Conditional Fields ==========
function resetConditionalFields() {
  ['trainingReasonGroup', 'popMissingGroup', 'assetIssueGroup', 'schematicIssueGroup',
   'priceTagIssueGroup', 'otherIssueGroup', 'gmNotMetGroup'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
}

function toggleTrainingReason() {
  document.getElementById('trainingReasonGroup').style.display =
    document.querySelector('input[name="trainingStatus"]:checked')?.value === 'not_done' ? 'block' : 'none';
}

function togglePopMissing() {
  document.getElementById('popMissingGroup').style.display =
    document.querySelector('input[name="pop"]:checked')?.value === 'ไม่ครบ' ? 'block' : 'none';
}

function toggleAssetIssue() {
  document.getElementById('assetIssueGroup').style.display =
    document.querySelector('input[name="asset"]:checked')?.value === 'พบเฟอร์นิเจอร์ชำรุด' ? 'block' : 'none';
}

function toggleSchematicIssue() {
  document.getElementById('schematicIssueGroup').style.display =
    document.querySelector('input[name="schematic"]:checked')?.value === 'ไม่เรียบร้อย' ? 'block' : 'none';
}

function togglePriceTagIssue() {
  document.getElementById('priceTagIssueGroup').style.display =
    document.querySelector('input[name="priceTag"]:checked')?.value === 'ไม่ถูกต้อง' ? 'block' : 'none';
}

function toggleOtherIssue() {
  document.getElementById('otherIssueGroup').style.display =
    document.querySelector('#issueCheckboxes input[value="อื่นๆ"]')?.checked ? 'block' : 'none';
}

function toggleGmMet() {
  document.getElementById('gmNotMetGroup').style.display =
    document.querySelector('input[name="gmMet"]:checked')?.value === 'ไม่ได้เข้าพบ' ? 'block' : 'none';
}

// ========== Staff Rows ==========
function addCompetitorStaff() {
  const container = document.getElementById('staffRows');
  const idx = container.children.length;
  const div = document.createElement('div');
  div.className = 'staff-row';
  div.innerHTML = `
    <div class="staff-row-header">
      คู่แข่ง ${idx}
      <button type="button" class="btn-icon" onclick="this.closest('.staff-row').remove()" style="float:right">✕</button>
    </div>
    <div class="staff-fields">
      <div class="staff-field">
        <label>Brand name</label>
        <input type="text" class="staff-brand" data-brand="competitor" placeholder="ชื่อแบรนด์">
      </div>
      <div class="staff-field">
        <label>PC</label>
        <input type="number" min="0" class="staff-pc" value="0">
      </div>
      <div class="staff-field">
        <label>Promoter/ME</label>
        <input type="number" min="0" class="staff-me" value="0">
      </div>
      <div class="staff-field staff-field-wide">
        <label>Part-time / หมายเหตุ</label>
        <input type="text" class="staff-pt">
      </div>
    </div>
  `;
  container.appendChild(div);
}

// ========== Sales Helper ==========
function calcAch() {
  const target = parseFloat(document.getElementById('fHaierTarget').value) || 0;
  const current = parseFloat(document.getElementById('fHaierCurrent').value) || 0;
  const ach = target > 0 ? ((current / target) * 100).toFixed(1) : '0.0';
  document.getElementById('fHaierAch').value = `${ach}%`;
}

function addCompetitorSalesRow() {
  const container = document.getElementById('competitorSalesRows');
  const div = document.createElement('div');
  div.className = 'competitor-sales-row';
  div.innerHTML = `
    <input type="text" class="comp-brand" placeholder="Brand name">
    <input type="number" min="0" class="comp-target" placeholder="Target">
    <input type="number" min="0" class="comp-current" placeholder="ยอดปัจจุบัน">
    <input type="text" class="comp-note" placeholder="สินค้าที่ขายดี/สาเหตุ">
    <button type="button" class="btn-icon" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(div);
}

// ========== Photo Upload ==========
function handlePhotoUpload(input, catKey) {
  const files = Array.from(input.files);
  if (!photos[catKey]) photos[catKey] = [];
  photos[catKey] = photos[catKey].concat(files);

  renderPhotoPreviews(catKey);
  input.value = ''; // reset so same file can be re-added
}

function renderPhotoPreviews(catKey) {
  const container = document.getElementById(`preview-${catKey}`);
  container.innerHTML = '';
  (photos[catKey] || []).forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.innerHTML = `
      <img src="${url}" alt="photo">
      <button class="thumb-remove" onclick="removePhoto('${catKey}', ${idx})">✕</button>
    `;
    container.appendChild(thumb);
  });
}

function removePhoto(catKey, idx) {
  if (photos[catKey]) {
    photos[catKey].splice(idx, 1);
    renderPhotoPreviews(catKey);
  }
}

// ========== Form Submit ==========
async function submitVisit(event) {
  event.preventDefault();
  if (!selectedSupervisor || !selectedShop) {
    showToast('กรุณาเลือก Supervisor และร้านค้า', 'error');
    return;
  }

  // Gather form data
  const formJson = {
    header: {
      channel_zone: document.getElementById('fChannelZone').value,
      visit_datetime: document.getElementById('fVisitDatetime').value,
      pc_name: document.getElementById('fPcName').value,
      note: document.getElementById('fNote').value,
    },
    section1: {
      staff: collectStaffData(),
      training: {
        topic: document.getElementById('fTrainingTopic').value,
        status: document.querySelector('input[name="trainingStatus"]:checked')?.value || '',
        reason: document.getElementById('fTrainingReason').value,
        outcome: document.getElementById('fTrainingOutcome').value,
      },
    },
    section2: {
      total_target: parseFloat(document.getElementById('fSalesTotalTarget').value) || 0,
      total_current: parseFloat(document.getElementById('fSalesTotalCurrent').value) || 0,
      haier_target: parseFloat(document.getElementById('fHaierTarget').value) || 0,
      haier_current: parseFloat(document.getElementById('fHaierCurrent').value) || 0,
      haier_ach: document.getElementById('fHaierAch').value,
      competitors: collectCompetitorSales(),
    },
    section3: {
      product_count: {
        ac: parseInt(document.getElementById('fProdAC').value) || 0,
        rf: parseInt(document.getElementById('fProdRF').value) || 0,
        wm: parseInt(document.getElementById('fProdWM').value) || 0,
        fz: parseInt(document.getElementById('fProdFZ').value) || 0,
        tv: parseInt(document.getElementById('fProdTV').value) || 0,
      },
      cleanliness: document.querySelector('input[name="cleanliness"]:checked')?.value || '',
      pop: {
        status: document.querySelector('input[name="pop"]:checked')?.value || '',
        missing: document.getElementById('fPopMissing').value,
      },
      asset: {
        status: document.querySelector('input[name="asset"]:checked')?.value || '',
        issue: document.getElementById('fAssetIssue').value,
      },
      schematic: {
        status: document.querySelector('input[name="schematic"]:checked')?.value || '',
        issue: document.getElementById('fSchematicIssue').value,
      },
      price_tag: {
        status: document.querySelector('input[name="priceTag"]:checked')?.value || '',
        issue: document.getElementById('fPriceTagIssue').value,
      },
    },
    section4: {
      competitor_promo: document.getElementById('fCompPromo').value,
      competitor_activity: document.getElementById('fCompActivity').value,
      main_issues: collectMainIssues(),
      issue_detail: document.getElementById('fIssueDetail').value,
      cause: document.getElementById('fCause').value,
      solution: document.getElementById('fSolution').value,
      responsible: document.getElementById('fResponsible').value,
    },
    section5: {
      met: document.querySelector('input[name="gmMet"]:checked')?.value || '',
      not_met_reason: document.getElementById('fGmNotMetReason').value,
      name: document.getElementById('fGmName').value,
      position: document.getElementById('fGmPosition').value,
      feedback: document.getElementById('fGmFeedback').value,
      support: document.getElementById('fGmSupport').value,
    },
    section6: {
      haier_trend: document.querySelector('input[name="haierTrend"]:checked')?.value || '',
      store_situation: document.querySelector('input[name="storeSituation"]:checked')?.value || '',
      key_finding: document.getElementById('fKeyFinding').value,
      opportunity: document.getElementById('fOpportunity').value,
      follow_up: document.getElementById('fFollowUp').value,
    },
    signature: {
      supervisor: document.getElementById('fSignatureSupervisor').value,
      date: document.getElementById('fSignatureDate').value,
      gm: document.getElementById('fSignatureGm').value,
    },
  };

  showLoading(true);

  try {
    // Submit the visit
    const body = {
      supervisor_id: selectedSupervisor.id,
      customer_code: selectedCustomer,
      shop_code: selectedShop,
      channel_zone: document.getElementById('fChannelZone').value,
      pc_name_at_store: document.getElementById('fPcName').value,
      visit_datetime: document.getElementById('fVisitDatetime').value,
      note: document.getElementById('fNote').value,
      form_json: formJson,
    };

    const res = await fetch(`${API}/api/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.error) {
      showToast('ส่งข้อมูลไม่สำเร็จ: ' + data.error, 'error');
      showLoading(false);
      return;
    }

    const visitId = data.id;

    // Upload photos if any
    let photoCount = 0;
    const categoryNames = ['cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6'];
    for (const catKey of categoryNames) {
      const files = photos[catKey] || [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('visit_id', visitId);
        formData.append('category', catKey);
        try {
          await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
          photoCount++;
        } catch (e) {
          console.error('Photo upload failed:', e);
        }
      }
    }

    // Show confirmation
    document.getElementById('confirmDetails').innerHTML = `
      <p>รหัส: ${visitId.slice(0, 8)}...</p>
      <p>รูปภาพ: ${photoCount} รูป</p>
    `;
    showPage('pageConfirmation');
    document.getElementById('headerTitle').textContent = 'ส่งข้อมูลเรียบร้อย';
    document.getElementById('headerBtn').style.display = 'block';
  } catch (err) {
    console.error('Submit failed:', err);
    showToast('ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่', 'error');
  } finally {
    showLoading(false);
  }
}

function collectStaffData() {
  const rows = [];
  document.querySelectorAll('.staff-row').forEach(row => {
    const brand = row.querySelector('.staff-brand')?.value || 'Haier';
    const pc = parseInt(row.querySelector('.staff-pc')?.value) || 0;
    const me = parseInt(row.querySelector('.staff-me')?.value) || 0;
    const pt = row.querySelector('.staff-pt')?.value || '';
    rows.push({ brand, pc, me, part_time: pt });
  });
  return rows;
}

function collectCompetitorSales() {
  const rows = [];
  document.querySelectorAll('.competitor-sales-row').forEach(row => {
    const brand = row.querySelector('.comp-brand')?.value || '';
    const target = parseFloat(row.querySelector('.comp-target')?.value) || 0;
    const current = parseFloat(row.querySelector('.comp-current')?.value) || 0;
    const note = row.querySelector('.comp-note')?.value || '';
    if (brand) rows.push({ brand, target, current, note });
  });
  return rows;
}

function collectMainIssues() {
  const issues = [];
  document.querySelectorAll('#issueCheckboxes input[type="checkbox"]:checked').forEach(cb => {
    if (cb.value === 'อื่นๆ') {
      issues.push(document.getElementById('fOtherIssue').value || 'อื่นๆ');
    } else {
      issues.push(cb.value);
    }
  });
  return issues;
}

// ========== My Submissions ==========
async function showMySubmissions() {
  showPage('pageMySubmissions');
  document.getElementById('headerTitle').textContent = 'ผลการตรวจของฉัน';
  document.getElementById('headerBtn').style.display = 'block';
  await loadMySubmissions();
}

async function loadMySubmissions() {
  if (!selectedSupervisor) {
    // Ask for supervisor selection
    const supSelect = document.getElementById('landingSupervisor');
    if (supSelect.value) {
      const id = parseInt(supSelect.value);
      const name = supSelect.options[supSelect.selectedIndex].text;
      selectedSupervisor = { id, name };
    } else {
      document.getElementById('mySubmissionsList').innerHTML =
        '<div class="empty-state">กรุณาเลือกชื่อ PC Supervisor ก่อน</div>';
      return;
    }
  }

  const filter = document.getElementById('mySubmissionsFilter').value;
  const url = `${API}/api/my-visits?supervisor_id=${selectedSupervisor.id}${filter ? '&status=' + filter : ''}`;

  try {
    showLoading(true);
    const res = await fetch(url);
    const data = await res.json();
    const list = document.getElementById('mySubmissionsList');

    if (!data.visits || data.visits.length === 0) {
      list.innerHTML = '<div class="empty-state">ไม่พบผลการตรวจ</div>';
      return;
    }

    list.innerHTML = data.visits.map(v => {
      const statusClass = 'status-' + v.status;
      const statusLabel = { pending: 'รอตรวจ', approved: 'อนุมัติ', rejected: 'ตีกลับ' }[v.status] || v.status;
      return `
        <div class="visit-item">
          <div class="visit-header">
            <span class="visit-store">${v.shop_name || v.shop_code}</span>
            <span class="visit-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="visit-date">${v.customer_name || ''} — ${new Date(v.visit_datetime).toLocaleDateString('th-TH')}</div>
          ${v.status === 'rejected' && v.review_comment ? `<div class="visit-review">⛔ ${v.review_comment}</div>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load submissions:', err);
    showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
  } finally {
    showLoading(false);
  }
}

// ========== Admin ==========
function showAdminLogin() {
  showPage('pageAdminLogin');
  document.getElementById('headerTitle').textContent = 'Admin Login';
  document.getElementById('headerBtn').style.display = 'block';
  document.getElementById('adminPassword').focus();
}

async function adminLogin() {
  const password = document.getElementById('adminPassword').value;
  if (!password) return;

  try {
    showLoading(true);
    const res = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();

    if (data.success) {
      adminToken = data.token;
      localStorage.setItem('adminToken', adminToken);
      showAdminDashboard();
    } else {
      showToast('รหัสผ่านไม่ถูกต้อง', 'error');
    }
  } catch (err) {
    showToast('เข้าสู่ระบบไม่สำเร็จ', 'error');
  } finally {
    showLoading(false);
  }
}

function adminLogout() {
  adminToken = '';
  localStorage.removeItem('adminToken');
  showLanding();
}

async function showAdminDashboard() {
  showPage('pageAdminDashboard');
  document.getElementById('headerTitle').textContent = 'Admin Dashboard';
  document.getElementById('headerBtn').style.display = 'block';
  document.getElementById('headerBtn').textContent = 'ออก';
  await Promise.all([loadAdminStats(), loadAdminVisits(), loadSupervisors()]);
}

async function loadAdminStats() {
  try {
    const res = await fetch(`${API}/api/admin/stats`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    const data = await res.json();

    document.getElementById('adminStats').innerHTML = `
      <div class="stat-card"><div class="stat-number">${data.total || 0}</div><div class="stat-label">ทั้งหมด</div></div>
      <div class="stat-card"><div class="stat-number" style="color:#856404">${data.pending || 0}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card"><div class="stat-number" style="color:#155724">${data.approved || 0}</div><div class="stat-label">Approved</div></div>
      <div class="stat-card"><div class="stat-number" style="color:#721c24">${data.rejected || 0}</div><div class="stat-label">Rejected</div></div>
    `;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadAdminVisits() {
  const status = document.getElementById('adminFilterStatus').value;
  const dateFrom = document.getElementById('adminFilterDateFrom').value;
  const dateTo = document.getElementById('adminFilterDateTo').value;

  let url = `${API}/api/admin/visits?limit=100`;
  if (status) url += '&status=' + status;
  if (dateFrom) url += '&date_from=' + dateFrom;
  if (dateTo) url += '&date_to=' + dateTo;

  try {
    const res = await fetch(url, { headers: { 'X-Admin-Token': adminToken } });
    const data = await res.json();

    if (!data.visits || data.visits.length === 0) {
      document.getElementById('adminVisitsTable').innerHTML = '<div class="empty-state">ไม่พบข้อมูล</div>';
      return;
    }

    const table = document.getElementById('adminVisitsTable');
    table.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>วันที่</th>
            <th>Supervisor</th>
            <th>ร้านค้า</th>
            <th>Customer</th>
            <th>สถานะ</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${data.visits.map(v => {
            const statusClass = 'status-' + v.status;
            const statusLabel = { pending: 'รอตรวจ', approved: 'อนุมัติ', rejected: 'ตีกลับ' }[v.status] || v.status;
            return `
              <tr>
                <td>${new Date(v.visit_datetime).toLocaleDateString('th-TH')}</td>
                <td>${v.supervisor_name || '—'}</td>
                <td>${v.shop_name || v.shop_code}</td>
                <td>${v.customer_name || '—'}</td>
                <td><span class="visit-status ${statusClass}">${statusLabel}</span></td>
                <td><button class="btn btn-sm btn-outline" onclick="showAdminVisitDetail('${v.id}')">ดู</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Failed to load visits:', err);
  }
}

async function showAdminVisitDetail(id) {
  try {
    showLoading(true);
    const res = await fetch(`${API}/api/admin/visits/${id}`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    const data = await res.json();
    const v = data.visit;

    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    showPage('pageAdminVisitDetail');
    document.getElementById('headerTitle').textContent = 'Visit Detail';

    const fj = v.form_json || {};
    const html = `
      <div class="visit-detail-card">
        <h3>ข้อมูลทั่วไป</h3>
        <div class="detail-row"><span class="detail-label">Supervisor:</span><span class="detail-value">${v.supervisor_name}</span></div>
        <div class="detail-row"><span class="detail-label">ร้านค้า:</span><span class="detail-value">${v.shop_name} (${v.shop_code})</span></div>
        <div class="detail-row"><span class="detail-label">Customer:</span><span class="detail-value">${v.customer_name}</span></div>
        <div class="detail-row"><span class="detail-label">วันที่:</span><span class="detail-value">${new Date(v.visit_datetime).toLocaleString('th-TH')}</span></div>
        <div class="detail-row"><span class="detail-label">สถานะ:</span><span class="detail-value">${v.status}</span></div>
        <div class="detail-row"><span class="detail-label">Revision:</span><span class="detail-value">${v.revision_count}</span></div>
      </div>

      ${fj.section2 ? `
      <div class="visit-detail-card">
        <h3>ยอดขาย</h3>
        <div class="detail-row"><span class="detail-label">รวม Target:</span><span class="detail-value">${(fj.section2.total_target || 0).toLocaleString()} บาท</span></div>
        <div class="detail-row"><span class="detail-label">รวม ปัจจุบัน:</span><span class="detail-value">${(fj.section2.total_current || 0).toLocaleString()} บาท</span></div>
        <div class="detail-row"><span class="detail-label">Haier Target:</span><span class="detail-value">${(fj.section2.haier_target || 0).toLocaleString()} บาท</span></div>
        <div class="detail-row"><span class="detail-label">Haier ปัจจุบัน:</span><span class="detail-value">${(fj.section2.haier_current || 0).toLocaleString()} บาท</span></div>
        <div class="detail-row"><span class="detail-label">%Ach.:</span><span class="detail-value">${fj.section2.haier_ach || '0.0%'}</span></div>
      </div>
      ` : ''}

      ${fj.section6 ? `
      <div class="visit-detail-card">
        <h3>สรุปภาพรวม</h3>
        <div class="detail-row"><span class="detail-label">แนวโน้ม:</span><span class="detail-value">${fj.section6.haier_trend || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">สถานการณ์:</span><span class="detail-value">${fj.section6.store_situation || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Key Finding:</span><span class="detail-value">${fj.section6.key_finding || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Action:</span><span class="detail-value">${fj.section6.opportunity || '—'}</span></div>
      </div>
      ` : ''}

      ${data.photos && data.photos.length > 0 ? `
      <div class="visit-detail-card">
        <h3>รูปภาพ (${data.photos.length})</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${data.photos.map(p => `<img src="${p.r2_key}" alt="photo" style="width:80px;height:80px;object-fit:cover;border-radius:4px">`).join('')}
        </div>
      </div>
      ` : ''}

      <div class="review-actions">
        <button class="btn btn-primary" onclick="reviewVisit('${id}', 'approved')">อนุมัติ</button>
        <button class="btn btn-outline" onclick="promptReject('${id}')">ตีกลับ</button>
      </div>
    `;

    document.getElementById('adminVisitDetail').innerHTML = html;
  } catch (err) {
    console.error('Failed to load visit detail:', err);
    showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
  } finally {
    showLoading(false);
  }
}

function promptReject(id) {
  const comment = prompt('ระบุเหตุผลที่ตีกลับ:');
  if (comment) {
    reviewVisit(id, 'rejected', comment);
  }
}

async function reviewVisit(id, status, comment) {
  try {
    const res = await fetch(`${API}/api/admin/visits/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ status, review_comment: comment || '' }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast(status === 'approved' ? 'อนุมัติเรียบร้อย' : 'ตีกลับเรียบร้อย', 'success');
      backToAdmin();
    }
  } catch (err) {
    showToast('ดำเนินการไม่สำเร็จ', 'error');
  }
}

function backToAdmin() {
  showAdminDashboard();
}

function exportAdminCSV() {
  const status = document.getElementById('adminFilterStatus').value;
  let url = `${API}/api/admin/export`;
  if (status) url += '?status=' + status;

  window.open(url + '&token=' + adminToken, '_blank');
}

// Switch admin tabs
function switchAdminTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');

  document.querySelector(`.tab-btn[onclick*="${tab}"]`).classList.add('active');
  document.getElementById(`adminTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).style.display = 'block';

  if (tab === 'stores') loadAdminStores();
}

async function loadSupervisors() {
  try {
    const res = await fetch(`${API}/api/supervisors`);
    const data = await res.json();
    const list = document.getElementById('supervisorList');
    list.innerHTML = (data.supervisors || []).map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-100)">
        <span>${s.name}</span>
        <button class="btn btn-sm btn-outline" onclick="deleteSupervisor(${s.id})">ลบ</button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load supervisors:', err);
  }
}

async function addSupervisor() {
  const name = document.getElementById('newSupervisorName').value.trim();
  if (!name) return;

  try {
    const res = await fetch(`${API}/api/admin/supervisors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      document.getElementById('newSupervisorName').value = '';
      showToast('เพิ่มเรียบร้อย', 'success');
      loadSupervisors();
      loadLandingData();
    }
  } catch (err) {
    showToast('เพิ่มไม่สำเร็จ', 'error');
  }
}

async function deleteSupervisor(id) {
  if (!confirm('ลบ Supervisor นี้?')) return;
  try {
    await fetch(`${API}/api/admin/supervisors/${id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': adminToken },
    });
    showToast('ลบเรียบร้อย', 'success');
    loadSupervisors();
    loadLandingData();
  } catch (err) {
    showToast('ลบไม่สำเร็จ', 'error');
  }
}

async function loadAdminStores() {
  try {
    const res = await fetch(`${API}/api/stores`, { headers: { 'X-Admin-Token': adminToken } });
    const data = await res.json();
    const stores = data.stores || [];
    const table = document.getElementById('adminStoreTable');
    table.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Shop Code</th>
            <th>Shop Name</th>
            <th>Customer</th>
            <th>Region</th>
            <th>Channel Lv1</th>
            <th>Channel Lv2</th>
          </tr>
        </thead>
        <tbody>
          ${stores.slice(0, 50).map(s => `
            <tr>
              <td>${s.shop_code}</td>
              <td>${s.shop_name}</td>
              <td>${s.customer_code}</td>
              <td>${s.region || '—'}</td>
              <td>${s.channel_lv1 || '—'}</td>
              <td>${s.channel_lv2 || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${stores.length > 50 ? `<p style="font-size:13px;color:gray;margin-top:4px">แสดง 50 จาก ${stores.length} ร้าน</p>` : ''}
    `;
  } catch (err) {
    console.error('Failed to load stores:', err);
  }
}

async function importCSV() {
  const fileInput = document.getElementById('csvImportFile');
  if (!fileInput.files[0]) {
    showToast('กรุณาเลือกไฟล์ CSV', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    showLoading(true);
    const res = await fetch(`${API}/api/admin/import-csv`, {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken },
      body: formData,
    });
    const data = await res.json();
    document.getElementById('importResult').innerHTML = `
      <div style="padding:12px;background:var(--success);color:white;border-radius:var(--radius);margin-top:8px">
        ✅ นำเข้า ${data.imported} รายการเรียบร้อย
      </div>
    `;
    loadAdminStores();
  } catch (err) {
    showToast('นำเข้าไม่สำเร็จ', 'error');
  } finally {
    showLoading(false);
  }
}

// ========== Navigation helpers ==========
function showLanding() {
  showPage('pageLanding');
  document.getElementById('headerTitle').textContent = 'Store Visit Checklist';
  document.getElementById('headerBtn').style.display = 'none';
  loadLandingData();
}

function resetToLanding() {
  showLanding();
}

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  showLanding();

  // Check for auto-login
  if (adminToken) {
    // Optionally verify token is still valid
  }

  // Listen for shop dropdown change
  document.getElementById('landingShop').addEventListener('change', checkStartEnabled);
});