// Background Service Worker for Custom URL Proxy Extension

// Track auth attempts to prevent infinite loop on wrong credentials
const authAttempts = new Map();

// Helper to apply current proxy settings based on storage
function applyProxySettings() {
  chrome.storage.local.get(['enabled', 'proxyConfig', 'rules'], (result) => {
    const enabled = result.enabled ?? false;
    const proxyConfig = result.proxyConfig || {};
    const rules = result.rules || [];

    if (!enabled || !proxyConfig.host || !proxyConfig.port) {
      // Clear proxy settings and restore default (system/direct)
      chrome.proxy.settings.clear({ scope: 'regular' }, () => {
        console.log("Proxy settings cleared (extension disabled or incomplete config).");
      });
      return;
    }

    const type = proxyConfig.type || 'HTTP';
    const host = proxyConfig.host;
    const port = proxyConfig.port;

    // Convert proxy type to PAC proxy string
    let proxyStr = '';
    if (type === 'HTTP') {
      proxyStr = `PROXY ${host}:${port}`;
    } else if (type === 'HTTPS') {
      // Note: PAC standard supports "HTTPS host:port". If there are issues in specific environments,
      // users can fallback to PROXY. We document this in the UI.
      proxyStr = `HTTPS ${host}:${port}`;
    } else if (type === 'SOCKS5') {
      proxyStr = `SOCKS5 ${host}:${port}; SOCKS ${host}:${port}`;
    } else {
      proxyStr = `PROXY ${host}:${port}`;
    }

    // Clean and validate rules list
    const cleanRules = rules
      .map(r => r.trim())
      .filter(r => r.length > 0);

    // Create the PAC Script dynamically
    const pacScriptContent = `
      function FindProxyForURL(url, host) {
        var rules = ${JSON.stringify(cleanRules)};
        var proxyStr = ${JSON.stringify(proxyStr)};
        
        for (var i = 0; i < rules.length; i++) {
          var rule = rules[i];
          if (!rule) continue;
          
          // 1. Wildcard match (contains '*')
          if (rule.indexOf('*') !== -1) {
            if (shExpMatch(host, rule) || shExpMatch(url, rule)) {
              return proxyStr;
            }
          }
          // 2. Full URL prefix match (starts with http:// or https://)
          else if (rule.indexOf('http://') === 0 || rule.indexOf('https://') === 0) {
            if (url.indexOf(rule) === 0) {
              return proxyStr;
            }
          }
          // 3. Exact domain or subdomain match (dnsDomainIs)
          else {
            if (host === rule || dnsDomainIs(host, "." + rule)) {
              return proxyStr;
            }
          }
        }
        return "DIRECT";
      }
    `;

    const config = {
      mode: "pac_script",
      pacScript: {
        data: pacScriptContent.trim()
      }
    };

    chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error setting proxy settings via PAC:", chrome.runtime.lastError.message);
      } else {
        console.log("PAC script settings applied successfully.");
      }
    });
  });
}

// Perform initial configuration check on install/startup
chrome.runtime.onInstalled.addListener(() => {
  console.log("Custom URL Proxy Extension installed.");
  
  chrome.storage.local.get(['enabled', 'proxyConfig', 'rules'], (result) => {
    const updates = {};
    if (result.enabled === undefined) updates.enabled = false;
    if (result.proxyConfig === undefined) {
      updates.proxyConfig = {
        type: 'HTTP',
        host: '',
        port: '',
        username: '',
        password: ''
      };
    }
    if (result.rules === undefined) {
      // Default rule for Medium
      updates.rules = [
        'medium.com',
        '*.medium.com'
      ];
    }
    
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        applyProxySettings();
      });
    } else {
      applyProxySettings();
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  applyProxySettings();
});

// React to storage changes dynamically
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.enabled || changes.proxyConfig || changes.rules) {
      applyProxySettings();
    }
  }
});

// Intercept proxy authentication requests asynchronously
chrome.webRequest.onAuthRequired.addListener(
  (details, asyncCallback) => {
    if (!details.isProxy) {
      asyncCallback({});
      return;
    }

    const reqId = details.requestId;
    const attempts = authAttempts.get(reqId) || 0;
    
    if (attempts >= 2) {
      // Stop attempting credentials to prevent infinite auth prompts loop
      console.warn("Proxy credentials rejected multiple times. Stopping attempts.");
      authAttempts.delete(reqId);
      asyncCallback({});
      return;
    }

    authAttempts.set(reqId, attempts + 1);

    chrome.storage.local.get(['enabled', 'proxyConfig'], (result) => {
      if (!result.enabled || !result.proxyConfig) {
        asyncCallback({});
        return;
      }

      const { username, password } = result.proxyConfig;
      if (username && password) {
        // Authenticate with saved credentials
        asyncCallback({
          authCredentials: {
            username: username,
            password: password
          }
        });
      } else {
        asyncCallback({});
      }
    });
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

// Clean up requests from tracking map when they finish or error
chrome.webRequest.onCompleted.addListener(
  (details) => {
    authAttempts.delete(details.requestId);
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    authAttempts.delete(details.requestId);
  },
  { urls: ["<all_urls>"] }
);
