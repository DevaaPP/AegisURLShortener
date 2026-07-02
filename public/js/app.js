/* ==========================================================================
   AegisURL Frontend Controller (Client-Side Single-Page SaaS Engine)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // ========================================================================
  // BULLETPROOF SESSION STORAGE WRAPPER
  // ========================================================================
  const safeStorage = {
    inMemory: {},
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return this.inMemory[key] || null;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        this.inMemory[key] = value;
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        delete this.inMemory[key];
      }
    }
  };

  const getSafeJSON = (key) => {
    const val = safeStorage.getItem(key);
    if (!val || val === 'undefined' || val === 'null') return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  };

  // ========================================================================
  // GLOBAL APPLICATION STATE
  // ========================================================================
  const state = {
    token: safeStorage.getItem('token') === 'undefined' ? null : safeStorage.getItem('token'),
    user: getSafeJSON('user'),
    activeSection: 'shorten-section',
    charts: {
      timeline: null,
      device: null,
      browser: null
    }
  };

  // ========================================================================
  // SELECT DOM ELEMENTS
  // ========================================================================
  const sections = document.querySelectorAll('.app-section');
  const navLinks = document.querySelectorAll('.nav-link');
  const navDashboard = document.getElementById('nav-dashboard');
  const navAuth = document.getElementById('nav-auth');
  const userProfile = document.getElementById('user-profile');
  const userEmailSpan = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  const shortenForm = document.getElementById('shorten-form');
  const errorAlert = document.getElementById('error-alert');
  const errorMessage = document.getElementById('error-message');
  const resultBox = document.getElementById('result-box');
  const shortenedUrlInput = document.getElementById('shortened-url');
  const copyBtn = document.getElementById('copy-btn');
  const qrCodeImage = document.getElementById('qr-code-image');
  const anonSignupPrompt = document.getElementById('anon-signup-prompt');
  const heroAuthCtas = document.getElementById('hero-auth-ctas');

  const authAlert = document.getElementById('auth-alert');
  const authErrorMessage = document.getElementById('auth-error-message');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  const apiKeyDisplay = document.getElementById('api-key-display');
  const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
  const copyKeyBtn = document.getElementById('copy-key-btn');
  const refreshLinksBtn = document.getElementById('refresh-links-btn');
  const linksTableBody = document.getElementById('links-table-body');
  const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');

  const tabShorten = document.getElementById('tab-shorten');
  const tabApi = document.getElementById('tab-api');
  const shortenFormTab = document.getElementById('shorten-form-tab');
  const terminalTab = document.getElementById('terminal-tab');

  const targetUrlInput = document.getElementById('target-url');
  const customCodeInput = document.getElementById('custom-code');
  const expiresInSelect = document.getElementById('expires-in');
  const singleUseCheckbox = document.getElementById('single-use');

  const termUrl = document.getElementById('term-url');
  const termCustomComma = document.getElementById('term-custom-comma');
  const termCustom = document.getElementById('term-custom');
  const termExpiryComma = document.getElementById('term-expiry-comma');
  const termExpiry = document.getElementById('term-expiry');
  const termSingleComma = document.getElementById('term-single-comma');
  const termSingle = document.getElementById('term-single');

  // ========================================================================
  // TOAST FEEDBACK NOTIFICATION SYSTEM
  // ========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast`;
    
    let icon = '<i class="fa-solid fa-circle-info text-indigo-400"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark text-rose-400"></i>';
    if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.2s ease-out forwards';
      setTimeout(() => {
        toast.remove();
      }, 200);
    }, 3000);
  }

  // ========================================================================
  // SPA ROUTING & VIEW CONTROLLER
  // ========================================================================
  function handleNavigation() {
    const hash = window.location.hash || '#shorten-section';
    const targetSectionId = hash.split('?')[0].substring(1);
    
    const targetSection = document.getElementById(targetSectionId);
    if (!targetSection) return;

    // Route guards
    if ((targetSectionId === 'dashboard-section' || targetSectionId === 'analytics-section') && !state.token) {
      window.location.hash = '#auth-section';
      showToast('Authentication required to access dashboard.', 'warning');
      return;
    }

    // Toggle Section visibility
    sections.forEach(section => {
      section.classList.remove('active');
    });
    targetSection.classList.add('active');

    // Update active nav highlights
    navLinks.forEach(link => {
      link.classList.remove('active-nav');
      if (link.getAttribute('href') === `#${targetSectionId}`) {
        link.classList.add('active-nav');
      }
    });

    state.activeSection = targetSectionId;
    mobileMenu.classList.add('hidden'); // Close menu on nav

    if (targetSectionId === 'dashboard-section') {
      loadDashboard();
    }
  }

  // Bind navigation links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href.startsWith('#')) {
        e.preventDefault();
        window.location.hash = href;
      }
    });
  });

  // Mobile menu toggle
  mobileMenuToggle.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
  });

  // ========================================================================
  // SESSION AUTH STATE UI UPDATER
  // ========================================================================
  function updateAuthUI() {
    const isAnon = safeStorage.getItem('is_anonymous') === 'true';

    if (state.token && state.user && !isAnon) {
      // Logged in normal user
      navAuth.classList.add('hidden');
      navDashboard.classList.remove('hidden');
      userProfile.classList.remove('hidden');
      userEmailSpan.textContent = state.user.email;
      heroAuthCtas.classList.add('hidden');
      if (state.user.apiKey) {
        apiKeyDisplay.value = state.user.apiKey;
      }
    } else {
      // Logged out or Anonymous session
      navAuth.classList.remove('hidden');
      navDashboard.classList.add('hidden');
      userProfile.classList.add('hidden');
      heroAuthCtas.classList.remove('hidden');
      apiKeyDisplay.value = '';
    }
  }

  logoutBtn.addEventListener('click', () => {
    safeStorage.removeItem('token');
    safeStorage.removeItem('user');
    safeStorage.removeItem('is_anonymous');
    state.token = null;
    state.user = null;
    updateAuthUI();
    showToast('Signed out successfully.', 'success');
    window.location.hash = '#shorten-section';
  });

  // ========================================================================
  // CARD TAB TOGGLING
  // ========================================================================
  if (tabShorten && tabApi) {
    tabShorten.addEventListener('click', () => {
      tabShorten.classList.add('active', 'bg-slate-900', 'border-brand-border', 'text-white');
      tabShorten.classList.remove('text-slate-400');
      tabApi.classList.remove('active', 'bg-slate-900', 'border-brand-border', 'text-white');
      tabApi.classList.add('text-slate-400');
      
      shortenFormTab.classList.remove('hidden');
      terminalTab.classList.add('hidden');
    });

    tabApi.addEventListener('click', () => {
      tabApi.classList.add('active', 'bg-slate-900', 'border-brand-border', 'text-white');
      tabApi.classList.remove('text-slate-400');
      tabShorten.classList.remove('active', 'bg-slate-900', 'border-brand-border', 'text-white');
      tabShorten.classList.add('text-slate-400');
      
      terminalTab.classList.remove('hidden');
      shortenFormTab.classList.add('hidden');
    });
  }

  // ========================================================================
  // INTERACTIVE API CURL GENERATOR
  // ========================================================================
  function updateApiRequestTerminal() {
    if (!termUrl) return;
    
    const urlVal = targetUrlInput.value || 'https://your-long-sensitive-link.com/with-parameters';
    termUrl.textContent = `"${urlVal}"`;

    const customVal = customCodeInput.value.trim();
    if (customVal) {
      termCustomComma.textContent = ',\n    ';
      termCustom.innerHTML = `<span class="key">"customCode"</span>: <span class="str">"${customVal}"</span>`;
    } else {
      termCustomComma.textContent = '';
      termCustom.innerHTML = '';
    }

    const expiryVal = expiresInSelect.value;
    if (expiryVal) {
      termExpiryComma.textContent = ',\n    ';
      termExpiry.innerHTML = `<span class="key">"expiresInSecs"</span>: <span class="val">${expiryVal}</span>`;
    } else {
      termExpiryComma.textContent = '';
      termExpiry.innerHTML = '';
    }

    const singleVal = singleUseCheckbox.checked;
    if (singleVal) {
      termSingleComma.textContent = ',\n    ';
      termSingle.innerHTML = `<span class="key">"allowSingleUse"</span>: <span class="val">true</span>`;
    } else {
      termSingleComma.textContent = '';
      termSingle.innerHTML = '';
    }
  }

  [targetUrlInput, customCodeInput, expiresInSelect, singleUseCheckbox].forEach(el => {
    if (el) {
      el.addEventListener('input', updateApiRequestTerminal);
      el.addEventListener('change', updateApiRequestTerminal);
    }
  });

  // ========================================================================
  // FAQS ACCORDION ENGINE
  // ========================================================================
  document.querySelectorAll('.faq-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      const icon = btn.querySelector('.fa-chevron-down');
      
      content.classList.toggle('open');
      
      if (content.classList.contains('open')) {
        icon.style.transform = 'rotate(180deg)';
      } else {
        icon.style.transform = 'rotate(0deg)';
      }
    });
  });

  // ========================================================================
  // PUBLIC LIVE DEMO / ANONYMOUS SESSION BUILDER
  // ========================================================================
  async function registerAnonymousSession() {
    const randomId = Math.floor(Math.random() * 1000000);
    const email = `anon-${randomId}@aegisurl.demo`;
    const password = `DemoSecretPass_${randomId}_$`;

    // 1. Create anonymous database record
    const regResp = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!regResp.ok) throw new Error('Registration failed for anonymous session.');

    // 2. Authorize token
    const loginResp = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await loginResp.json();
    if (!loginResp.ok) throw new Error('Failed to authorize anonymous session.');

    // Save as anonymous state
    safeStorage.setItem('token', data.token);
    safeStorage.setItem('user', JSON.stringify(data.user));
    safeStorage.setItem('is_anonymous', 'true');
    state.token = data.token;
    state.user = data.user;
  }

  // ========================================================================
  // CORE URL SHORTENING OPERATION
  // ========================================================================
  shortenForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAlert.classList.add('hidden');
    resultBox.classList.add('hidden');
    anonSignupPrompt.classList.add('hidden');

    // UI Loading state
    const submitBtn = document.getElementById('shorten-submit');
    const btnText = document.getElementById('shorten-btn-text');
    const spinner = document.getElementById('shorten-spinner');
    const arrow = document.getElementById('shorten-arrow');

    btnText.textContent = 'Securing Redirection...';
    spinner.classList.remove('hidden');
    arrow.classList.add('hidden');
    submitBtn.disabled = true;

    const targetUrl = targetUrlInput.value;
    const customCode = customCodeInput.value.trim();
    const expiresInSecs = expiresInSelect.value;
    const allowSingleUse = singleUseCheckbox.checked;

    try {
      // If user has no token, spin up an anonymous demo session instantly
      if (!state.token) {
        await registerAnonymousSession();
      }

      const response = await fetch('/api/v1/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          targetUrl,
          customCode: customCode || undefined,
          expiresInSecs: expiresInSecs || undefined,
          allowSingleUse
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Redirection generation failed.');
      }

      // Display short link
      shortenedUrlInput.value = data.short_url;
      qrCodeImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.short_url)}`;
      resultBox.classList.remove('hidden');
      
      // If anonymous, show the warning panel encouraging sign-up
      if (safeStorage.getItem('is_anonymous') === 'true') {
        anonSignupPrompt.classList.remove('hidden');
      }

      showToast('Link secured successfully!', 'success');
      shortenForm.reset();
      updateApiRequestTerminal();
    } catch (err) {
      errorMessage.textContent = err.message;
      errorAlert.classList.remove('hidden');
      showToast(err.message, 'error');
    } finally {
      btnText.textContent = 'Generate Secure Link';
      spinner.classList.add('hidden');
      arrow.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });

  // Copy button
  copyBtn.addEventListener('click', () => {
    shortenedUrlInput.select();
    shortenedUrlInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(shortenedUrlInput.value);

    const origText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> Copied';
    showToast('Copied to clipboard!', 'success');
    setTimeout(() => {
      copyBtn.innerHTML = origText;
    }, 2000);
  });

  // ========================================================================
  // DEV PORTAL AUTHENTICATION HANDLERS
  // ========================================================================
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active', 'bg-slate-900', 'border-brand-border', 'text-white');
    tabLogin.classList.remove('text-slate-400');
    tabRegister.classList.remove('active', 'bg-slate-900', 'border-brand-border', 'text-white');
    tabRegister.classList.add('text-slate-400');
    
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    authAlert.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active', 'bg-slate-900', 'border-brand-border', 'text-white');
    tabRegister.classList.remove('text-slate-400');
    tabLogin.classList.remove('active', 'bg-slate-900', 'border-brand-border', 'text-white');
    tabLogin.classList.add('text-slate-400');
    
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    authAlert.classList.add('hidden');
  });

  // Login execution
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authAlert.classList.add('hidden');
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || data.message || 'Login credentials incorrect.');

      // Clear any previous demo state
      safeStorage.removeItem('is_anonymous');

      safeStorage.setItem('token', data.token);
      safeStorage.setItem('user', JSON.stringify(data.user));
      state.token = data.token;
      state.user = data.user;
      
      updateAuthUI();
      showToast('Welcome back, Developer!', 'success');
      window.location.hash = '#dashboard-section';
      loginForm.reset();
    } catch (err) {
      authErrorMessage.textContent = err.message;
      authAlert.classList.remove('hidden');
      showToast(err.message, 'error');
    }
  });

  // Register execution
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authAlert.classList.add('hidden');
    
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || 'Registration failed.');

      // Auto login
      const loginResp = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const loginData = await loginResp.json();

      if (!loginResp.ok) throw new Error(loginData.error || 'Failed to auto-authenticate new account.');

      safeStorage.removeItem('is_anonymous');
      safeStorage.setItem('token', loginData.token);
      safeStorage.setItem('user', JSON.stringify(loginData.user));
      state.token = loginData.token;
      state.user = loginData.user;

      updateAuthUI();
      showToast('Developer account established successfully!', 'success');
      window.location.hash = '#dashboard-section';
      registerForm.reset();
    } catch (err) {
      authErrorMessage.textContent = err.message;
      authAlert.classList.remove('hidden');
      showToast(err.message, 'error');
    }
  });

  // ========================================================================
  // DEVELOPER DASHBOARD METRICS & INVENTORY
  // ========================================================================
  async function loadDashboard() {
    linksTableBody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-slate-500">Loading links...</td></tr>';
    
    try {
      const response = await fetch('/api/v1/links', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (!response.ok) throw new Error('Authorization expired.');

      const data = await response.json();
      
      if (data.links.length === 0) {
        linksTableBody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-slate-500">No shortcodes configured. Start by shortening a link!</td></tr>';
        return;
      }

      linksTableBody.innerHTML = '';
      data.links.forEach(link => {
        const shortUrl = `${window.location.protocol}//${window.location.host}/${link.short_code}`;
        const createdDate = new Date(link.created_at).toLocaleDateString();
        
        let expiry = '<span class="text-slate-500">Permanent</span>';
        if (link.expires_at) {
          const expired = new Date(link.expires_at).getTime() < Date.now();
          expiry = expired 
            ? `<span class="badge badge-danger">Expired</span>`
            : new Date(link.expires_at).toLocaleDateString();
        }
        if (link.allow_single_use) {
          expiry = `<span class="badge badge-info"><i class="fa-solid fa-bolt-lightning text-amber-400"></i> Single-Use</span>`;
        }

        const activeStatus = link.is_active ? '' : ' opacity-40 line-through';

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-900/40 transition-colors';
        row.innerHTML = `
          <td class="py-3 px-4 font-mono font-bold text-indigo-300${activeStatus}"><a href="${shortUrl}" target="_blank">${link.short_code}</a></td>
          <td class="py-3 px-4 text-slate-400">${createdDate}</td>
          <td class="py-3 px-4">${expiry}</td>
          <td class="py-3 px-4"><span class="badge badge-secondary">${link.total_clicks} redirections</span></td>
          <td class="py-3 px-4">
            <button class="btn btn-secondary btn-sm analytics-btn flex items-center gap-1" data-code="${link.short_code}">
              <i class="fa-solid fa-chart-simple text-indigo-400"></i> Metrics
            </button>
          </td>
        `;
        linksTableBody.appendChild(row);
      });

      // Bind metrics buttons
      document.querySelectorAll('.analytics-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          window.location.hash = `#analytics-section?code=${code}`;
        });
      });

    } catch (err) {
      console.error(err);
      linksTableBody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-rose-400">Failed to load registry.</td></tr>';
      showToast('Session expired. Please sign in again.', 'error');
    }
  }

  refreshLinksBtn.addEventListener('click', loadDashboard);

  // Toggle API Key visibility
  toggleKeyVisibility.addEventListener('click', () => {
    if (apiKeyDisplay.type === 'password') {
      apiKeyDisplay.type = 'text';
      toggleKeyVisibility.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    } else {
      apiKeyDisplay.type = 'password';
      toggleKeyVisibility.innerHTML = '<i class="fa-solid fa-eye"></i>';
    }
  });

  // Copy API key to clipboard
  copyKeyBtn.addEventListener('click', () => {
    apiKeyDisplay.select();
    navigator.clipboard.writeText(apiKeyDisplay.value);
    showToast('API Key copied to clipboard!', 'success');
  });

  // ========================================================================
  // CLICK ANALYTICS CHARTING & GRAPHS
  // ========================================================================
  async function loadAnalytics(code) {
    document.getElementById('analytics-code-title').textContent = code;

    const geoTableBody = document.getElementById('geo-table-body');
    geoTableBody.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-slate-500">Loading geo metrics...</td></tr>';

    try {
      const response = await fetch(`/api/v1/analytics/${code}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (!response.ok) throw new Error('Authorization expired.');

      const data = await response.json();
      const metrics = data.metrics;

      // Populate geo list
      if (metrics.breakdown.countries.length === 0) {
        geoTableBody.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-slate-500">No clicks registered yet.</td></tr>';
      } else {
        geoTableBody.innerHTML = '';
        metrics.breakdown.countries.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="py-2.5 px-4 font-semibold text-slate-300">${row.country}</td>
            <td class="py-2.5 px-4 text-right"><span class="badge badge-secondary">${row.count} clicks</span></td>
          `;
          geoTableBody.appendChild(tr);
        });
      }

      // Render charts
      renderTimelineChart(metrics.timeline);
      renderPieChart('device-chart', 'device', metrics.breakdown.devices);
      renderPieChart('browser-chart', 'browser', metrics.breakdown.browsers);

    } catch (err) {
      console.error(err);
      showToast('Failed to fetch click metrics.', 'error');
    }
  }

  backToDashboardBtn.addEventListener('click', () => {
    window.location.hash = '#dashboard-section';
  });

  // Timeline chart
  function renderTimelineChart(timelineData) {
    const ctx = document.getElementById('timeline-chart').getContext('2d');
    
    if (state.charts.timeline) {
      state.charts.timeline.destroy();
    }

    const labels = timelineData.map(d => d.date);
    const data = timelineData.map(d => d.count);

    state.charts.timeline = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Redirections',
          data: data,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.05)',
          fill: true,
          tension: 0.35,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#71717a' } },
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#71717a' } }
        }
      }
    });
  }

  // Device/Browser Pie charts
  function renderPieChart(canvasId, chartKey, breakdownData) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    if (state.charts[chartKey]) {
      state.charts[chartKey].destroy();
    }

    const labels = breakdownData.map(d => d[chartKey]);
    const counts = breakdownData.map(d => d.count);

    const colors = ['#6366f1', '#a855f7', '#10b981', '#3b82f6', '#ef4444', '#f59e0b'];

    state.charts[chartKey] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: counts,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'right',
            labels: { color: '#d4d4d8', font: { size: 10 } }
          }
        },
        cutout: '60%'
      }
    });
  }

  // ========================================================================
  // MODAL OVERLAYS ENGINE (LEGAL DOCUMENTS & DOCS MOCKS)
  // ========================================================================
  const modalOverlay = document.getElementById('modal-overlay');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalContent = document.getElementById('modal-content');

  function openModal(contentHtml) {
    modalContent.innerHTML = contentHtml;
    modalOverlay.classList.remove('hidden');
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    modalContent.innerHTML = '';
  }

  modalCloseBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Modal content templates
  const legalTemplates = {
    privacy: `
      <h2 class="text-lg font-bold text-white mb-2 flex items-center gap-1.5"><i class="fa-solid fa-user-shield text-indigo-400"></i> Privacy & Data Policy</h2>
      <p class="text-slate-400 text-xs">Last Updated: July 2026</p>
      <div class="space-y-3 mt-4 text-xs">
        <p>AegisURL is designed with a **privacy-first** approach. We collect click analytics metadata solely to generate statistics for developer dashboards. We do not place cookies on redirect visitors, nor do we build advertising profiles.</p>
        <h3 class="font-semibold text-slate-200 mt-2">1. Data We Collect</h3>
        <p>For redirection analytics, we record: IP Addresses (hashed locally for privacy), User-Agent details (OS, Browser, Device Type), Geolocation (based on Vercel CDN header inputs), and HTTP referrers. We do not correlate click information with personal identities.</p>
        <h3 class="font-semibold text-slate-200 mt-2">2. Data Security</h3>
        <p>All shortened URLs and destination targets are stored on disk inside secure PostgreSQL clusters encrypted using industry-standard **AES-256-GCM** keys to prevent directory data leaks.</p>
      </div>
    `,
    terms: `
      <h2 class="text-lg font-bold text-white mb-2 flex items-center gap-1.5"><i class="fa-solid fa-file-contract text-indigo-400"></i> Terms of Service</h2>
      <p class="text-slate-400 text-xs">Last Updated: July 2026</p>
      <div class="space-y-3 mt-4 text-xs">
        <p>Welcome to AegisURL. By creating short links on our platform, you agree to these service conditions.</p>
        <h3 class="font-semibold text-slate-200 mt-2">1. Acceptable Content</h3>
        <p>You may not shorten URLs that point to illegal content, malware payloads, credential harvesting forms (phishing), or unsolicited commercial message triggers (spam). AegisURL uses Google Safe Browsing and automatically disables flagged items.</p>
        <h3 class="font-semibold text-slate-200 mt-2">2. Rate Limits</h3>
        <p>To ensure fair distribution and avoid server exhaust, public shortening endpoints are limited to 30 requests per minute. Accounts violating these rates programmatically will be throttled.</p>
      </div>
    `,
    cookies: `
      <h2 class="text-lg font-bold text-white mb-2 flex items-center gap-1.5"><i class="fa-solid fa-cookie-bite text-indigo-400"></i> Cookie Policy</h2>
      <p class="text-slate-400 text-xs">Last Updated: July 2026</p>
      <div class="space-y-3 mt-4 text-xs">
        <p>AegisURL utilizes cookies to manage your developer login session on the SaaS dashboard. We **do not** write cookies during user redirection.</p>
        <h3 class="font-semibold text-slate-200 mt-2">1. System Cookies</h3>
        <p>We use temporary tokens (in LocalStorage or secure Session Cookies) to verify your dashboard session. These cookies are essential to display active links and allow access to metrics.</p>
      </div>
    `,
    acceptable: `
      <h2 class="text-lg font-bold text-white mb-2 flex items-center gap-1.5"><i class="fa-solid fa-ban text-indigo-400"></i> Acceptable Use & Abuse Report Policy</h2>
      <p class="text-slate-400 text-xs">Last Updated: July 2026</p>
      <div class="space-y-3 mt-4 text-xs">
        <p>Our platform enforces a strict zero-abuse policy to keep short links safe for users across the internet.</p>
        <h3 class="font-semibold text-slate-200 mt-2">1. Reporting Abuse</h3>
        <p>If you encounter an AegisURL short link pointing to harmful resources (phishing, virus, illegal content), please report it to us immediately via our support center or email ` + "`abuse@aegisurl.com`" + `. Reported links will be reviewed and removed within 12 hours.</p>
      </div>
    `,
    apiDocs: `
      <h2 class="text-lg font-bold text-white mb-2 flex items-center gap-1.5"><i class="fa-solid fa-code text-indigo-400"></i> Developer REST API Specifications</h2>
      <div class="space-y-3 mt-4 text-xs">
        <p>Integrate AegisURL directly into your scripts or backends. Make JSON requests using your Developer API key.</p>
        <h3 class="font-semibold text-slate-200 mt-2">Headers Required:</h3>
        <pre class="bg-black/60 p-2.5 rounded font-mono border border-brand-border text-slate-300">
X-API-Key: &lt;YOUR_API_KEY&gt;
Content-Type: application/json</pre>
        <h3 class="font-semibold text-slate-200 mt-2">1. Shorten Link Endpoint</h3>
        <pre class="bg-black/60 p-2.5 rounded font-mono border border-brand-border text-indigo-300">
POST /api/v1/shorten</pre>
        <p class="text-slate-400 font-bold">Request Body JSON Schema:</p>
        <pre class="bg-black/60 p-2.5 rounded font-mono border border-brand-border text-slate-300">
{
  "targetUrl": "https://dest.com",
  "customCode": "optional_alias",
  "expiresInSecs": 86400,
  "allowSingleUse": false
}</pre>
        <p class="text-slate-400 font-bold">Successful Response JSON (201 Created):</p>
        <pre class="bg-black/60 p-2.5 rounded font-mono border border-brand-border text-slate-300">
{
  "success": true,
  "short_code": "optional_alias",
  "short_url": "https://ae.gs/optional_alias",
  "expires_at": "2026-07-03T16:00:00.000Z"
}</pre>
      </div>
    `,
    contact: `
      <h2 class="text-lg font-bold text-white mb-2 flex items-center gap-1.5"><i class="fa-solid fa-circle-question text-indigo-400"></i> Contact Support Center</h2>
      <p class="text-slate-400 text-xs mb-4">Have an inquiry or want to report abuse? Register a support ticket below.</p>
      
      <form id="modal-contact-form" class="space-y-3">
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase text-slate-400">Name</label>
          <input type="text" id="contact-name" required placeholder="Alex Dev" class="bg-brand-dark border border-brand-border rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none w-full">
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase text-slate-400">Email Address</label>
          <input type="email" id="contact-email" required placeholder="alex@company.com" class="bg-brand-dark border border-brand-border rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none w-full">
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold uppercase text-slate-400">Message Description</label>
          <textarea id="contact-msg" required rows="3" placeholder="Describe your issue or links report details..." class="bg-brand-dark border border-brand-border rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none w-full"></textarea>
        </div>
        <button type="submit" class="w-full py-2.5 rounded bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-xs">Submit Ticket</button>
      </form>
    `
  };

  // Bind footer modals
  document.getElementById('btn-show-privacy').addEventListener('click', () => openModal(legalTemplates.privacy));
  document.getElementById('btn-show-terms').addEventListener('click', () => openModal(legalTemplates.terms));
  document.getElementById('btn-show-cookies').addEventListener('click', () => openModal(legalTemplates.cookies));
  document.getElementById('btn-show-acceptable').addEventListener('click', () => openModal(legalTemplates.acceptable));
  document.getElementById('nav-api-docs').addEventListener('click', (e) => {
    e.preventDefault();
    openModal(legalTemplates.apiDocs);
  });
  document.getElementById('btn-show-contact').addEventListener('click', () => {
    openModal(legalTemplates.contact);
    
    // Bind submission event dynamically
    const cForm = document.getElementById('modal-contact-form');
    cForm.addEventListener('submit', (e) => {
      e.preventDefault();
      closeModal();
      showToast('Support ticket registered. We will reply within 24 hours.', 'success');
    });
  });

  // ========================================================================
  // ROUTING NAVIGATION INTERCEPTOR
  // ========================================================================
  function handleHashWithParams() {
    const hash = window.location.hash || '#shorten-section';
    
    if (hash.startsWith('#analytics-section')) {
      const urlParts = hash.split('?');
      if (urlParts.length > 1) {
        const queryParams = new URLSearchParams(urlParts[1]);
        const code = queryParams.get('code');
        if (code) {
          sections.forEach(s => s.classList.remove('active'));
          document.getElementById('analytics-section').classList.add('active');
          navLinks.forEach(l => l.classList.remove('active-nav'));
          navDashboard.classList.add('active-nav');
          
          state.activeSection = 'analytics-section';
          loadAnalytics(code);
          return;
        }
      }
    }

    handleNavigation();
  }

  window.addEventListener('hashchange', handleHashWithParams);

  // ========================================================================
  // INITIALIZE UI & ROUTING RUNTIME
  // ========================================================================
  updateAuthUI();
  handleHashWithParams();
  updateApiRequestTerminal();
});
