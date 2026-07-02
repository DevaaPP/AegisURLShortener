/* ==========================================================================
   AegisURL Frontend Controller (SPA clean URL pushState Engine)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // ========================================================================
  // SESSION STORAGE STATE CONTROLLER
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

  // Global State
  const state = {
    token: safeStorage.getItem('token') === 'undefined' ? null : safeStorage.getItem('token'),
    user: getSafeJSON('user'),
    charts: {
      timeline: null,
      device: null,
      browser: null
    }
  };

  // ========================================================================
  // SELECT DOM ELEMENTS
  // ========================================================================
  const appViews = document.querySelectorAll('.app-view');
  const homeNav = document.getElementById('home-nav');
  const dashboardNav = document.getElementById('dashboard-nav');
  const userEmailDisplay = document.getElementById('user-email-display');
  const logoutBtn = document.getElementById('logout-btn');

  const landingView = document.getElementById('landing-view');
  const authView = document.getElementById('auth-view');
  const dashboardView = document.getElementById('dashboard-view');
  const analyticsView = document.getElementById('analytics-view');

  const shortenForm = document.getElementById('shorten-form');
  const errorAlert = document.getElementById('error-alert');
  const errorMessage = document.getElementById('error-message');
  const resultBox = document.getElementById('result-box');
  const shortenedUrlInput = document.getElementById('shortened-url');
  const copyBtn = document.getElementById('copy-btn');
  const qrCodeImage = document.getElementById('qr-code-image');
  const anonSignupPrompt = document.getElementById('anon-signup-prompt');

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
  // TOAST FEEDBACK ALERTS
  // ========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast`;
    
    let icon = '<i class="fa-solid fa-circle-info text-primary"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check text-emerald-600"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark text-rose-600"></i>';
    if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation text-amber-500"></i>';

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
  // CLEAN PATH SPA ROUTER (HTML5 history pushState)
  // ========================================================================
  function navigateTo(path) {
    history.pushState(null, '', path);
    handleRouting();
  }

  function handleRouting() {
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    // Hide all views first
    appViews.forEach(v => v.classList.add('hidden'));

    // Route guards: dashboard & analytics require authentication
    if ((path === '/dashboard' || path === '/analytics') && !state.token) {
      history.replaceState(null, '', '/auth');
      authView.classList.remove('hidden');
      updateAuthUI();
      showToast('Authentication required.', 'warning');
      return;
    }

    if (path === '/auth') {
      if (state.token && safeStorage.getItem('is_anonymous') !== 'true') {
        history.replaceState(null, '', '/dashboard');
        dashboardView.classList.remove('hidden');
        loadDashboard();
      } else {
        authView.classList.remove('hidden');
      }
    } else if (path === '/dashboard') {
      if (code) {
        analyticsView.classList.remove('hidden');
        loadAnalytics(code);
      } else {
        dashboardView.classList.remove('hidden');
        loadDashboard();
      }
    } else {
      // Default to home/landing view
      if (path !== '/') {
        history.replaceState(null, '', '/');
      }
      landingView.classList.remove('hidden');
    }

    updateAuthUI();
  }

  // Bind browser popstate (back/forward keys)
  window.addEventListener('popstate', handleRouting);

  // Intercept click on links to use router instead of reloads
  document.addEventListener('click', (e) => {
    const target = e.target.closest('a');
    if (target) {
      const href = target.getAttribute('href');
      // Only intercept absolute paths in our app (not hashes on landing page or external links)
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        e.preventDefault();
        navigateTo(href);
      }
    }
  });

  // Home navigation redirection bindings
  document.getElementById('btn-nav-login').addEventListener('click', () => navigateTo('/auth'));
  document.getElementById('btn-nav-dashboard').addEventListener('click', () => navigateTo('/dashboard'));
  document.getElementById('btn-hero-login').addEventListener('click', () => navigateTo('/auth'));
  document.getElementById('btn-hero-signup').addEventListener('click', () => {
    navigateTo('/auth');
    // Switch to register tab
    tabRegister.click();
  });
  document.getElementById('btn-demo-signup').addEventListener('click', () => {
    navigateTo('/auth');
    tabRegister.click();
  });

  // ========================================================================
  // SESSION AUTH STATE UI UPDATER
  // ========================================================================
  function updateAuthUI() {
    const isAnon = safeStorage.getItem('is_anonymous') === 'true';
    const mobileToggle = document.getElementById('mobile-menu-toggle');
    const mobMenu = document.getElementById('mobile-menu');

    if (state.token && state.user && !isAnon) {
      homeNav.style.display = 'none';
      dashboardNav.style.display = 'flex';
      userEmailDisplay.textContent = state.user.email;
      document.getElementById('hero-auth-ctas').classList.add('hidden');
      if (mobileToggle) mobileToggle.style.display = 'none';
      if (mobMenu) mobMenu.style.display = 'none';
      
      if (state.user.apiKey) {
        apiKeyDisplay.value = state.user.apiKey;
      }
    } else {
      homeNav.style.display = '';
      dashboardNav.style.display = 'none';
      document.getElementById('hero-auth-ctas').classList.remove('hidden');
      if (mobileToggle) mobileToggle.style.display = '';
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
    navigateTo('/');
  });

  // ========================================================================
  // TABS CONTROLLERS
  // ========================================================================
  
  // URL Shortener Card Tab Toggles
  tabShorten.addEventListener('click', () => {
    tabShorten.classList.add('active', 'bg-wheat-alt', 'border-wheat-border', 'text-text-primary');
    tabShorten.classList.remove('text-text-secondary');
    tabApi.classList.remove('active', 'bg-wheat-alt', 'border-wheat-border', 'text-text-primary');
    tabApi.classList.add('text-text-secondary');
    
    shortenFormTab.classList.remove('hidden');
    terminalTab.classList.add('hidden');
  });

  tabApi.addEventListener('click', () => {
    tabApi.classList.add('active', 'bg-wheat-alt', 'border-wheat-border', 'text-text-primary');
    tabApi.classList.remove('text-text-secondary');
    tabShorten.classList.remove('active', 'bg-wheat-alt', 'border-wheat-border', 'text-text-primary');
    tabShorten.classList.add('text-text-secondary');
    
    terminalTab.classList.remove('hidden');
    shortenFormTab.classList.add('hidden');
  });

  // Auth Tab Toggles
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active', 'bg-wheat-alt', 'border-wheat-border', 'text-text-primary');
    tabLogin.classList.remove('text-text-secondary');
    tabRegister.classList.remove('active', 'bg-wheat-alt', 'border-wheat-border', 'text-text-primary');
    tabRegister.classList.add('text-text-secondary');
    
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    authAlert.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active', 'bg-wheat-alt', 'border-wheat-border', 'text-text-primary');
    tabRegister.classList.remove('text-text-secondary');
    tabLogin.classList.remove('active', 'bg-wheat-alt', 'border-wheat-border', 'text-text-primary');
    tabLogin.classList.add('text-text-secondary');
    
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    authAlert.classList.add('hidden');
  });

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
  // FAQ ACCORDIONS
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
  // PUBLIC ANONYMOUS SESSION BUILDER
  // ========================================================================
  async function registerAnonymousSession() {
    const randomId = Math.floor(Math.random() * 1000000);
    const email = `anon-${randomId}@aegisurl.demo`;
    const password = `DemoSecretPass_${randomId}_$`;

    const regResp = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!regResp.ok) throw new Error('Failed to start anonymous session.');

    const loginResp = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await loginResp.json();
    if (!loginResp.ok) throw new Error('Failed to authorize anonymous session.');

    safeStorage.setItem('token', data.token);
    safeStorage.setItem('user', JSON.stringify(data.user));
    safeStorage.setItem('is_anonymous', 'true');
    state.token = data.token;
    state.user = data.user;
  }

  // ========================================================================
  // URL SHORTENING EXECUTION
  // ========================================================================
  shortenForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAlert.classList.add('hidden');
    resultBox.classList.add('hidden');
    anonSignupPrompt.classList.add('hidden');

    const submitBtn = document.getElementById('shorten-submit');
    const btnText = document.getElementById('shorten-btn-text');
    const spinner = document.getElementById('shorten-spinner');

    btnText.textContent = 'Generating...';
    spinner.classList.remove('hidden');
    submitBtn.disabled = true;

    const targetUrl = targetUrlInput.value;
    const customCode = customCodeInput.value.trim();
    const expiresInSecs = expiresInSelect.value;
    const allowSingleUse = singleUseCheckbox.checked;

    try {
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
      if (!response.ok) throw new Error(data.error || data.message || 'Failed to shorten URL.');

      shortenedUrlInput.value = data.short_url;
      qrCodeImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.short_url)}`;
      resultBox.classList.remove('hidden');
      
      if (safeStorage.getItem('is_anonymous') === 'true') {
        anonSignupPrompt.classList.remove('hidden');
      }

      showToast('Link created successfully!', 'success');
      shortenForm.reset();
      updateApiRequestTerminal();
    } catch (err) {
      errorMessage.textContent = err.message;
      errorAlert.classList.remove('hidden');
      showToast(err.message, 'error');
    } finally {
      btnText.textContent = 'Generate Link';
      spinner.classList.add('hidden');
      submitBtn.disabled = false;
    }
  });

  // Copy short URL
  copyBtn.addEventListener('click', () => {
    shortenedUrlInput.select();
    navigator.clipboard.writeText(shortenedUrlInput.value);
    showToast('Copied to clipboard!', 'success');
  });

  // ========================================================================
  // LOGIN / REGISTER OPERATIONS
  // ========================================================================
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
      if (!response.ok) throw new Error(data.error || data.message || 'Credentials incorrect.');

      safeStorage.removeItem('is_anonymous');
      safeStorage.setItem('token', data.token);
      safeStorage.setItem('user', JSON.stringify(data.user));
      state.token = data.token;
      state.user = data.user;
      
      showToast('Welcome back!', 'success');
      navigateTo('/dashboard');
      loginForm.reset();
    } catch (err) {
      authErrorMessage.textContent = err.message;
      authAlert.classList.remove('hidden');
      showToast(err.message, 'error');
    }
  });

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

      // Login
      const loginResp = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const loginData = await loginResp.json();
      if (!loginResp.ok) throw new Error(loginData.error || 'Auto-login failed.');

      safeStorage.removeItem('is_anonymous');
      safeStorage.setItem('token', loginData.token);
      safeStorage.setItem('user', JSON.stringify(loginData.user));
      state.token = loginData.token;
      state.user = loginData.user;

      showToast('Account established successfully!', 'success');
      navigateTo('/dashboard');
      registerForm.reset();
    } catch (err) {
      authErrorMessage.textContent = err.message;
      authAlert.classList.remove('hidden');
      showToast(err.message, 'error');
    }
  });

  // ========================================================================
  // DEVELOPER DASHBOARD OPERATIONS
  // ========================================================================
  async function loadDashboard() {
    linksTableBody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-text-muted">Loading registry...</td></tr>';
    
    try {
      const response = await fetch('/api/v1/links', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (!response.ok) throw new Error('Session expired.');

      const data = await response.json();
      
      if (data.links.length === 0) {
        linksTableBody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-text-muted">No shortcodes. Generate a link to get started!</td></tr>';
        return;
      }

      linksTableBody.innerHTML = '';
      data.links.forEach(link => {
        const shortUrl = `${window.location.protocol}//${window.location.host}/${link.short_code}`;
        const createdDate = new Date(link.created_at).toLocaleDateString();
        
        let expiry = '<span class="text-text-muted">Permanent</span>';
        if (link.expires_at) {
          const expired = new Date(link.expires_at).getTime() < Date.now();
          expiry = expired 
            ? `<span class="badge badge-danger">Expired</span>`
            : new Date(link.expires_at).toLocaleDateString();
        }
        if (link.allow_single_use) {
          expiry = `<span class="badge badge-info">Single-Use</span>`;
        }

        const activeStatus = link.is_active ? '' : ' opacity-40 line-through';

        const row = document.createElement('tr');
        row.className = 'hover:bg-wheat-alt/50 transition-colors border-b border-wheat-border';
        row.innerHTML = `
          <td class="py-3.5 px-4 font-mono font-bold text-primary${activeStatus}"><a href="${shortUrl}" target="_blank">${link.short_code}</a></td>
          <td class="py-3.5 px-4 text-text-secondary">${createdDate}</td>
          <td class="py-3.5 px-4">${expiry}</td>
          <td class="py-3.5 px-4"><span class="badge badge-secondary">${link.total_clicks} clicks</span></td>
          <td class="py-3.5 px-4">
            <button class="px-2.5 py-1 rounded border border-wheat-border bg-wheat-card hover:bg-wheat-alt text-text-primary font-bold text-[10px] uppercase tracking-wider analytics-btn" data-code="${link.short_code}">
              Metrics
            </button>
          </td>
        `;
        linksTableBody.appendChild(row);
      });

      document.querySelectorAll('.analytics-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          navigateTo(`/dashboard?code=${code}`);
        });
      });

    } catch (err) {
      console.error(err);
      linksTableBody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-rose-600">Failed to load active shortcodes.</td></tr>';
    }
  }

  refreshLinksBtn.addEventListener('click', loadDashboard);

  toggleKeyVisibility.addEventListener('click', () => {
    if (apiKeyDisplay.type === 'password') {
      apiKeyDisplay.type = 'text';
      toggleKeyVisibility.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    } else {
      apiKeyDisplay.type = 'password';
      toggleKeyVisibility.innerHTML = '<i class="fa-solid fa-eye"></i>';
    }
  });

  copyKeyBtn.addEventListener('click', () => {
    apiKeyDisplay.select();
    navigator.clipboard.writeText(apiKeyDisplay.value);
    showToast('API Key copied successfully!', 'success');
  });

  // ========================================================================
  // CLICK METRICS VISUALS (CHART.JS)
  // ========================================================================
  async function loadAnalytics(code) {
    document.getElementById('analytics-code-title').textContent = code;
    const geoTableBody = document.getElementById('geo-table-body');
    geoTableBody.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-text-muted">Loading metrics...</td></tr>';

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
        geoTableBody.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-text-muted">No click events recorded.</td></tr>';
      } else {
        geoTableBody.innerHTML = '';
        metrics.breakdown.countries.forEach(row => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-wheat-border';
          tr.innerHTML = `
            <td class="py-2.5 px-4 font-semibold text-text-primary">${row.country}</td>
            <td class="py-2.5 px-4 text-right text-text-secondary"><span class="badge badge-secondary">${row.count} clicks</span></td>
          `;
          geoTableBody.appendChild(tr);
        });
      }

      renderTimelineChart(metrics.timeline);
      renderPieChart('device-chart', 'device', metrics.breakdown.devices);
      renderPieChart('browser-chart', 'browser', metrics.breakdown.browsers);

    } catch (err) {
      console.error(err);
      showToast('Failed to retrieve analytics metrics.', 'error');
    }
  }

  backToDashboardBtn.addEventListener('click', () => {
    navigateTo('/dashboard');
  });

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
          data: data,
          borderColor: '#4F46E5', // Warm Premium Indigo
          backgroundColor: 'hsla(243, 75%, 59%, 0.05)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'hsl(33, 24%, 87%)' }, ticks: { color: '#6B6258' } },
          x: { grid: { color: 'hsl(33, 24%, 87%)' }, ticks: { color: '#6B6258' } }
        }
      }
    });
  }

  function renderPieChart(canvasId, chartKey, breakdownData) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    if (state.charts[chartKey]) {
      state.charts[chartKey].destroy();
    }

    const labels = breakdownData.map(d => d[chartKey]);
    const counts = breakdownData.map(d => d.count);

    const colors = ['#4F46E5', '#A855F7', '#14B8A6', '#F59E0B', '#EF4444', '#6B6258'];

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
            labels: { color: '#6B6258', font: { size: 10 } }
          }
        },
        cutout: '65%'
      }
    });
  }

  // ========================================================================
  // OVERLAY POLICY MODALS (Clean Bolding with HTML strong tags)
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

  const legalTemplates = {
    privacy: `
      <h2 class="text-base font-bold text-text-primary mb-2">Privacy & Data Policy</h2>
      <p class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Last Updated: July 2026</p>
      <div class="space-y-3 mt-4 text-xs">
        <p>AegisURL is engineered to be <strong>privacy-first</strong>. We do not place user tracking cookies on visitors during redirection, nor do we build profiles to target advertising.</p>
        <h3 class="font-bold text-text-primary mt-3 text-[10px] uppercase tracking-wider">1. Click Analytics Data</h3>
        <p>To compile metrics for the developer panel, we record: hashed IP addresses, browser agent strings (OS, browser, device type), geolocation (mapped at the Vercel edge), and HTTP referrers.</p>
        <h3 class="font-bold text-text-primary mt-3 text-[10px] uppercase tracking-wider">2. Data Security</h3>
        <p>All active destination target mapping rows are stored securely on disk inside PostgreSQL clusters encrypted with <strong>AES-256-GCM</strong> cipher keys.</p>
      </div>
    `,
    terms: `
      <h2 class="text-base font-bold text-text-primary mb-2">Terms of Service</h2>
      <p class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Last Updated: July 2026</p>
      <div class="space-y-3 mt-4 text-xs">
        <p>By creating shortened links on AegisURL, you agree to comply with our service requirements.</p>
        <h3 class="font-bold text-text-primary mt-3 text-[10px] uppercase tracking-wider">1. Acceptable Content</h3>
        <p>You are strictly prohibited from shortening links pointing to phishing campaigns, malware repositories, viruses, or unsolicited messaging vectors (spam). All links are scanned by Google Safe Browsing and disabled instantly if flagged.</p>
        <h3 class="font-bold text-text-primary mt-3 text-[10px] uppercase tracking-wider">2. Service Limitations</h3>
        <p>To protect system availability, API requests are subject to rate limiting of 30 requests per minute.</p>
      </div>
    `,
    cookies: `
      <h2 class="text-base font-bold text-text-primary mb-2">Cookie Usage Policy</h2>
      <p class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Last Updated: July 2026</p>
      <div class="space-y-3 mt-4 text-xs">
        <p>AegisURL uses essential cookies to authenticate developer login sessions on the dashboard console. We <strong>do not</strong> write cookies when users are redirected through shortlinks.</p>
      </div>
    `,
    acceptable: `
      <h2 class="text-base font-bold text-text-primary mb-2">Acceptable Use & Abuse Report</h2>
      <p class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Last Updated: July 2026</p>
      <div class="space-y-3 mt-4 text-xs">
        <p>AegisURL maintains a zero-tolerance policy against malicious or illegal link redirects.</p>
        <h3 class="font-bold text-text-primary mt-3 text-[10px] uppercase tracking-wider">1. Report Abuse</h3>
        <p>To report an active AegisURL short link pointing to harmful resources, contact our team immediately at <strong>abuse@aegisurl.com</strong>. Flagged items will be reviewed and removed within 12 hours.</p>
      </div>
    `,
    apiDocs: `
      <h2 class="text-base font-bold text-text-primary mb-2">REST API Integration Specifications</h2>
      <div class="space-y-3 mt-4 text-xs">
        <p>Integrate AegisURL programmatically using your developer secret key.</p>
        <h3 class="font-bold text-text-primary text-[10px] uppercase tracking-wider">Authentication Header:</h3>
        <pre class="bg-wheat-ivory p-3 rounded font-mono border border-wheat-border text-text-primary">
X-API-Key: &lt;YOUR_API_KEY&gt;
Content-Type: application/json</pre>
        <h3 class="font-bold text-text-primary text-[10px] uppercase tracking-wider">Endpoint:</h3>
        <pre class="bg-wheat-ivory p-3 rounded font-mono border border-wheat-border text-primary font-bold">
POST /api/v1/shorten</pre>
        <h3 class="font-bold text-text-primary text-[10px] uppercase tracking-wider">JSON Body Schema:</h3>
        <pre class="bg-wheat-ivory p-3 rounded font-mono border border-wheat-border text-text-secondary">
{
  "targetUrl": "https://dest.com",
  "customCode": "custom_alias",
  "expiresInSecs": 86400,
  "allowSingleUse": false
}</pre>
      </div>
    `,
    contact: `
      <h2 class="text-base font-bold text-text-primary mb-2">Developer Support Desk</h2>
      <p class="text-text-secondary text-xs mb-4">Register a support inquiry or abuse report ticket below.</p>
      <form id="modal-contact-form" class="space-y-3">
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-bold uppercase text-text-muted">Name</label>
          <input type="text" id="contact-name" required placeholder="Alex Dev" class="bg-wheat-ivory border border-wheat-border rounded px-3 py-2 text-xs text-text-primary focus:border-primary outline-none w-full">
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-bold uppercase text-text-muted">Email Address</label>
          <input type="email" id="contact-email" required placeholder="alex@company.com" class="bg-wheat-ivory border border-wheat-border rounded px-3 py-2 text-xs text-text-primary focus:border-primary outline-none w-full">
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-bold uppercase text-text-muted">Message Details</label>
          <textarea id="contact-msg" required rows="3" placeholder="Explain your inquiry details..." class="bg-wheat-ivory border border-wheat-border rounded px-3 py-2 text-xs text-text-primary focus:border-primary outline-none w-full"></textarea>
        </div>
        <button type="submit" class="w-full py-2.5 rounded bg-primary hover:bg-primary-hover text-white font-bold text-xs shadow-premium">Submit Ticket</button>
      </form>
    `
  };

  // Bind footer buttons
  document.getElementById('btn-show-privacy').addEventListener('click', () => openModal(legalTemplates.privacy));
  document.getElementById('btn-show-terms').addEventListener('click', () => openModal(legalTemplates.terms));
  document.getElementById('btn-show-cookies').addEventListener('click', () => openModal(legalTemplates.cookies));
  document.getElementById('btn-show-acceptable').addEventListener('click', () => openModal(legalTemplates.acceptable));
  document.getElementById('nav-api-docs').addEventListener('click', () => openModal(legalTemplates.apiDocs));
  document.getElementById('btn-show-contact').addEventListener('click', () => {
    openModal(legalTemplates.contact);
    document.getElementById('modal-contact-form').addEventListener('submit', (e) => {
      e.preventDefault();
      closeModal();
      showToast('Support ticket registered successfully.', 'success');
    });
  });

  // Bind disclaimer buttons inside the form
  document.getElementById('btn-disclaimer-privacy').addEventListener('click', () => openModal(legalTemplates.privacy));
  document.getElementById('btn-disclaimer-terms').addEventListener('click', () => openModal(legalTemplates.terms));

  // Bind mobile burger menu navigation
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  
  if (mobileMenuToggle && mobileMenu) {
    mobileMenuToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });

    document.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
      });
    });

    document.getElementById('mobile-api-docs').addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      openModal(legalTemplates.apiDocs);
    });

    document.getElementById('mobile-btn-nav-login').addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      navigateTo('/auth');
    });
  }

  // ========================================================================
  // BOOTSTRAP SPA ROUTING
  // ========================================================================
  handleRouting();
});
