// Authenticated API integration for My Library. Local mode remains available when logged out.
(function () {
  if (window.__ml_api_integration_loaded) return;
  window.__ml_api_integration_loaded = true;

  const config = window.API_CONFIG;
  const app = window.MLApp;
  if (!config || !app) {
    console.error("My Library API integration: API_CONFIG or MLApp is missing.");
    return;
  }

  const $ = id => document.getElementById(id);
  const token = config.getToken;
  const toast = message => app.toast(message);
  let syncing = false;

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (token()) headers.Authorization = "Bearer " + token();
    const response = await fetch(config.BASE_URL + path, { ...options, headers });
    if (response.status === 401) {
      config.removeToken();
      updateAuthState();
      throw new Error("Session expired. Please log in again.");
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const detail = data.detail;
      throw new Error(Array.isArray(detail) ? detail.map(item => item.msg).join(", ") : (detail || response.statusText || "Request failed"));
    }
    if (response.status === 204) return null;
    const type = response.headers.get("content-type") || "";
    return type.includes("application/json") ? response.json() : null;
  }

  const auth = {
    async register(username, password) {
      return request("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
    },
    async login(username, password) {
      const body = new URLSearchParams({ username, password });
      const result = await request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      if (!result || !result.access_token) throw new Error("The server did not return an access token.");
      config.setToken(result.access_token);
      return result;
    },
    logout() { config.removeToken(); }
  };

  function toPayload(book) {
    return {
      title: String(book.title || "").trim(),
      author: book.author || "",
      status: ["read", "reading", "planned"].includes(book.status) ? book.status : "planned",
      genre: book.genre || "",
      language: book.language || "uz",
      pages: Math.max(0, Number(book.pages) || 0),
      rating: Math.min(5, Math.max(0, Number(book.rating) || 0)),
      date: book.date || null,
      description: book.description || "",
      cover: book.cover || ""
    };
  }

  function fromServer(book) {
    return {
      id: String(book.id), title: book.title || "", author: book.author || "",
      status: book.status || "planned", genre: book.genre || "", language: book.language || "uz",
      pages: Number(book.pages) || 0, rating: Number(book.rating) || 0, date: book.date || "",
      description: book.description || "", cover: book.cover || "", likes: 0, dislikes: 0, userVote: ""
    };
  }

  async function loadBooks() {
    if (!token() || syncing) return;
    syncing = true;
    try {
      const remote = await request("/books");
      if (Array.isArray(remote)) {
        app.setBooks(remote.map(fromServer));
        localStorage.setItem("ml-remote-books", JSON.stringify(remote));
      }
    } catch (error) {
      toast("Could not sync books: " + error.message);
    } finally {
      syncing = false;
    }
  }

  async function saveBook(book, editingId) {
    if (!token()) return false;
    const payload = toPayload(book);
    const isServerId = editingId !== null && /^\d+$/.test(String(editingId));
    try {
      let saved;
      if (isServerId) {
        saved = await request("/books/" + encodeURIComponent(editingId), {
          method: "PUT", body: JSON.stringify(payload)
        });
      } else {
        saved = await request("/books", { method: "POST", body: JSON.stringify(payload) });
      }
      const list = app.getBooks();
      const normalized = fromServer(saved);
      app.setBooks(isServerId ? list.map(item => String(item.id) === String(editingId) ? normalized : item) : [normalized, ...list]);
      return true;
    } catch (error) {
      toast("Book was not saved to the server: " + error.message);
      return false;
    }
  }

  async function deleteBook(id) {
    if (!token() || !/^\d+$/.test(String(id))) return false;
    try {
      await request("/books/" + encodeURIComponent(id), { method: "DELETE" });
      app.setBooks(app.getBooks().filter(book => String(book.id) !== String(id)));
      return true;
    } catch (error) {
      toast("Book was not deleted: " + error.message);
      return false;
    }
  }

  function createSettingsPanel() {
    const page = $("page-settings");
    if (!page || $("ml-auth-panel")) return;
    const panel = document.createElement("section");
    panel.id = "ml-auth-panel";
    panel.className = "section";
    panel.style.maxWidth = "650px";
    panel.style.marginTop = "24px";
    panel.innerHTML = `
      <div class="section-title">Account & Cloud Sync</div>
      <p class="sub" style="margin:8px 0 16px">Sign in to sync books across devices. Logged-out changes stay in this browser.</p>
      <div class="field"><label for="ml-username">Username</label><input id="ml-username" autocomplete="username" minlength="3" maxlength="50" placeholder="At least 3 characters"></div>
      <div class="field" style="margin-top:12px"><label for="ml-password">Password</label><input id="ml-password" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button id="ml-register-btn" class="secondary" type="button">Create account</button>
        <button id="ml-login-btn" class="primary" type="button">Log in & sync</button>
        <button id="ml-logout-btn" class="secondary" type="button" hidden>Log out</button>
        <button id="ml-migrate-btn" class="secondary" type="button" hidden>Import this browser's books</button>
      </div>
      <p id="ml-auth-status" class="help" style="margin-top:12px" role="status"></p>
      <p class="help" style="margin-top:8px">Import copies local books into this account. Your local backup is not deleted. Voting is currently browser-local.</p>
    `;
    const intro = page.querySelector(".page-intro");
    if (intro) intro.insertAdjacentElement("afterend", panel);
    else page.appendChild(panel);

    $("ml-register-btn").addEventListener("click", async () => {
      const username = $("ml-username").value.trim();
      const password = $("ml-password").value;
      if (!username || !password) return toast("Enter a username and password first.");
      try {
        await auth.register(username, password);
        $("ml-auth-status").textContent = "Account created. Log in to sync your books.";
        toast("Account created. You can now log in.");
      } catch (error) { toast("Registration failed: " + error.message); }
    });

    $("ml-login-btn").addEventListener("click", async () => {
      const username = $("ml-username").value.trim();
      const password = $("ml-password").value;
      if (!username || !password) return toast("Enter a username and password first.");
      const button = $("ml-login-btn");
      button.disabled = true;
      try {
        await auth.login(username, password);
        updateAuthState();
        await loadBooks();
        $("ml-auth-status").textContent = "Signed in. Your server library is loaded.";
        toast("Logged in and synced.");
      } catch (error) {
        config.removeToken();
        updateAuthState();
        toast("Login failed: " + error.message);
      } finally { button.disabled = false; }
    });

    $("ml-logout-btn").addEventListener("click", () => {
      auth.logout();
      updateAuthState();
      toast("Logged out. New changes will stay in this browser.");
    });

    $("ml-migrate-btn").addEventListener("click", async () => {
      if (!token()) return toast("Log in before importing books.");
      const local = JSON.parse(localStorage.getItem("ml-books") || "[]");
      if (!local.length) return toast("There are no local books to import.");
      const key = "ml-imported-" + $("ml-username").value.trim().toLowerCase();
      if (localStorage.getItem(key) && !confirm("This browser has imported books before. Import again? This may create duplicates.")) return;
      if (!confirm("Copy " + local.length + " local books to your account? Existing local books will remain unchanged.")) return;
      const button = $("ml-migrate-btn");
      button.disabled = true;
      let succeeded = 0;
      try {
        for (const book of local) {
          await request("/books", { method: "POST", body: JSON.stringify(toPayload(book)) });
          succeeded++;
        }
        localStorage.setItem(key, "true");
        await loadBooks();
        toast("Imported " + succeeded + " of " + local.length + " books.");
      } catch (error) {
        toast("Imported " + succeeded + " books before an error: " + error.message + ". Retry carefully to avoid duplicates.");
      } finally { button.disabled = false; }
    });

    updateAuthState();
  }

  function updateAuthState() {
    const loggedIn = Boolean(token());
    if ($("ml-login-btn")) $("ml-login-btn").hidden = loggedIn;
    if ($("ml-register-btn")) $("ml-register-btn").hidden = loggedIn;
    if ($("ml-logout-btn")) $("ml-logout-btn").hidden = !loggedIn;
    if ($("ml-migrate-btn")) $("ml-migrate-btn").hidden = !loggedIn;
    if ($("ml-auth-status")) $("ml-auth-status").textContent = loggedIn ? "Signed in. Cloud sync is enabled." : "Not signed in. Books are saved in this browser.";
  }

  // Existing form remains visually unchanged; intercept its submit to persist through the API.
  document.addEventListener("submit", async event => {
    if (event.target.id !== "bookForm" || !token()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const title = $("title").value.trim();
    if (!title) return;
    const id = app.getEditingId();
    const book = {
      id: id || "pending", title, author: $("author").value.trim(),
      language: $("bookLang").value, status: $("status").value,
      genre: $("genre").value.trim(), pages: Number($("bookPages").value) || 0,
      rating: Number($("rating").value) || 0, date: $("date").value,
      description: $("description").value.trim(), cover: app.getCoverData()
    };
    const submit = event.target.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    const ok = await saveBook(book, id);
    if (submit) submit.disabled = false;
    if (ok) {
      app.closeBookModal();
      toast("Book saved to your account.");
    }
  }, true);

  // Intercept delete and status changes in the existing detail modal.
  document.addEventListener("click", async event => {
    if (!token()) return;
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const id = action.dataset.id;
    if (action.dataset.action === "delete" && /^\d+$/.test(String(id))) {
      event.preventDefault(); event.stopImmediatePropagation();
      const book = app.getBooks().find(item => String(item.id) === String(id));
      if (!book || !confirm("Delete this book from your account?")) return;
      if (await deleteBook(id)) {
        app.closeDetailModal();
        toast("Book deleted.");
      }
      return;
    }
    if (["read", "reading", "planned"].includes(action.dataset.action) && /^\d+$/.test(String(id))) {
      event.preventDefault(); event.stopImmediatePropagation();
      const book = app.getBooks().find(item => String(item.id) === String(id));
      if (!book) return;
      const updated = { ...book, status: action.dataset.action };
      try {
        const saved = await request("/books/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(toPayload(updated)) });
        app.setBooks(app.getBooks().map(item => String(item.id) === String(id) ? fromServer(saved) : item));
        app.closeDetailModal();
        toast("Book status updated.");
      } catch (error) { toast("Could not update status: " + error.message); }
    }
  }, true);

  // Voting is not part of the current backend schema, so don't imply it syncs to the cloud.
  function init() {
    createSettingsPanel();
    if (token()) loadBooks();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.MLApi = { auth, loadBooks, saveBook, deleteBook };
})();
