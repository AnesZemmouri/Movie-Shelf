import fs from "node:fs";
const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find(t => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id);} });
const send = (m, p={}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({id:i,method:m,params:p})); });
const evalIn = async (expr) => {
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: expr });
  if (r.result?.exceptionDetails) return "THREW: " + r.result.exceptionDetails.exception?.description;
  return r.result?.result?.value;
};
await new Promise(r => ws.addEventListener("open", r, {once:true}));
await send("Runtime.enable"); await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:5173/mockup.html" });
await new Promise(r => setTimeout(r, 7000));

const set = (label, v) => evalIn(`(() => {
  const c=[...document.querySelectorAll('.mk-control')].find(x=>x.textContent.toLowerCase().startsWith(${JSON.stringify(label)}));
  if(!c) return 'MISSING';
  const i=c.querySelector('input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,String(${v}));
  i.dispatchEvent(new Event('input',{bubbles:true})); return 'ok';
})()`);

// Turn hard so the right-hand wall faces the camera — that is the "side".
console.log(await set("turn", -62), await set("tilt", 4), await set("light angle", 100));
await new Promise(r => setTimeout(r, 1600));

const boxes = await evalIn(`(() => {
  const s = document.querySelectorAll('.mk-stage');
  const a = s[0].getBoundingClientRect(), b = s[1].getBoundingClientRect();
  return { css: [a.x,a.y,a.width,a.height], webgl: [b.x,b.y,b.width,b.height] };
})()`);

for (const [panel, box] of [["css", boxes.css], ["webgl", boxes.webgl]]) {
  const shot = await send("Page.captureScreenshot", { format: "png",
    clip: { x: box[0], y: box[1], width: box[2], height: box[3], scale: 2 } });
  fs.writeFileSync(`C:/Users/Bureau/AppData/Local/Temp/side-${panel}.png`, Buffer.from(shot.result.data, "base64"));
}
console.log("captured", JSON.stringify(boxes));
ws.close();
