/* =========================================================
   STUDIO · 工业设计作品集  —  应用逻辑（纯前端 / 无后端）
   ========================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     ① 配置区（你要改的东西基本都在这里）
     --------------------------------------------------------- */
  // ⚠️ 管理员密码：修改这里即可。注意纯前端密码仅防随手改动，
  //    懂技术的人能在源码里看到，正式安全请部署后端（见 README）。
  const ADMIN_PASSWORD = "design2026";

  const K_WORKS   = "idp_works_v1";      // 作品数据
  const K_PROFILE  = "idp_profile_v1";    // 首页/关于资料
  const K_SESSION  = "idp_admin_session_v1"; // 后台登录态（仅当前标签页会话）

  const MAX_DIM = 1600;   // 上传图片最长边压缩到 1600px，省本地空间
  const JPEG_Q  = 0.82;   // JPEG 压缩质量

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
     ③ 本地存储读写
     --------------------------------------------------------- */
  function loadWorks() {
    try { return JSON.parse(localStorage.getItem(K_WORKS)) || null; }
    catch (e) { return null; }
  }
  function saveWorks(w) { localStorage.setItem(K_WORKS, JSON.stringify(w)); }

  function loadProfile() {
    try { return JSON.parse(localStorage.getItem(K_PROFILE)) || null; }
    catch (e) { return null; }
  }
  function saveProfile(p) { localStorage.setItem(K_PROFILE, JSON.stringify(p)); }

  // 估算已用本地空间（仅统计本应用两个键）
  function storageUsedMB() {
    let bytes = 0;
    [K_WORKS, K_PROFILE].forEach((k) => {
      const v = localStorage.getItem(k);
      if (v) bytes += new Blob([v]).size;
    });
    return (bytes / (1024 * 1024)).toFixed(2);
  }

  /* ---------------------------------------------------------
     ④ 首次访问的种子数据（中性灰占位图，可全部在后台删除）
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

  function seedIfEmpty() {
    if (loadWorks()) return;

    const seeds = [
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
    ];
    saveWorks(seeds);

    saveProfile({
      name: "STUDIO",
      title: "工业设计师 · 产品 / CMF / 包装",
      bio: "专注消费电子与生活方式产品的工业设计，擅长从概念草图到量产落地的完整链路。工作涵盖 Rhino / NX 建模、CMF 与包装系统。",
      avatar: placeholder("AVATAR", ""),
    });
  }

  /* ---------------------------------------------------------
     ⑤ 图片处理：上传前压缩，控制本地存储占用
     --------------------------------------------------------- */
  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function downscale(dataURL, maxDim, quality) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s);
          height = Math.round(height * s);
        }
        const cv = document.createElement("canvas");
        cv.width = width; cv.height = height;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        try { res(cv.toDataURL("image/jpeg", quality)); }
        catch (e) { rej(e); }
      };
      img.onerror = rej;
      img.src = dataURL;
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
    const p = loadProfile() || {};
    const works = (loadWorks() || []).slice().sort((a, b) => b.createdAt - a.createdAt);
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
    const works = (loadWorks() || []).slice().sort((a, b) => b.createdAt - a.createdAt);
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
    const works = loadWorks() || [];
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
    const p = loadProfile() || {};
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

  // 卡片点击跳转（事件委托）
  app.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card && card.dataset.id) location.hash = "#/work/" + card.dataset.id;
  });

  /* ---------------------------------------------------------
     ⑦ 灯箱（点击大图放大预览）
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
    if (isAdmin()) showPanel();
    else showLogin();
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
  }
  function updateStorageInfo() {
    $("#storageInfo").textContent = "本地已用 " + storageUsedMB() + " MB";
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
    });
  });

  // 后台作品列表
  function renderAdminWorks() {
    const works = (loadWorks() || []).slice().sort((a, b) => b.createdAt - a.createdAt);
    const list = $("#adminWorkList");
    if (!works.length) { list.innerHTML = `<div class="muted" style="padding:10px 0;">暂无作品。</div>`; return; }
    list.innerHTML = works.map((w) =>
      `<div class="work-row">
        <img src="${esc((w.images && w.images[0]) || placeholder("NO","") )}" alt="">
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
        if (!confirm("确定删除该作品？此操作不可恢复。")) return;
        const all = loadWorks().filter((x) => x.id !== b.dataset.del);
        saveWorks(all);
        renderAdminWorks();
        updateStorageInfo();
        render(); // 刷新前台视图
      }));
  }

  /* ---------------------------------------------------------
     ⑨ 新增 / 编辑作品弹窗
     --------------------------------------------------------- */
  const editModal = $("#editModal");
  let editState = null; // { id, images:[], coverIdx, params:[] }

  function openEdit(id) {
    const all = loadWorks() || [];
    const w = id ? all.find((x) => x.id === id) : null;
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
    $$("[data-pk]", box).forEach((inp) => inp.addEventListener("input", () => editState.params[Number(inp.dataset.pk)].k = inp.value));
    $$("[data-pv]", box).forEach((inp) => inp.addEventListener("input", () => editState.params[Number(inp.dataset.pv)].v = inp.value));
    $$("[data-prm]", box).forEach((b) =>
      b.addEventListener("click", () => { editState.params.splice(Number(b.dataset.prm), 1); renderParams(); }));
  }

  // 参数行
  $("#addParamBtn").addEventListener("click", () => { editState.params.push({ k: "", v: "" }); renderParams(); });

  // 保存作品
  $("#editSave").addEventListener("click", () => {
    const title = $("#wkTitle").value.trim();
    if (!title) { alert("请填写项目标题。"); return; }
    if (!editState.images.length) { alert("请至少上传一张作品图片。"); return; }

    // 同步参数输入（防御性）
    $$("#wkParams [data-pk]").forEach((inp) => editState.params[Number(inp.dataset.pk)].k = inp.value);
    $$("#wkParams [data-pv]").forEach((inp) => editState.params[Number(inp.dataset.pv)].v = inp.value);
    const params = editState.params.filter((p) => p.k.trim() || p.v.trim());

    const cover = editState.images[editState.coverIdx] || editState.images[0];
    const all = loadWorks() || [];
    if (editState.id) {
      const w = all.find((x) => x.id === editState.id);
      Object.assign(w, { title, intro: $("#wkIntro").value.trim(), images: editState.images, cover, params });
    } else {
      all.push({
        id: uid(), title, intro: $("#wkIntro").value.trim(),
        images: editState.images, cover, params, createdAt: Date.now(),
      });
    }
    saveWorks(all);
    closeEdit();
    renderAdminWorks();
    updateStorageInfo();
    render();
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
     ⑩ 资料编辑
     --------------------------------------------------------- */
  function renderProfileForm() {
    const p = loadProfile() || {};
    $("#pfName").value = p.name || "";
    $("#pfTitle").value = p.title || "";
    $("#pfBio").value = p.bio || "";
  }
  let avatarBuf = null;
  $("#pfAvatar").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) { try { avatarBuf = await fileToStored(f); } catch (err) { alert("头像处理失败"); } }
  });
  $("#saveProfileBtn").addEventListener("click", () => {
    const cur = loadProfile() || {};
    const next = {
      name: $("#pfName").value.trim() || "STUDIO",
      title: $("#pfTitle").value.trim(),
      bio: $("#pfBio").value.trim(),
      avatar: avatarBuf || cur.avatar || placeholder("AVATAR", ""),
    };
    saveProfile(next);
    avatarBuf = null;
    $("#pfAvatar").value = "";
    $("#brandName").textContent = next.name;
    render();
    alert("资料已保存。");
  });

  // 刷新品牌名
  (function syncBrand() {
    const p = loadProfile();
    if (p && p.name) $("#brandName").textContent = p.name;
    if (p && p.title) $("#footCopy").textContent = "© 2026 " + p.name + " · " + p.title;
  })();

  /* ---------------------------------------------------------
     ⑪ 启动
     --------------------------------------------------------- */
  seedIfEmpty();
  window.addEventListener("hashchange", render);
  render();
})();
