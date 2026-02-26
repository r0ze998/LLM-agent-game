// Quick PDF export using Chrome CDP (no puppeteer dependency)
import { execSync } from 'child_process';
import http from 'http';
import https from 'https';
import { writeFileSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE_URL = 'http://localhost:8888/demo-slides.html?print-pdf';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'murasato-slides.pdf');

// Launch Chrome with remote debugging
const child = (await import('child_process')).spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=9222',
  PAGE_URL,
], { stdio: 'ignore' });

// Wait for Chrome to start
await new Promise(r => setTimeout(r, 5000));

// Get the WebSocket debugger URL
const res = await fetch('http://127.0.0.1:9222/json/list');
const targets = await res.json();
const page = targets.find(t => t.type === 'page');

if (!page) {
  console.error('No page found');
  child.kill();
  process.exit(1);
}

// Connect via CDP
const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 1;

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = msgId++;
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.addEventListener('open', async () => {
  // Wait for page to fully load
  await new Promise(r => setTimeout(r, 5000));

  // Print to PDF
  const result = await send('Page.printToPDF', {
    landscape: true,
    printBackground: true,
    paperWidth: 13.33,  // 1280/96
    paperHeight: 7.5,   // 720/96
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    preferCSSPageSize: true,
  });

  const buffer = Buffer.from(result.data, 'base64');
  writeFileSync(OUT, buffer);
  console.log(`PDF saved: ${OUT} (${buffer.length} bytes)`);

  ws.close();
  child.kill();
  process.exit(0);
});
