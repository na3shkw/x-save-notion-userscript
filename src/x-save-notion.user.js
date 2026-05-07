// ==UserScript==
// @name         X → Notion Saver
// @namespace    https://github.com/na3shkw/x-save-notion-userscript
// @version      0.1.0
// @description  X のポストを Notion に保存するユーザースクリプト
// @author       na3shkw
// @updateURL    https://github.com/na3shkw/x-save-notion-userscript/releases/latest/download/x-save-notion.user.js
// @downloadURL  https://github.com/na3shkw/x-save-notion-userscript/releases/latest/download/x-save-notion.user.js
// @match        https://x.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=x.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      api.notion.com
// @connect      pbs.twimg.com
// @connect      video.twimg.com
// @connect      t.co
// @run-at       document-idle
// ==/UserScript==

'use strict';

// ============================================================
// SECTION 1: CONFIG
// ============================================================

const LS = {
  TOKEN: 'nx_saver_token',
  DS_ID: 'nx_saver_ds_id',
  DEBUG: 'nx_saver_debug',
};

const CONFIG = {
  get NOTION_TOKEN() {
    return GM_getValue(LS.TOKEN, '');
  },
  get DATA_SOURCE_ID() {
    return GM_getValue(LS.DS_ID, '');
  },
  get DEBUG() {
    return GM_getValue(LS.DEBUG, false);
  },
  NOTION_VERSION: '2025-09-03',
  NOTION_API_BASE: 'https://api.notion.com/v1',
};

function isConfigured() {
  return CONFIG.NOTION_TOKEN.length > 0 && CONFIG.DATA_SOURCE_ID.length > 0;
}

function showSettingsModal() {
  const existing = document.getElementById('nx-settings-modal');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'nx-settings-modal';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(0,0,0,.6)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'z-index:99999',
    'font-family:sans-serif',
  ].join(';');

  // XSS リスク回避のためユーザーデータを innerHTML に埋め込まず、DOM 挿入後に .value で設定する
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:28px 32px;width:420px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.3)">
      <h2 style="margin:0 0 20px;font-size:16px;font-weight:700">X → Notion Saver 設定</h2>
      <label style="display:block;font-size:13px;margin-bottom:4px">Notion Token</label>
      <input id="nx-token-input" type="password" placeholder="secret_..."
        style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px;margin-bottom:14px">
      <label style="display:block;font-size:13px;margin-bottom:4px">Datasource ID</label>
      <input id="nx-dbid-input" type="text" placeholder="32桁のID"
        style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px;margin-bottom:14px">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px;cursor:pointer">
        <input id="nx-debug-input" type="checkbox">
        DEBUGログを有効にする
      </label>
      <p id="nx-settings-error" style="margin:0 0 14px;font-size:12px;color:#f4212e;min-height:16px"></p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="nx-cancel-btn"
          style="padding:8px 16px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;font-size:13px">
          キャンセル
        </button>
        <button id="nx-save-btn"
          style="padding:8px 16px;border:none;background:#000;color:#fff;border-radius:6px;cursor:pointer;font-size:13px">
          保存
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const tokenInput = document.getElementById('nx-token-input');
  const dbidInput = document.getElementById('nx-dbid-input');
  const debugInput = document.getElementById('nx-debug-input');
  const errorEl = document.getElementById('nx-settings-error');
  const saveBtn = document.getElementById('nx-save-btn');
  const cancelBtn = document.getElementById('nx-cancel-btn');

  tokenInput.value = GM_getValue(LS.TOKEN, '');
  dbidInput.value = GM_getValue(LS.DS_ID, '');
  debugInput.checked = GM_getValue(LS.DEBUG, false);

  saveBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    const dbId = dbidInput.value.trim();
    if (!token || !dbId) {
      errorEl.textContent = 'Token と Database ID の両方を入力してください';
      return;
    }
    errorEl.textContent = '';
    GM_setValue(LS.TOKEN, token);
    GM_setValue(LS.DS_ID, dbId);
    GM_setValue(LS.DEBUG, debugInput.checked);
    overlay.remove();
    state.savedIds.clear();
    state.ready = false;
    init();
  });

  cancelBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// コンソールから手動で設定を開けるようにする (unsafeWindow = ページの実際の window)
unsafeWindow.notionSaverSettings = showSettingsModal;

// ============================================================
// SECTION 2: STATE
// ============================================================

const state = {
  savedIds: new Set(),
  ready: false,
};

// ============================================================
// UTILITIES
// ============================================================

const log = {
  debug: (...args) => {
    if (CONFIG.DEBUG) console.log('[X→Notion]', ...args);
  },
  info: (...args) => console.info('[X→Notion]', ...args),
  warn: (...args) => console.warn('[X→Notion]', ...args),
  error: (...args) => console.error('[X→Notion]', ...args),
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function showToast(message, type = 'info') {
  const bg =
    type === 'error' ? '#f4212e' : type === 'warn' ? '#f59e0b' : '#1d9bf0';
  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'padding:12px 18px',
    `background:${bg}`,
    'color:#fff',
    'border-radius:8px',
    'font-size:13px',
    'font-family:sans-serif',
    'z-index:99999',
    'box-shadow:0 4px 16px rgba(0,0,0,.25)',
    'max-width:320px',
    'word-break:break-word',
    'pointer-events:none',
    'transition:opacity .3s',
  ].join(';');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================
// SECTION 3: NOTION API CLIENT
// ============================================================

/**
 * GM_xmlhttpRequest を Promise でラップした Notion API 汎用リクエスター。
 * 429 は 1 秒待ちで 1 回リトライ。
 */
function gmFetch(method, path, body, _retried = false) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method,
      url: CONFIG.NOTION_API_BASE + path,
      headers: {
        Authorization: `Bearer ${CONFIG.NOTION_TOKEN}`,
        'Notion-Version': CONFIG.NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      data: body !== undefined ? JSON.stringify(body) : undefined,
      onload: async (res) => {
        if (res.status === 429 && !_retried) {
          await sleep(1000);
          try {
            resolve(await gmFetch(method, path, body, true));
          } catch (e) {
            reject(e);
          }
          return;
        }
        if (res.status < 200 || res.status >= 300) {
          reject({
            status: res.status,
            message: res.statusText,
            body: res.responseText,
          });
          return;
        }
        try {
          resolve(JSON.parse(res.responseText));
        } catch {
          resolve(res.responseText);
        }
      },
      onerror: (err) =>
        reject({ status: 0, message: 'Network error', raw: err }),
    });
  });
}

/** pbs.twimg.com など外部 URL からバイナリを ArrayBuffer で取得。 */
function gmFetchBinary(url) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      onload: (res) => {
        if (res.status === 200) resolve(res.response);
        else reject({ status: res.status, url });
      },
      onerror: (err) =>
        reject({ status: 0, message: 'Binary fetch failed', url, raw: err }),
    });
  });
}

/** t.co URL をリダイレクト追跡して最終 URL を返す。失敗時は元 URL をそのまま返す。 */
function resolveTcoUrl(url) {
  return new Promise((resolve) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      timeout: 8000,
      onload: (res) => {
        log.debug(
          't.co resolve:',
          url,
          '→ finalUrl:',
          res.finalUrl,
          'status:',
          res.status,
        );
        // finalUrl がリダイレクト先を指している場合はそれを使う
        if (res.finalUrl && !res.finalUrl.startsWith('https://t.co/')) {
          resolve(res.finalUrl);
          return;
        }
        // フォールバック: GM がリダイレクトを追跡しなかった場合、meta refresh を解析
        const meta = res.responseText?.match(
          /content=["']0;\s*url=([^"'\s>]+)/i,
        );
        if (meta?.[1]) {
          log.debug('t.co resolved via meta refresh:', meta[1]);
          resolve(meta[1]);
          return;
        }
        log.warn('t.co could not resolve:', url);
        resolve(url);
      },
      onerror: (err) => {
        log.debug('t.co resolve error:', url, err);
        resolve(url);
      },
      ontimeout: () => {
        log.debug('t.co resolve timeout:', url);
        resolve(url);
      },
    });
  });
}

/** テキスト中の t.co URL をすべて最終 URL に置換して返す。 */
async function resolveTcoUrlsInText(text) {
  const matches = [...new Set(text.match(/https:\/\/t\.co\/\w+/g) || [])];
  log.debug('t.co URLs in text:', matches);
  if (!matches.length) return text;
  const resolved = await Promise.all(matches.map(resolveTcoUrl));
  let result = text;
  for (let i = 0; i < matches.length; i++) {
    result = result.replaceAll(matches[i], resolved[i]);
  }
  return result;
}

/**
 * Notion DB クエリ。has_more の間ページネーションし、
 * すべての post ID (string[]) を返す。
 */
async function notionQueryAllPostIds() {
  const ids = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      filter: { property: 'ID', rich_text: { is_not_empty: true } },
    };
    if (cursor) body.start_cursor = cursor;
    const result = await gmFetch(
      'POST',
      `/data_sources/${CONFIG.DATA_SOURCE_ID}/query`,
      body,
    );
    for (const p of result.results) {
      const id = p.properties?.ID?.rich_text?.[0]?.plain_text;
      if (id) ids.push(id);
    }
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return ids;
}

/** Notion DB に新規ページを作成し、{ id } を返す。children を指定するとページ作成時にブロックも追加する。 */
function notionCreatePage(properties, children) {
  const body = {
    parent: { type: 'data_source_id', data_source_id: CONFIG.DATA_SOURCE_ID },
    properties,
  };
  if (children?.length) body.children = children;
  return gmFetch('POST', '/pages', body);
}

function makeGmHandlers(resolve, reject) {
  return {
    onload: (res) => {
      if (res.status >= 200 && res.status < 300) {
        try {
          resolve(JSON.parse(res.responseText));
        } catch {
          resolve(res.responseText);
        }
      } else {
        reject({ status: res.status, body: res.responseText });
      }
    },
    onerror: (err) => reject({ status: 0, raw: err }),
  };
}

/**
 * POST /v1/file_uploads にバイナリを送り { id, upload_url, status } を返す。
 * status は "pending"。upload_url に PUT することで "uploaded" になる。
 */
function notionCreateFileUpload(filename, arrayBuffer, contentType) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${CONFIG.NOTION_API_BASE}/file_uploads`,
      headers: {
        Authorization: `Bearer ${CONFIG.NOTION_TOKEN}`,
        'Notion-Version': CONFIG.NOTION_VERSION,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      data: arrayBuffer,
      ...makeGmHandlers(resolve, reject),
    });
  });
}

/**
 * upload_url (/.../send) に multipart/form-data で binary を POST し
 * ファイルのステータスを "uploaded" にする。Notion API エンドポイントのため認証ヘッダ必要。
 */
function notionCompleteFileUpload(
  uploadUrl,
  filename,
  arrayBuffer,
  contentType,
) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([arrayBuffer], { type: contentType });
    const formData = new FormData();
    formData.append('file', blob, filename);

    GM_xmlhttpRequest({
      method: 'POST',
      url: uploadUrl,
      headers: {
        Authorization: `Bearer ${CONFIG.NOTION_TOKEN}`,
        'Notion-Version': CONFIG.NOTION_VERSION,
      },
      data: formData,
      ...makeGmHandlers(resolve, reject),
    });
  });
}

// ============================================================
// SECTION 4: DOM SCRAPERS
// ============================================================

/**
 * article 直下（引用ポストの内側を除く）の要素を返す。
 * ネストした article[data-testid="tweet"] と [data-testid="quoteTweet"] の子孫は除外する。
 */
function outerOnly(article, selector) {
  return Array.from(article.querySelectorAll(selector)).filter((el) => {
    let cur = el.parentElement;
    while (cur && cur !== article) {
      if (
        cur.matches('article[data-testid="tweet"], [data-testid="quoteTweet"]')
      )
        return false;
      // 実際のX DOM: 引用カードは <div role="link"> (通常リンクは <a> なので div のみ対象)
      if (cur.tagName === 'DIV' && cur.getAttribute('role') === 'link')
        return false;
      cur = cur.parentElement;
    }
    return true;
  });
}

function extractTweetUrl(article) {
  // Primary: time 要素の最近接 <a href*="/status/"> から取得（タイムライン）
  for (const time of outerOnly(article, 'time[datetime]')) {
    const a = time.closest('a[href*="/status/"]');
    if (!a) continue;
    const href = a.getAttribute('href');
    if (!href) continue;
    if (href.startsWith('/')) return `https://x.com${href}`;
    if (/^https?:/.test(href))
      return href.replace('https://twitter.com', 'https://x.com');
  }

  // Fallback: 詳細画面では time が <a> で包まれない場合がある。
  // outer only な <a href="/username/status/ID"> を探す。
  for (const a of outerOnly(article, 'a[href*="/status/"]')) {
    const href = a.getAttribute('href');
    if (href && /^\/[^/]+\/status\/\d+/.test(href)) {
      return `https://x.com${href.match(/^(\/[^/]+\/status\/\d+)/)[1]}`;
    }
  }

  return null;
}

function extractDatetime(article) {
  const times = outerOnly(article, 'time[datetime]');
  return times.length ? times[0].getAttribute('datetime') : null;
}

function parseAuthorBlock(block) {
  let displayName = '';
  let username = '';
  for (const span of block.querySelectorAll('span')) {
    const t = span.textContent.trim();
    if (!t) continue;
    if (t.startsWith('@') && !username) username = t;
    else if (!displayName && !t.startsWith('@')) displayName = t;
  }
  if (!displayName) {
    const links = block.querySelectorAll('a');
    if (links[0]) displayName = links[0].textContent.trim();
    if (links[1] && !username) username = links[1].textContent.trim();
  }
  return { displayName, username };
}

function extractAuthor(article) {
  const blocks = outerOnly(article, '[data-testid="User-Name"]');
  if (!blocks.length) return null;
  return parseAuthorBlock(blocks[0]);
}

function extractCardUrls(article) {
  const cards = outerOnly(article, '[data-testid="card.wrapper"]');
  return cards
    .map((card) => {
      const a = card.querySelector('a[href]');
      return a ? a.getAttribute('href') : null;
    })
    .filter(Boolean);
}

// innerText だと <a> 内の aria-hidden スパンで URL が複数行に分割されるため DOM を手動ウォークする。
// t.co リンクのみ href を使用し、ハッシュタグ・メンションは子ノードのテキストをそのまま返す。
function walkTweetText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeName === 'IMG') return node.getAttribute('alt') || '';
  if (node.nodeName === 'A') {
    const href = node.getAttribute('href') || '';
    return href.startsWith('https://t.co/')
      ? href
      : Array.from(node.childNodes).map(walkTweetText).join('');
  }
  if (node.nodeName === 'BR') return '\n';
  return Array.from(node.childNodes).map(walkTweetText).join('');
}

function extractBody(article) {
  const els = outerOnly(article, '[data-testid="tweetText"]');
  if (!els.length) return '';
  return walkTweetText(els[0]);
}

function extractImages(article) {
  const imgs = outerOnly(article, '[data-testid="tweetPhoto"] img');
  return imgs
    .map((img) => {
      let src = img.src || img.getAttribute('src') || '';
      if (!src?.includes('pbs.twimg.com')) return null;
      // name= パラメータを orig（最高画質）に置き換え
      src = src.replace(/([?&])name=[^&]*/g, '$1name=orig');
      if (!src.includes('name=orig')) {
        src += `${src.includes('?') ? '&' : '?'}name=orig`;
      }
      return src;
    })
    .filter(Boolean);
}

function extractQuotedPost(article) {
  // X の実際のDOM: 引用カードは <div role="link"> の中（<a> ではなく div）
  // 旧構造として [data-testid="quoteTweet"] や nested article もフォールバックで試みる
  const container =
    Array.from(article.querySelectorAll('div[role="link"]')).find((el) =>
      el.querySelector('[data-testid="tweetText"]'),
    ) ||
    article.querySelector('[data-testid="quoteTweet"]') ||
    article.querySelector('article[data-testid="tweet"]');

  if (!container || container === article) return null;

  const textEl = container.querySelector('[data-testid="tweetText"]');
  if (!textEl) return null;

  const body = walkTweetText(textEl);

  const authorBlock = container.querySelector('[data-testid="User-Name"]');
  let authorStr = '';
  if (authorBlock) {
    const { displayName, username } = parseAuthorBlock(authorBlock);
    if (displayName || username) authorStr = `${displayName} (${username}): `;
  }

  return `${authorStr}${body}` || null;
}

/** 記事全体をスクレイプして TweetData を返す。URL 取得失敗時は null。 */
function scrapeArticle(article) {
  const url = extractTweetUrl(article);
  if (!url) return null;

  const author = extractAuthor(article);
  return {
    url,
    datetime: extractDatetime(article),
    author: author ? `${author.displayName} (${author.username})` : '',
    body: extractBody(article),
    cardUrls: extractCardUrls(article),
    imageUrls: extractImages(article),
    quotedPost: extractQuotedPost(article),
  };
}

// ============================================================
// SECTION 5: DATA PIPELINE
// ============================================================

function mimeFromUrl(url) {
  if (url.includes('format=png') || url.includes('.png')) return 'image/png';
  if (url.includes('format=webp') || url.includes('.webp')) return 'image/webp';
  if (url.includes('format=gif') || url.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function extFromMime(mime) {
  return (
    {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }[mime] || 'jpg'
  );
}

/**
 * 画像 URL リストを Notion にアップロードしてファイルオブジェクト配列を返す。
 * POST /v1/file_uploads (multipart) を試み、失敗時は外部 URL 参照にフォールバック。
 * 外部 URL にフォールバックした画像がある場合は hasFallback: true を返す。
 */
async function uploadImages(imageUrls) {
  const fileObjects = [];
  let hasFallback = false;
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const mime = mimeFromUrl(url);
    const filename = `post-img-${i}.${extFromMime(mime)}`;
    let fileObj;

    try {
      const buffer = await gmFetchBinary(url);
      log.debug('Uploading', filename, buffer.byteLength, 'bytes');
      // Step 1: pending な file upload を作成 → { id, upload_url, ... }
      const record = await notionCreateFileUpload(filename, buffer, mime);
      log.debug('file_uploads response:', JSON.stringify(record));
      // Step 2: upload_url に PUT してステータスを "uploaded" に変更
      const uploadUrl = record.upload_url ?? record.url ?? record.signed_url;
      if (!uploadUrl)
        throw new Error(`No upload URL in response: ${JSON.stringify(record)}`);
      await notionCompleteFileUpload(uploadUrl, filename, buffer, mime);
      fileObj = { type: 'file_upload', file_upload: { id: record.id } };
      log.debug('Upload complete:', record.id);
    } catch (err) {
      log.warn('Upload failed, falling back to external URL:', url, err);
      fileObj = { type: 'external', name: filename, external: { url } };
      hasFallback = true;
    }

    fileObjects.push(fileObj);
    if (i < imageUrls.length - 1) await sleep(400);
  }
  return { fileObjects, hasFallback };
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * 本文末尾の URL を抜き出して (cleanedBody, linkUrls) を返す。
 * URL が見つからない場合は linkUrl: null を返す。
 */
function extractLinksFromBody(body) {
  const urlRe = /https?:\/\/\S+/g;
  const matches = Array.from(body.matchAll(urlRe));

  if (matches.length === 0) return { body, linkUrls: [] };

  const linkUrls = matches.map((m) => m[0]);
  const cleaned = body.replace(urlRe, '').replace(/\s+/g, ' ').trim();

  return { body: cleaned, linkUrls };
}

function extractPostId(url) {
  return url?.match(/\/status\/(\d+)/)?.[1] ?? url;
}

/**
 * uploadImages() が返すファイルオブジェクト配列を Notion image ブロック配列に変換する。
 * 1 枚: 単一 image ブロック
 * 2 枚以上: column_list > column[] > image ブロック (横並びレイアウト)
 */
function buildImageBlocks(fileObjects) {
  const blocks = fileObjects.map((fo) => {
    if (fo.type === 'file_upload') {
      return {
        object: 'block',
        type: 'image',
        image: { type: 'file_upload', file_upload: { id: fo.file_upload.id } },
      };
    }
    return {
      object: 'block',
      type: 'image',
      image: { type: 'external', external: { url: fo.external.url } },
    };
  });

  if (blocks.length <= 1) return blocks;

  return [
    {
      object: 'block',
      type: 'column_list',
      column_list: {
        children: blocks.map((b) => ({
          object: 'block',
          type: 'column',
          column: { children: [b] },
        })),
      },
    },
  ];
}

/**
 * ページコンテンツとして追加するブロック配列を組み立てる。
 */
function buildPageBlocks(postData, imageBlocks, linkUrls) {
  const blocks = [];

  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: { content: truncate(postData.body, 2000), link: null },
        },
      ],
      color: 'default',
    },
  });

  if (postData.quotedPost) {
    blocks.push({
      object: 'block',
      type: 'quote',
      quote: {
        rich_text: [
          {
            type: 'text',
            text: { content: truncate(postData.quotedPost, 2000) },
          },
        ],
        color: 'default',
      },
    });
  }

  blocks.push(...imageBlocks);

  for (const url of linkUrls) {
    blocks.push({
      object: 'block',
      type: 'bookmark',
      bookmark: { caption: [], url },
    });
  }

  const lastType = blocks[blocks.length - 1]?.type;
  if (lastType && !['bookmark', 'image', 'column_list'].includes(lastType)) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [], color: 'default' },
    });
  }

  return blocks;
}

function buildNotionProperties(postData) {
  const postId = extractPostId(postData.url);
  const props = {
    Title: {
      title: [{ text: { content: truncate(postData.body, 50) } }],
    },
    URL: {
      url: postData.url,
    },
    ID: {
      rich_text: [{ text: { content: postId } }],
    },
    Author: {
      rich_text: [{ text: { content: postData.author } }],
    },
    Body: {
      rich_text: [{ text: { content: truncate(postData.body, 2000) } }],
    },
    QuotedPost: {
      rich_text: [{ text: { content: postData.quotedPost || '' } }],
    },
  };

  if (postData.datetime) {
    props.PostedAt = { date: { start: postData.datetime } };
  }

  return props;
}

// ============================================================
// SECTION 6: BUTTON INJECTION
// ============================================================

let authAlerted = false;

function setButtonState(button, btnState) {
  button.dataset.notionSave = btnState;

  const label = button.querySelector('.nx-label');
  if (!label) return;

  switch (btnState) {
    case 'pending':
      label.textContent = '保存';
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      break;
    case 'saving':
      label.textContent = '…';
      button.disabled = true;
      button.style.opacity = '0.5';
      button.style.cursor = 'default';
      break;
    case 'saved':
      label.textContent = '✅';
      button.disabled = true;
      button.style.opacity = '1';
      button.style.cursor = 'default';
      break;
    case 'saved_partial':
      label.textContent = '✅⚠';
      button.disabled = true;
      button.style.opacity = '1';
      button.style.cursor = 'default';
      button.title =
        '保存済み（一部画像は外部URL参照のため将来リンク切れの可能性あり）';
      break;
    case 'error':
      label.textContent = '！';
      button.disabled = false;
      button.style.color = '#f4212e';
      button.style.cursor = 'pointer';
      setTimeout(() => {
        if (button.dataset.notionSave === 'error')
          setButtonState(button, 'pending');
      }, 3000);
      break;
  }
}

function createSaveButton(article, isSaved) {
  const btn = document.createElement('button');
  btn.style.cssText = [
    'background:none',
    'border:none',
    'padding:0 8px',
    'cursor:pointer',
    'font-size:13px',
    'color:rgb(83, 100, 113)',
    'display:flex',
    'align-items:center',
    'line-height:1',
    'vertical-align:middle',
  ].join(';');

  const label = document.createElement('span');
  label.className = 'nx-label';
  btn.appendChild(label);

  if (isSaved) {
    setButtonState(btn, 'saved');
  } else {
    btn.dataset.notionSave = 'pending';
    label.textContent = '保存';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await handleSaveClick(article, btn);
    });
  }

  return btn;
}

async function handleSaveClick(article, button) {
  const postData = scrapeArticle(article);
  if (!postData) {
    setButtonState(button, 'error');
    return;
  }

  setButtonState(button, 'saving');
  try {
    const { fileObjects, hasFallback } = await uploadImages(postData.imageUrls);
    const imageBlocks = buildImageBlocks(fileObjects);

    postData.body = await resolveTcoUrlsInText(postData.body);

    // カード URL は本文に追記せず bookmark ブロックとして使用する
    // card.wrapper がない場合は本文末尾の URL を抽出して bookmark に使い、ブロック本文からは削除する
    // プロパティの Body には URL を残すため postData.body は変更しない
    let linkUrls = [];
    let blockBody = postData.body;
    if (postData.cardUrls.length > 0) {
      linkUrls = await Promise.all(postData.cardUrls.map(resolveTcoUrl));
    } else {
      const extracted = extractLinksFromBody(postData.body);
      blockBody = extracted.body;
      linkUrls = extracted.linkUrls;
    }

    const blocks = buildPageBlocks(
      { ...postData, body: blockBody },
      imageBlocks,
      linkUrls,
    );
    const properties = buildNotionProperties(postData);
    await notionCreatePage(properties, blocks);
    state.savedIds.add(extractPostId(postData.url));
    setButtonState(button, hasFallback ? 'saved_partial' : 'saved');
    log.debug('Saved:', postData.url);
    if (hasFallback) {
      showToast(
        '一部の画像のアップロードに失敗しました。外部URL参照で保存されましたが、将来リンク切れの可能性があります。',
        'warn',
      );
    }
  } catch (err) {
    log.error('Save failed:', err);
    if (err.status === 401 && !authAlerted) {
      authAlerted = true;
      showToast('Notion トークンが無効です。設定を確認してください。', 'error');
    }
    setButtonState(button, 'error');
  }
}

/**
 * article にボタンを注入する。
 * article.dataset.notionInjected が設定済み かつ ボタンが存在する場合はスキップ。
 * （X の React が内部再レンダリングでボタンを消した場合は再注入する）
 */
function injectButton(article) {
  const alreadyHasButton = article.querySelector('[data-notion-save]');
  if (article.dataset.notionInjected && alreadyHasButton) return;
  article.dataset.notionInjected = '1';

  const url = extractTweetUrl(article);
  if (!url) return; // 広告・プロモーションポスト等

  // outerOnly で引用ポスト内の [role="group"] を除外して外側のアクションバーを取得
  const actionBars = outerOnly(article, '[role="group"]');
  const actionBar = actionBars[0];
  if (!actionBar) return;

  const isSaved = state.savedIds.has(extractPostId(url));
  const btn = createSaveButton(article, isSaved);
  actionBar.appendChild(btn);
}

/** state.ready 完了後、既に注入済みで pending のボタンを ✅ に更新。 */
function updateExistingButtons() {
  document.querySelectorAll('[data-notion-save="pending"]').forEach((btn) => {
    const article = btn.closest('article[data-testid="tweet"]');
    if (!article) return;
    const url = extractTweetUrl(article);
    if (url && state.savedIds.has(extractPostId(url))) {
      setButtonState(btn, 'saved');
    }
  });
}

// ============================================================
// SECTION 7: MUTATION OBSERVER
// ============================================================

let _observer = null;

function startObserver() {
  // 設定変更後の再 init 時に二重起動しないよう既存オブザーバーを切断する
  if (_observer) _observer.disconnect();
  _observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        node
          .querySelectorAll?.('article[data-testid="tweet"]')
          .forEach(injectButton);
        if (node.matches?.('article[data-testid="tweet"]')) injectButton(node);
      }
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
  return _observer;
}

// ============================================================
// SECTION 8: INIT
// ============================================================

async function loadSavedIds() {
  try {
    const ids = await notionQueryAllPostIds();
    for (const id of ids) state.savedIds.add(id);
    log.debug('Loaded', state.savedIds.size, 'saved post IDs');
  } catch (err) {
    log.warn(
      `Failed to load saved IDs (status: ${err?.status ?? '?'}, body: ${err?.body ?? err?.message ?? err}):`,
      err,
    );
  }
}

async function init() {
  if (!isConfigured()) {
    showSettingsModal();
    return;
  }

  log.debug('Initializing...');

  // 既存ポストに先にボタンを注入しておき、ready 後に ✅ を更新する
  startObserver();
  document
    .querySelectorAll('article[data-testid="tweet"]')
    .forEach(injectButton);

  await loadSavedIds();
  state.ready = true;
  updateExistingButtons();

  log.debug('Ready. Saved IDs:', state.savedIds.size);
}

init();
