if (!window.__ps_ready) {
  window.__ps_ready = true;

  (function () {
    const HOVER = "__ps_hover";
    const PICK = "__ps_pick";

    let picking = false;
    let activeProfile = null;
    let activeGroupId = null;
    let cfg = {
      quick: false,
      autoKeyPrefix: "field",
      autoIndexStart: 1,
      defaultAttr: "text",
      defaultAll: false,
      _counter: 1,
    };

    let clickBusy = false;
    let lastClickTs = 0;

    const style = document.createElement("style");
    style.textContent = `
      .${HOVER}{ outline:2px dashed #2563eb!important; cursor:crosshair!important }
      .${PICK}{ outline:2px solid #16a34a!important }
      .__ps_hud{
        position:fixed; top:12px; right:12px; background:rgba(0,0,0,.75); color:#fff;
        padding:8px 10px; border-radius:8px; z-index:2147483647; font:12px/1.4 sans-serif; direction:rtl;
        max-width: 60vw; box-shadow: 0 4px 20px rgba(0,0,0,.35);
      }
      .__ps_hud b{ color:#60a5fa }
    `;
    (document.documentElement || document).appendChild(style);

    let hudEl = null;
    function hud(txt) {
      try {
        if (!hudEl) {
          hudEl = document.createElement("div");
          hudEl.className = "__ps_hud";
          (document.body || document.documentElement).appendChild(hudEl);
        }
        hudEl.innerHTML = txt;
      } catch {}
    }
    function hudRemove() {
      try {
        hudEl?.remove();
        hudEl = null;
      } catch {}
    }

    function toast(txt) {
      try {
        const d = document.createElement("div");
        d.textContent = txt;
        Object.assign(d.style, {
          position: "fixed",
          bottom: "12px",
          right: "12px",
          background: "rgba(0,0,0,.8)",
          color: "#fff",
          padding: "8px 10px",
          borderRadius: "8px",
          zIndex: 2147483647,
          fontSize: "12px",
          direction: "rtl",
          boxShadow: "0 4px 16px rgba(0,0,0,.35)",
        });
        (document.body || document.documentElement).appendChild(d);
        setTimeout(() => d.remove(), 1400);
      } catch {}
    }

    function highlight(el) {
      try {
        el.classList.add(PICK);
        setTimeout(() => el.classList.remove(PICK), 1200);
      } catch {}
    }

    function start(profile, groupId, pickerConfig) {
      stop();

      activeProfile = profile || activeProfile;
      activeGroupId = groupId || activeGroupId;
      cfg = Object.assign(
        {
          quick: false,
          autoKeyPrefix: "field",
          autoIndexStart: 1,
          defaultAttr: "text",
          defaultAll: false,
        },
        pickerConfig || {}
      );
      cfg._counter = Number(cfg.autoIndexStart) || 1;

      picking = true;
      window.addEventListener("mouseover", onOver, true);
      window.addEventListener("mouseout", onOut, true);
      window.addEventListener("click", onClick, true);

      if (cfg.quick) {
        hud(`حالت <b>انتخاب سریع</b> فعال شد. با هر کلیک، سلکتور ذخیره می‌شود.<br>
             prefix: <b>${cfg.autoKeyPrefix}</b> &nbsp; attr: <b>${
          cfg.defaultAttr
        }</b> &nbsp; all: <b>${cfg.defaultAll ? "بله" : "خیر"}</b><br>
             برای خروج، کلید <b>ESC</b> را بزنید.`);
      } else {
        hud(`حالت انتخاب فعال شد. با هر کلیک، از شما <b>key</b> و <b>attr</b> پرسیده می‌شود.<br>
             برای خروج، ESC را بزنید.`);
      }
    }

    function stop() {
      picking = false;
      window.removeEventListener("mouseover", onOver, true);
      window.removeEventListener("mouseout", onOut, true);
      window.removeEventListener("click", onClick, true);
      hudRemove();
      clickBusy = false;
    }

    function onOver(e) {
      if (!picking) return;
      const t = e.composedPath?.()[0] || e.target;
      t?.classList?.add(HOVER);
      e.stopPropagation();
    }
    function onOut(e) {
      if (!picking) return;
      const t = e.composedPath?.()[0] || e.target;
      t?.classList?.remove(HOVER);
      e.stopPropagation();
    }

    function getUniqueSelectorFallback(el) {
      if (!el || el.nodeType !== 1) return "";
      const escapePart = (s) =>
        s.replace(/([ !"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, "\\$1");
      if (
        el.id &&
        document.querySelectorAll(`#${escapePart(el.id)}`).length === 1
      )
        return `#${escapePart(el.id)}`;
      const nth = (node) => {
        let i = 1,
          sib = node;
        while ((sib = sib.previousElementSibling) != null) {
          if (sib.tagName === node.tagName) i++;
        }
        return i;
      };
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
        let part = cur.tagName.toLowerCase();
        if (cur.classList?.length) {
          const cls = Array.from(cur.classList)
            .filter(Boolean)
            .map(escapePart)
            .join(".");
          if (cls) part += `.${cls}`;
        }
        const test = parts.length ? `${part} > ${parts.join(" > ")}` : part;
        if (document.querySelectorAll(test).length !== 1) {
          part = `${cur.tagName.toLowerCase()}:nth-of-type(${nth(cur)})`;
        }
        parts.unshift(part);
        const full = parts.join(" > ");
        if (document.querySelectorAll(full).length === 1) return full;
        cur = cur.parentElement;
      }
      return parts.join(" > ");
    }

    function getUniqueSelector(el) {
      try {
        if (window._scraperUtils?.getUniqueSelector)
          return window._scraperUtils.getUniqueSelector(el);
      } catch {}
      return getUniqueSelectorFallback(el);
    }

    function onClick(e) {
      if (!picking) return;
      if (!e.isTrusted) return;
      const now = Date.now();
      if (now - lastClickTs < 250) return;
      lastClickTs = now;
      if (clickBusy) return;

      clickBusy = true;
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();

      const el = e.composedPath?.()[0] || e.target;
      const selector = getUniqueSelector(el);
      if (!selector || !activeProfile) {
        clickBusy = false;
        return;
      }

      let key, attr, all;
      if (cfg.quick) {
        key = `${cfg.autoKeyPrefix}${cfg._counter++}`;
        attr = cfg.defaultAttr;
        all = !!cfg.defaultAll;
      } else {
        key = prompt("نام کلید آیتم؟", "item" + Date.now());
        if (!key) {
          clickBusy = false;
          return;
        }
        attr =
          prompt("نوع برداشت؟ (text/html/attr:href/attr:src)", "text") ||
          "text";
        all = confirm("همهٔ مطابقت‌ها ذخیره شود؟ (OK=بله)");
        const rxPattern = prompt(
          "الگوی Regex (اختیاری):\nمثال: (\\d+(?:\\.\\d+)?)",
          ""
        );
        if (rxPattern) {
          const rxFlags = prompt("پرچم‌های Regex (gmi اختیاری):", "g");
          const rxMode =
            prompt(
              "حالت Regex: capture/replace (پیش‌فرض: capture)",
              "capture"
            ) || "capture";
          let rxGroup = 1;
          let rxReplacement = "";
          if (rxMode.toLowerCase() === "replace") {
            rxReplacement = prompt("Replacement (مثلاً $1 یا متن خالی):", "");
          } else {
            const gStr =
              prompt("شمارهٔ گروه برای capture (پیش‌فرض 1):", "1") || "1";
            rxGroup = Number(gStr) || 1;
          }
          rx = {
            pattern: rxPattern,
            flags: rxFlags || "",
            mode: rxMode.toLowerCase(),
            group: rxGroup,
            replacement: rxReplacement,
          };
        }
      }

      chrome.runtime.sendMessage(
        {
          type: "selectors:update",
          domain: activeProfile.domain,
          name: activeProfile.name,
          groupId: activeGroupId,
          op: "add",
          selectorItem: { key, selector, attr, all },
        },
        (res) => {
          clickBusy = false;
          if (res?.ok) {
            highlight(el);
            if (cfg.quick) {
              hud(
                `افزوده شد: <b>${key}</b> (${attr}) — ادامه دهید… (ESC برای خروج)`
              );
            } else {
              toast(`افزوده شد: ${key}`);
            }
          } else {
            toast("خطا در ذخیره‌سازی");
          }
        }
      );
    }

    window.addEventListener(
      "keydown",
      (e) => {
        if (picking && e.key === "Escape") {
          stop();
          toast("انتخاب متوقف شد");
        }
      },
      true
    );

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "start-picking") {
        start(msg.profile, msg.groupId, msg.pickerConfig);
        sendResponse({ ok: true });
        return true;
      }
      if (msg?.type === "stop-picking") {
        stop();
        sendResponse({ ok: true });
        return true;
      }
      if (msg?.type === "update-active-profile") {
        activeProfile = msg.profile;
        activeGroupId = msg.groupId || activeGroupId;
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });
  })();
}
