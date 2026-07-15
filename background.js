// Background Service Worker for Bypass Flow

const DIRECT_PROXY_ID = '__DIRECT__';
const authAttempts = new Map();

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHost(host) {
  const value = String(host || '').trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function formatProxyHost(host) {
  const normalized = normalizeHost(host);
  return normalized.includes(':') ? `[${normalized}]` : normalized;
}

function normalizeProxy(proxy, index = 0) {
  const port = Number.parseInt(proxy?.port, 10);
  return {
    id: String(proxy?.id || `proxy_${index + 1}`),
    name: String(proxy?.name || `Proxy ${index + 1}`).trim() || `Proxy ${index + 1}`,
    type: String(proxy?.type || 'HTTP').toUpperCase(),
    host: normalizeHost(proxy?.host),
    port: Number.isInteger(port) ? port : 0,
    username: String(proxy?.username || ''),
    password: String(proxy?.password || '')
  };
}

function normalizeRoute(route, index = 0) {
  return {
    id: String(route?.id || `route_${index + 1}`),
    pattern: String(route?.pattern || '').trim(),
    proxyId: String(route?.proxyId || DIRECT_PROXY_ID)
  };
}

function normalizeStoredConfig(result) {
  let proxies = Array.isArray(result.proxies)
    ? result.proxies.map(normalizeProxy)
    : [];

  if (proxies.length === 0 && result.proxyConfig) {
    proxies = [normalizeProxy({
      ...result.proxyConfig,
      id: 'proxy_legacy',
      name: 'Default Proxy'
    })];
  }

  let routes = Array.isArray(result.routes)
    ? result.routes.map(normalizeRoute)
    : [];

  if (routes.length === 0 && Array.isArray(result.rules)) {
    const fallbackProxyId = proxies[0]?.id || DIRECT_PROXY_ID;
    routes = result.rules.map((pattern, index) => normalizeRoute({
      id: `route_legacy_${index + 1}`,
      pattern,
      proxyId: fallbackProxyId
    }, index));
  }

  return { proxies, routes };
}

function buildProxyDirective(proxy) {
  if (!proxy.host || proxy.port < 1 || proxy.port > 65535) {
    return null;
  }

  const endpoint = `${formatProxyHost(proxy.host)}:${proxy.port}`;

  if (proxy.type === 'HTTPS') {
    return `HTTPS ${endpoint}`;
  }

  if (proxy.type === 'SOCKS5') {
    return `SOCKS5 ${endpoint}; SOCKS ${endpoint}`;
  }

  return `PROXY ${endpoint}`;
}

function clearProxySettings(reason) {
  chrome.proxy.settings.clear({ scope: 'regular' }, () => {
    if (chrome.runtime.lastError) {
      console.error('Unable to clear proxy settings:', chrome.runtime.lastError.message);
      return;
    }
    console.log(`Proxy settings cleared: ${reason}`);
  });
}

function applyProxySettings() {
  chrome.storage.local.get(
    ['enabled', 'proxies', 'routes', 'proxyConfig', 'rules'],
    (result) => {
      const enabled = result.enabled ?? false;
      const { proxies, routes } = normalizeStoredConfig(result);

      if (!enabled) {
        clearProxySettings('extension disabled');
        return;
      }

      const proxyDirectives = {};
      proxies.forEach((proxy) => {
        const directive = buildProxyDirective(proxy);
        if (directive) {
          proxyDirectives[proxy.id] = directive;
        }
      });

      const pacRoutes = routes
        .filter((route) => route.pattern)
        .map((route) => {
          if (route.proxyId === DIRECT_PROXY_ID) {
            return { pattern: route.pattern, proxyStr: 'DIRECT' };
          }

          const proxyStr = proxyDirectives[route.proxyId];
          return proxyStr ? { pattern: route.pattern, proxyStr } : null;
        })
        .filter(Boolean);

      const hasProxyRoute = pacRoutes.some((route) => route.proxyStr !== 'DIRECT');
      if (!hasProxyRoute) {
        clearProxySettings('no valid proxy routes');
        return;
      }

      const pacScriptContent = `
        function routeMatches(url, host, rule) {
          if (!rule) return false;

          if (rule.indexOf('http://') === 0 || rule.indexOf('https://') === 0) {
            return url.indexOf(rule) === 0;
          }

          if (rule.indexOf('*') !== -1) {
            return shExpMatch(host, rule) || shExpMatch(url, rule);
          }

          var normalizedRule = rule;
          if (normalizedRule.charAt(0) === '[' && normalizedRule.charAt(normalizedRule.length - 1) === ']') {
            normalizedRule = normalizedRule.substring(1, normalizedRule.length - 1);
          }

          var lowerHost = host.toLowerCase();
          var lowerRule = normalizedRule.toLowerCase();
          return lowerHost === lowerRule || dnsDomainIs(lowerHost, '.' + lowerRule);
        }

        function FindProxyForURL(url, host) {
          var routes = ${JSON.stringify(pacRoutes)};

          for (var i = 0; i < routes.length; i++) {
            if (routeMatches(url, host, routes[i].pattern)) {
              return routes[i].proxyStr;
            }
          }

          return 'DIRECT';
        }
      `;

      const config = {
        mode: 'pac_script',
        pacScript: {
          data: pacScriptContent.trim()
        }
      };

      chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error setting proxy settings via PAC:', chrome.runtime.lastError.message);
          return;
        }
        console.log(`PAC applied with ${pacRoutes.length} route(s) and ${Object.keys(proxyDirectives).length} proxy profile(s).`);
      });
    }
  );
}

function matchesRoutePattern(urlString, pattern) {
  if (!pattern) return false;

  let formattedUrl = String(urlString || '');
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  try {
    const url = new URL(formattedUrl);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();

    if (/^https?:\/\//i.test(pattern)) {
      return formattedUrl.startsWith(pattern);
    }

    if (pattern.includes('*')) {
      const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`, 'i');
      return regex.test(host) || regex.test(formattedUrl);
    }

    const normalizedPattern = pattern.replace(/^\[|\]$/g, '').toLowerCase();
    return host === normalizedPattern || host.endsWith(`.${normalizedPattern}`);
  } catch {
    return false;
  }
}

function findProxyForRequest(url, proxies, routes) {
  const proxyMap = new Map(proxies.map((proxy) => [proxy.id, proxy]));

  for (const route of routes) {
    if (!matchesRoutePattern(url, route.pattern)) continue;
    if (route.proxyId === DIRECT_PROXY_ID) return null;
    return proxyMap.get(route.proxyId) || null;
  }

  return null;
}

function migrateConfiguration() {
  chrome.storage.local.get(
    ['enabled', 'proxies', 'routes', 'proxyConfig', 'rules', 'configVersion'],
    (result) => {
      const updates = {};
      if (result.enabled === undefined) updates.enabled = false;

      let proxies = result.proxies;
      if (proxies === undefined) {
        if (result.proxyConfig) {
          proxies = [normalizeProxy({
            ...result.proxyConfig,
            id: 'proxy_legacy',
            name: 'Default Proxy'
          })];
        } else {
          proxies = [normalizeProxy({
            id: createId('proxy'),
            name: 'Default Proxy',
            type: 'HTTP',
            host: '',
            port: 8080,
            username: '',
            password: ''
          })];
        }
        updates.proxies = proxies;
      }

      if (result.routes === undefined) {
        const fallbackProxyId = proxies?.[0]?.id || DIRECT_PROXY_ID;
        const legacyRules = Array.isArray(result.rules)
          ? result.rules
          : ['medium.com', '*.medium.com'];

        updates.routes = legacyRules.map((pattern, index) => normalizeRoute({
          id: createId('route'),
          pattern,
          proxyId: fallbackProxyId
        }, index));
      }

      if (result.configVersion !== 2) updates.configVersion = 2;

      if (Object.keys(updates).length === 0) {
        applyProxySettings();
        return;
      }

      chrome.storage.local.set(updates, applyProxySettings);
    }
  );
}

chrome.runtime.onInstalled.addListener(migrateConfiguration);
chrome.runtime.onStartup.addListener(applyProxySettings);

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;

  if (
    changes.enabled ||
    changes.proxies ||
    changes.routes ||
    changes.proxyConfig ||
    changes.rules
  ) {
    applyProxySettings();
  }
});

chrome.webRequest.onAuthRequired.addListener(
  (details, asyncCallback) => {
    if (!details.isProxy) {
      asyncCallback({});
      return;
    }

    const attempts = authAttempts.get(details.requestId) || 0;
    if (attempts >= 2) {
      authAttempts.delete(details.requestId);
      console.warn('Proxy credentials rejected multiple times. Stopping attempts.');
      asyncCallback({});
      return;
    }

    authAttempts.set(details.requestId, attempts + 1);

    chrome.storage.local.get(
      ['enabled', 'proxies', 'routes', 'proxyConfig', 'rules'],
      (result) => {
        if (!result.enabled) {
          asyncCallback({});
          return;
        }

        const { proxies, routes } = normalizeStoredConfig(result);
        let selectedProxy = findProxyForRequest(details.url, proxies, routes);

        if (!selectedProxy && details.challenger) {
          const challengerHost = normalizeHost(details.challenger.host).toLowerCase();
          const challengerPort = Number(details.challenger.port);
          selectedProxy = proxies.find((proxy) => (
            normalizeHost(proxy.host).toLowerCase() === challengerHost &&
            proxy.port === challengerPort
          )) || null;
        }

        if (!selectedProxy && proxies.length === 1) {
          selectedProxy = proxies[0];
        }

        if (selectedProxy?.username && selectedProxy?.password) {
          asyncCallback({
            authCredentials: {
              username: selectedProxy.username,
              password: selectedProxy.password
            }
          });
          return;
        }

        asyncCallback({});
      }
    );
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);

function clearAuthAttempt(details) {
  authAttempts.delete(details.requestId);
}

chrome.webRequest.onCompleted.addListener(clearAuthAttempt, { urls: ['<all_urls>'] });
chrome.webRequest.onErrorOccurred.addListener(clearAuthAttempt, { urls: ['<all_urls>'] });
