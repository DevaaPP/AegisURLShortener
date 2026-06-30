/* ==========================================================================
   AegisURL Frontend Controller (Client-Side JavaScript Engine)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Bulletproof Storage Service (Fallback to in-memory if localStorage is blocked by tracking prevention)
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

  // Helper to parse stored JSON safely
  const getSafeJSON = (key) => {
    const val = safeStorage.getItem(key);
    if (!val || val === 'undefined' || val === 'null') return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  };

  // Global Application State
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

  // Select DOM Elements
  const sections = document.querySelectorAll('.app-section');
  const navLinks = document.querySelectorAll('.nav-link');
  const navDashboard = document.getElementById('nav-dashboard');
  const navAuth = document.getElementById('nav-auth');
  const userProfile = document.getElementById('user-profile');
  const userEmailSpan = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');

  const shortenForm = document.getElementById('shorten-form');
  const errorAlert = document.getElementById('error-alert');
  const errorMessage = document.getElementById('error-message');
  const resultBox = document.getElementById('result-box');
  const shortenedUrlInput = document.getElementById('shortened-url');
  const copyBtn = document.getElementById('copy-btn');
  const qrCodeImage = document.getElementById('qr-code-image');

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

  // Shortener Card Tabs
  const tabShorten = document.getElementById('tab-shorten');
  const tabApi = document.getElementById('tab-api');
  const shortenFormTab = document.getElementById('shorten-form-tab');
  const terminalTab = document.getElementById('terminal-tab');

  // ========================================================================
  // ROUTING & NAVIGATION ENGINE
  // ========================================================================

  function handleNavigation() {
    const hash = window.location.hash || '#shorten-section';
    const targetSectionId = hash.substring(1);
    
    // Safety check for section existence
    const targetSection = document.getElementById(targetSectionId);
    if (!targetSection) return;

    // Guard dashboard & analytics sections (require authentication)
    if ((targetSectionId === 'dashboard-section' || targetSectionId === 'analytics-section') && !state.token) {
      window.location.hash = '#auth-section';
      return;
    }

    // Toggle section visibility
    sections.forEach(section => {
      section.classList.remove('active');
    });
    targetSection.classList.add('active');

    // Update Nav bar highlights
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === hash) {
        link.classList.add('active');
      }
    });

    state.activeSection = targetSectionId;

    // Trigger loads depending on route destination
    if (targetSectionId === 'dashboard-section') {
      loadDashboard();
    }
  }



  // Initialize navigation links
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href.startsWith('#')) {
        e.preventDefault();
        window.location.hash = href;
      }
    });
  });

  // ========================================================================
  // USER CONTEXT & SESSION MANAGEMENT
  // ========================================================================

  function updateAuthUI() {
    if (state.token && state.user) {
      // Authenticated state
      navAuth.classList.add('hidden');
      navDashboard.classList.remove('hidden');
      userProfile.classList.remove('hidden');
      userEmailSpan.textContent = state.user.email;
      
      // Load API key in dashboard display
      if (state.user.apiKey) {
        apiKeyDisplay.value = state.user.apiKey;
      }
    } else {
      // Logged out state
      navAuth.classList.remove('hidden');
      navDashboard.classList.add('hidden');
      userProfile.classList.add('hidden');
      apiKeyDisplay.value = '';
    }
  }

  logoutBtn.addEventListener('click', () => {
    safeStorage.removeItem('token');
    safeStorage.removeItem('user');
    state.token = null;
    state.user = null;
    updateAuthUI();
    window.location.hash = '#shorten-section';
  });

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
    navigator.clipboard.writeText(apiKeyDisplay.value);
    const originalText = copyKeyBtn.innerHTML;
    copyKeyBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Copied!';
    setTimeout(() => {
      copyKeyBtn.innerHTML = originalText;
    }, 2000);
  });

  // Shortener Card Tab Toggles
  if (tabShorten && tabApi) {
    tabShorten.addEventListener('click', () => {
      tabShorten.classList.add('active');
      tabApi.classList.remove('active');
      shortenFormTab.classList.remove('hidden');
      terminalTab.classList.add('hidden');
    });

    tabApi.addEventListener('click', () => {
      tabApi.classList.add('active');
      tabShorten.classList.remove('active');
      terminalTab.classList.remove('hidden');
      shortenFormTab.classList.add('hidden');
    });
  }

  // ========================================================================
  // AUTHENTICATION OPERATIONS (LOGIN/SIGNUP)
  // ========================================================================

  // Auth Tab Toggles
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    authAlert.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
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

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Login failed.');
      }

      // Save user session
      safeStorage.setItem('token', data.token);
      safeStorage.setItem('user', JSON.stringify(data.user));
      state.token = data.token;
      state.user = data.user;
      
      updateAuthUI();
      window.location.hash = '#dashboard-section';
      
      // Clear forms
      loginForm.reset();
    } catch (err) {
      authErrorMessage.textContent = err.message;
      authAlert.classList.remove('hidden');
    }
  });

  // Registration execution
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

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Registration failed.');
      }

      // Registration successful: Auto-login
      authAlert.classList.add('hidden');
      
      // Perform auto-login directly
      const loginResponse = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const loginData = await loginResponse.json();
      
      if (!loginResponse.ok) {
        throw new Error(loginData.error || loginData.message || 'Registration succeeded, but auto-login failed. Please sign in manually.');
      }
      
      safeStorage.setItem('token', loginData.token);
      safeStorage.setItem('user', JSON.stringify(loginData.user));
      state.token = loginData.token;
      state.user = loginData.user;
      
      updateAuthUI();
      window.location.hash = '#dashboard-section';
      registerForm.reset();
    } catch (err) {
      authErrorMessage.textContent = err.message;
      authAlert.classList.remove('hidden');
    }
  });

  // ========================================================================
  // CORE URL SHORTENING OPERATION
  // ========================================================================

  shortenForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAlert.classList.add('hidden');
    resultBox.classList.add('hidden');

    // Safe Browsing check will run on backend
    const targetUrl = document.getElementById('target-url').value;
    const customCode = document.getElementById('custom-code').value;
    const expiresInSecs = document.getElementById('expires-in').value;
    const allowSingleUse = document.getElementById('single-use').checked;

    // Verify authentication prior to shortening
    if (!state.token) {
      errorAlert.classList.remove('hidden');
      errorMessage.innerHTML = '<strong>Account Required:</strong> You must create a Developer Account or Sign In to shorten URLs.';
      window.location.hash = '#auth-section';
      return;
    }

    try {
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
        throw new Error(data.error || data.message || 'Failed to shorten URL.');
      }

      // Populate results box
      shortenedUrlInput.value = data.short_url;
      
      // Load QR Code dynamically (Using OpenSource QR API)
      qrCodeImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.short_url)}`;
      
      resultBox.classList.remove('hidden');
      shortenForm.reset();
    } catch (err) {
      errorMessage.textContent = err.message;
      errorAlert.classList.remove('hidden');
    }
  });

  // Copy shortened link to clipboard
  copyBtn.addEventListener('click', () => {
    shortenedUrlInput.select();
    shortenedUrlInput.setSelectionRange(0, 99999); // Mobile compatibility
    navigator.clipboard.writeText(shortenedUrlInput.value);

    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
    }, 2000);
  });

  // ========================================================================
  // DEVELOPER DASHBOARD METRICS & INVENTORY
  // ========================================================================

  async function loadDashboard() {
    linksTableBody.innerHTML = '<tr><td colspan="5" class="table-empty">Loading links...</td></tr>';
    
    try {
      const response = await fetch('/api/v1/links', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${state.token}`
        }
      });

      if (!response.ok) throw new Error('Failed to load inventory.');

      const data = await response.json();
      
      if (data.links.length === 0) {
        linksTableBody.innerHTML = '<tr><td colspan="5" class="table-empty">No shortened links created yet.</td></tr>';
        return;
      }

      linksTableBody.innerHTML = '';
      data.links.forEach((link) => {
        const shortUrl = `${window.location.protocol}//${window.location.host}/${link.short_code}`;
        const createdDate = new Date(link.created_at).toLocaleDateString();
        
        let expiry = '<span class="text-muted">Permanent</span>';
        if (link.expires_at) {
          const expired = new Date(link.expires_at).getTime() < Date.now();
          expiry = expired 
            ? `<span class="badge badge-danger">Expired</span>`
            : new Date(link.expires_at).toLocaleDateString();
        }
        if (link.allow_single_use) {
          expiry = `<span class="badge badge-info"><i class="fa-solid fa-bolt-lightning"></i> Single-Use</span>`;
        }

        const activeStatus = link.is_active 
          ? '' 
          : ' style="opacity: 0.55; text-decoration: line-through;"';

        const row = document.createElement('tr');
        row.innerHTML = `
          <td${activeStatus}><a href="${shortUrl}" target="_blank">${link.short_code}</a></td>
          <td>${createdDate}</td>
          <td>${expiry}</td>
          <td><span class="badge badge-secondary">${link.total_clicks} clicks</span></td>
          <td>
            <button class="btn btn-secondary btn-sm analytics-btn" data-code="${link.short_code}">
              <i class="fa-solid fa-chart-simple"></i> Analytics
            </button>
          </td>
        `;

        linksTableBody.appendChild(row);
      });

      // Bind analytics buttons
      document.querySelectorAll('.analytics-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          window.location.hash = `#analytics-section?code=${code}`;
        });
      });

    } catch (err) {
      console.error(err);
      linksTableBody.innerHTML = '<tr><td colspan="5" class="table-empty text-danger">Failed to load links inventory.</td></tr>';
    }
  }

  refreshLinksBtn.addEventListener('click', loadDashboard);

  // ========================================================================
  // CLICK ANALYTICS CHARTING & GRAPHS
  // ========================================================================

  async function loadAnalytics(code) {
    document.getElementById('analytics-code-title').textContent = code;

    // Reset tables
    const geoTableBody = document.getElementById('geo-table-body');
    geoTableBody.innerHTML = '<tr><td colspan="2" class="table-empty">Loading geo metrics...</td></tr>';

    try {
      const response = await fetch(`/api/v1/analytics/${code}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${state.token}`
        }
      });

      if (!response.ok) throw new Error('Failed to load analytics.');

      const data = await response.json();
      const metrics = data.metrics;

      // 1. Populate Geo Location Table
      if (metrics.breakdown.countries.length === 0) {
        geoTableBody.innerHTML = '<tr><td colspan="2" class="table-empty">No redirection clicks recorded yet.</td></tr>';
      } else {
        geoTableBody.innerHTML = '';
        metrics.breakdown.countries.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${row.country}</strong></td>
            <td><span class="badge badge-secondary">${row.count} clicks</span></td>
          `;
          geoTableBody.appendChild(tr);
        });
      }

      // 2. Render Charts using Chart.js
      renderTimelineChart(metrics.timeline);
      renderPieChart('device-chart', 'device', metrics.breakdown.devices);
      renderPieChart('browser-chart', 'browser', metrics.breakdown.browsers);

    } catch (err) {
      console.error('Error fetching link metrics:', err);
    }
  }

  function renderTimelineChart(timelineData) {
    const ctx = document.getElementById('timeline-chart').getContext('2d');
    
    // Destroy existing chart instance to prevent duplicates
    if (state.charts.timeline) {
      state.charts.timeline.destroy();
    }

    const labels = timelineData.map(d => d.date);
    const clicks = timelineData.map(d => d.clicks);

    state.charts.timeline = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Total Redirections',
          data: clicks,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#6366f1'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', stepSize: 1 },
            beginAtZero: true
          }
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

    // Dynamic high-contrast colors matching dark mode glow
    const colors = ['#6366f1', '#3b82f6', '#10b981', '#06b6d4', '#ef4444', '#f59e0b'];

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
          legend: { display: false }
        },
        cutout: '65%'
      }
    });
  }

  backToDashboardBtn.addEventListener('click', () => {
    window.location.hash = '#dashboard-section';
  });

  // ========================================================================
  // INTERCEPT ROUTING WITH QUERY PARAMS IN HASH
  // ========================================================================

  function handleHashWithParams() {
    const hash = window.location.hash || '#shorten-section';
    
    if (hash.startsWith('#analytics-section')) {
      // Parse query string (e.g. #analytics-section?code=1)
      const urlParts = hash.split('?');
      if (urlParts.length > 1) {
        const queryParams = new URLSearchParams(urlParts[1]);
        const code = queryParams.get('code');
        if (code) {
          // Force display analytics section
          sections.forEach(s => s.classList.remove('active'));
          document.getElementById('analytics-section').classList.add('active');
          
          navLinks.forEach(l => l.classList.remove('active'));
          document.getElementById('nav-dashboard').classList.add('active');
          
          state.activeSection = 'analytics-section';
          loadAnalytics(code);
          return;
        }
      }
    }
    
    // Default normal routing
    handleNavigation();
  }

  window.addEventListener('hashchange', handleHashWithParams);

  // ========================================================================
  // INTERACTIVE API REQUEST TERMINAL GENERATOR
  // ========================================================================
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

  function updateApiRequestTerminal() {
    if (!termUrl) return; // safety guard
    
    // 1. Update URL
    const urlVal = targetUrlInput.value || 'https://your-long-sensitive-link.com/with-parameters';
    termUrl.textContent = `"${urlVal}"`;

    // 2. Custom code
    const customVal = customCodeInput.value.trim();
    if (customVal) {
      termCustomComma.textContent = ',\n    ';
      termCustom.innerHTML = `<span class="key">"customCode"</span>: <span class="str">"${customVal}"</span>`;
    } else {
      termCustomComma.textContent = '';
      termCustom.innerHTML = '';
    }

    // 3. Expiry
    const expiryVal = expiresInSelect.value;
    if (expiryVal) {
      termExpiryComma.textContent = ',\n    ';
      termExpiry.innerHTML = `<span class="key">"expiresInSecs"</span>: <span class="val">${expiryVal}</span>`;
    } else {
      termExpiryComma.textContent = '';
      termExpiry.innerHTML = '';
    }

    // 4. Single use
    const singleVal = singleUseCheckbox.checked;
    if (singleVal) {
      termSingleComma.textContent = ',\n    ';
      termSingle.innerHTML = `<span class="key">"allowSingleUse"</span>: <span class="val">true</span>`;
    } else {
      termSingleComma.textContent = '';
      termSingle.innerHTML = '';
    }
  }

  // Bind input listeners
  [targetUrlInput, customCodeInput, expiresInSelect, singleUseCheckbox].forEach(el => {
    if (el) {
      el.addEventListener('input', updateApiRequestTerminal);
      el.addEventListener('change', updateApiRequestTerminal);
    }
  });

  // Initialize UI & Session State
  updateAuthUI();
  handleHashWithParams();
  updateApiRequestTerminal();
});
