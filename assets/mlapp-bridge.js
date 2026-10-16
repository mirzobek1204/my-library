// assets/mlapp-bridge.js
// Minimal bridge exposing a small MLApp interface used by the integration script.
// This file is intentionally tiny and only binds to existing globals in index.html.
(function(){
  if(window.MLApp) return;

  function safeGetBooks(){ try{ return Array.isArray(window.books)?window.books:[];}catch(e){return [];} }
  function safeSetBooks(arr){ try{ window.books = Array.isArray(arr)?arr:[]; if(typeof save==='function') try{ save(); }catch(e){} if(typeof render==='function') try{ render(); }catch(e){} }catch(e){} }
  function safeGetEditingId(){ try{ return typeof editingId !== 'undefined' ? editingId : null; }catch(e){return null;} }
  function safeGetCoverData(){ try{ return typeof coverData !== 'undefined' ? coverData : ''; }catch(e){return ''; } }
  function safeCloseBookModal(){ try{ if(typeof closeModal==='function') closeModal('bookModal'); else { const el=document.getElementById('bookModal'); if(el) el.classList.remove('open'); } }catch(e){} }
  function safeCloseDetailModal(){ try{ if(typeof closeModal==='function') closeModal('detailModal'); else { const el=document.getElementById('detailModal'); if(el) el.classList.remove('open'); } }catch(e){} }
  function safeToast(msg){ try{ if(typeof toast==='function') toast(msg); else { const el=document.getElementById('toast'); if(el){ el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2600); } } }catch(e){} }

  window.MLApp = {
    getBooks: safeGetBooks,
    setBooks: safeSetBooks,
    getEditingId: safeGetEditingId,
    getCoverData: safeGetCoverData,
    closeBookModal: safeCloseBookModal,
    closeDetailModal: safeCloseDetailModal,
    toast: safeToast
  };
})();
