/* =========================================================
   STUDIO · 工业设计作品集  —  应用逻辑（GitHub 同步版）
   =========================================================
   数据存储：作品和资料存在 GitHub 仓库的 data.json 中。
   - 访客：从 GitHub 读取数据（无需任何凭据）
   - 管理员：保存时通过 GitHub API 写回 data.json（需输入一次 Token）
   - 离线/降级：localStorage 作为缓存，无网络时仍可浏览
   ========================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     ① 配置区
     --------------------------------------------------------- */
  const ADMIN_PASSWORD = "design2026";

  // GitHub 配置（改成你自己的仓库）
  const GH_USER  = "fjiqi493-lgtm";
  const GH_REPO  = "portfolio";
  const GH_BRANCH = "main";
  const DATA_FILE = "data.json";

  // GitHub API 地址
  const GH_API_ROOT = "https://api.github.com";
  const GH_RAW_URL  = `https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/${GH_BRANCH}/${DATA_FILE}`;

  const K_WORKS    = "idp_works_v1";
  const K_PROFILE  = "idp_profile_v1";
  const K_SESSION  = "idp_admin_session_v1";
  const K_GH_TOKEN = "idp_gh_token_v1";   // GitHub Token（localStorage，持久记忆，避免刷新后丢失）

  const MAX_DIM = 1600;
  const JPEG_Q  = 0.82;

  /* ---------------------------------------------------------
     ② 小工具
     --------------------------------------------------------- */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------------------------------------------------------
     ③ 数据层：GitHub API + localStorage 缓存
     --------------------------------------------------------- */

  /** 内存中的当前数据（单例） */
  let _works   = null;
  let _profile = null;
  let _dataSha = null;  // GitHub 上 data.json 的 SHA（写回时需要）
  let _syncStatus = ""; // "loading" | "ok" | "error" | "offline"
  let _pendingLocal = false; // 本地有 GitHub 上没有的作品，待补推

  /** 从 localStorage 读取缓存 */
  function loadWorksCache() {
    try { return JSON.parse(localStorage.getItem(K_WORKS)) || null; }
    catch (e) { return null; }
  }
  function loadProfileCache() {
    try { return JSON.parse(localStorage.getItem(K_PROFILE)) || null; }
    catch (e) { return null; }
  }
  function saveWorksCache(w) { try { localStorage.setItem(K_WORKS, JSON.stringify(w)); } catch (e) { console.warn("[Portfolio] 本地缓存写入失败（可能超容量）", e); } }
  function saveProfileCache(p) { try { localStorage.setItem(K_PROFILE, JSON.stringify(p)); } catch (e) { console.warn("[Portfolio] 本地缓存写入失败", e); } }

  /** 对外接口（其他代码只调这两个） */
  function loadWorks()   { return _works; }
  function loadProfile() { return _profile; }

  /** 已删除作品 id（防止被本地缓存「复活」） */
  const K_DELETED = "idp_deleted_v1";
  function loadDeleted() { try { return new Set(JSON.parse(localStorage.getItem(K_DELETED)) || []); } catch (e) { return new Set(); } }
  function addDeleted(id) { try { const s = loadDeleted(); s.add(id); localStorage.setItem(K_DELETED, JSON.stringify(Array.from(s))); } catch (e) {} }

  /** 获取 GitHub Token（持久化在 localStorage，刷新/重开不再丢失） */
  function getGhToken() { return localStorage.getItem(K_GH_TOKEN); }
  function setGhToken(t) {
    if (t) localStorage.setItem(K_GH_TOKEN, t);
    else localStorage.removeItem(K_GH_TOKEN);
  }

  /** 合并远程与本地数据：远程优先（同 id 用远程），本地独有的作品保留，已删除的剔除 */
  function mergeData(remoteWorks, remoteProfile, localWorks, localProfile) {
    const deleted = loadDeleted();
    const map = new Map();
    (remoteWorks || []).forEach((w) => { if (!deleted.has(w.id)) map.set(w.id, w); });
    (localWorks || []).forEach((w) => { if (!deleted.has(w.id) && !map.has(w.id)) map.set(w.id, w); });
    const profile = (remoteProfile && Object.keys(remoteProfile).length) ? remoteProfile : localProfile;
    return { works: Array.from(map.values()), profile: profile || {} };
  }

  /** 从 GitHub 拉取最新数据（与本地合并，绝不覆盖本地未同步的作品） */
  async function fetchFromGitHub() {
    _syncStatus = "loading";
    updateSyncUI();
    const localWorks = loadWorksCache() || [];
    const localProfile = loadProfileCache() || {};
    try {
      const resp = await fetch(GH_RAW_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = JSON.parse(await resp.text());
      const remoteWorks = data.works || [];
      const merged = mergeData(remoteWorks, data.profile || {}, localWorks, localProfile);
      _works   = merged.works;
      _profile = merged.profile;
      // 本地有、GitHub 上没有（且未删除）→ 标记为待补推，有 token 时自动同步
      const remoteIds = new Set(remoteWorks.map((w) => w.id));
      const deleted = loadDeleted();
      _pendingLocal = (localWorks || []).some((w) => !remoteIds.has(w.id) && !deleted.has(w.id));
      saveWorksCache(_works);
      saveProfileCache(_profile);
      _syncStatus = "ok";
      console.log("[Portfolio] 已从 GitHub 同步数据：" + _works.length + " 件作品（本地待补推：" + _pendingLocal + "）");
    } catch (e) {
      console.warn("[Portfolio] GitHub 拉取失败，使用本地缓存：", e.message);
      _works   = localWorks;
      _profile = localProfile;
      _syncStatus = "error";
    }
    updateSyncUI();
  }

  /** 推送数据到 GitHub（管理员保存时调用） */
  async function pushToGitHub() {
    const token = getGhToken();
    if (!token) {
      alert("未配置 GitHub Token，数据将仅保存在本地浏览器。\n\n请在后台「设置」中填入你的 GitHub Personal Access Token。");
      // 降级：只存本地
      saveWorksCache(_works);
      saveProfileCache(_profile);
      return false;
    }

    const payload = JSON.stringify({ works: _works, profile: _profile }, null, 2);
    const base64 = btoa(unescape(encodeURIComponent(payload)));

    try {
      // 1. 获取当前文件 SHA
      const getUrl = `${GH_API_ROOT}/repos/${GH_USER}/${GH_REPO}/contents/${DATA_FILE}?ref=${GH_BRANCH}`;
      const getResp = await fetch(getUrl, {
        headers: { "Authorization": "token " + token, "Accept": "application/vnd.github+json" }
      });
      if (!getResp.ok && getResp.status !== 404) throw new Error("获取文件失败 HTTP " + getResp.status);

      let sha = null;
      if (getResp.ok) {
        const fileInfo = await getResp.json();
        sha = fileInfo.sha;
      }

      // 2. 写入 / 创建文件
      const putUrl = `${GH_API_ROOT}/repos/${GH_USER}/${GH_REPO}/contents/${DATA_FILE}`;
      const body = {
        message: "更新作品集数据 (" + new Date().toLocaleString("zh-CN") + ")",
        content: base64,
        branch: GH_BRANCH
      };
      if (sha) body.sha = sha;

      const putResp = await fetch(putUrl, {
        method: "PUT",
        headers: { "Authorization": "token " + token, "Accept": "application/vnd.github+json" },
        body: JSON.stringify(body)
      });
      if (!putResp.ok) {
        const errData = await putResp.json().catch(() => ({}));
        throw new Error(errData.message || "写入失败 HTTP " + putResp.status);
      }

      // 同时更新本地缓存
      saveWorksCache(_works);
      saveProfileCache(_profile);
      console.log("[Portfolio] 已推送到 GitHub");
      return true;
    } catch (e) {
      console.error("[Portfolio] 推送失败：", e);
      alert("同步到 GitHub 失败：" + e.message + "\n\n数据已保存在本机浏览器，稍后可重试。");
      saveWorksCache(_works);
      saveProfileCache(_profile);
      return false;
    }
  }

  /** 显示同步状态 */
  function updateSyncUI() {
    const el = $("#syncStatus");
    if (!el) return;
    el.textContent =
      _syncStatus === "loading" ? "⏳ 同步中…" :
      _syncStatus === "ok"      ? "✓ 已同步" :
      _syncStatus === "error"   ? "⚠ 使用本地缓存" :
      _syncStatus === "offline" ? "📴 离线模式" : "";
  }

  // 估算已用空间
  function storageUsedMB() {
    let bytes = 0;
    [K_WORKS, K_PROFILE].forEach((k) => {
      const v = localStorage.getItem(k);
      if (v) bytes += new Blob([v]).size;
    });
    return (bytes / (1024 * 1024)).toFixed(2);
  }

  /* ---------------------------------------------------------
     ④ 种子数据（首次离线或 GitHub 无数据时的默认值）
     --------------------------------------------------------- */
  function placeholder(label, sub) {
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'>` +
      `<rect width='800' height='600' fill='#eceae7'/>` +
      `<rect x='0' y='0' width='800' height='600' fill='url(#g)'/>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
      `<stop offset='0' stop-color='#f2f1ef'/><stop offset='1' stop-color='#e2e0dc'/>` +
      `</linearGradient></defs>` +
      `<text x='400' y='288' font-family='Helvetica,Arial' font-size='30' fill='#9a9893' text-anchor='middle' letter-spacing='2'>${label}</text>` +
      `<text x='400' y='326' font-family='Helvetica,Arial' font-size='15' fill='#b7b5b0' text-anchor='middle' letter-spacing='1'>${sub}</text>` +
      `</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function getSeedData() {
    return {
      works: [
        {
          id: uid(), title: "Aero 桌面空气净化扇",
          intro: "面向居家办公场景的桌面空气净化扇，主打低噪与极简体量，外壳采用回收铝。",
          images: [placeholder("AERO FAN", "Rendering"), placeholder("AERO FAN", "Detail")],
          params: [
            { k: "材料", v: "回收铝合金 / ABS" },
            { k: "尺寸", v: "180 × 180 × 210 mm" },
            { k: "角色", v: "ID / CMF" },
            { k: "年份", v: "2025" },
          ], createdAt: Date.now() - 3000,
        },
        {
          id: uid(), title: "NOIR 香水瓶 · 包装系统",
          intro: "高端男士香水瓶体与外包装一体化设计，哑光玻璃搭配磁吸木盖。",
          images: [placeholder("NOIR EDP", "Bottle"), placeholder("NOIR EDP", "Pack")],
          params: [
            { k: "容量", v: "50 / 100 ml" },
            { k: "工艺", v: "哑光喷砂玻璃" },
            { k: "角色", v: "包装设计" },
            { k: "年份", v: "2024" },
          ], createdAt: Date.now() - 2000,
        },
        {
          id: uid(), title: "Link 工业连接件 · NX 建模",
          intro: "基于 NX 的参数化连接件系列，用于模块化设备框架的快速装配。",
          images: [placeholder("LINK PART", "NX Model"), placeholder("LINK PART", "Assembly")],
          params: [
            { k: "软件", v: "Siemens NX" },
            { k: "工艺", v: "CNC / 压铸" },
            { k: "角色", v: "结构设计" },
            { k: "年份", v: "2025" },
          ], createdAt: Date.now() - 1000,
        },
      ],
      profile: {
        name: "STUDIO",
        title: "工业设计师 · 产品 / CMF / 包装",
        bio: "专注消费电子与生活方式产品的工业设计，擅长从概念草图到量产落地的完整链路。工作涵盖 Rhino / NX 建模、CMF 与包装系统。",
        avatar: placeholder("AVATAR", ""),
      }
    };
  }

  /* ---------------------------------------------------------
     ⑤ 图片处理
     --------------------------------------------------------- */
  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
    });
  }
  function downscale(dataURL, maxDim, quality) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s); height = Math.round(height * s);
        }
        const cv = document.createElement("canvas"); cv.width = width; cv.height = height;
        const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        try { res(cv.toDataURL("image/jpeg", quality)); } catch (e) { rej(e); }
      }; img.onerror = rej; img.src = dataURL;
    });
  }
  async function fileToStored(file) {
    const raw = await fileToDataURL(file);
    return await downscale(raw, MAX_DIM, JPEG_Q);
  }

  /* ---------------------------------------------------------
     ⑥ 路由与视图渲染
     --------------------------------------------------------- */
  const app = $("#app");

  function setActiveNav() {
    const h = location.hash || "#/";
    $$(".nav-links a").forEach((a) => {
      const href = a.getAttribute("href");
      a.classList.toggle("active", href === h || (href === "#/" && h === ""));
    });
  }

  function render() {
    setActiveNav();
    const h = location.hash || "#/";
    if (h === "#/admin") { openAdmin(); return; }
    if (h.startsWith("#/work/")) return renderDetail(h.split("/")[2]);
    if (h === "#/works") return renderWorks();
    if (h === "#/about") return renderAbout();
    return renderHome();
  }

  function revealObserve(root) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); });
    }, { threshold: 0.12 });
    $$(".reveal", root).forEach((n) => io.observe(n));
  }

  // —— 首页 ——
  function renderHome() {
    const p = _profile || {};
    const works = (_works || []).slice().sort((a, b) => b.createdAt - a.createdAt);
    const featured = works.slice(0, 3);
    const cards = featured.map((w) => cardHTML(w)).join("");

    app.innerHTML =
      `<section class="hero">
        <div class="hero-text">
          <div class="hero-eyebrow">Industrial Design Portfolio</div>
          <h1>${esc(p.name || "STUDIO")}<br>${esc((p.title || "").split(" · ")[0] || "")}</h1>
          <p>${esc(p.bio || "产品渲染 / Rhino·NX 建模 / 香水瓶包装设计。")}</p>
          <div class="hero-cta">
            <a class="btn-primary" href="#/works">查看作品</a>
            <a class="btn-ghost" href="#/about">关于我</a>
          </div>
        </div>
        <div class="hero-media reveal">${
          p.avatar ? `<img src="${esc(p.avatar)}" alt="头像">` : ""
        }</div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>精选作品</h2>
          <a class="count" href="#/works">全部 ${works.length} 件 →</a>
        </div>
        <div class="grid">
          ${cards || `<div class="empty">还没有作品，管理员可在后台新增。</div>`}
        </div>
      </section>`;

    revealObserve(app);
  }

  function cardHTML(w) {
    const cover = w.images && w.images.length ? w.images[0] : placeholder("NO IMAGE", "");
    return (
      `<article class="card reveal" data-id="${esc(w.id)}">
        <div class="card-media"><img src="${esc(cover)}" alt="${esc(w.title)}" loading="lazy"></div>
        <div class="card-body">
          <h3 class="card-title">${esc(w.title)}</h3>
          <p class="card-intro">${esc(w.intro || "")}</p>
        </div>
      </article>`
    );
  }

  // —— 作品列表 ——
  function renderWorks() {
    const works = (_works || []).slice().sort((a, b) => b.createdAt - a.createdAt);
    app.innerHTML =
      `<section class="section">
        <div class="section-head">
          <h2>作品集</h2>
          <span class="count">${works.length} 件作品</span>
        </div>
        <div class="grid">
          ${works.map((w) => cardHTML(w)).join("") ||
            `<div class="empty">还没有作品，管理员可在后台新增。</div>`}
        </div>
      </section>`;
    revealObserve(app);
  }

  // —— 详情 ——
  function renderDetail(id) {
    const works = _works || [];
    const w = works.find((x) => x.id === id);
    if (!w) { app.innerHTML = `<div class="empty">作品不存在或已被删除。<br><a href="#/works">返回作品集</a></div>`; return; }

    const shots = (w.images || []).map((src, i) =>
      `<div class="shot" data-idx="${i}"><img src="${esc(src)}" alt="${esc(w.title)} ${i + 1}"></div>`
    ).join("");

    const params = (w.params || []).map((p) =>
      `<div class="row"><span class="k">${esc(p.k)}</span><span class="v">${esc(p.v)}</span></div>`
    ).join("");

    app.innerHTML =
      `<div class="detail">
        <a class="detail-back" href="#/works">← 返回作品集</a>
        <div class="detail-grid">
          <div class="detail-media">${shots}</div>
          <div class="detail-info">
            <h1>${esc(w.title)}</h1>
            <p class="intro">${esc(w.intro || "")}</p>
            ${params ? `<div class="params">${params}</div>` : ""}
          </div>
        </div>
      </div>`;

    $$(".shot", app).forEach((s) => {
      s.addEventListener("click", () => openLightbox(w.images, Number(s.dataset.idx)));
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  // —— 关于 ——
  function renderAbout() {
    const p = _profile || {};
    app.innerHTML =
      `<div class="about">
        ${p.avatar ? `<img class="avatar" src="${esc(p.avatar)}" alt="头像">` : ""}
        <h1>${esc(p.name || "STUDIO")}</h1>
        <p class="role">${esc(p.title || "工业设计师")}</p>
        <p>${esc(p.bio || "")}</p>
        <p class="muted" style="margin-top:30px;font-size:13px;">本页资料可在后台「资料编辑」中修改。</p>
      </div>`;
    revealObserve(app);
  }

  // 卡片点击跳转
  app.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card && card.dataset.id) location.hash = "#/work/" + card.dataset.id;
  });

  /* ---------------------------------------------------------
     ⑦ 灯箱
     --------------------------------------------------------- */
  const lb = $("#lightbox");
  let lbList = [], lbIdx = 0;
  function openLightbox(list, idx) {
    lbList = list || []; lbIdx = idx || 0;
    if (!lbList.length) return;
    $("#lbImg").src = lbList[lbIdx];
    $("#lbCount").textContent = (lbIdx + 1) + " / " + lbList.length;
    lb.classList.add("open"); lb.setAttribute("aria-hidden", "false");
  }
  function closeLightbox() { lb.classList.remove("open"); lb.setAttribute("aria-hidden", "true"); }
  function lbStep(d) {
    if (!lbList.length) return;
    lbIdx = (lbIdx + d + lbList.length) % lbList.length;
    $("#lbImg").src = lbList[lbIdx];
    $("#lbCount").textContent = (lbIdx + 1) + " / " + lbList.length;
  }
  $("#lbClose").addEventListener("click", closeLightbox);
  $("#lbPrev").addEventListener("click", () => lbStep(-1));
  $("#lbNext").addEventListener("click", () => lbStep(1));
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") lbStep(-1);
    if (e.key === "ArrowRight") lbStep(1);
  });

  /* ---------------------------------------------------------
     ⑧ 管理员：登录 + 后台面板
     --------------------------------------------------------- */
  const adminModal = $("#adminModal");
  function isAdmin() { return sessionStorage.getItem(K_SESSION) === "1"; }

  function openAdmin() {
    adminModal.classList.add("open");
    adminModal.setAttribute("aria-hidden", "false");
    if (isAdmin()) showPanel(); else showLogin();
  }
  function closeAdmin() {
    adminModal.classList.remove("open");
    adminModal.setAttribute("aria-hidden", "true");
  }
  function showLogin() {
    $("#adminLogin").classList.remove("hidden");
    $("#adminPanel").classList.add("hidden");
    $("#adminErr").textContent = "";
    $("#adminPwd").value = "";
    setTimeout(() => $("#adminPwd").focus(), 50);
  }
  function showPanel() {
    $("#adminLogin").classList.add("hidden");
    $("#adminPanel").classList.remove("hidden");
    renderAdminWorks();
    renderProfileForm();
    updateStorageInfo();
    renderTokenInfo();
  }
  function updateStorageInfo() {
    $("#storageInfo").textContent = "本地已用 " + storageUsedMB() + " MB" +
      (_syncStatus ? " · " + (_syncStatus === "ok" ? "✓ 云端已同步" : _syncStatus) : "");
  }

  function renderTokenInfo() {
    const el = $("#tokenInfo");
    if (!el) return;
    const t = getGhToken();
    el.innerHTML = t
      ? `<span style="color:var(--success,#2ea043)">✓ Token 已配置（${t.slice(0,8)}…）</span> <button class="btn-ghost sm" id="clearTokenBtn">清除</button>`
      : `<span style="color:var(--warn,#d29922)">⚠ 未配置 Token</span> <button class="btn-primary sm" id="setTokenBtn">设置</button>`;

    const setBtn = $("#setTokenBtn");
    if (setBtn) setBtn.addEventListener("click", showTokenDialog);
    const clrBtn = $("#clearTokenBtn");
    if (clrBtn) clrBtn.addEventListener("click", () => { setGhToken(null); renderTokenInfo(); });
  }

  function showTokenDialog() {
    const t = prompt(
      "请输入你的 GitHub Personal Access Token（需要 repo 权限）。\n\n" +
      "获取方式：GitHub → Settings → Developer settings → Personal access tokens → Generate new token\n" +
      "勾选 repo 权限即可。",
      getGhToken() || ""
    );
    if (t && t.trim()) {
      setGhToken(t.trim());
      renderTokenInfo();
      if (_pendingLocal) {
        pushToGitHub().then((ok) =>
          alert(ok
            ? "Token 已保存 ✓ 本地尚未同步的作品已自动推送到 GitHub，刷新其他设备即可看到。"
            : "Token 已保存，但推送到 GitHub 失败，请稍后点「立即从 GitHub 重新拉取」再试。"));
      } else {
        alert("Token 已保存（已记住，下次无需重填）。现在保存作品会自动同步到 GitHub。");
      }
    }
  }

  $("#adminTrigger").addEventListener("click", openAdmin);
  $("#adminBackdrop").addEventListener("click", closeAdmin);
  $("#adminLoginBtn").addEventListener("click", () => {
    const v = $("#adminPwd").value;
    if (v === ADMIN_PASSWORD) {
      sessionStorage.setItem(K_SESSION, "1");
      showPanel();
    } else {
      $("#adminErr").textContent = "密码错误。";
    }
  });
  $("#adminPwd").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#adminLoginBtn").click(); });
  $("#adminLogout").addEventListener("click", () => {
    sessionStorage.removeItem(K_SESSION);
    closeAdmin();
  });

  // 标签页切换
  $$(".admin-tabs .tab").forEach((t) => {
    t.addEventListener("click", () => {
      $$(".admin-tabs .tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      const name = t.dataset.tab;
      $("#tabWorks").classList.toggle("active", name === "works");
      $("#tabProfile").classList.toggle("active", name === "profile");
      $("#tabSettings").classList.toggle("active", name === "settings");
    });
  });

  // 后台作品列表
  function renderAdminWorks() {
    const works = (_works || []).slice().sort((a, b) => b.createdAt - a.createdAt);
    const list = $("#adminWorkList");
    if (!works.length) { list.innerHTML = `<div class="muted" style="padding:10px 0;">暂无作品。</div>`; return; }
    list.innerHTML = works.map((w) =>
      `<div class="work-row">
        <img src="${esc((w.images && w.images[0]) || placeholder("NO",""))}" alt="">
        <div class="meta"><b>${esc(w.title)}</b><span>${esc(w.intro || "")}</span></div>
        <div class="acts">
          <button class="btn-ghost sm" data-edit="${esc(w.id)}">编辑</button>
          <button class="btn-ghost sm btn-danger" data-del="${esc(w.id)}">删除</button>
        </div>
      </div>`
    ).join("");

    $$("[data-edit]", list).forEach((b) =>
      b.addEventListener("click", () => openEdit(b.dataset.edit)));
    $$("[data-del]", list).forEach((b) =>
      b.addEventListener("click", () => {
        if (!confirm("确定删除该作品？此操作会同步到 GitHub。")) return;
        addDeleted(b.dataset.del);
        _works = _works.filter((x) => x.id !== b.dataset.del);
        pushToGitHub();
        renderAdminWorks();
        updateStorageInfo();
        render();
      }));
  }

  /* ---------------------------------------------------------
     ⑨ 新增 / 编辑作品弹窗
     --------------------------------------------------------- */
  const editModal = $("#editModal");
  let editState = null;

  function openEdit(id) {
    const w = id ? (_works || []).find((x) => x.id === id) : null;
    editState = {
      id: w ? w.id : null,
      images: w ? (w.images || []).slice() : [],
      coverIdx: 0,
      params: w ? (w.params || []).map((p) => ({ ...p })) : [],
    };
    $("#editTitle").textContent = w ? "编辑作品" : "新增作品";
    $("#wkTitle").value = w ? w.title : "";
    $("#wkIntro").value = w ? (w.intro || "") : "";
    renderThumbs();
    renderParams();
    editModal.classList.add("open");
    editModal.setAttribute("aria-hidden", "false");
  }
  function closeEdit() {
    editModal.classList.remove("open");
    editModal.setAttribute("aria-hidden", "true");
    editState = null;
  }
  function renderThumbs() {
    const box = $("#wkThumbs");
    box.innerHTML = editState.images.map((src, i) =>
      `<div class="thumb ${i === editState.coverIdx ? "cover" : ""}">
        <img src="${esc(src)}" alt="">
        ${i === editState.coverIdx ? `<span class="badge">封面</span>` : ""}
        <button class="setcover" data-set="${i}">设为封面</button>
        <button class="rm" data-rm="${i}" aria-label="移除">×</button>
      </div>`
    ).join("");
    $$("[data-rm]", box).forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.rm);
        editState.images.splice(i, 1);
        if (editState.coverIdx >= editState.images.length) editState.coverIdx = 0;
        renderThumbs();
      }));
    $$("[data-set]", box).forEach((b) =>
      b.addEventListener("click", () => { editState.coverIdx = Number(b.dataset.set); renderThumbs(); }));
  }
  function renderParams() {
    const box = $("#wkParams");
    box.innerHTML = editState.params.map((_, i) =>
      `<div class="param-row">
        <input placeholder="参数名" data-pk="${i}" value="${esc(editState.params[i].k)}">
        <input placeholder="参数值" data-pv="${i}" value="${esc(editState.params[i].v)}">
        <button class="rm" data-prm="${i}" aria-label="删除">×</button>
      </div>`
    ).join("");
    $$("#wkParams [data-pk]").forEach((inp) => inp.addEventListener("input", () => editState.params[Number(inp.dataset.pk)].k = inp.value));
    $$("#wkParams [data-pv]").forEach((inp) => inp.addEventListener("input", () => editState.params[Number(inp.dataset.pv)].v = inp.value));
    $$("#wkParams [data-prm]").forEach((b) =>
      b.addEventListener("click", () => { editState.params.splice(Number(b.dataset.prm), 1); renderParams(); }));
  }

  $("#addParamBtn").addEventListener("click", () => { editState.params.push({ k: "", v: "" }); renderParams(); });

  // 保存作品（核心改动：保存后推送到 GitHub）
  $("#editSave").addEventListener("click", async () => {
    const title = $("#wkTitle").value.trim();
    if (!title) { alert("请填写项目标题。"); return; }
    if (!editState.images.length) { alert("请至少上传一张作品图片。"); return; }

    $$("#wkParams [data-pk]").forEach((inp) => editState.params[Number(inp.dataset.pk)].k = inp.value);
    $$("#wkParams [data-pv]").forEach((inp) => editState.params[Number(inp.dataset.pv)].v = inp.value);
    const params = editState.params.filter((p) => p.k.trim() || p.v.trim());

    const cover = editState.images[editState.coverIdx] || editState.images[0];

    if (!_works) _works = [];
    if (editState.id) {
      const w = _works.find((x) => x.id === editState.id);
      Object.assign(w, { title, intro: $("#wkIntro").value.trim(), images: editState.images, cover, params });
    } else {
      _works.push({
        id: uid(), title, intro: $("#wkIntro").value.trim(),
        images: editState.images, cover, params, createdAt: Date.now(),
      });
    }

    // 推送到 GitHub
    const ok = await pushToGitHub();
    closeEdit();
    renderAdminWorks();
    updateStorageInfo();
    render();
    if (ok) alert("作品已保存并同步到 GitHub ✓");
  });

  // 拖拽上传
  const dz = $("#dropzone");
  const fileInput = $("#wkFiles");
  dz.addEventListener("click", () => fileInput.click());
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault(); dz.classList.remove("drag");
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener("change", () => handleFiles(fileInput.files));

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    for (const f of files) {
      try { editState.images.push(await fileToStored(f)); }
      catch (e) { alert("图片处理失败：" + f.name); }
    }
    if (editState.coverIdx >= editState.images.length) editState.coverIdx = 0;
    renderThumbs();
    fileInput.value = "";
  }

  $("#addWorkBtn").addEventListener("click", () => openEdit(null));
  $("#editClose").addEventListener("click", closeEdit);
  $("#editCancel").addEventListener("click", closeEdit);
  $("#editBackdrop").addEventListener("click", closeEdit);

  /* ---------------------------------------------------------
     ⑩ 资料编辑（同样推送 GitHub）
     --------------------------------------------------------- */
  function renderProfileForm() {
    const p = _profile || {};
    $("#pfName").value = p.name || "";
    $("#pfTitle").value = p.title || "";
    $("#pfBio").value = p.bio || "";
  }
  let avatarBuf = null;
  $("#pfAvatar").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) { try { avatarBuf = await fileToStored(f); } catch (err) { alert("头像处理失败"); } }
  });
  $("#saveProfileBtn").addEventListener("click", async () => {
    const cur = _profile || {};
    _profile = {
      name: $("#pfName").value.trim() || "STUDIO",
      title: $("#pfTitle").value.trim(),
      bio: $("#pfBio").value.trim(),
      avatar: avatarBuf || cur.avatar || placeholder("AVATAR", ""),
    };
    const ok = await pushToGitHub();
    avatarBuf = null;
    $("#pfAvatar").value = "";
    $("#brandName").textContent = _profile.name;
    render();
    if (ok) alert("资料已保存并同步到 GitHub ✓");
  });

  // 刷新品牌名
  (function syncBrand() {
    if (_profile && _profile.name) $("#brandName").textContent = _profile.name;
    if (_profile && _profile.title) $("#footCopy").textContent = "© 2026 " + _profile.name + " · " + _profile.title;
  })();

  // 强制重新同步按钮
  $("#forceSyncBtn")?.addEventListener("click", async () => {
    $("#forceSyncBtn").disabled = true;
    $("#forceSyncBtn").textContent = "⏳ 拉取中…";
    await fetchFromGitHub();
    if (getGhToken() && _pendingLocal) await pushToGitHub();
    render();
    updateStorageInfo();
    $("#forceSyncBtn").disabled = false;
    $("#forceSyncBtn").textContent = "🔄 立即从 GitHub 重新拉取";
    alert(_syncStatus === "ok"
      ? (_pendingLocal ? "已从 GitHub 同步，并把本地未同步的作品推上去了 ✓" : "已从 GitHub 同步最新数据 ✓")
      : "拉取失败，使用本地缓存");
  });

  /* ---------------------------------------------------------
     ⑪ 启动：先从 GitHub 加载数据，再渲染
     --------------------------------------------------------- */
  async function init() {
    // 先尝试从 GitHub 拉取（会与本地合并，保留本地未同步作品）
    await fetchFromGitHub();

    // 本地有 GitHub 没有的作品，且已配置 Token → 立即补推（救回「先加后填 token」的数据）
    if (getGhToken() && _pendingLocal) {
      await pushToGitHub();
    }

    // 如果 GitHub 和本地都没有数据（全新部署），用种子数据并推送
    if (!_works || !_works.length) {
      console.log("[Portfolio] GitHub 无数据，使用种子数据");
      const seed = getSeedData();
      _works = seed.works;
      _profile = seed.profile;
      saveWorksCache(_works);
      saveProfileCache(_profile);

      // 如果有 Token，自动把种子数据推上去
      if (getGhToken()) {
        await pushToGitHub();
      }
    }

    window.addEventListener("hashchange", render);
    render();
  }

  init();
})();
