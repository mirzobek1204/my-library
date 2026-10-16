// assets/api-integration.js
// Minimal, non-invasive integration between frontend and backend.
// Uses API_CONFIG from api-config.js for BASE_URL and token helpers.

(function(){
  if(window.__ml_api_integration_loaded) return; window.__ml_api_integration_loaded = true;
  const BASE = API_CONFIG.BASE_URL;
  const getToken = API_CONFIG.getToken; const setToken = API_CONFIG.setToken; const removeToken = API_CONFIG.removeToken;

  function authFetch(path, opts={}){
    opts.headers = opts.headers || {};
    if(!opts.headers['Content-Type'] && !(opts.body instanceof FormData)) opts.headers['Content-Type']='application/json';
    const token = getToken();
    if(token) opts.headers['Authorization']='Bearer '+token;
    return fetch(BASE+path, opts).then(async res=>{
      if(res.status===401){ removeToken(); toast('Session expired. Please log in again.'); return Promise.reject({unauthorized:true}); }
      if(!res.ok){
        let detail = res.statusText;
        try{ const j = await res.json(); if(j && j.detail) detail = j.detail; }catch(e){}
        return Promise.reject(new Error(detail));
      }
      const ct = (res.headers.get('content-type')||'')
      if(!ct.includes('application/json')) return null;
      return res.json();
    });
  }

  const auth = {
    async register(username,password){
      const res = await fetch(BASE+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
      if(!res.ok){ const j=await res.json().catch(()=>null); throw new Error((j&&j.detail)||'Register failed'); }
      return res.json();
    },
    async login(username,password){
      const form = new URLSearchParams(); form.append('username',username); form.append('password',password);
      const res = await fetch(BASE+'/auth/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
      if(!res.ok){ const j=await res.json().catch(()=>null); throw new Error((j&&j.detail)||'Login failed'); }
      const data = await res.json(); if(data && data.access_token){ setToken(data.access_token); return data;} throw new Error('No access_token returned');
    },
    logout(){ removeToken(); }
  };

  const apiBooks = {
    list(){ return authFetch('/books',{method:'GET'}); },
    create(book){ return authFetch('/books',{method:'POST',body:JSON.stringify(book)}); },
    remove(id){ return authFetch('/books/'+encodeURIComponent(id),{method:'DELETE'}); }
  };

  // Insert small settings panel for auth/migration (non-destructive)
  function createSettingsPanel(){
    const settingsPage = document.getElementById('page-settings'); if(!settingsPage) return; if(document.getElementById('ml-auth-panel')) return;
    const container = document.createElement('div'); container.id='ml-auth-panel'; container.style.marginTop='12px';
    container.innerHTML = `
      <div class="section-head" style="margin-bottom:8px"><div><div class="section-title">🔑 <span>Account</span></div><div class="sub">Sign in to sync your library</div></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;"> 
        <div style="min-width:220px;flex:1"><label for="ml-username">Username</label><input id="ml-username" placeholder="username" style="width:100%;margin-top:4px;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:inherit"/></div>
        <div style="min-width:220px;flex:1"><label for="ml-password">Password</label><input id="ml-password" type="password" placeholder="password" style="width:100%;margin-top:4px;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:inherit"/></div>
        <div style="display:flex;gap:8px;align-items:center"><button id="ml-register-btn" class="secondary">Register</button><button id="ml-login-btn" class="primary">Login</button><button id="ml-logout-btn" class="secondary" style="display:none">Logout</button></div>
      </div>
      <div style="margin-top:10px"><button id="ml-migrate-btn" class="secondary">Migrate local books to server</button><small style="display:block;margin-top:6px;color:var(--muted)">Local books are preserved. Migration is one-way for convenience; you can export before migrating.</small></div>
    `;
    const firstChild = settingsPage.querySelector('.page-intro') || settingsPage.firstElementChild;
    if(firstChild && firstChild.parentElement) firstChild.parentElement.insertBefore(container, firstChild.nextSibling); else settingsPage.appendChild(container);

    document.getElementById('ml-register-btn').addEventListener('click', async ()=>{
      const u=document.getElementById('ml-username').value.trim(); const p=document.getElementById('ml-password').value; if(!u||!p) return toast('Please enter username and password');
      try{ await auth.register(u,p); toast('Registered — you can now log in'); }catch(err){ toast(err.message||'Register failed'); }
    });

    document.getElementById('ml-login-btn').addEventListener('click', async ()=>{
      const u=document.getElementById('ml-username').value.trim(); const p=document.getElementById('ml-password').value; if(!u||!p) return toast('Please enter username and password');
      try{ await auth.login(u,p); updateAuthState(); toast('Logged in — fetching your books'); await fetchAndReplaceBooks(); }catch(err){ toast(err.message||'Login failed'); }
    });

    document.getElementById('ml-logout-btn').addEventListener('click', ()=>{ auth.logout(); updateAuthState(); toast('Logged out'); });

    document.getElementById('ml-migrate-btn').addEventListener('click', async ()=>{
      if(!confirm('Migrate local books to your account? This will copy them to the server but will NOT delete the local copies.')) return;
      if(!getToken()){ toast('Please login first to migrate'); return; }
      let localBooks=[]; try{ localBooks = JSON.parse(localStorage.getItem('ml-books'))||[]; }catch(e){ localBooks=[]; }
      let migrated=0;
      for(const b of localBooks){ const payload={ title: b.title||'Untitled', author:b.author||'', status:b.status||'planned', genre:b.genre||'', language:b.language||'uz', pages:Number(b.pages)||0, rating:Number(b.rating)||0, date:b.date||null, description:b.description||'', cover:b.cover||null };
        try{ await apiBooks.create(payload); migrated++; await new Promise(r=>setTimeout(r,120)); }catch(e){}
      }
      toast(`Migrated ${migrated} books (local copies preserved)`);
      await fetchAndReplaceBooks();
    });

    updateAuthState();
  }

  function updateAuthState(){ const loggedIn=!!getToken(); const logoutBtn=document.getElementById('ml-logout-btn'); const loginBtn=document.getElementById('ml-login-btn'); if(logoutBtn && loginBtn){ logoutBtn.style.display=loggedIn?'':'none'; loginBtn.style.display=loggedIn?'none':''; } }

  async function fetchAndReplaceBooks(){ try{ const serverBooks = await apiBooks.list(); if(!Array.isArray(serverBooks)) return; const mapped = serverBooks.map(sb=>({ id: String(sb.id), title: sb.title||'', author: sb.author||'', status: sb.status||'planned', genre: sb.genre||'', description: sb.description||'', language: sb.language||'uz', pages: Number(sb.pages)||0, rating: Number(sb.rating)||0, date: sb.date||'', cover: sb.cover||'', likes:0, dislikes:0, userVote:null })); if(window.books && Array.isArray(window.books)){ window.books = mapped; try{ localStorage.setItem('ml-remote-books', JSON.stringify(mapped)); }catch(e){} if(typeof render==='function') render(); } else { try{ localStorage.setItem('ml-remote-books', JSON.stringify(mapped)); }catch(e){} } }catch(e){} }

  function initWhenReady(){ if(document.readyState==='complete' || document.readyState==='interactive'){ createSettingsPanel(); if(getToken()) fetchAndReplaceBooks(); } else document.addEventListener('DOMContentLoaded', ()=>{ createSettingsPanel(); if(getToken()) fetchAndReplaceBooks(); }); }

  initWhenReady(); window.MLApi={ auth, apiBooks, fetchAndReplaceBooks };
})();
