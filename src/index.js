import engineJs from './engine.js' with { type: 'text' };
import uiHtml from './ui.html' with { type: 'text' };

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/engine.js') {
      return new Response(engineJs, {
        headers: { 'Content-Type': 'application/javascript;charset=utf-8', 'Cache-Control': 'no-cache' }
      });
    }
    return new Response(uiHtml, {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-cache' }
    });
  }
};
