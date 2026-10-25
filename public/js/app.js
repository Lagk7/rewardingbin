// public/js/app.js - ECO BIN Application Orchestrator & View Controller
const App = (() => {
  let currentUser = null;
  let currentView = 'home';

  // ==================== TOAST NOTIFICATIONS ====================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;

    const icon = type === 'success' ? '🌱' : type === 'error' ? '⚠️' : '💡';
    toast.innerHTML = `
      <span style="font-size: 1.25rem;">${icon}</span>
      <div style="font-size: 0.9rem; font-weight: 500; color: #fff;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ==================== VIEW ROUTING ====================
  function switchView(viewName) {
    // If user tries to access protected views without login, prompt login
    if ((viewName === 'dashboard' || viewName === 'history') && !currentUser) {
      showToast('Please sign in to access your ' + viewName, 'info');
      openAuthModal('login');
      // Keep on previous view or home
      if (currentView !== viewName) {
        window.location.hash = currentView;
      }
      return;
    }

    currentView = viewName;

    // Hide all views, show target view
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => v.classList.remove('active-view'));

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active-view');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update desktop nav links
    const desktopLinks = document.querySelectorAll('.nav-link');
    desktopLinks.forEach(link => {
      if (link.dataset.view === viewName) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update mobile bottom nav items
    const mobileItems = document.querySelectorAll('.mobile-nav-item');
    mobileItems.forEach(item => {
      if (item.dataset.view === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Refresh view data
    if (viewName === 'dashboard') refreshDashboard();
    if (viewName === 'leaderboard') refreshLeaderboard();
    if (viewName === 'history') refreshHistory();
    if (viewName === 'home') refreshHomeFeed();
  }

  function setupRouting() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') || 'home';
      switchView(hash);
    });

    document.querySelectorAll('[data-view]').forEach(elem => {
      elem.addEventListener('click', (e) => {
        e.preventDefault();
        const view = elem.dataset.view;
        window.location.hash = view;
        switchView(view);
      });
    });

    const initialHash = window.location.hash.replace('#', '') || 'home';
    switchView(initialHash);
  }

  // ==================== AUTHENTICATION & SESSION ====================
  async function checkAuth() {
    const token = API.getToken();
    if (!token) {
      currentUser = null;
      renderAuthHeader(null);
      updateUserBanners(null);
      return;
    }

    try {
      const res = await API.auth.me();
      currentUser = res.user;
      renderAuthHeader(currentUser);
      updateUserBanners(currentUser);
    } catch (err) {
      API.setToken(null);
      currentUser = null;
      renderAuthHeader(null);
      updateUserBanners(null);
    }
  }

  function renderAuthHeader(user) {
    const container = document.getElementById('auth-header-container');
    if (!container) return;

    if (user) {
      container.innerHTML = `
        <div class="user-chip" id="btn-user-profile" title="View Profile (${user.name})">
          <div class="user-avatar-badge">${user.avatar || '🌱'}</div>
          <span class="user-chip-name">${user.name.split(' ')[0]}</span>
          <span class="user-points-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ${user.total_points || 0} pts
          </span>
          <span class="user-chip-divider"></span>
          <button id="btn-logout-header" class="user-chip-logout" title="Sign Out" aria-label="Sign Out">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      `;

      const logoutBtn = document.getElementById('btn-logout-header');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          logout();
        });
      }

      const profileChip = document.getElementById('btn-user-profile');
      if (profileChip) {
        profileChip.addEventListener('click', () => {
          window.location.hash = 'dashboard';
        });
      }
    } else {
      container.innerHTML = `
        <button class="btn btn-primary btn-sm" id="btn-open-login">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          Sign In
        </button>
      `;

      const btnLogin = document.getElementById('btn-open-login');
      if (btnLogin) {
        btnLogin.addEventListener('click', () => openAuthModal('login'));
      }
    }
  }

  function updateUserBanners(user) {
    const homeBanner = document.getElementById('home-user-banner');
    const homeName = document.getElementById('home-user-name');
    const homeAvatar = document.getElementById('home-user-avatar');
    const homeAvgHighlight = document.getElementById('home-user-avg-highlight');
    const homeBadge = document.getElementById('home-user-badge');
    const guestBanner = document.getElementById('scale-guest-banner');

    if (user) {
      if (homeBanner) homeBanner.style.display = 'flex';
      if (homeName) homeName.textContent = `Welcome, ${user.name}!`;
      if (homeAvatar) homeAvatar.textContent = user.avatar || '🌱';
      if (homeAvgHighlight) homeAvgHighlight.textContent = `${user.average_weight_grams || 0.0} g`;
      if (homeBadge) homeBadge.textContent = getTierTitle(user.total_points);
      if (guestBanner) guestBanner.style.display = 'none';
    } else {
      if (homeBanner) homeBanner.style.display = 'none';
      if (guestBanner) guestBanner.style.display = 'flex';
    }
  }

  function getTierTitle(points) {
    if (points >= 150) return '🏆 Platinum Planet Saver';
    if (points >= 80) return '🥇 Gold Eco Champion';
    if (points >= 30) return '🥈 Silver Recycler';
    return '🥉 Bronze Recycler';
  }

  async function logout() {
    await API.auth.logout();
    currentUser = null;
    renderAuthHeader(null);
    updateUserBanners(null);
    showToast('Signed out successfully', 'info');
    window.location.hash = 'home';
    switchView('home');
  }

  // ==================== AUTH MODAL LOGIC ====================
  function openAuthModal(tab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('active');
    switchAuthTab(tab);
  }

  function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
  }

  function switchAuthTab(tab) {
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formReg = document.getElementById('form-register');

    if (tab === 'login') {
      tabLogin.classList.add('active');
      tabReg.classList.remove('active');
      formLogin.style.display = 'block';
      formReg.style.display = 'none';
    } else {
      tabReg.classList.add('active');
      tabLogin.classList.remove('active');
      formReg.style.display = 'block';
      formLogin.style.display = 'none';
    }
  }

  function setupAuthEvents() {
    // Open modal buttons
    const btnHeroDemo = document.getElementById('btn-hero-demo-login');
    if (btnHeroDemo) {
      btnHeroDemo.addEventListener('click', async () => {
        try {
          const res = await API.auth.quickDemo();
          currentUser = res.user;
          renderAuthHeader(currentUser);
          updateUserBanners(currentUser);
          showToast(`Signed in as ${currentUser.name}!`, 'success');
          window.location.hash = 'dashboard';
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const btnQuickDemoModal = document.getElementById('btn-quick-demo-modal');
    if (btnQuickDemoModal) {
      btnQuickDemoModal.addEventListener('click', async () => {
        try {
          const res = await API.auth.quickDemo();
          currentUser = res.user;
          renderAuthHeader(currentUser);
          updateUserBanners(currentUser);
          closeAuthModal();
          showToast(`Signed in as ${currentUser.name}!`, 'success');
          if (currentView !== 'scale') {
            window.location.hash = 'dashboard';
          } else {
            refreshDashboard();
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    // Close button
    const btnClose = document.getElementById('btn-close-auth-modal');
    if (btnClose) {
      btnClose.addEventListener('click', closeAuthModal);
    }

    // Modal background click
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAuthModal();
      });
    }

    // Tab buttons
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    if (tabLogin) tabLogin.addEventListener('click', () => switchAuthTab('login'));
    if (tabReg) tabReg.addEventListener('click', () => switchAuthTab('register'));

    // Login Form Submit
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
          const res = await API.auth.login(email, password);
          currentUser = res.user;
          renderAuthHeader(currentUser);
          updateUserBanners(currentUser);
          closeAuthModal();
          showToast(`Welcome back, ${currentUser.name}!`, 'success');
          if (currentView !== 'scale') {
            window.location.hash = 'dashboard';
          } else {
            refreshDashboard();
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    // Register Form Submit
    const formReg = document.getElementById('form-register');
    if (formReg) {
      formReg.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;

        try {
          const res = await API.auth.register(name, email, password);
          currentUser = res.user;
          renderAuthHeader(currentUser);
          updateUserBanners(currentUser);
          closeAuthModal();
          showToast('Account created successfully! Welcome to Eco Bin.', 'success');
          if (currentView !== 'scale') {
            window.location.hash = 'dashboard';
          } else {
            refreshDashboard();
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  }

  // ==================== DASHBOARD DATA LOADER ====================
  async function refreshDashboard() {
    if (!currentUser) return;

    try {
      const res = await API.dashboard.get();
      const dash = res.dashboard;
      const user = dash.user;
      currentUser = user;

      renderAuthHeader(user);
      updateUserBanners(user);

      // Welcome card elements
      const nameElem = document.getElementById('dash-user-welcome-name');
      const emailElem = document.getElementById('dash-user-email');
      const avatarElem = document.getElementById('dash-user-avatar');
      const rankBadgeElem = document.getElementById('dash-user-rank-badge');

      if (nameElem) nameElem.textContent = `Hello, ${user.name}!`;
      if (emailElem) emailElem.textContent = user.email;
      if (avatarElem) avatarElem.textContent = user.avatar || '🌱';
      if (rankBadgeElem) rankBadgeElem.textContent = `Rank #${dash.rank} • ${getTierTitle(user.total_points)}`;

      // Stat cards
      const statPoints = document.getElementById('dash-stat-points');
      const statWeightKg = document.getElementById('dash-stat-weight-kg');
      const statWeightG = document.getElementById('dash-stat-weight-g');
      const statAvgG = document.getElementById('dash-stat-avg-g');
      const statTrips = document.getElementById('dash-stat-trips');
      const statAvgBadge = document.getElementById('dash-stat-avg-badge');

      if (statPoints) statPoints.textContent = user.total_points;
      if (statWeightKg) statWeightKg.textContent = dash.totalKg.toFixed(2);
      if (statWeightG) statWeightG.textContent = user.total_weight_grams.toFixed(0);
      
      // CRITICAL REQUIREMENT: Average weight put by user
      if (statAvgG) statAvgG.textContent = dash.averageGrams.toFixed(1);
      if (statTrips) statTrips.textContent = user.deposit_count;

      if (statAvgBadge) {
        if (dash.averageGrams >= 400) statAvgBadge.textContent = '🌟 Bulk Champion';
        else if (dash.averageGrams >= 200) statAvgBadge.textContent = '🌿 Super Saver';
        else statAvgBadge.textContent = '🌱 Regular Recycler';
      }

      // Environmental Impact Metrics
      const impactLandfill = document.getElementById('dash-impact-landfill');
      const impactCo2 = document.getElementById('dash-impact-co2');
      const impactTrees = document.getElementById('dash-impact-trees');

      if (impactLandfill) impactLandfill.textContent = `${dash.totalKg.toFixed(2)} kg`;
      if (impactCo2) impactCo2.textContent = `${(dash.totalKg * 1.8).toFixed(1)} kg`;
      if (impactTrees) impactTrees.textContent = `${(dash.totalKg * 0.05).toFixed(1)}`;

      // Recent deposits list
      const depositsList = document.getElementById('dash-user-deposits-list');
      if (depositsList) {
        if (!dash.recentDeposits || dash.recentDeposits.length === 0) {
          depositsList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
              No deposits yet. Enter your garbage weight on the Scale page to start earning!
            </div>
          `;
        } else {
          depositsList.innerHTML = dash.recentDeposits.map(dep => `
            <div class="activity-item">
              <div class="activity-left">
                <div class="activity-icon-badge">♻️</div>
                <div>
                  <div class="activity-user">${dep.notes || 'Recycled Waste'} (${dep.weight_grams}g)</div>
                  <div class="activity-time">${formatDate(dep.created_at)}</div>
                </div>
              </div>
              <div class="activity-points-tag">+${dep.points_earned} pts</div>
            </div>
          `).join('');
        }
      }

    } catch (err) {
      console.error('Error refreshing dashboard:', err);
    }
  }

  // ==================== LEADERBOARD DATA LOADER ====================
  async function refreshLeaderboard() {
    try {
      const res = await API.leaderboard.get(50);
      const list = res.leaderboard || [];

      // Render Top 3 Podium
      const podium = document.getElementById('leaderboard-podium');
      if (podium && list.length >= 3) {
        const first = list[0];
        const second = list[1];
        const third = list[2];

        podium.innerHTML = `
          <!-- 2nd Place -->
          <div class="podium-card podium-2nd">
            <div class="podium-crown">🥈</div>
            <div class="podium-avatar">${second.avatar || '🌿'}</div>
            <span class="podium-rank-badge">RANK 2</span>
            <div class="podium-name">${second.name}</div>
            <div class="podium-score">${second.total_points} pts</div>
            <div class="podium-weight">${second.total_weight_kg} kg recycled</div>
          </div>

          <!-- 1st Place -->
          <div class="podium-card podium-1st">
            <div class="podium-crown">👑</div>
            <div class="podium-avatar">${first.avatar || '🌱'}</div>
            <span class="podium-rank-badge">RANK 1 (CHAMPION)</span>
            <div class="podium-name">${first.name}</div>
            <div class="podium-score">${first.total_points} pts</div>
            <div class="podium-weight">${first.total_weight_kg} kg recycled</div>
          </div>

          <!-- 3rd Place -->
          <div class="podium-card podium-3rd">
            <div class="podium-crown">🥉</div>
            <div class="podium-avatar">${third.avatar || '🍃'}</div>
            <span class="podium-rank-badge">RANK 3</span>
            <div class="podium-name">${third.name}</div>
            <div class="podium-score">${third.total_points} pts</div>
            <div class="podium-weight">${third.total_weight_kg} kg recycled</div>
          </div>
        `;
      }

      // Render Table Rows
      const tbody = document.getElementById('leaderboard-table-body');
      if (tbody) {
        tbody.innerHTML = list.map(item => {
          const isCurrent = currentUser && currentUser.id === item.id;
          const rankCrown = item.rank === 1 ? '👑 1' : item.rank === 2 ? '🥈 2' : item.rank === 3 ? '🥉 3' : `#${item.rank}`;

          return `
            <tr class="${isCurrent ? 'current-user-row' : ''}">
              <td>
                <span class="rank-badge">${rankCrown}</span>
              </td>
              <td>
                <div class="user-cell">
                  <span style="font-size: 1.3rem;">${item.avatar || '🌱'}</span>
                  <div>
                    <strong style="color: #fff;">${item.name}</strong> ${isCurrent ? '<span style="color: var(--emerald-400); font-size: 0.75rem;">(You)</span>' : ''}
                  </div>
                </div>
              </td>
              <td><strong style="color: var(--emerald-400); font-size: 1.05rem;">${item.total_points} pts</strong></td>
              <td>${item.total_weight_kg} kg (${item.total_weight_grams} g)</td>
              <td>${item.average_weight_grams} g</td>
              <td>${item.deposit_count}</td>
              <td>
                <span class="stat-badge">${getTierTitle(item.total_points)}</span>
              </td>
            </tr>
          `;
        }).join('');
      }

    } catch (err) {
      console.error('Error refreshing leaderboard:', err);
    }
  }

  // ==================== REWARD HISTORY DATA LOADER ====================
  async function refreshHistory() {
    if (!currentUser) return;

    try {
      const res = await API.history.get(100);
      const history = res.history || [];

      // Summary boxes
      const statPoints = document.getElementById('history-stat-points');
      const statKg = document.getElementById('history-stat-kg');
      const statAvg = document.getElementById('history-stat-avg');
      const statCount = document.getElementById('history-stat-count');

      const totalPts = history.reduce((acc, h) => acc + h.points_earned, 0);
      const totalWeightG = history.reduce((acc, h) => acc + h.weight_grams, 0);
      const avgWeight = history.length > 0 ? (totalWeightG / history.length) : 0;

      if (statPoints) statPoints.textContent = totalPts;
      if (statKg) statKg.textContent = (totalWeightG / 1000).toFixed(2);
      if (statAvg) statAvg.textContent = avgWeight.toFixed(1);
      if (statCount) statCount.textContent = history.length;

      // Table rows
      const tbody = document.getElementById('history-table-body');
      if (tbody) {
        if (history.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                No recycling history found yet. Deposit waste on the Scale page to earn points!
              </td>
            </tr>
          `;
        } else {
          tbody.innerHTML = history.map(item => `
            <tr>
              <td>${formatDate(item.created_at)}</td>
              <td style="color: #fff; font-weight: 500;">${item.notes || 'Recycled Waste'}</td>
              <td><strong>${item.weight_grams} g</strong></td>
              <td>${item.average_weight_grams ? item.average_weight_grams + ' g' : '-'}</td>
              <td><strong style="color: var(--emerald-400);">+${item.points_earned} pts</strong></td>
              <td><span class="stat-badge">Credited</span></td>
            </tr>
          `).join('');
        }
      }

    } catch (err) {
      console.error('Error refreshing history:', err);
    }
  }

  // ==================== HOME FEED DATA LOADER ====================
  async function refreshHomeFeed() {
    try {
      const res = await API.leaderboard.get(5);
      const feedContainer = document.getElementById('home-community-feed');
      if (!feedContainer) return;

      const items = res.leaderboard || [];
      feedContainer.innerHTML = items.map(u => `
        <div class="activity-item">
          <div class="activity-left">
            <div class="activity-icon-badge">${u.avatar || '🌱'}</div>
            <div>
              <div class="activity-user">${u.name}</div>
              <div class="activity-time">Total Recycled: ${u.total_weight_kg} kg • Avg: ${u.average_weight_grams}g per drop</div>
            </div>
          </div>
          <div class="activity-points-tag">${u.total_points} pts</div>
        </div>
      `).join('');
    } catch (err) {}
  }

  // ==================== CSV EXPORT ====================
  function setupExport() {
    const btnExport = document.getElementById('btn-export-history');
    if (!btnExport) return;

    btnExport.addEventListener('click', async () => {
      try {
        const res = await API.history.get(200);
        const data = res.history || [];
        if (data.length === 0) {
          showToast('No history records to export', 'info');
          return;
        }

        const headers = ['ID', 'Date Time', 'Description', 'Weight (g)', 'Average Weight (g)', 'Points Earned'];
        const csvRows = [headers.join(',')];

        for (const row of data) {
          csvRows.push([
            row.id,
            `"${row.created_at}"`,
            `"${(row.notes || '').replace(/"/g, '""')}"`,
            row.weight_grams,
            row.average_weight_grams,
            row.points_earned
          ].join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ecobin_history_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported history as CSV file', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ==================== INITIALIZE APP ====================
  function init() {
    setupRouting();
    setupAuthEvents();
    setupExport();
    checkAuth();
    ScaleController.init();
    refreshHomeFeed();

    const btnRefLeader = document.getElementById('btn-refresh-leaderboard');
    if (btnRefLeader) {
      btnRefLeader.addEventListener('click', () => {
        refreshLeaderboard();
        showToast('Leaderboard updated', 'info');
      });
    }
  }

  return {
    init,
    showToast,
    isLoggedIn() {
      return !!currentUser;
    },
    getCurrentUser() {
      return currentUser;
    },
    setCurrentUser(user) {
      currentUser = user;
      renderAuthHeader(user);
      updateUserBanners(user);
    },
    checkAuth,
    refreshDashboard,
    refreshLeaderboard,
    refreshHistory,
    openAuthModal,
    logout
  };
})();

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
