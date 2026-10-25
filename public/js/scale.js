// public/js/scale.js - Manual Smart Eco Scale Controller
const ScaleController = (() => {
  let currentWeight = 0;
  let selectedCategory = 'Plastic';
  let audioCtx = null;
  let eventSource = null;

  // Web Audio Context for synthesized rewards chime
  function playRewardChime() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      // Arpeggio chime: 523.25Hz (C5) -> 659.25Hz (E5) -> 783.99Hz (G5) -> 1046.50Hz (C6)
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.3);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.7);
    } catch (e) {
      // Audio not permitted without interaction
    }
  }

  // Confetti celebration animation
  function launchConfetti() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#6ee7b7', '#f59e0b', '#3b82f6']
      });
    }
  }

  // Update Scale Display & Live Points Preview
  function setWeight(weight, syncInput = true) {
    currentWeight = Math.max(0, Math.round(parseFloat(weight || 0) * 10) / 10);

    const weightDisplay = document.getElementById('scale-weight-display');
    const heroLiveWeight = document.getElementById('hero-live-weight');
    const heroPointsPreview = document.getElementById('hero-points-preview');
    const scalePointsPreview = document.getElementById('scale-points-preview');
    const manualPointsCalc = document.getElementById('manual-points-calc');
    const scaleAvgDisplay = document.getElementById('scale-avg-display');
    const gaugeFill = document.getElementById('scale-gauge-fill');
    const stabilityBadge = document.getElementById('scale-stability-badge');
    const heroScaleBadge = document.getElementById('hero-scale-badge');
    const manualInput = document.getElementById('manual-weight-input');

    const formattedWeight = currentWeight.toFixed(1);
    const calculatedPoints = Math.floor(currentWeight / 10);
    const weightKg = (currentWeight / 1000).toFixed(2);

    if (weightDisplay) weightDisplay.textContent = formattedWeight;
    if (heroLiveWeight) heroLiveWeight.textContent = formattedWeight;
    if (heroPointsPreview) heroPointsPreview.textContent = `${calculatedPoints} pts`;
    if (scalePointsPreview) scalePointsPreview.textContent = `${calculatedPoints} Points`;
    if (manualPointsCalc) manualPointsCalc.textContent = `${calculatedPoints} Points`;
    if (scaleAvgDisplay) scaleAvgDisplay.textContent = `${weightKg} kg`;

    if (syncInput && manualInput && document.activeElement !== manualInput) {
      manualInput.value = currentWeight > 0 ? formattedWeight : '';
    }

    // Update gauge fill (scale range up to 1000g)
    const percentage = Math.min(100, Math.max(0, (currentWeight / 1000) * 100));
    if (gaugeFill) gaugeFill.style.width = `${percentage}%`;

    // Status Badge
    if (stabilityBadge) {
      if (currentWeight === 0) {
        stabilityBadge.className = 'stability-badge';
        stabilityBadge.textContent = 'ENTER WEIGHT (G)';
      } else {
        stabilityBadge.className = 'stability-badge stable';
        stabilityBadge.textContent = 'READY TO DEPOSIT';
      }
    }

    if (heroScaleBadge) {
      heroScaleBadge.textContent = currentWeight === 0 ? 'READY' : `${calculatedPoints} PTS`;
    }
  }

  function addWeight(delta) {
    setWeight(currentWeight + delta);
  }

  function selectCategory(categoryName, defaultWeight) {
    selectedCategory = categoryName;

    // Update Category Pills active class
    const categoryBtns = document.querySelectorAll('.category-pill-btn');
    categoryBtns.forEach(btn => {
      if (btn.dataset.category === categoryName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const manualNote = document.getElementById('manual-note-input');
    if (manualNote) {
      manualNote.value = `${categoryName} Waste`;
    }

    // Update weight to selected category default
    if (defaultWeight) {
      setWeight(defaultWeight);
    }
  }

  function clear() {
    setWeight(0);
    const manualNote = document.getElementById('manual-note-input');
    if (manualNote) manualNote.value = '';
    const manualInput = document.getElementById('manual-weight-input');
    if (manualInput) manualInput.value = '';

    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast('Scale reset to 0.0g', 'info');
    }
  }

  // Execute Deposit & Award Points
  async function submitDeposit() {
    let weightToDeposit = currentWeight;

    // 1. Fallback: Check if numeric direct weight input has a valid number
    if (weightToDeposit <= 0) {
      const manualInput = document.getElementById('manual-weight-input');
      const inputVal = manualInput ? parseFloat(manualInput.value) : 0;
      if (!isNaN(inputVal) && inputVal > 0) {
        weightToDeposit = inputVal;
        setWeight(weightToDeposit, false);
      }
    }

    // 2. Fallback: Check if an active category pill has a pre-defined typical weight
    if (weightToDeposit <= 0) {
      const activeCat = document.querySelector('.category-pill-btn.active');
      if (activeCat) {
        const catWeight = parseFloat(activeCat.dataset.weight) || 0;
        if (catWeight > 0) {
          weightToDeposit = catWeight;
          setWeight(weightToDeposit);
        }
      }
    }

    // 3. If still zero, guide the user with a friendly prompt
    if (weightToDeposit <= 0) {
      if (window.App) {
        window.App.showToast('Please enter garbage weight in grams (minimum 1g) or click a quick-add chip (+50g, +100g).', 'error');
      }
      const manualInput = document.getElementById('manual-weight-input');
      if (manualInput) manualInput.focus();
      return;
    }

    const manualNote = document.getElementById('manual-note-input');
    const noteText = manualNote ? manualNote.value.trim() : '';

    const btnRecord = document.getElementById('btn-scale-record');
    const btnSubmitManual = document.getElementById('btn-submit-manual');

    try {
      if (btnRecord) {
        btnRecord.disabled = true;
        btnRecord.innerHTML = '<span class="pulse-dot"></span> Processing Reward...';
      }
      if (btnSubmitManual) btnSubmitManual.disabled = true;

      // Submit deposit to server API
      const res = await API.bin.depositManual(weightToDeposit, noteText, selectedCategory);

      // If a session token was returned (e.g. guest or active bin user auto-authenticated), store it
      if (res.token && !API.getToken()) {
        API.setToken(res.token);
      }

      // Update current user in App state immediately
      if (window.App && res.user) {
        if (typeof window.App.setCurrentUser === 'function') {
          window.App.setCurrentUser(res.user);
        }
      }

      // Play joyful celebratory chime & burst confetti
      playRewardChime();
      launchConfetti();

      const recipientName = (res.user && res.user.name) ? res.user.name : 'your profile';
      if (window.App) {
        window.App.showToast(
          `🎉 Great job! Successfully awarded ${res.pointsEarned} Eco Points for depositing ${weightToDeposit}g of ${selectedCategory}! (Credited to ${recipientName})`,
          'success'
        );
        window.App.refreshDashboard();
        window.App.refreshLeaderboard();
        window.App.refreshHistory();
      }

      // Reset scale after deposit
      setWeight(0);
      if (manualNote) manualNote.value = '';
      const manualInput = document.getElementById('manual-weight-input');
      if (manualInput) manualInput.value = '';

    } catch (err) {
      if (window.App) {
        window.App.showToast(err.message, 'error');
      }
    } finally {
      if (btnRecord) {
        btnRecord.disabled = false;
        btnRecord.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          Deposit Waste & Award Points
        `;
      }
      if (btnSubmitManual) btnSubmitManual.disabled = false;
    }
  }

  // Setup DOM Event Listeners
  function setupListeners() {
    // 1. Numeric Weight Input
    const manualInput = document.getElementById('manual-weight-input');
    if (manualInput) {
      manualInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        setWeight(val, false);
      });
    }

    // 2. Clear / Reset Scale Button
    const btnTare = document.getElementById('btn-scale-tare');
    if (btnTare) {
      btnTare.addEventListener('click', clear);
    }

    // 3. Confirm & Award Points Button
    const btnRecord = document.getElementById('btn-scale-record');
    if (btnRecord) {
      btnRecord.addEventListener('click', submitDeposit);
    }

    // 4. Form Manual Deposit Submit
    const manualForm = document.getElementById('form-manual-deposit');
    if (manualForm) {
      manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitDeposit();
      });
    }

    // 5. Quick-Add Weight Chips (+20g, +50g, +100g, etc.)
    const quickAddBtns = document.querySelectorAll('.chip-btn');
    quickAddBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('chip-btn-clear')) {
          clear();
        } else {
          const delta = parseFloat(btn.dataset.add) || 0;
          addWeight(delta);
        }
      });
    });

    // 6. Category Selection Pills
    const categoryBtns = document.querySelectorAll('.category-pill-btn');
    categoryBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        const defaultW = parseFloat(btn.dataset.weight) || 100;
        selectCategory(cat, defaultW);
      });
    });

    // 7. Quick Test Recyclables buttons
    const quickDropBtns = document.querySelectorAll('.quick-drop-btn');
    quickDropBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const weight = parseFloat(btn.dataset.weight) || 100;
        const itemName = btn.dataset.item || 'Recyclable';
        const manualNote = document.getElementById('manual-note-input');
        if (manualNote) manualNote.value = itemName;
        setWeight(weight);
      });
    });

    // 8. Guest Banner Quick Demo Login Button
    const btnGuestDemo = document.getElementById('btn-guest-quick-demo');
    if (btnGuestDemo) {
      btnGuestDemo.addEventListener('click', async () => {
        try {
          const res = await API.auth.quickDemo();
          if (window.App) {
            await window.App.checkAuth();
            window.App.showToast(`Signed in as ${res.user.name}! Ready to claim points.`, 'success');
          }
        } catch (err) {
          if (window.App) window.App.showToast(err.message, 'error');
        }
      });
    }

    // 9. Hero Card Quick Presets (Interactive Hero buttons)
    const heroChips = document.querySelectorAll('.hero-quick-chip');
    heroChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const w = parseFloat(chip.dataset.weight) || 100;
        setWeight(w);
      });
    });
  }

  // Background SSE listener for real-time scale & cross-tab sync
  function initBackgroundStream() {
    try {
      if (eventSource) eventSource.close();
      eventSource = new EventSource('/api/live-stream');

      // Live weight stream from Arduino HX711 or Python Bridge
      eventSource.addEventListener('scale-reading', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data && typeof data.weight === 'number') {
            const manualInput = document.getElementById('manual-weight-input');
            // Do not override if user is currently typing in the numeric input
            if (document.activeElement !== manualInput) {
              const liveWeight = (data.isStable && typeof data.averageWeight === 'number')
                ? data.averageWeight
                : data.weight;
              setWeight(liveWeight, true);
            }
          }
        } catch (err) {
          console.error('[Scale] Error handling scale-reading event:', err);
        }
      });

      // Celebration broadcast when deposit is awarded
      eventSource.addEventListener('deposit-awarded', (e) => {
        try {
          const data = JSON.parse(e.data);
          playRewardChime();
          launchConfetti();
          if (window.App) {
            if (data.user && typeof window.App.getCurrentUser === 'function') {
              const current = window.App.getCurrentUser();
              if (current && current.id === data.user.id) {
                window.App.setCurrentUser(data.user);
              }
            }
            window.App.refreshDashboard();
            window.App.refreshLeaderboard();
            window.App.refreshHistory();
            if (data.message) {
              window.App.showToast(data.message, 'success');
            }
          }
        } catch (err) {
          console.error('[Scale] Error handling deposit-awarded event:', err);
        }
      });
    } catch (e) {
      console.error('[Scale] SSE connection failed:', e);
    }
  }

  // Fetch initial live state from server
  async function fetchInitialScaleState() {
    try {
      const res = await API.bin.getStatus('ECOBIN-001');
      if (res && res.liveState && typeof res.liveState.currentWeight === 'number' && res.liveState.currentWeight > 0) {
        setWeight(res.liveState.currentWeight);
      }
    } catch (e) {
      // Offline fallback
    }
  }

  return {
    init() {
      setupListeners();
      initBackgroundStream();
      fetchInitialScaleState();
      setWeight(0);
      const activeCat = document.querySelector('.category-pill-btn.active');
      if (activeCat) {
        selectedCategory = activeCat.dataset.category || 'Plastic';
      }
    },
    setWeight,
    addWeight,
    selectCategory,
    clear,
    submitDeposit,
    playRewardChime,
    launchConfetti
  };
})();
