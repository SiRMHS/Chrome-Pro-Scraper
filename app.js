const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const domainView = $("#domainView");
const refreshProfiles = $("#refreshProfiles");
const profileSelect = $("#profileSelect");
const newProfileName = $("#newProfileName");
const createProfile = $("#createProfile");
const deleteProfile = $("#deleteProfile");

const groupSelect = $("#groupSelect");
const newGroupName = $("#newGroupName");
const addGroupBtn = $("#addGroup");
const renameGroupBtn = $("#renameGroup");
const deleteGroupBtn = $("#deleteGroup");

const startPick = $("#startPick");
const stopPick = $("#stopPick");
const testScrape = $("#testScrape");
const scrapeAll = $("#scrapeAll");
const exportJSON = $("#exportJSON");
const exportCSV = $("#exportCSV");

const selectorsList = $("#selectorsList");
const preview = $("#preview");
const rowTmpl = $("#selectorRowTmpl");

const btnResize = $("#btnResize");
const btnClose = $("#btnClose");

let currentDomain = "";
let profiles = {};
let currentProfile = null;
let currentGroup = null;
let lastResult = null;

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
async function getTargetTab() {
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
function domainFromUrl(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function initDomainAndProfiles() {
  const tab = await getTargetTab();
  currentDomain = domainFromUrl(tab?.url || "");
  domainView.value = currentDomain || "(نامشخص)";
  await loadProfiles();
}
function loadProfiles() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "profiles:get", domain: currentDomain },
      (res) => {
        profiles = res?.profiles || {};
        fillProfileSelect();
        resolve();
      }
    );
  });
}
function fillProfileSelect() {
  profileSelect.innerHTML = "";
  Object.keys(profiles).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    profileSelect.appendChild(opt);
  });
  if (profileSelect.options.length > 0) {
    profileSelect.value = profileSelect.options[0].value;
    setCurrentProfile(profileSelect.value);
  } else {
    currentProfile = null;
    currentGroup = null;
    groupSelect.innerHTML = "";
    renderSelectors([]);
  }
}
function setCurrentProfile(name) {
  currentProfile = profiles[name] || null;
  fillGroupSelect();
}
function fillGroupSelect() {
  groupSelect.innerHTML = "";
  if (!currentProfile || !Array.isArray(currentProfile.groups)) {
    renderSelectors([]);
    return;
  }
  currentProfile.groups.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.name;
    groupSelect.appendChild(opt);
  });
  if (groupSelect.options.length > 0) {
    groupSelect.value = groupSelect.options[0].value;
    setCurrentGroup(groupSelect.value);
  } else {
    currentGroup = null;
    renderSelectors([]);
  }
}
function setCurrentGroup(groupId) {
  if (!currentProfile) return;
  currentGroup =
    currentProfile.groups.find((g) => g.id === groupId) ||
    currentProfile.groups[0] ||
    null;
  renderSelectors(currentGroup?.selectors || []);
}

function renderSelectors(items) {
  selectorsList.innerHTML = "";
  (items || []).forEach(addSelectorRow);
  const addBtn = document.createElement("button");
  addBtn.className = "btn sm";
  addBtn.textContent = "افزودن ردیف";
  addBtn.addEventListener("click", () =>
    addSelectorRow({ key: "", selector: "", attr: "text", all: false })
  );
  selectorsList.appendChild(addBtn);
}
function addSelectorRow(item) {
  const n = rowTmpl.content.cloneNode(true);
  const k = $(".k", n),
    s = $(".s", n),
    a = $(".a", n),
    all = $(".all", n),
    rxp = $(".rxp", n),
    rxf = $(".rxf", n),
    rxm = $(".rxm", n),
    rxg = $(".rxg", n),
    rxr = $(".rxr", n),
    del = $(".del", n);

  k.value = item.key || "";
  s.value = item.selector || "";
  a.value = item.attr || "text";
  all.checked = !!item.all;

  const rx = item.rx || {};
  rxp.value = rx.pattern || "";
  rxf.value = rx.flags || "";
  rxm.value = rx.mode || "capture";
  rxg.value = rx.group ?? 1;
  rxr.value = rx.replacement || "";

  const rowEl = $(".row", n);

  const saveRowDebounced = () => saveSelectorsDebounced();
  [k, s, a, rxp, rxf, rxm, rxg, rxr].forEach((el) =>
    el.addEventListener("input", saveRowDebounced)
  );
  all.addEventListener("change", saveRowDebounced);

  del.addEventListener("click", async () => {
    rowEl.remove();
    await saveSelectors();
  });

  selectorsList.appendChild(n);
}

let saveTimer = null;
function saveSelectorsDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSelectors, 300);
}
async function saveSelectors() {
  if (!currentProfile || !currentGroup) return;
  const rows = $$(".row", selectorsList);
  const newSel = rows
    .map((r) => {
      const key = $(".k", r).value.trim();
      const selector = $(".s", r).value.trim();
      if (!key || !selector) return null;

      const attr = $(".a", r).value.trim() || "text";
      const all = $(".all", r).checked;

      const pattern = $(".rxp", r).value.trim();
      const flags = $(".rxf", r).value.trim();
      const mode = $(".rxm", r).value;
      const group = Number($(".rxg", r).value || 1);
      const replacement = $(".rxr", r).value;

      const rx = pattern
        ? { pattern, flags, mode, group, replacement }
        : undefined;

      return { key, selector, attr, all, ...(rx ? { rx } : {}) };
    })
    .filter(Boolean);

  await new Promise((res) =>
    chrome.runtime.sendMessage(
      {
        type: "selectors:update",
        domain: currentDomain,
        name: currentProfile.name,
        groupId: currentGroup.id,
        op: "replace",
        newSelectors: newSel,
      },
      () => res()
    )
  );

  await loadProfiles();
  profileSelect.value = currentProfile.name;
  setCurrentProfile(currentProfile.name);
  groupSelect.value = currentGroup.id;
  setCurrentGroup(currentGroup.id);
}

refreshProfiles.addEventListener("click", initDomainAndProfiles);

profileSelect.addEventListener("change", (e) =>
  setCurrentProfile(e.target.value)
);

createProfile.addEventListener("click", async () => {
  const name = (newProfileName.value || profileSelect.value || "").trim();
  if (!name) return alert("نام پروفایل را وارد کنید");

  const exists = !!profiles[name];
  const base = exists
    ? profiles[name]
    : {
        name,
        domain: currentDomain,
        groups: [{ id: "default", name: "پیش‌فرض", selectors: [] }],
      };

  await new Promise((res) =>
    chrome.runtime.sendMessage(
      {
        type: "profiles:save",
        domain: currentDomain,
        name,
        profile: base,
      },
      () => res()
    )
  );

  await loadProfiles();
  profileSelect.value = name;
  setCurrentProfile(name);
  newProfileName.value = "";
});

deleteProfile.addEventListener("click", async () => {
  const name = profileSelect.value;
  if (!name) return;
  if (!confirm(`پروفایل "${name}" حذف شود؟`)) return;

  await new Promise((res) =>
    chrome.runtime.sendMessage(
      {
        type: "profiles:delete",
        domain: currentDomain,
        name,
      },
      () => res()
    )
  );

  await loadProfiles();
});

groupSelect.addEventListener("change", (e) => setCurrentGroup(e.target.value));

addGroupBtn.addEventListener("click", async () => {
  if (!currentProfile) return;
  const gname = (newGroupName.value || "").trim() || `گروه ${Date.now()}`;

  await new Promise((res) =>
    chrome.runtime.sendMessage(
      {
        type: "groups:add",
        domain: currentDomain,
        name: currentProfile.name,
        groupName: gname,
      },
      () => res()
    )
  );

  await loadProfiles();
  profileSelect.value = currentProfile.name;
  setCurrentProfile(currentProfile.name);
  const created = currentProfile.groups?.find((g) => g.name === gname);
  if (created) {
    groupSelect.value = created.id;
    setCurrentGroup(created.id);
  }
  newGroupName.value = "";
});

renameGroupBtn.addEventListener("click", async () => {
  if (!currentProfile || !currentGroup) return;
  const newName = prompt("نام جدید گروه:", currentGroup.name);
  if (!newName) return;

  await new Promise((res) =>
    chrome.runtime.sendMessage(
      {
        type: "groups:rename",
        domain: currentDomain,
        name: currentProfile.name,
        groupId: currentGroup.id,
        newName,
      },
      () => res()
    )
  );

  await loadProfiles();
  profileSelect.value = currentProfile.name;
  setCurrentProfile(currentProfile.name);
  groupSelect.value = currentGroup.id;
  setCurrentGroup(currentGroup.id);
});

deleteGroupBtn.addEventListener("click", async () => {
  if (!currentProfile || !currentGroup) return;
  if (!confirm(`حذف گروه "${currentGroup.name}"؟`)) return;

  await new Promise((res) =>
    chrome.runtime.sendMessage(
      {
        type: "groups:delete",
        domain: currentDomain,
        name: currentProfile.name,
        groupId: currentGroup.id,
      },
      () => res()
    )
  );

  await loadProfiles();
  profileSelect.value = currentProfile.name;
  setCurrentProfile(currentProfile.name);
});

startPick.addEventListener("click", async () => {
  const tab = await getTargetTab();
  if (!tab?.id) return alert("تب مناسبی برای تزریق پیدا نشد.");
  if (!currentProfile) return alert("پروفایل انتخاب نشده است.");
  if (!currentGroup) return alert("گروه انتخاب نشده است.");

  let profileToUse = profiles[currentProfile.name];
  if (!profileToUse) {
    profileToUse = {
      name: currentProfile.name,
      domain: currentDomain,
      groups: [{ id: "default", name: "پیش‌فرض", selectors: [] }],
    };
    await new Promise((res) =>
      chrome.runtime.sendMessage(
        {
          type: "profiles:save",
          domain: currentDomain,
          name: currentProfile.name,
          profile: profileToUse,
        },
        () => res()
      )
    );
    await loadProfiles();
  }

  const useQuick = confirm(
    "حالت سریع (بدون پرسش‌های تکراری) فعال شود؟\nOK = بله، Cancel = خیر"
  );
  let pickerConfig = { quick: false };
  if (useQuick) {
    const prefix = prompt("پیشوند کلید (مثلاً field):", "field") || "field";
    const attr =
      prompt("نوع برداشت پیش‌فرض (text/html/attr:href/attr:src):", "text") ||
      "text";
    const all = confirm("برای هر سلکتور، همهٔ مطابقت‌ها ذخیره شود؟ (OK=بله)");
    pickerConfig = {
      quick: true,
      autoKeyPrefix: prefix,
      autoIndexStart: 1,
      defaultAttr: attr,
      defaultAll: !!all,
    };
  }

  await ensureContentInjected(tab.id);
  chrome.tabs.sendMessage(tab.id, {
    type: "start-picking",
    profile: { name: currentProfile.name, domain: currentDomain },
    groupId: currentGroup.id,
    pickerConfig,
  });
});

stopPick.addEventListener("click", async () => {
  const tab = await getTargetTab();
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "stop-picking" });
});

testScrape.addEventListener("click", async () => {
  if (!currentProfile || !currentGroup)
    return alert("پروفایل/گروه انتخاب نشده است.");
  await saveSelectors();
  chrome.runtime.sendMessage(
    {
      type: "scrape:run",
      profile: currentProfile,
      groupId: currentGroup.id,
      allGroups: false,
    },
    (res) => {
      if (res?.ok) {
        preview.textContent = JSON.stringify(res.result, null, 2);
        lastResult = res.result;
      } else {
        preview.textContent = "Error: " + (res?.error || "unknown");
      }
    }
  );
});

scrapeAll.addEventListener("click", async () => {
  if (!currentProfile) return alert("پروفایل انتخاب نشده است.");
  await saveSelectors();
  chrome.runtime.sendMessage(
    {
      type: "scrape:run",
      profile: currentProfile,
      allGroups: true,
    },
    (res) => {
      if (res?.ok) {
        preview.textContent = JSON.stringify(res.result, null, 2);
        lastResult = res.result;
      } else {
        preview.textContent = "Error: " + (res?.error || "unknown");
      }
    }
  );
});

exportJSON.addEventListener("click", () => {
  if (!lastResult) return alert("ابتدا اسکرپ را اجرا کنید.");
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `scrape_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

exportCSV.addEventListener("click", () => {
  if (!lastResult) return alert("ابتدا اسکرپ را اجرا کنید.");
  const data = lastResult.data || {};
  const cols = [];
  for (const g of Object.keys(data)) {
    const obj = data[g] || {};
    for (const k of Object.keys(obj)) {
      const col = `${g}.${k}`;
      if (!cols.includes(col)) cols.push(col);
    }
  }
  const vals = cols.map((col) => {
    const [g, ...rk] = col.split(".");
    const k = rk.join(".");
    const v = (data[g] || {})[k];
    if (Array.isArray(v))
      return `"${v
        .map((x) => x ?? "")
        .join(" | ")
        .replace(/"/g, '""')}"`;
    return `"${(v ?? "").toString().replace(/"/g, '""')}"`;
  });
  const csv = cols.join(",") + "\n" + vals.join(",");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `scrape_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

async function ensureContentInjected(tabId) {
  try {
    const [{ result }] = await chrome.scripting
      .executeScript({
        target: { tabId, allFrames: true },
        func: () => !!window.__ps_ready,
      })
      .catch(() => [{ result: false }]);
    if (result) return;

    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["utils.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["contentScript.js"],
    });
  } catch (e) {
    console.error("inject failed", e);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.SCRAPER_PROFILES) return;
  const val = changes.SCRAPER_PROFILES.newValue || {};
  profiles = val[currentDomain] || {};
  const selectedProfile = profileSelect.value;
  const selectedGroup = groupSelect.value;
  fillProfileSelect();
  if (profiles[selectedProfile]) {
    profileSelect.value = selectedProfile;
    setCurrentProfile(selectedProfile);
    if (selectedGroup) {
      groupSelect.value = selectedGroup;
      setCurrentGroup(selectedGroup);
    }
  }
});

btnResize?.addEventListener("click", () =>
  chrome.runtime.sendMessage({
    type: "resize-window",
    width: 1200,
    height: 800,
  })
);
btnClose?.addEventListener("click", () =>
  chrome.runtime.sendMessage({ type: "close-window" })
);

initDomainAndProfiles();
