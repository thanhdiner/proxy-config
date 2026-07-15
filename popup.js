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
  const btnAddRoute = document.getElementById('btn-add-route');
  const btnSave = document.getElementById('btn-save');
  const saveState = document.getElementById('save-state');
  const saveStateText = document.getElementById('save-state-text');
  const testUrl = document.getElementById('test-url');
  const btnTest = document.getElementById('btn-test');
  const testResult = document.getElementById('test-result');
  const resultBadge = document.getElementById('result-badge');
  const resultReason = document.getElementById('result-reason');
  const toast = document.getElementById('toast');
  const currentHost = document.getElementById('current-host');
  const currentRouteBadge = document.getElementById('current-route-badge');
  const currentRouteDetail = document.getElementById('current-route-detail');
  const btnAddCurrentRoute = document.getElementById('btn-add-current-route');

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
        <article class="proxy-card" data-proxy-id="${escapeHtml(proxy.id)}">
          <div class="proxy-card-header">
            <input class="profile-name" type="text" value="${escapeHtml(proxy.name)}" placeholder="Proxy name" aria-label="Proxy profile name" autocomplete="off">
            <button type="button" class="icon-btn danger" data-action="remove-proxy" title="Remove proxy" aria-label="Remove proxy">×</button>
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
      <article class="route-card" data-route-id="${escapeHtml(route.id)}">
        <div class="route-card-top">
          <span class="route-order">Rule ${index + 1}</span>
          <div class="route-actions">
            <button type="button" class="icon-btn" data-action="move-up" title="Move up" aria-label="Move rule up" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="icon-btn" data-action="move-down" title="Move down" aria-label="Move rule down" ${index === routes.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="icon-btn danger" data-action="remove-route" title="Remove rule" aria-label="Remove rule">×</button>
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
    statusCard.className = `status-card ${enabled ? 'enabled' : 'disabled'}`;
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

    captureDraft();
    const card = button.closest('.route-card');
    const routeId = card.dataset.routeId;
    const index = routes.findIndex((route) => route.id === routeId);
    if (index < 0) return;

    const action = button.dataset.action;
    if (action === 'remove-route') {
      routes.splice(index, 1);
    } else if (action === 'move-up' && index > 0) {
      [routes[index - 1], routes[index]] = [routes[index], routes[index - 1]];
    } else if (action === 'move-down' && index < routes.length - 1) {
      [routes[index + 1], routes[index]] = [routes[index], routes[index + 1]];
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

  btnTest.addEventListener('click', runRoutingTest);
  testUrl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runRoutingTest();
  });

  function runRoutingTest() {
    const input = testUrl.value.trim();
    if (!input) return failValidation('Enter a website URL to test.', testUrl);

    const config = syncStateFromDom(false);
    if (!config) return;

    proxies = config.proxies;
    routes = config.routes;
    const result = simulateRouting(input, proxies, routes);

    testResult.classList.remove('hidden');

    if (result.error) {
      resultBadge.textContent = 'ERROR';
      resultBadge.className = 'result-badge error';
      resultReason.textContent = result.error;
      return;
    }

    if (result.direct) {
      resultBadge.textContent = 'DIRECT';
      resultBadge.className = 'result-badge direct';
      resultReason.textContent = result.route
        ? `Rule “${result.route.pattern}” forces a direct connection`
        : 'No matching rule';
      return;
    }

    resultBadge.textContent = result.proxy.type;
    resultBadge.className = 'result-badge proxy';
    resultReason.textContent = `${result.route.pattern} → ${result.proxy.name} (${formatEndpoint(result.proxy)})`;
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
