// Popup UI for multi-proxy routing

document.addEventListener('DOMContentLoaded', () => {
  const DIRECT_PROXY_ID = '__DIRECT__';

  const extToggle = document.getElementById('extension-toggle');
  const statusCard = document.getElementById('status-card');
  const statusText = document.getElementById('status-text');
  const proxyCount = document.getElementById('proxy-count');
  const routesCount = document.getElementById('routes-count');
  const proxyList = document.getElementById('proxy-list');
  const routeList = document.getElementById('route-list');
  const btnAddProxy = document.getElementById('btn-add-proxy');
  const btnImportProxy = document.getElementById('btn-import-proxy');
  const btnAddRoute = document.getElementById('btn-add-route');
  const btnSave = document.getElementById('btn-save');
  const saveState = document.getElementById('save-state');
  const saveStateText = document.getElementById('save-state-text');
  const testUrl = document.getElementById('test-url');
  const btnTest = document.getElementById('btn-test');
  const btnProbe = document.getElementById('btn-probe');
  const btnTestAllRules = document.getElementById('btn-test-all-rules');
  const testResult = document.getElementById('test-result');
  const testBatch = document.getElementById('test-batch');
  const resultBadge = document.getElementById('result-badge');
  const resultReason = document.getElementById('result-reason');
  const probeBadge = document.getElementById('probe-badge');
  const probeReason = document.getElementById('probe-reason');
  const toast = document.getElementById('toast');
  const currentHost = document.getElementById('current-host');
  const currentRouteBadge = document.getElementById('current-route-badge');
  const currentRouteDetail = document.getElementById('current-route-detail');
  const btnAddCurrentRoute = document.getElementById('btn-add-current-route');
  const importModal = document.getElementById('import-modal');
  const importDefaultType = document.getElementById('import-default-type');
  const importProxyText = document.getElementById('import-proxy-text');
  const importFeedback = document.getElementById('import-feedback');
  const btnImportClose = document.getElementById('btn-import-close');
  const btnImportCancel = document.getElementById('btn-import-cancel');
  const btnImportConfirm = document.getElementById('btn-import-confirm');

  let proxies = [];
  let routes = [];
  let savedFingerprint = '';
  let currentTabUrl = '';
  let dirtyTimer = null;

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createBlankProxy() {
    return {
      id: createId('proxy'),
      name: `Proxy ${proxies.length + 1}`,
      type: 'HTTP',
      host: '',
      port: 8080,
      username: '',
      password: ''
    };
  }

  function mapSchemeToType(scheme) {
    const value = String(scheme || '').toLowerCase().replace(/:$/, '');
    if (value === 'https') return 'HTTPS';
    if (value === 'socks5' || value === 'socks4' || value === 'socks') return 'SOCKS5';
    if (value === 'http' || value === 'proxy') return 'HTTP';
    return null;
  }

  function isValidPort(port) {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }

  function decodeMaybe(value) {
    try {
      return decodeURIComponent(String(value || ''));
    } catch {
      return String(value || '');
    }
  }

  function proxyFingerprint(proxy) {
    return [
      String(proxy.type || 'HTTP').toUpperCase(),
      normalizeHost(proxy.host).toLowerCase(),
      String(proxy.port || ''),
      String(proxy.username || ''),
      String(proxy.password || '')
    ].join('|');
  }

  function parseHostPortAuth(value, type, username = '', password = '') {
    let rest = String(value || '').trim();
    if (!rest) return { error: 'Missing host' };

    let host = '';
    let portText = '';
    let user = username;
    let pass = password;

    if (rest.startsWith('[')) {
      const close = rest.indexOf(']');
      if (close < 0) return { error: 'Invalid IPv6 host' };
      host = rest.slice(1, close).trim();
      rest = rest.slice(close + 1).trim();
      if (!rest.startsWith(':')) return { error: 'Missing port after IPv6 host' };
      const parts = rest.slice(1).split(':');
      portText = parts[0];
      if (parts.length >= 3) {
        user = parts[1];
        pass = parts.slice(2).join(':');
      } else if (parts.length === 2) {
        user = parts[1];
        pass = '';
      }
    } else {
      const parts = rest.split(':');
      if (parts.length < 2) return { error: 'Expected host:port' };

      if (parts.length === 2) {
        host = parts[0];
        portText = parts[1];
      } else if (parts.length === 3) {
        host = parts[0];
        portText = parts[1];
        user = parts[2];
        pass = '';
      } else {
        host = parts[0];
        portText = parts[1];
        user = parts[2];
        pass = parts.slice(3).join(':');
      }
    }

    host = normalizeHost(host);
    if (!host || /\s/.test(host) || host.includes('/')) {
      return { error: 'Invalid host' };
    }

    const port = Number.parseInt(portText, 10);
    if (!isValidPort(port)) return { error: 'Port must be 1–65535' };

    return {
      type: String(type || 'HTTP').toUpperCase(),
      host,
      port,
      username: decodeMaybe(user),
      password: decodeMaybe(pass)
    };
  }

  function looksLikeHostPort(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (text.startsWith('[')) return /\]:\d+$/.test(text) || /\]:\d+:/.test(text);
    const parts = text.split(':');
    if (parts.length < 2) return false;
    return /^\d+$/.test(parts[1]);
  }

  function parseProxyLine(rawLine, defaultType = 'HTTP') {
    let line = String(rawLine || '').trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      return { skip: true };
    }

    if (
      (line.startsWith('"') && line.endsWith('"')) ||
      (line.startsWith("'") && line.endsWith("'"))
    ) {
      line = line.slice(1, -1).trim();
    }

    line = line.replace(/,\s*$/, '').trim();
    if (!line) return { skip: true };

    // type|host|port|user|pass  or  host|port|user|pass
    if (line.includes('|') && !line.includes('://')) {
      const parts = line.split('|').map((part) => part.trim());
      if (parts.length >= 2) {
        let type = defaultType;
        let host;
        let port;
        let username = '';
        let password = '';

        const token = parts[0].toUpperCase();
        const maybeType = mapSchemeToType(parts[0]) || (
          token === 'HTTP' || token === 'HTTPS' || token === 'SOCKS5' || token === 'SOCKS'
            ? (token === 'SOCKS' ? 'SOCKS5' : token)
            : null
        );

        if (maybeType && parts.length >= 3) {
          type = maybeType;
          host = parts[1];
          port = parts[2];
          username = parts[3] || '';
          password = parts.slice(4).join('|') || '';
        } else {
          host = parts[0];
          port = parts[1];
          username = parts[2] || '';
          password = parts.slice(3).join('|') || '';
        }

        return parseHostPortAuth(
          host.includes(':') && !host.startsWith('[') && host.includes('::')
            ? `[${host}]:${port}`
            : `${host}:${port}`,
          type,
          username,
          password
        );
      }
    }

    // host,port,user,pass  (CSV without scheme)
    if (line.includes(',') && !line.includes('://') && !line.includes('@')) {
      const parts = line.split(',').map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
        const maybeType = mapSchemeToType(parts[0]) || (
          ['HTTP', 'HTTPS', 'SOCKS5'].includes(parts[0].toUpperCase()) ? parts[0].toUpperCase() : null
        );
        if (maybeType && parts.length >= 3) {
          return parseHostPortAuth(`${parts[1]}:${parts[2]}`, maybeType, parts[3] || '', parts.slice(4).join(',') || '');
        }
        return parseHostPortAuth(`${parts[0]}:${parts[1]}`, defaultType, parts[2] || '', parts.slice(3).join(',') || '');
      }
    }

    // scheme://...
    const schemeMatch = line.match(/^(https?|socks5?|socks4?|proxy):\/\//i);
    if (schemeMatch) {
      const type = mapSchemeToType(schemeMatch[1]) || defaultType;
      const rest = line.slice(schemeMatch[0].length);

      if (rest.includes('@')) {
        const atIndex = rest.indexOf('@');
        const userinfo = rest.slice(0, atIndex);
        const hostport = rest.slice(atIndex + 1);
        const colonIndex = userinfo.indexOf(':');
        const username = colonIndex >= 0 ? userinfo.slice(0, colonIndex) : userinfo;
        const password = colonIndex >= 0 ? userinfo.slice(colonIndex + 1) : '';
        return parseHostPortAuth(hostport, type, username, password);
      }

      return parseHostPortAuth(rest, type);
    }

    // user:pass@host:port  OR  host:port@user:pass
    if (line.includes('@')) {
      const atIndex = line.indexOf('@');
      const left = line.slice(0, atIndex);
      const right = line.slice(atIndex + 1);

      if (looksLikeHostPort(left) && !looksLikeHostPort(right)) {
        const colonIndex = right.indexOf(':');
        const username = colonIndex >= 0 ? right.slice(0, colonIndex) : right;
        const password = colonIndex >= 0 ? right.slice(colonIndex + 1) : '';
        return parseHostPortAuth(left, defaultType, username, password);
      }

      const colonIndex = left.indexOf(':');
      const username = colonIndex >= 0 ? left.slice(0, colonIndex) : left;
      const password = colonIndex >= 0 ? left.slice(colonIndex + 1) : '';
      return parseHostPortAuth(right, defaultType, username, password);
    }

    return parseHostPortAuth(line, defaultType);
  }

  function parseProxyImportText(text, defaultType = 'HTTP') {
    const raw = String(text || '').trim();
    if (!raw) {
      return { imported: [], errors: ['Paste at least one proxy line.'], skipped: 0 };
    }

    // JSON array of proxy objects
    if (raw.startsWith('[')) {
      try {
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) {
          return { imported: [], errors: ['JSON root must be an array.'], skipped: 0 };
        }

        const imported = [];
        const errors = [];
        data.forEach((item, index) => {
          if (!item || typeof item !== 'object') {
            errors.push(`Item ${index + 1}: expected an object`);
            return;
          }
          const type = mapSchemeToType(item.type || item.protocol || item.scheme)
            || (['HTTP', 'HTTPS', 'SOCKS5'].includes(String(item.type || '').toUpperCase())
              ? String(item.type).toUpperCase()
              : defaultType);

          let endpoint = item.endpoint || item.address || item.proxy || '';
          if (item.host != null && item.port != null) {
            const hostValue = String(item.host).trim();
            const needsBrackets = hostValue.includes(':') && !hostValue.startsWith('[');
            endpoint = needsBrackets ? `[${hostValue}]:${item.port}` : `${hostValue}:${item.port}`;
          }

          const parsed = parseHostPortAuth(
            endpoint,
            type,
            item.username || item.user || '',
            item.password || item.pass || ''
          );
          if (parsed.error) {
            errors.push(`Item ${index + 1}: ${parsed.error}`);
            return;
          }
          imported.push({
            ...parsed,
            name: String(item.name || '').trim()
          });
        });
        return { imported, errors, skipped: 0 };
      } catch {
        // Fall through to line parser if not valid JSON
      }
    }

    const lines = raw.split(/\r?\n/);
    const imported = [];
    const errors = [];
    let skipped = 0;

    lines.forEach((line, index) => {
      const parsed = parseProxyLine(line, defaultType);
      if (parsed.skip) {
        if (String(line || '').trim()) skipped += 1;
        return;
      }
      if (parsed.error) {
        errors.push(`Line ${index + 1}: ${parsed.error}`);
        return;
      }
      imported.push(parsed);
    });

    return { imported, errors, skipped };
  }

  function openImportModal() {
    importFeedback.className = 'import-feedback hidden';
    importFeedback.textContent = '';
    importProxyText.value = '';
    importModal.classList.remove('hidden');
    enhanceSelects(importModal);
    requestAnimationFrame(() => importProxyText.focus());
  }

  function closeImportModal() {
    importModal.classList.add('hidden');
    importFeedback.className = 'import-feedback hidden';
    importFeedback.textContent = '';
  }

  function applyImportedProxies() {
    const defaultType = importDefaultType.value || 'HTTP';
    const result = parseProxyImportText(importProxyText.value, defaultType);

    if (result.imported.length === 0 && result.errors.length > 0) {
      importFeedback.className = 'import-feedback error';
      importFeedback.textContent = result.errors.slice(0, 4).join(' · ');
      return;
    }

    if (result.imported.length === 0) {
      importFeedback.className = 'import-feedback error';
      importFeedback.textContent = 'No valid proxies found.';
      return;
    }

    captureDraft();

    const existing = new Set(proxies.map(proxyFingerprint));
    let added = 0;
    let duplicates = 0;
    const startIndex = proxies.length;

    result.imported.forEach((item, offset) => {
      const fingerprint = proxyFingerprint(item);
      if (existing.has(fingerprint)) {
        duplicates += 1;
        return;
      }
      existing.add(fingerprint);

      const index = startIndex + added;
      const name = item.name || `Proxy ${index + 1}`;
      proxies.push(normalizeProxy({
        id: createId('proxy'),
        name,
        type: item.type,
        host: item.host,
        port: item.port,
        username: item.username,
        password: item.password
      }, index));
      added += 1;
    });

    if (added === 0) {
      importFeedback.className = 'import-feedback warn';
      importFeedback.textContent = duplicates > 0
        ? `No new proxies added (${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped).`
        : 'No new proxies added.';
      return;
    }

    renderAll();
    closeImportModal();

    const parts = [`Imported ${added} prox${added === 1 ? 'y' : 'ies'}`];
    if (duplicates > 0) parts.push(`${duplicates} duplicate skipped`);
    if (result.errors.length > 0) parts.push(`${result.errors.length} line error`);
    showToast(parts.join(' · '));
  }

  function createBlankRoute(pattern = '') {
    return {
      id: createId('route'),
      pattern,
      proxyId: proxies[0]?.id || DIRECT_PROXY_ID
    };
  }

  function normalizeHost(host) {
    const value = String(host || '').trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      return value.slice(1, -1).trim();
    }
    return value;
  }

  function formatEndpoint(proxy) {
    const host = normalizeHost(proxy.host);
    const formattedHost = host.includes(':') ? `[${host}]` : host;
    return `${formattedHost}:${proxy.port}`;
  }

  function normalizeProxy(proxy, index) {
    const parsedPort = Number.parseInt(proxy?.port, 10);
    return {
      id: String(proxy?.id || createId('proxy')),
      name: String(proxy?.name || `Proxy ${index + 1}`),
      type: String(proxy?.type || 'HTTP').toUpperCase(),
      host: normalizeHost(proxy?.host),
      port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : '',
      username: String(proxy?.username || ''),
      password: String(proxy?.password || '')
    };
  }

  function normalizeRoute(route) {
    return {
      id: String(route?.id || createId('route')),
      pattern: String(route?.pattern || ''),
      proxyId: String(route?.proxyId || DIRECT_PROXY_ID)
    };
  }

  function normalizeStoredConfig(result) {
    let normalizedProxies = Array.isArray(result.proxies)
      ? result.proxies.map(normalizeProxy)
      : [];

    if (result.proxies === undefined && result.proxyConfig) {
      normalizedProxies = [normalizeProxy({
        ...result.proxyConfig,
        id: 'proxy_legacy',
        name: 'Default Proxy'
      }, 0)];
    }

    let normalizedRoutes = Array.isArray(result.routes)
      ? result.routes.map(normalizeRoute)
      : [];

    if (result.routes === undefined && Array.isArray(result.rules)) {
      const proxyId = normalizedProxies[0]?.id || DIRECT_PROXY_ID;
      normalizedRoutes = result.rules.map((pattern) => normalizeRoute({
        id: createId('route'),
        pattern,
        proxyId
      }));
    }

    return { proxies: normalizedProxies, routes: normalizedRoutes };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const ICONS = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"></path></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>',
    test: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>'
  };

  function closeCustomSelects(exceptShell = null) {
    document.querySelectorAll('.select-shell.open').forEach((shell) => {
      if (shell === exceptShell) return;
      shell.classList.remove('open', 'open-up');
      shell.querySelector('.select-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }

  function syncCustomSelect(select) {
    const shell = select.closest('.select-shell');
    if (!shell) return;

    const selectedOption = select.options[select.selectedIndex];
    shell.querySelector('.select-value').textContent = selectedOption?.textContent || 'Choose';
    shell.querySelectorAll('.select-option').forEach((optionButton) => {
      const selected = optionButton.dataset.value === select.value;
      optionButton.classList.toggle('selected', selected);
      optionButton.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  function setCustomSelectOpen(shell, open, focusOption = false) {
    const trigger = shell.querySelector('.select-trigger');
    if (!open) {
      shell.classList.remove('open', 'open-up');
      trigger.setAttribute('aria-expanded', 'false');
      return;
    }

    closeCustomSelects(shell);
    const rect = trigger.getBoundingClientRect();
    const optionCount = shell.querySelectorAll('.select-option').length;
    const estimatedMenuHeight = Math.min(220, optionCount * 33 + 12);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estimatedMenuHeight + 10 && rect.top > estimatedMenuHeight;

    shell.classList.toggle('open-up', openUp);
    shell.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');

    if (focusOption) {
      requestAnimationFrame(() => {
        (shell.querySelector('.select-option.selected') || shell.querySelector('.select-option'))?.focus();
      });
    }
  }

  function enhanceSelects(root = document) {
    root.querySelectorAll('select:not([data-enhanced])').forEach((select) => {
      select.dataset.enhanced = 'true';
      select.classList.add('native-select');
      select.tabIndex = -1;

      const shell = document.createElement('div');
      shell.className = 'select-shell';
      select.parentNode.insertBefore(shell, select);
      shell.appendChild(select);

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', select.getAttribute('aria-label') || 'Choose option');
      trigger.innerHTML = '<span class="select-value"></span><span class="select-chevron" aria-hidden="true"></span>';

      const menu = document.createElement('div');
      menu.className = 'select-menu';
      menu.setAttribute('role', 'listbox');

      Array.from(select.options).forEach((option) => {
        const optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = 'select-option';
        optionButton.dataset.value = option.value;
        optionButton.textContent = option.textContent;
        optionButton.setAttribute('role', 'option');
        optionButton.disabled = option.disabled;

        optionButton.addEventListener('click', () => {
          select.value = option.value;
          syncCustomSelect(select);
          setCustomSelectOpen(shell, false);
          trigger.focus();
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        optionButton.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setCustomSelectOpen(shell, false);
            trigger.focus();
          }
        });

        menu.appendChild(optionButton);
      });

      trigger.addEventListener('click', () => {
        setCustomSelectOpen(shell, !shell.classList.contains('open'));
      });

      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setCustomSelectOpen(shell, true, true);
        }
        if (event.key === 'Escape') setCustomSelectOpen(shell, false);
      });

      select.addEventListener('change', () => syncCustomSelect(select));
      shell.append(trigger, menu);
      syncCustomSelect(select);
    });
  }

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.select-shell')) closeCustomSelects();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCustomSelects();
  });

  document.addEventListener('scroll', (event) => {
    if (!event.target.closest?.('.select-menu')) closeCustomSelects();
  }, true);

  function fingerprint(config) {
    return JSON.stringify({
      proxies: config.proxies.map((proxy) => ({
        id: proxy.id,
        name: proxy.name,
        type: proxy.type,
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        password: proxy.password
      })),
      routes: config.routes.map((route) => ({
        id: route.id,
        pattern: route.pattern,
        proxyId: route.proxyId
      }))
    });
  }

  function renderAll() {
    renderProxyList();
    renderRouteList();
    updateSummary();
    queueUiRefresh();
  }

  function renderProxyList() {
    if (proxies.length === 0) {
      proxyList.innerHTML = '<div class="empty-state">No proxy profile yet. Add one, then assign websites to it.</div>';
      return;
    }

    proxyList.innerHTML = proxies.map((proxy) => {
      const hasAuth = Boolean(proxy.username || proxy.password);
      return `
        <article class="glass-panel proxy-card" data-proxy-id="${escapeHtml(proxy.id)}">
          <div class="proxy-card-header">
            <input class="profile-name" type="text" value="${escapeHtml(proxy.name)}" placeholder="Proxy name" aria-label="Proxy profile name" autocomplete="off">
            <button type="button" class="icon-btn danger" data-action="remove-proxy" title="Remove proxy" aria-label="Remove proxy">${ICONS.x}</button>
          </div>

          <div class="form-grid">
            <label class="field">
              <span>Protocol</span>
              <select class="proxy-type" aria-label="Proxy protocol">
                <option value="HTTP" ${proxy.type === 'HTTP' ? 'selected' : ''}>HTTP</option>
                <option value="HTTPS" ${proxy.type === 'HTTPS' ? 'selected' : ''}>HTTPS</option>
                <option value="SOCKS5" ${proxy.type === 'SOCKS5' ? 'selected' : ''}>SOCKS5</option>
              </select>
            </label>
            <label class="field">
              <span>Host</span>
              <input class="proxy-host" type="text" value="${escapeHtml(proxy.host)}" placeholder="IPv4, IPv6 or domain" aria-label="Proxy host" autocomplete="off" spellcheck="false">
            </label>
            <label class="field">
              <span>Port</span>
              <input class="proxy-port" type="number" value="${escapeHtml(proxy.port)}" min="1" max="65535" placeholder="8080" aria-label="Proxy port" inputmode="numeric">
            </label>
          </div>

          <details class="auth-details" ${hasAuth ? 'open' : ''}>
            <summary>Authentication (optional)</summary>
            <div class="auth-grid">
              <label class="field">
                <span>Username</span>
                <input class="proxy-username" type="text" value="${escapeHtml(proxy.username)}" placeholder="Username" aria-label="Proxy username" autocomplete="off">
              </label>
              <label class="field">
                <span>Password</span>
                <div class="password-wrap">
                  <input class="proxy-password" type="password" value="${escapeHtml(proxy.password)}" placeholder="Password" aria-label="Proxy password" autocomplete="off">
                  <button type="button" class="password-toggle" data-action="toggle-password" aria-label="Show password">Show</button>
                </div>
              </label>
            </div>
          </details>
        </article>
      `;
    }).join('');

    enhanceSelects(proxyList);
  }

  function buildProxyOptions(selectedProxyId) {
    const options = [
      `<option value="${DIRECT_PROXY_ID}" ${selectedProxyId === DIRECT_PROXY_ID ? 'selected' : ''}>Direct connection</option>`
    ];

    proxies.forEach((proxy) => {
      options.push(
        `<option value="${escapeHtml(proxy.id)}" ${selectedProxyId === proxy.id ? 'selected' : ''}>${escapeHtml(proxy.name || 'Unnamed proxy')}</option>`
      );
    });

    const exists = selectedProxyId === DIRECT_PROXY_ID || proxies.some((proxy) => proxy.id === selectedProxyId);
    if (!exists && selectedProxyId) {
      options.push(`<option value="${escapeHtml(selectedProxyId)}" selected>Missing proxy</option>`);
    }

    return options.join('');
  }

  function renderRouteList() {
    if (routes.length === 0) {
      routeList.innerHTML = '<div class="empty-state">No routing rule. Unmatched websites connect directly.</div>';
      return;
    }

    routeList.innerHTML = routes.map((route, index) => `
      <article class="glass-panel route-card" data-route-id="${escapeHtml(route.id)}">
        <div class="route-card-top">
          <span class="route-order">Rule ${index + 1}</span>
          <div class="route-actions">
            <button type="button" class="icon-btn" data-action="test-route" title="Test this rule without opening a tab" aria-label="Test rule" ${route.pattern.trim() ? '' : 'disabled'}>${ICONS.test}</button>
            <button type="button" class="icon-btn" data-action="move-up" title="Move up" aria-label="Move rule up" ${index === 0 ? 'disabled' : ''}>${ICONS.up}</button>
            <button type="button" class="icon-btn" data-action="move-down" title="Move down" aria-label="Move rule down" ${index === routes.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>
            <button type="button" class="icon-btn danger" data-action="remove-route" title="Remove rule" aria-label="Remove rule">${ICONS.x}</button>
          </div>
        </div>
        <div class="route-fields">
          <label class="field">
            <span>Website match</span>
            <input class="route-pattern" type="text" value="${escapeHtml(route.pattern)}" placeholder="example.com or *.example.com" aria-label="Route pattern" autocomplete="off" spellcheck="false">
          </label>
          <label class="field">
            <span>Connect via</span>
            <select class="route-proxy" aria-label="Assigned proxy">
              ${buildProxyOptions(route.proxyId)}
            </select>
          </label>
        </div>
      </article>
    `).join('');

    enhanceSelects(routeList);
  }

  function updateSummary() {
    proxyCount.textContent = proxies.length;
    routesCount.textContent = routes.filter((route) => route.pattern.trim()).length;
  }

  function updateStatusUI(enabled) {
    statusCard.classList.toggle('enabled', enabled);
    statusCard.classList.toggle('disabled', !enabled);
    statusText.textContent = enabled ? 'Enabled' : 'Disabled';
  }

  function showToast(message, tone = 'success') {
    toast.textContent = message;
    toast.className = `toast ${tone === 'error' ? 'error' : ''}`.trim();
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => toast.classList.add('hidden'), 2400);
  }

  function getVisibleControl(element) {
    if (element?.matches('select[data-enhanced]')) {
      return element.closest('.select-shell')?.querySelector('.select-trigger') || element;
    }
    return element;
  }

  function clearFieldError(element) {
    if (!element) return;
    element.classList.remove('is-invalid');
    element.removeAttribute('aria-invalid');
    const visibleControl = getVisibleControl(element);
    if (visibleControl !== element) {
      visibleControl.classList.remove('is-invalid');
      visibleControl.removeAttribute('aria-invalid');
    }
  }

  function failValidation(message, element) {
    document.querySelectorAll('.is-invalid').forEach(clearFieldError);
    if (element) {
      const visibleControl = getVisibleControl(element);
      element.classList.add('is-invalid');
      element.setAttribute('aria-invalid', 'true');
      visibleControl.classList.add('is-invalid');
      visibleControl.setAttribute('aria-invalid', 'true');
      visibleControl.focus();
      visibleControl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    showToast(message, 'error');
    return null;
  }

  function syncStateFromDom(strict) {
    const nextProxies = [];
    const proxyCards = [...proxyList.querySelectorAll('.proxy-card')];

    for (let index = 0; index < proxyCards.length; index += 1) {
      const card = proxyCards[index];
      const nameInput = card.querySelector('.profile-name');
      const hostInput = card.querySelector('.proxy-host');
      const portInput = card.querySelector('.proxy-port');
      const usernameInput = card.querySelector('.proxy-username');
      const passwordInput = card.querySelector('.proxy-password');

      const name = nameInput.value.trim();
      const host = normalizeHost(hostInput.value);
      const port = Number.parseInt(portInput.value, 10);
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (strict && !name) return failValidation(`Proxy ${index + 1}: enter a profile name.`, nameInput);
      if (strict && !host) return failValidation(`${name || `Proxy ${index + 1}`}: enter a host.`, hostInput);
      if (strict && (/\s/.test(host) || host.includes('/') || host.includes('://'))) {
        return failValidation(`${name || `Proxy ${index + 1}`}: enter only the host, without protocol or path.`, hostInput);
      }
      if (strict && (!Number.isInteger(port) || port < 1 || port > 65535)) {
        return failValidation(`${name || `Proxy ${index + 1}`}: port must be from 1 to 65535.`, portInput);
      }
      if (strict && Boolean(username) !== Boolean(password)) {
        return failValidation(`${name || `Proxy ${index + 1}`}: username and password must be filled together.`, username ? passwordInput : usernameInput);
      }

      nextProxies.push({
        id: card.dataset.proxyId,
        name: name || `Proxy ${index + 1}`,
        type: card.querySelector('.proxy-type').value,
        host,
        port: Number.isInteger(port) ? port : '',
        username,
        password
      });
    }

    const nextRoutes = [];
    const routeCards = [...routeList.querySelectorAll('.route-card')];
    const validProxyIds = new Set(nextProxies.map((proxy) => proxy.id));

    for (let index = 0; index < routeCards.length; index += 1) {
      const card = routeCards[index];
      const patternInput = card.querySelector('.route-pattern');
      const proxySelect = card.querySelector('.route-proxy');
      const pattern = patternInput.value.trim();
      const proxyId = proxySelect.value;

      if (strict && !pattern) {
        return failValidation(`Rule ${index + 1}: enter a domain, wildcard or URL prefix.`, patternInput);
      }
      if (strict && proxyId !== DIRECT_PROXY_ID && !validProxyIds.has(proxyId)) {
        return failValidation(`Rule ${index + 1}: choose an existing proxy.`, proxySelect);
      }

      nextRoutes.push({
        id: card.dataset.routeId,
        pattern,
        proxyId
      });
    }

    return { proxies: nextProxies, routes: nextRoutes };
  }

  function captureDraft() {
    const draft = syncStateFromDom(false);
    if (!draft) return;
    proxies = draft.proxies;
    routes = draft.routes;
  }

  function updateDirtyState() {
    const config = syncStateFromDom(false) || { proxies, routes };
    const dirty = fingerprint(config) !== savedFingerprint;
    saveState.classList.toggle('dirty', dirty);
    saveStateText.textContent = dirty ? 'Unsaved changes' : 'Up to date';
    btnSave.disabled = !dirty;
    renderCurrentRoute(config);
  }

  function queueUiRefresh() {
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(updateDirtyState, 30);
  }

  function wildcardMatches(value, pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`, 'i').test(value);
  }

  function patternMatches(formattedUrl, host, pattern) {
    if (/^https?:\/\//i.test(pattern)) {
      return formattedUrl.startsWith(pattern);
    }

    if (pattern.includes('*')) {
      return wildcardMatches(host, pattern) || wildcardMatches(formattedUrl, pattern);
    }

    const normalizedPattern = pattern.replace(/^\[|\]$/g, '').toLowerCase();
    return host === normalizedPattern || host.endsWith(`.${normalizedPattern}`);
  }

  function simulateRouting(input, currentProxies, currentRoutes) {
    let formattedUrl = input;
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(formattedUrl);
    } catch {
      return { error: 'Invalid URL' };
    }

    const host = parsedUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const proxyMap = new Map(currentProxies.map((proxy) => [proxy.id, proxy]));

    for (const route of currentRoutes) {
      if (!route.pattern || !patternMatches(formattedUrl, host, route.pattern)) continue;

      if (route.proxyId === DIRECT_PROXY_ID) {
        return { direct: true, route };
      }

      const proxy = proxyMap.get(route.proxyId);
      if (!proxy) return { error: `Rule “${route.pattern}” points to a missing proxy` };
      if (!proxy.host || !proxy.port) return { error: `Proxy “${proxy.name}” is incomplete` };
      return { direct: false, route, proxy };
    }

    return { direct: true, route: null };
  }

  function setCurrentRouteBadge(text, tone) {
    currentRouteBadge.textContent = text;
    currentRouteBadge.className = `route-state ${tone}`;
  }

  function renderCurrentRoute(config = { proxies, routes }) {
    btnAddCurrentRoute.classList.add('hidden');

    if (!currentTabUrl || !/^https?:\/\//i.test(currentTabUrl)) {
      currentHost.textContent = 'Browser page';
      currentRouteDetail.textContent = 'Proxy rules apply only to regular websites.';
      setCurrentRouteBadge('N/A', 'neutral');
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(currentTabUrl);
    } catch {
      currentHost.textContent = 'Unknown website';
      currentRouteDetail.textContent = 'Could not read the active tab URL.';
      setCurrentRouteBadge('ERROR', 'error');
      return;
    }

    currentHost.textContent = parsedUrl.hostname;
    const result = simulateRouting(currentTabUrl, config.proxies, config.routes);

    if (result.error) {
      currentRouteDetail.textContent = result.error;
      setCurrentRouteBadge('ERROR', 'error');
      return;
    }

    if (result.direct) {
      setCurrentRouteBadge('DIRECT', 'direct');
      currentRouteDetail.textContent = result.route
        ? `Matched “${result.route.pattern}” and forced a direct connection.`
        : 'No rule matches this website.';
      if (!result.route) btnAddCurrentRoute.classList.remove('hidden');
      return;
    }

    setCurrentRouteBadge(result.proxy.type, 'proxy');
    currentRouteDetail.textContent = `${result.proxy.name} · ${formatEndpoint(result.proxy)}`;
  }

  function queryCurrentTab() {
    if (!chrome.tabs?.query) {
      renderCurrentRoute();
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        currentTabUrl = '';
        renderCurrentRoute();
        return;
      }
      currentTabUrl = tabs[0]?.url || '';
      renderCurrentRoute(syncStateFromDom(false) || { proxies, routes });
    });
  }

  btnAddProxy.addEventListener('click', () => {
    captureDraft();
    proxies.push(createBlankProxy());
    renderAll();
    proxyList.querySelector('.proxy-card:last-child .profile-name')?.select();
  });

  btnImportProxy.addEventListener('click', openImportModal);
  btnImportClose.addEventListener('click', closeImportModal);
  btnImportCancel.addEventListener('click', closeImportModal);
  btnImportConfirm.addEventListener('click', applyImportedProxies);

  importModal.addEventListener('click', (event) => {
    if (event.target === importModal) closeImportModal();
  });

  importProxyText.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      applyImportedProxies();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !importModal.classList.contains('hidden')) {
      event.preventDefault();
      closeImportModal();
    }
  });

  btnAddRoute.addEventListener('click', () => {
    captureDraft();
    routes.push(createBlankRoute());
    renderRouteList();
    updateSummary();
    queueUiRefresh();
    routeList.querySelector('.route-card:last-child .route-pattern')?.focus();
  });

  btnAddCurrentRoute.addEventListener('click', () => {
    if (!currentTabUrl) return;

    let host;
    try {
      host = new URL(currentTabUrl).hostname;
    } catch {
      return;
    }

    captureDraft();
    routes.push(createBlankRoute(host));
    renderRouteList();
    updateSummary();
    queueUiRefresh();

    const lastPattern = routeList.querySelector('.route-card:last-child .route-pattern');
    lastPattern?.focus();
    lastPattern?.select();
    lastPattern?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  proxyList.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;

    if (actionButton.dataset.action === 'toggle-password') {
      const input = actionButton.closest('.password-wrap').querySelector('.proxy-password');
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      actionButton.textContent = isHidden ? 'Hide' : 'Show';
      actionButton.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      return;
    }

    if (actionButton.dataset.action !== 'remove-proxy') return;

    captureDraft();
    const card = actionButton.closest('.proxy-card');
    const proxyId = card.dataset.proxyId;
    const proxy = proxies.find((item) => item.id === proxyId);
    const affectedRoutes = routes.filter((route) => route.proxyId === proxyId).length;

    if (affectedRoutes > 0) {
      const accepted = confirm(`Remove “${proxy?.name || 'this proxy'}” and its ${affectedRoutes} assigned rule(s)?`);
      if (!accepted) return;
    }

    proxies = proxies.filter((item) => item.id !== proxyId);
    routes = routes.filter((route) => route.proxyId !== proxyId);
    renderAll();
  });

  proxyList.addEventListener('change', (event) => {
    if (!event.target.classList.contains('profile-name')) return;
    captureDraft();
    renderRouteList();
    updateSummary();
    queueUiRefresh();
  });

  routeList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const card = button.closest('.route-card');
    const routeId = card.dataset.routeId;

    if (button.dataset.action === 'test-route') {
      captureDraft();
      const route = routes.find((item) => item.id === routeId);
      if (!route?.pattern?.trim()) {
        showToast('Enter a website match first', 'error');
        return;
      }
      const url = patternToTestUrl(route.pattern);
      testUrl.value = url;
      testBatch.classList.add('hidden');
      testBatch.innerHTML = '';
      document.getElementById('test-section')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      runRoutingTest({ probe: true });
      return;
    }

    captureDraft();
    const index = routes.findIndex((route) => route.id === routeId);
    if (index < 0) return;

    const action = button.dataset.action;
    if (action === 'remove-route') {
      routes.splice(index, 1);
    } else if (action === 'move-up' && index > 0) {
      [routes[index - 1], routes[index]] = [routes[index], routes[index - 1]];
    } else if (action === 'move-down' && index < routes.length - 1) {
      [routes[index + 1], routes[index]] = [routes[index], routes[index + 1]];
    } else {
      return;
    }

    renderRouteList();
    updateSummary();
    queueUiRefresh();
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('input, select')) {
      clearFieldError(event.target);
      queueUiRefresh();
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('input, select')) {
      clearFieldError(event.target);
      queueUiRefresh();
    }
  });

  extToggle.addEventListener('change', () => {
    const enabled = extToggle.checked;
    updateStatusUI(enabled);
    chrome.storage.local.set({ enabled }, () => {
      if (chrome.runtime.lastError) {
        extToggle.checked = !enabled;
        updateStatusUI(!enabled);
        showToast(`Could not update status: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      showToast(enabled ? 'Proxy routing enabled' : 'Proxy routing disabled');
    });
  });

  btnSave.addEventListener('click', () => {
    const config = syncStateFromDom(true);
    if (!config) return;

    proxies = config.proxies;
    routes = config.routes;
    btnSave.disabled = true;
    btnSave.textContent = 'Applying…';

    chrome.storage.local.set({ proxies, routes, configVersion: 2 }, () => {
      btnSave.textContent = 'Apply changes';

      if (chrome.runtime.lastError) {
        btnSave.disabled = false;
        showToast(`Save failed: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }

      chrome.storage.local.remove(['proxyConfig', 'rules']);
      savedFingerprint = fingerprint({ proxies, routes });
      updateSummary();
      updateDirtyState();
      showToast('Changes applied');
    });
  });

  btnTest.addEventListener('click', () => runRoutingTest({ probe: false }));
  btnProbe.addEventListener('click', () => runRoutingTest({ probe: true }));
  btnTestAllRules.addEventListener('click', runAllRulesTest);
  testUrl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runRoutingTest({ probe: event.shiftKey });
    }
  });

  function patternToTestUrl(pattern) {
    const value = String(pattern || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;

    // *.example.com → https://www.example.com
    // *medium* → skip; keep simple host cases
    let host = value.replace(/\*/g, 'www');
    host = host.replace(/^\.+/, '').replace(/\.+$/, '');
    if (!host) host = value.replace(/\*/g, '');
    return `https://${host}`;
  }

  function formatRouteMatch(result) {
    if (result.error) {
      return {
        badge: 'ERROR',
        tone: 'error',
        reason: result.error
      };
    }
    if (result.direct) {
      return {
        badge: 'DIRECT',
        tone: 'direct',
        reason: result.route
          ? `Rule “${result.route.pattern}” forces a direct connection`
          : 'No matching rule'
      };
    }
    return {
      badge: result.proxy.type,
      tone: 'proxy',
      reason: `${result.route.pattern} → ${result.proxy.name} (${formatEndpoint(result.proxy)})`
    };
  }

  function setProbePending(message = 'Checking…') {
    probeBadge.textContent = '…';
    probeBadge.className = 'result-badge neutral';
    probeReason.textContent = message;
  }

  function setProbeIdle() {
    probeBadge.textContent = '—';
    probeBadge.className = 'result-badge neutral';
    probeReason.textContent = 'Run Probe to check connectivity';
  }

  async function probeUrl(url) {
    const controller = new AbortController();
    const timeoutMs = 9000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
        credentials: 'omit'
      });
      const ms = Math.round(performance.now() - started);
      clearTimeout(timer);
      return {
        ok: response.ok || (response.status >= 300 && response.status < 500),
        status: response.status,
        ms
      };
    } catch (error) {
      clearTimeout(timer);
      const ms = Math.round(performance.now() - started);
      if (error?.name === 'AbortError') {
        return { ok: false, error: `Timeout after ${timeoutMs / 1000}s`, ms };
      }
      return { ok: false, error: error?.message || 'Network error', ms };
    }
  }

  async function runRoutingTest({ probe = false } = {}) {
    const input = testUrl.value.trim();
    if (!input) return failValidation('Enter a website URL to test.', testUrl);

    const config = syncStateFromDom(false);
    if (!config) return;

    proxies = config.proxies;
    routes = config.routes;
    const result = simulateRouting(input, proxies, routes);
    const match = formatRouteMatch(result);

    testResult.classList.remove('hidden');
    testBatch.classList.add('hidden');
    resultBadge.textContent = match.badge;
    resultBadge.className = `result-badge ${match.tone}`;
    resultReason.textContent = match.reason;

    if (!probe) {
      setProbeIdle();
      return;
    }

    let probeTarget = input;
    if (!/^https?:\/\//i.test(probeTarget)) {
      probeTarget = `https://${probeTarget}`;
    }

    setProbePending(extToggle.checked
      ? 'Fetching through current browser proxy settings…'
      : 'Extension is off — probing DIRECT (enable + Apply for proxy path)');

    btnProbe.disabled = true;
    btnTest.disabled = true;
    const live = await probeUrl(probeTarget);
    btnProbe.disabled = false;
    btnTest.disabled = false;

    if (live.ok) {
      probeBadge.textContent = 'OK';
      probeBadge.className = 'result-badge direct';
      probeReason.textContent = `HTTP ${live.status} · ${live.ms} ms`;
      return;
    }

    probeBadge.textContent = 'FAIL';
    probeBadge.className = 'result-badge error';
    probeReason.textContent = `${live.error || 'Unreachable'} · ${live.ms} ms`;
  }

  async function runAllRulesTest() {
    captureDraft();
    const activeRoutes = routes.filter((route) => route.pattern.trim());
    if (activeRoutes.length === 0) {
      showToast('No routing rules to test', 'error');
      return;
    }

    testBatch.classList.remove('hidden');
    testResult.classList.add('hidden');
    testBatch.innerHTML = `<div class="test-batch-status">Testing ${activeRoutes.length} rule${activeRoutes.length === 1 ? '' : 's'}…</div>`;

    btnTestAllRules.disabled = true;
    const rows = [];

    for (let index = 0; index < activeRoutes.length; index += 1) {
      const route = activeRoutes[index];
      const url = patternToTestUrl(route.pattern);
      const match = formatRouteMatch(simulateRouting(url, proxies, routes));
      const live = await probeUrl(url);

      rows.push(`
        <div class="test-batch-row">
          <div class="test-batch-main">
            <strong>Rule ${index + 1}</strong>
            <span class="test-batch-pattern">${escapeHtml(route.pattern)}</span>
          </div>
          <div class="test-batch-meta">
            <span class="result-badge ${match.tone}">${escapeHtml(match.badge)}</span>
            <span class="result-badge ${live.ok ? 'direct' : 'error'}">${live.ok ? `OK ${live.ms}ms` : 'FAIL'}</span>
          </div>
          <div class="test-batch-detail">${escapeHtml(match.reason)}${live.ok ? '' : ` · ${escapeHtml(live.error || 'Unreachable')}`}</div>
        </div>
      `);

      testBatch.innerHTML = rows.join('');
    }

    btnTestAllRules.disabled = false;
    showToast(`Finished testing ${activeRoutes.length} rule${activeRoutes.length === 1 ? '' : 's'}`);
  }

  chrome.storage.local.get(
    ['enabled', 'proxies', 'routes', 'proxyConfig', 'rules'],
    (result) => {
      const normalized = normalizeStoredConfig(result);
      proxies = normalized.proxies;
      routes = normalized.routes;
      savedFingerprint = fingerprint({ proxies, routes });

      extToggle.checked = result.enabled ?? false;
      updateStatusUI(extToggle.checked);
      renderAll();
      queryCurrentTab();
    }
  );
});
