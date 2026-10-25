// public/js/api.js - ECO BIN API Client
const API = (() => {
  const BASE_URL = '';
  const TOKEN_KEY = 'ecobin_auth_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async function request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  return {
    getToken,
    setToken,

    // Auth
    auth: {
      async login(email, password) {
        const res = await request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        if (res.token) setToken(res.token);
        return res;
      },

      async register(name, email, password) {
        const res = await request('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password })
        });
        if (res.token) setToken(res.token);
        return res;
      },

      async quickDemo() {
        const res = await request('/api/auth/quick-demo', {
          method: 'POST'
        });
        if (res.token) setToken(res.token);
        return res;
      },

      async me() {
        return await request('/api/auth/me');
      },

      async logout() {
        try {
          await request('/api/auth/logout', { method: 'POST' });
        } catch (e) {
          // ignore
        }
        setToken(null);
      }
    },

    // Dashboard
    dashboard: {
      async get() {
        return await request('/api/dashboard');
      }
    },

    // Leaderboard
    leaderboard: {
      async get(limit = 50) {
        return await request(`/api/leaderboard?limit=${limit}`);
      }
    },

    // History
    history: {
      async get(limit = 100) {
        return await request(`/api/history?limit=${limit}`);
      }
    },

    // Bin & Weight Operations
    bin: {
      async getStatus(deviceId = 'ECOBIN-001') {
        return await request(`/api/bin/status?deviceId=${deviceId}`);
      },

      async bindUser(deviceId = 'ECOBIN-001') {
        return await request('/api/bin/bind', {
          method: 'POST',
          body: JSON.stringify({ deviceId })
        });
      },

      async depositManual(weightGrams, notes = '', category = '', deviceId = 'ECOBIN-001') {
        return await request('/api/deposits/manual', {
          method: 'POST',
          body: JSON.stringify({ weightGrams, notes, category, deviceId })
        });
      },

      async simulate(weight, action = 'deposit') {
        return await request('/api/bin/simulate', {
          method: 'POST',
          body: JSON.stringify({ weight, action })
        });
      }
    }
  };
})();
