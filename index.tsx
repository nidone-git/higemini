// index.tsx (一時的なテスト用)
alert('[index.tsx] Minimal script loaded and executed!');
console.log('[index.tsx] Minimal script console log.');

// DOMが完全に読み込まれた後に実行する
document.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = '<h1 style="color: black; background-color: yellow; padding: 20px;">Minimal script has replaced root!</h1>';
    console.log('[index.tsx] Minimal script successfully modified the #root element.');
  } else {
    console.error('[index.tsx] Minimal script: #root element not found.');
    alert('[index.tsx] Minimal script: #root element not found!');
    document.body.innerHTML = '<h1 style="color: red; background-color: pink; padding: 20px;">Minimal script: #root NOT FOUND!</h1>';
  }
});