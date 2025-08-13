const KEY = "SCRAPER_PROFILES";
const APP_URL = chrome.runtime.getURL("app.html");
let appWindowId = null;

async function focusOrCreateAppWindow() {
  if (appWindowId !== null) {
    try {
      const win = await chrome.windows.get(appWindowId, { populate: true });
      await chrome.windows.update(win.id, { focused: true });
      const hasAppTab = (win.tabs || []).some((t) => t.url === APP_URL);
      if (!hasAppTab)
        await chrome.tabs.create({
          windowId: win.id,
          url: APP_URL,
          active: true,
        });
      return;
    } catch {
      appWindowId = null;
    }
  }
  const win = await chrome.windows.create({
    url: APP_URL,
    type: "popup",
    focused: true,
    width: 1100,
    height: 760,
  });
  appWindowId = win.id;
}
chrome.action.onClicked.addListener(() => focusOrCreateAppWindow());
chrome.windows.onRemoved.addListener((wid) => {
  if (wid === appWindowId) appWindowId = null;
});

function isEligibleUrl(u) {
  try {
    const url = new URL(u);
    return (
      ["http:", "https:", "file:"].includes(url.protocol) ||
      u.startsWith("about:blank")
    );
  } catch {
    return false;
  }
}
async function findEligibleTab() {
  const tabs = await chrome.tabs.query({});
  const candidates = tabs
    .filter(
      (t) =>
        t.id &&
        t.url &&
        !t.url.startsWith("chrome-extension://") &&
        isEligibleUrl(t.url)
    )
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return candidates[0] || null;
}

const locks = new Map();
function withLock(lockKey, fn) {
  const prev = locks.get(lockKey) || Promise.resolve();
  const next = prev.then(fn).catch((e) => {
    console.error(e);
    throw e;
  });
  locks.set(
    lockKey,
    next.finally(() => {
      if (locks.get(lockKey) === next) locks.delete(lockKey);
    })
  );
  return next;
}
async function getAll() {
  return new Promise((res) =>
    chrome.storage.sync.get([KEY], (d) => res(d[KEY] || {}))
  );
}
async function setAll(obj) {
  return new Promise((res) => chrome.storage.sync.set({ [KEY]: obj }, res));
}

function domainFromUrl(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function domainFromSender(sender) {
  return domainFromUrl(sender?.tab?.url || "");
}

function migrateProfile(pf) {
  if (!pf) return pf;
  if (Array.isArray(pf.selectors)) {
    const migrated = {
      name: pf.name,
      domain: pf.domain,
      groups: [{ id: "default", name: "پیش‌فرض", selectors: pf.selectors }],
      mode: "grouped",
    };
    delete migrated.selectors;
    return migrated;
  }
  if (!Array.isArray(pf.groups)) {
    return {
      name: pf.name,
      domain: pf.domain,
      groups: [{ id: "default", name: "پیش‌فرض", selectors: [] }],
      mode: "grouped",
    };
  }
  return pf;
}
function ensureGroup(profile, groupIdOrName) {
  profile.groups = profile.groups || [
    { id: "default", name: "پیش‌فرض", selectors: [] },
  ];
  if (!groupIdOrName) return profile.groups[0];
  return (
    profile.groups.find(
      (g) => g.id === groupIdOrName || g.name === groupIdOrName
    ) || profile.groups[0]
  );
}
function uuid() {
  return Math.random().toString(36).slice(2, 10);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const respondAsync = true;
  const safeSend = (r) => {
    try {
      sendResponse(r);
    } catch {}
  };

  if (msg?.type === "resize-window") {
    if (appWindowId !== null)
      chrome.windows.update(
        appWindowId,
        { width: msg.width || 1200, height: msg.height || 800 },
        () => safeSend({ ok: true })
      );
    else safeSend({ ok: false, error: "window_not_found" });
    return respondAsync;
  }
  if (msg?.type === "close-window") {
    if (appWindowId !== null)
      chrome.windows.remove(appWindowId, () => {
        appWindowId = null;
        safeSend({ ok: true });
      });
    else safeSend({ ok: false, error: "window_not_found" });
    return respondAsync;
  }

  if (msg?.type === "profiles:get") {
    (async () => {
      const all = await getAll();
      const domain = msg.domain || domainFromSender(sender);
      const domainProfiles = all[domain] || {};
      const migrated = {};
      for (const [name, pf] of Object.entries(domainProfiles))
        migrated[name] = migrateProfile(pf);
      safeSend({ ok: true, profiles: migrated });
    })();
    return respondAsync;
  }

  if (msg?.type === "profiles:save") {
    const { domain, name, profile } = msg;
    withLock(`${domain}:${name}`, async () => {
      const all = await getAll();
      all[domain] = all[domain] || {};
      all[domain][name] = migrateProfile(profile);
      await setAll(all);
      chrome.runtime.sendMessage({
        type: "domain-profiles",
        payload: { domain, profiles: all[domain] },
      });
      safeSend({ ok: true });
    });
    return respondAsync;
  }

  if (msg?.type === "profiles:delete") {
    const { domain, name } = msg;
    withLock(`${domain}:${name}`, async () => {
      const all = await getAll();
      if (all[domain] && all[domain][name]) delete all[domain][name];
      await setAll(all);
      chrome.runtime.sendMessage({
        type: "domain-profiles",
        payload: { domain, profiles: all[domain] },
      });
      safeSend({ ok: true });
    });
    return respondAsync;
  }

  if (msg?.type === "groups:add") {
    const { domain, name, groupName } = msg;
    withLock(`${domain}:${name}`, async () => {
      const all = await getAll();
      all[domain] = all[domain] || {};
      const pf = migrateProfile(all[domain][name] || { name, domain });
      pf.groups = pf.groups || [];
      const gid = uuid();
      pf.groups.push({
        id: gid,
        name: groupName || `گروه ${pf.groups.length + 1}`,
        selectors: [],
      });
      all[domain][name] = pf;
      await setAll(all);
      chrome.runtime.sendMessage({
        type: "domain-profiles",
        payload: { domain, profiles: all[domain] },
      });
      safeSend({ ok: true, groupId: gid, profile: pf });
    });
    return respondAsync;
  }

  if (msg?.type === "groups:rename") {
    const { domain, name, groupId, newName } = msg;
    withLock(`${domain}:${name}`, async () => {
      const all = await getAll();
      all[domain] = all[domain] || {};
      const pf = migrateProfile(all[domain][name]);
      if (!pf) return safeSend({ ok: false, error: "profile_not_found" });
      const g = pf.groups.find((g) => g.id === groupId);
      if (!g) return safeSend({ ok: false, error: "group_not_found" });
      g.name = newName || g.name;
      all[domain][name] = pf;
      await setAll(all);
      chrome.runtime.sendMessage({
        type: "domain-profiles",
        payload: { domain, profiles: all[domain] },
      });
      safeSend({ ok: true, profile: pf });
    });
    return respondAsync;
  }

  if (msg?.type === "groups:delete") {
    const { domain, name, groupId } = msg;
    withLock(`${domain}:${name}`, async () => {
      const all = await getAll();
      all[domain] = all[domain] || {};
      const pf = migrateProfile(all[domain][name]);
      if (!pf) return safeSend({ ok: false, error: "profile_not_found" });
      pf.groups = (pf.groups || []).filter((g) => g.id !== groupId);
      if (pf.groups.length === 0)
        pf.groups.push({ id: "default", name: "پیش‌فرض", selectors: [] });
      all[domain][name] = pf;
      await setAll(all);
      chrome.runtime.sendMessage({
        type: "domain-profiles",
        payload: { domain, profiles: all[domain] },
      });
      safeSend({ ok: true, profile: pf });
    });
    return respondAsync;
  }

  if (msg?.type === "selectors:update") {
    const {
      domain,
      name,
      groupId,
      op = "replace",
      selectorItem,
      newSelectors,
    } = msg;
    withLock(`${domain}:${name}`, async () => {
      const all = await getAll();
      all[domain] = all[domain] || {};
      const pf = migrateProfile(
        all[domain][name] || {
          name,
          domain,
          groups: [{ id: "default", name: "پیش‌فرض", selectors: [] }],
        }
      );
      const g = ensureGroup(pf, groupId);
      g.selectors = Array.isArray(g.selectors) ? g.selectors : [];
      if (op === "add" && selectorItem) g.selectors.push(selectorItem);
      if (op === "replace" && Array.isArray(newSelectors))
        g.selectors = newSelectors;
      if (op === "deleteOne" && selectorItem)
        g.selectors = g.selectors.filter(
          (s) =>
            !(
              s.key === selectorItem.key &&
              s.selector === selectorItem.selector &&
              s.attr === selectorItem.attr &&
              !!s.all === !!selectorItem.all
            )
        );
      all[domain][name] = pf;
      await setAll(all);
      chrome.runtime.sendMessage({
        type: "domain-profiles",
        payload: { domain, profiles: all[domain] },
      });
      safeSend({ ok: true, profile: pf, group: g });
    });
    return respondAsync;
  }

  if (msg?.type === "scrape:run") {
    (async () => {
      const tab = await findEligibleTab();
      if (!tab?.id) return safeSend({ ok: false, error: "no_eligible_tab" });
      try {
        const profile = migrateProfile(msg.profile);
        const groups = profile.groups || [];
        const targetGroups = msg.allGroups
          ? groups
          : groups.filter((g) => g.id === msg.groupId) || [groups[0]];

        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: false },
          func: (groups) => {
            const getVal = (el, attr) => {
              if (!el) return null;
              if (!attr || attr === "text")
                return (el.textContent || "").trim();
              if (attr === "html") return el.innerHTML;
              if (attr.startsWith("attr:"))
                return el.getAttribute(attr.split(":")[1]) || null;
              return (el.textContent || "").trim();
            };

            const applyRx = (value, rx) => {
              if (!rx || !rx.pattern) return value;

              const normalize = (str) => {
                if (typeof str !== "string") return str;
                return str
                  .replace(/\\\"/g, '"')
                  .replace(/\\\'/g, "'")
                  .replace(/\\\\/g, "\\");
              };

              try {
                const re = new RegExp(rx.pattern, rx.flags || "");
                const mode = rx.mode || "capture";
                const groupIndex = Number(rx.group ?? 1);

                const processOne = (v) => {
                  if (v == null) return v;
                  const s = normalize(String(v));

                  if (mode === "replace") {
                    return s.replace(re, rx.replacement ?? "");
                  } else {
                    const m = s.match(re);
                    return m ? m[groupIndex] ?? s : s;
                  }
                };

                if (Array.isArray(value)) {
                  return value.map(processOne);
                } else {
                  return processOne(value);
                }
              } catch {
                return value;
              }
            };

            const scrapeGroup = (g) => {
              const out = {};
              for (const s of g.selectors || []) {
                try {
                  if (!s.selector) {
                    out[s.key] = null;
                    continue;
                  }
                  const many = !!s.all;
                  if (many) {
                    const els = Array.from(
                      document.querySelectorAll(s.selector)
                    );
                    const vals = els.map((el) => getVal(el, s.attr || "text"));
                    out[s.key] = applyRx(vals, s.rx);
                  } else {
                    const el = document.querySelector(s.selector);
                    const val = getVal(el, s.attr || "text");
                    out[s.key] = applyRx(val, s.rx);
                  }
                } catch {
                  out[s.key] = null;
                }
              }
              return out;
            };

            const result = {};
            for (const g of groups) result[g.name || g.id] = scrapeGroup(g);
            return { url: location.href, data: result };
          },
          args: [targetGroups],
        });
        safeSend({ ok: true, result });
      } catch (e) {
        safeSend({ ok: false, error: String(e) });
      }
    })();
    return respondAsync;
  }

  return false;
});
