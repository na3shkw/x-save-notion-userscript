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
// @run-at       document-idle
// ==/UserScript==

'use strict';

// ============================================================
// SECTION 1: CONFIG
// ============================================================

const LS = {
  TOKEN: 'nx_saver_token',
  DB_ID: 'nx_saver_db_id',
  DEBUG: 'nx_saver_debug',
};

const CONFIG = {
  get NOTION_TOKEN() {
    return GM_getValue(LS.TOKEN, '');
  },
  get DATABASE_ID() {
    return GM_getValue(LS.DB_ID, '');
  },
  get DEBUG() {
    return GM_getValue(LS.DEBUG, false);
  },
  NOTION_VERSION: '2022-06-28',
  NOTION_API_BASE: 'https://api.notion.com/v1',
};

function isConfigured() {
  return CONFIG.NOTION_TOKEN.length > 0 && CONFIG.DATABASE_ID.length > 0;
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
      <label style="display:block;font-size:13px;margin-bottom:4px">Database ID</label>
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

  document.getElementById('nx-token-input').value = GM_getValue(LS.TOKEN, '');
  document.getElementById('nx-dbid-input').value = GM_getValue(LS.DB_ID, '');
  document.getElementById('nx-debug-input').checked = GM_getValue(
    LS.DEBUG,
    false,
  );

  document.getElementById('nx-save-btn').addEventListener('click', () => {
    const token = document.getElementById('nx-token-input').value.trim();
    const dbId = document.getElementById('nx-dbid-input').value.trim();
    const errorEl = document.getElementById('nx-settings-error');
    if (!token || !dbId) {
      errorEl.textContent = 'Token と Database ID の両方を入力してください';
      return;
    }
    errorEl.textContent = '';
    GM_setValue(LS.TOKEN, token);
    GM_setValue(LS.DB_ID, dbId);
    GM_setValue(LS.DEBUG, document.getElementById('nx-debug-input').checked);
    overlay.remove();
    state.savedIds.clear();
    state.ready = false;
    init();
  });

  document
    .getElementById('nx-cancel-btn')
    .addEventListener('click', () => overlay.remove());
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
      `/databases/${CONFIG.DATABASE_ID}/query`,
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

/** Notion DB に新規ページを作成し、{ id } を返す。 */
function notionCreatePage(properties) {
  return gmFetch('POST', '/pages', {
    parent: { database_id: CONFIG.DATABASE_ID },
    properties,
  });
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

function extractAuthor(article) {
  const blocks = outerOnly(article, '[data-testid="User-Name"]');
  if (!blocks.length) return null;
  const block = blocks[0];

  let displayName = '';
  let username = '';

  // span テキストから displayName と @username を分離
  for (const span of block.querySelectorAll('span')) {
    const t = span.textContent.trim();
    if (!t) continue;
    if (t.startsWith('@') && !username) username = t;
    else if (!displayName && !t.startsWith('@')) displayName = t;
  }

  // フォールバック: <a> タグのテキスト
  if (!displayName) {
    const links = block.querySelectorAll('a');
    if (links[0]) displayName = links[0].textContent.trim();
    if (links[1] && !username) username = links[1].textContent.trim();
  }

  return { displayName, username };
}

function extractBody(article) {
  const els = outerOnly(article, '[data-testid="tweetText"]');
  return els.length ? els[0].innerText || els[0].textContent || '' : '';
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

  const body = textEl.innerText || textEl.textContent || '';

  const authorBlock = container.querySelector('[data-testid="User-Name"]');
  let authorStr = '';
  if (authorBlock) {
    let name = '',
      user = '';
    for (const span of authorBlock.querySelectorAll('span')) {
      const t = span.textContent.trim();
      if (t.startsWith('@') && !user) user = t;
      else if (!name && t) name = t;
    }
    if (name || user) authorStr = `${name} (${user}): `;
  }

  return `> ${authorStr}${body}` || null;
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
    const filename = `tweet-img-${i}.${extFromMime(mime)}`;
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

function extractPostId(url) {
  return url?.match(/\/status\/(\d+)/)?.[1] ?? url;
}

function buildNotionProperties(tweetData, fileObjects) {
  const postId = extractPostId(tweetData.url);
  const props = {
    Title: {
      title: [{ text: { content: truncate(tweetData.body, 50) } }],
    },
    URL: {
      url: tweetData.url,
    },
    ID: {
      rich_text: [{ text: { content: postId } }],
    },
    Author: {
      rich_text: [{ text: { content: tweetData.author } }],
    },
    Body: {
      rich_text: [{ text: { content: truncate(tweetData.body, 2000) } }],
    },
    Images: {
      files: fileObjects,
    },
    QuotedPost: {
      rich_text: [{ text: { content: tweetData.quotedPost || '' } }],
    },
  };

  if (tweetData.datetime) {
    props.PostedAt = { date: { start: tweetData.datetime } };
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
    btn.dataset.notionSave = 'saved';
    btn.disabled = true;
    label.textContent = '✅';
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
  const tweetData = scrapeArticle(article);
  if (!tweetData) {
    setButtonState(button, 'error');
    return;
  }

  setButtonState(button, 'saving');
  try {
    const { fileObjects, hasFallback } = await uploadImages(
      tweetData.imageUrls,
    );
    const properties = buildNotionProperties(tweetData, fileObjects);
    await notionCreatePage(properties);
    state.savedIds.add(extractPostId(tweetData.url));
    setButtonState(button, hasFallback ? 'saved_partial' : 'saved');
    log.debug('Saved:', tweetData.url);
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
  if (!url) return; // 広告・プロモーションツイート等

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
      'Failed to load saved IDs (continuing without duplicate check):',
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

  // 既存ツイートに先にボタンを注入しておき、ready 後に ✅ を更新する
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
