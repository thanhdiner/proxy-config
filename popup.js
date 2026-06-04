// UI Logic for Custom URL Proxy Popup

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const extToggle = document.getElementById('extension-toggle');
  const statusCard = document.getElementById('status-card');
  const statusText = document.getElementById('status-text');
  const rulesCount = document.getElementById('rules-count');
  const proxySummary = document.getElementById('proxy-summary');
  
  const proxyType = document.getElementById('proxy-type');
  const proxyHost = document.getElementById('proxy-host');
  const proxyPort = document.getElementById('proxy-port');
  
  const authToggle = document.getElementById('auth-toggle');
  const authFields = document.getElementById('auth-fields');
  const proxyUsername = document.getElementById('proxy-username');
  const proxyPassword = document.getElementById('proxy-password');
  
  const proxyRules = document.getElementById('proxy-rules');
  
  const testUrl = document.getElementById('test-url');
  const btnTest = document.getElementById('btn-test');
  const testResult = document.getElementById('test-result');
  const resultBadge = document.getElementById('result-badge');
  const resultReason = document.getElementById('result-reason');
  
  const btnSave = document.getElementById('btn-save');
  const toast = document.getElementById('toast');

  let activeRulesList = [];

  // 1. Load configuration from storage
  chrome.storage.local.get(['enabled', 'proxyConfig', 'rules'], (result) => {
    const enabled = result.enabled ?? false;
    const config = result.proxyConfig || {};
    const rules = result.rules || ['medium.com', '*.medium.com'];

    // Set toggle state
    extToggle.checked = enabled;
    updateStatusUI(enabled);

    // Set configuration fields
    proxyType.value = config.type || 'HTTP';
    proxyHost.value = config.host || '';
    proxyPort.value = config.port || '';
    proxyUsername.value = config.username || '';
    proxyPassword.value = config.password || '';

    // Show credential fields if saved values exist
    if (config.username || config.password) {
      authToggle.classList.add('active');
      authFields.classList.remove('hidden');
    }

    // Set rules
    activeRulesList = rules;
    proxyRules.value = rules.join('\n');
    
    // Update summary values
    rulesCount.textContent = rules.filter(r => r.trim().length > 0).length;
    proxySummary.textContent = proxyType.value;
  });

  // 2. Interactive Status Toggle
  extToggle.addEventListener('change', () => {
    const isEnabled = extToggle.checked;
    updateStatusUI(isEnabled);
    
    // Save state instantly
    chrome.storage.local.set({ enabled: isEnabled }, () => {
      showToast(isEnabled ? 'Extension Enabled' : 'Extension Disabled');
    });
  });

  // 3. Toggle Authentication Accordion
  authToggle.addEventListener('click', () => {
    const isActive = authToggle.classList.toggle('active');
    if (isActive) {
      authFields.classList.remove('hidden');
    } else {
      authFields.classList.add('hidden');
    }
  });

  // 4. Save and Apply Configurations
  btnSave.addEventListener('click', () => {
    const type = proxyType.value;
    const host = proxyHost.value.trim();
    const portVal = proxyPort.value.trim();
    const username = proxyUsername.value.trim();
    const password = proxyPassword.value; // Keep raw whitespace if user entered it

    // Validation
    if (!host) {
      alert('Please enter a valid proxy host.');
      proxyHost.focus();
      return;
    }

    if (!portVal || isNaN(portVal)) {
      alert('Please enter a valid port number.');
      proxyPort.focus();
      return;
    }

    const port = parseInt(portVal, 10);
    if (port < 1 || port > 65535) {
      alert('Port must be between 1 and 65535.');
      proxyPort.focus();
      return;
    }

    // Parse Rules
    const rawRulesText = proxyRules.value;
    const rules = rawRulesText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    activeRulesList = rules;

    const proxyConfig = {
      type,
      host,
      port,
      username,
      password
    };

    // Save to local storage
    chrome.storage.local.set({
      proxyConfig,
      rules
    }, () => {
      // Update quick display counts
      rulesCount.textContent = rules.length;
      proxySummary.textContent = type;
      showToast('Settings Saved & Applied!');
    });
  });

  // 5. Test Custom Rules
  btnTest.addEventListener('click', runRoutingTest);
  testUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      runRoutingTest();
    }
  });

  function runRoutingTest() {
    const inputUrl = testUrl.value.trim();
    if (!inputUrl) {
      alert('Please enter a URL to test.');
      testUrl.focus();
      return;
    }

    // Process and evaluate match
    const result = simulatePacMatch(inputUrl, activeRulesList);
    
    // Display result
    testResult.classList.remove('hidden');
    
    if (result.error) {
      resultBadge.textContent = 'ERROR';
      resultBadge.className = 'result-badge direct'; // Red/yellow styling if desired
      resultReason.textContent = result.error;
      return;
    }

    if (result.matched) {
      resultBadge.textContent = 'PROXY';
      resultBadge.className = 'result-badge proxy';
      
      let typeLabel = '';
      if (result.type === 'url_prefix') typeLabel = 'URL prefix';
      else if (result.type === 'wildcard') typeLabel = 'Wildcard';
      else if (result.type === 'domain') typeLabel = 'Domain';
      
      resultReason.textContent = `Matches rule: "${result.rule}" (${typeLabel})`;
    } else {
      resultBadge.textContent = 'DIRECT';
      resultBadge.className = 'result-badge direct';
      resultReason.textContent = 'No matching rule. Connects directly.';
    }
  }

  // Simulator helper (matches PAC script rules)
  function simulatePacMatch(urlStr, rules) {
    // Add default protocol if omitted for validation
    let formattedUrl = urlStr;
    if (!/^https?:\/\//i.test(urlStr)) {
      formattedUrl = 'https://' + urlStr;
    }

    try {
      const url = new URL(formattedUrl);
      const host = url.hostname;
      
      for (const rule of rules) {
        const cleanRule = rule.trim();
        if (!cleanRule) continue;

        // 1. Wildcard pattern match (e.g. *.medium.com)
        if (cleanRule.includes('*')) {
          // Escape special regex chars except asterisk, then map * to .*
          const escaped = cleanRule.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&');
          const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
          const regex = new RegExp(regexStr, 'i');
          
          if (regex.test(host) || regex.test(formattedUrl)) {
            return { matched: true, rule: cleanRule, type: 'wildcard' };
          }
        }
        // 2. Full URL prefix match (e.g. https://medium.com/)
        else if (cleanRule.startsWith('http://') || cleanRule.startsWith('https://')) {
          if (formattedUrl.startsWith(cleanRule)) {
            return { matched: true, rule: cleanRule, type: 'url_prefix' };
          }
        }
        // 3. Domain or subdomain match (e.g. medium.com)
        else {
          if (host === cleanRule || host.endsWith('.' + cleanRule)) {
            return { matched: true, rule: cleanRule, type: 'domain' };
          }
        }
      }
    } catch (e) {
      return { error: 'Invalid URL format' };
    }

    return { matched: false };
  }

  // UI Helpers
  function updateStatusUI(isEnabled) {
    statusCard.className = 'status-card ' + (isEnabled ? 'enabled' : 'disabled');
    statusText.textContent = isEnabled ? 'Active' : 'Disabled';
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    
    // Clear existing timeouts
    if (window.toastTimeout) {
      clearTimeout(window.toastTimeout);
    }
    
    window.toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }
});
