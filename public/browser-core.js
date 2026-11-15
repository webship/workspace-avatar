// The reading window's tools for the AI Assistant: the parts with rules, usable under test.
//
// Loaded by the page (window.wsBrowserCore) and required by the unit tests. A page is given here as a
// plain list of its blocks, in order: { tag: 'h2', text: 'Delivery' }, { tag: 'p', text: '…' }.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.wsBrowserCore = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const level = (tag) => { const m = String(tag || '').toLowerCase().match(/^h([1-6])$/); return m ? Number(m[1]) : 0; };

  /**
   * The sections of a page: each heading with what follows it, up to the next heading of its own level
   * or a higher one. What comes before the first heading is a section called "The top of the page".
   * `{ title, level, index, text }`, where `index` is the heading's place among the blocks (-1 for the top).
   */
  function sectionsOf(blocks) {
    const list = (Array.isArray(blocks) ? blocks : []).map((b) => ({ tag: String((b && b.tag) || '').toLowerCase(), text: tidy(b && b.text) })).filter((b) => b.text);
    const out = [];
    const lead = [];
    for (let i = 0; i < list.length && !level(list[i].tag); i += 1) lead.push(list[i].text);
    if (lead.length) out.push({ title: 'The top of the page', level: 0, index: -1, text: lead.join(' ') });
    list.forEach((b, i) => {
      const lv = level(b.tag);
      if (!lv) return;
      const parts = [];
      for (let k = i + 1; k < list.length; k += 1) {
        const next = level(list[k].tag);
        if (next && next <= lv) break;
        parts.push(next ? `${list[k].text}.` : list[k].text);
      }
      out.push({ title: b.text.slice(0, 120), level: lv, index: i, text: parts.join(' ') });
    });
    return out.slice(0, 200);
  }

  /** What is read aloud for a section: its title, then its words, cut at a sentence when it is long. */
  function spoken(section, max = 1500) {
    if (!section) return '';
    const title = tidy(section.title);
    const text = tidy(section.text);
    let all = title && section.level ? `${/[.!?:]$/.test(title) ? title : `${title}.`} ${text}` : text;
    all = all.trim();
    if (all.length > max) all = all.slice(0, max).replace(/[^.!?]*$/, '').trim() || all.slice(0, max).replace(/\s+\S*$/, '');
    return all;
  }

  /** A section as it goes on the board: a line for its title and a note with the start of its words. */
  function forBoard(section, max = 280) {
    if (!section) return { line: '', note: '' };
    const text = tidy(section.text);
    return { line: tidy(section.title).slice(0, 80), note: text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')} …` : text };
  }

  /** A site's address as the reading window takes it: https, a host name, nothing else. '' when it is not one. */
  function siteAddress(host) {
    const h = String(host || '').trim().toLowerCase();
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h) ? `https://${h}/` : '';
  }

  return { sectionsOf, spoken, forBoard, siteAddress };
}));
