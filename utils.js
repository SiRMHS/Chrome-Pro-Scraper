(function () {
  function escapePart(s) {
    return s.replace(/([ !"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, "\\$1");
  }
  function nth(el) {
    let i = 1,
      sib = el;
    while ((sib = sib.previousElementSibling) != null) {
      if (sib.tagName === el.tagName) i++;
    }
    return i;
  }
  function getSimple(el) {
    if (!el || el.nodeType !== 1) return null;
    const id =
      el.id && /^[A-Za-z]+[\w\-\:\.]*$/.test(el.id)
        ? `#${escapePart(el.id)}`
        : null;
    if (id) return id;
    const classes = (el.className || "")
      .toString()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    let cls = "";
    if (classes.length && classes.every((c) => /^[A-Za-z]+[\w\-]*$/.test(c))) {
      cls = "." + classes.map(escapePart).join(".");
    }
    return el.tagName.toLowerCase() + cls;
  }
  function getUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (
      el.id &&
      document.querySelectorAll(`#${escapePart(el.id)}`).length === 1
    )
      return `#${escapePart(el.id)}`;
    const path = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      const simple = getSimple(cur);
      let sel = simple;
      if (!sel || document.querySelectorAll(simple).length > 1) {
        sel = `${cur.tagName.toLowerCase()}:nth-of-type(${nth(cur)})`;
      }
      path.unshift(sel);
      const full = path.join(" > ");
      if (document.querySelectorAll(full).length === 1) return full;
      cur = cur.parentElement;
    }
    const full = path.join(" > ");
    return full || "";
  }
  window._scraperUtils = { getUniqueSelector };
})();
