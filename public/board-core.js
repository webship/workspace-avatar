// The board's tools for the AI Assistant: the parts with rules, kept apart from the page so they run under test.
//
// Loaded by the page (window.wsBoardCore) and required by the unit tests. The board itself is the
// dashboard's: an SVG drawing 100 wide and 60 high. What is here turns two points into a shape, keeps a
// drawing as a plain list of items (so a page that is put back is rebuilt from an allow-list, never from
// markup), and keeps the pages.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.wsBoardCore = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const W = 100; const H = 60;
  const round = (n) => Math.round(Number(n) * 100) / 100;
  const clampX = (x) => Math.max(0, Math.min(W, round(x)));
  const clampY = (y) => Math.max(0, Math.min(H, round(y)));

  /** A shape drawn from one point to another: the SVG element's name and its attributes, or null when it has no size. */
  function shapeFrom(kind, x1, y1, x2, y2) {
    const ax = clampX(x1); const ay = clampY(y1); const bx = clampX(x2); const by = clampY(y2);
    const w = Math.abs(bx - ax); const h = Math.abs(by - ay);
    if (kind === 'line' || kind === 'arrow') {
      if (w + h < 0.6) return null;
      return { tag: 'line', attrs: { x1: ax, y1: ay, x2: bx, y2: by, ...(kind === 'arrow' ? { 'marker-end': 'url(#avatar-arrow)' } : {}) } };
    }
    if (w < 0.6 || h < 0.6) return null;
    if (kind === 'rect') return { tag: 'rect', attrs: { x: Math.min(ax, bx), y: Math.min(ay, by), width: round(w), height: round(h), rx: 0.6 } };
    if (kind === 'ellipse') return { tag: 'ellipse', attrs: { cx: round((ax + bx) / 2), cy: round((ay + by) / 2), rx: round(w / 2), ry: round(h / 2) } };
    if (kind === 'diamond') {
      const cx = round((ax + bx) / 2); const cy = round((ay + by) / 2);
      return { tag: 'path', attrs: { d: `M${cx} ${Math.min(ay, by)} L${Math.max(ax, bx)} ${cy} L${cx} ${Math.max(ay, by)} L${Math.min(ax, bx)} ${cy} Z` } };
    }
    return null;
  }

  /** A picture's place on the board: as large as fits in two thirds of it, centred, its proportions kept. */
  function fitImage(width, height) {
    const w0 = Math.max(1, Number(width) || 1); const h0 = Math.max(1, Number(height) || 1);
    const scale = Math.min((W * 0.66) / w0, (H * 0.66) / h0);
    const w = round(w0 * scale); const h = round(h0 * scale);
    return { x: round((W - w) / 2), y: round((H - h) / 2), width: w, height: h };
  }

  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const IMAGE_MAX = 3 * 1024 * 1024;
  /** Why a file cannot go on the board, or '' when it can: a picture of a kind a browser draws, of a sane size. */
  function imageProblem(type, size) {
    if (!IMAGE_TYPES.includes(String(type || '').toLowerCase())) return 'Only a PNG, JPEG, WebP or GIF picture can go on the board.';
    if (!(Number(size) > 0) || Number(size) > IMAGE_MAX) return 'That picture is larger than 3 MB.';
    return '';
  }
  const DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

  // What a drawing may be made of when it is put back: these elements, with these attributes, and nothing else.
  const TAGS = { path: ['d'], rect: ['x', 'y', 'width', 'height', 'rx'], ellipse: ['cx', 'cy', 'rx', 'ry'], circle: ['cx', 'cy', 'r'],
    line: ['x1', 'y1', 'x2', 'y2', 'marker-end'], polyline: ['points'], polygon: ['points'], text: ['x', 'y'], image: ['x', 'y', 'width', 'height', 'href'] };
  const NUMBER = /^-?\d+(\.\d+)?$/;
  const PATH = /^[MLHVCSQTAZmlhvcsqtaz0-9eE.,\s-]{1,60000}$/;
  const POINTS = /^[0-9.,\s-]{1,20000}$/;
  const COLOUR = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|currentColor|none|[a-zA-Z]{3,20})$/;
  const STYLES = { stroke: COLOUR, fill: COLOUR, 'stroke-width': NUMBER, 'fill-opacity': NUMBER, 'stroke-dasharray': /^[0-9.\s,]{1,40}$/, 'font-size': /^\d+(\.\d+)?(px)?$/ };

  /** One item of a drawing, with only what is allowed left in it; null when it is not something a board holds. */
  function cleanItem(item) {
    if (!item || typeof item !== 'object' || !TAGS[item.tag]) return null;
    const attrs = {};
    for (const name of TAGS[item.tag]) {
      const v = item.attrs ? item.attrs[name] : undefined;
      if (v === undefined || v === null) continue;
      const value = String(v);
      if (name === 'd') { if (PATH.test(value)) attrs.d = value; }
      else if (name === 'points') { if (POINTS.test(value)) attrs.points = value; }
      else if (name === 'href') { if (DATA_IMAGE.test(value) && value.length <= IMAGE_MAX * 1.4) attrs.href = value; }
      else if (name === 'marker-end') { if (value === 'url(#avatar-arrow)') attrs['marker-end'] = value; }
      else if (NUMBER.test(value)) attrs[name] = value;
    }
    if (item.tag === 'path' && !attrs.d) return null;
    if (item.tag === 'image' && !attrs.href) return null;
    if ((item.tag === 'polyline' || item.tag === 'polygon') && !attrs.points) return null;
    const style = {};
    for (const [name, rule] of Object.entries(STYLES)) {
      const v = item.style ? item.style[name] : undefined;
      if (v !== undefined && v !== null && v !== '' && rule.test(String(v))) style[name] = String(v);
    }
    const out = { tag: item.tag, attrs, style };
    if (item.tag === 'text') out.text = String(item.text || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);
    if (typeof item.move === 'string' && /^translate\(-?\d+(\.\d+)?[ ,]-?\d+(\.\d+)?\)$/.test(item.move)) out.move = item.move;
    return out;
  }

  /** A page as it is kept: its drawing, its lines and its notes, each cleaned and counted. */
  function cleanPage(page) {
    const p = page && typeof page === 'object' ? page : {};
    return {
      items: (Array.isArray(p.items) ? p.items : []).map(cleanItem).filter(Boolean).slice(0, 600),
      lines: (Array.isArray(p.lines) ? p.lines : []).map((l) => String(l).slice(0, 300)).slice(0, 60),
      notes: (Array.isArray(p.notes) ? p.notes : []).filter((n) => n && typeof n === 'object')
        .map((n) => ({ text: String(n.text || '').slice(0, 1000), left: String(n.left || '').match(/^\d+(\.\d+)?%$/) ? n.left : '2%', top: String(n.top || '').match(/^\d+(\.\d+)?%$/) ? n.top : '56%' })).slice(0, 40),
    };
  }

  const MAX_PAGES = 20;
  /**
   * The pages of a board: `{ pages, at }`. `go` moves, `add` puts a new page after the one shown,
   * `remove` takes the one shown away (the last page is emptied, never removed).
   */
  function pagesOf(state) {
    const s = state && typeof state === 'object' ? state : {};
    const pages = (Array.isArray(s.pages) && s.pages.length ? s.pages : [{}]).slice(0, MAX_PAGES).map(cleanPage);
    const at = Math.max(0, Math.min(pages.length - 1, Number.isInteger(s.at) ? s.at : 0));
    return { pages, at };
  }
  const go = (state, to) => ({ pages: state.pages, at: Math.max(0, Math.min(state.pages.length - 1, to)) });
  function add(state) {
    if (state.pages.length >= MAX_PAGES) return state;
    const pages = state.pages.slice();
    pages.splice(state.at + 1, 0, cleanPage({}));
    return { pages, at: state.at + 1 };
  }
  function remove(state) {
    if (state.pages.length <= 1) return { pages: [cleanPage({})], at: 0 };
    const pages = state.pages.filter((_, i) => i !== state.at);
    return { pages, at: Math.min(state.at, pages.length - 1) };
  }

  /** A file name for a saved board: `board-2026-11-15-0931-page-2.png`. */
  function fileName(date, page, ext) {
    const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const two = (n) => String(n).padStart(2, '0');
    return `board-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}-page-${Math.max(1, Number(page) || 1)}.${ext === 'svg' ? 'svg' : 'png'}`;
  }

  return { W, H, shapeFrom, fitImage, imageProblem, cleanItem, cleanPage, pagesOf, go, add, remove, fileName, IMAGE_TYPES, IMAGE_MAX, MAX_PAGES };
}));
