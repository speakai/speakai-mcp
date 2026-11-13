import {
  MEDIA_LIST_CARD_MAX_ROWS,
  MEDIA_LIST_CARD_META_KEY,
} from "./card-data.js";

const SPEAK_WEB_APP_URL = "https://app.speakai.co";
const CARD_DATA_TIMEOUT_MS = 45_000;
const LIVE_BUTTON_PAUSE_MS = 8_000;
const MCP_APPS_PROTOCOL_VERSION = "2026-01-26";

const VIEW_STYLE = `
:root{color-scheme:light;
--fb-bg:#ffffff;--fb-fg:#1f2328;--fb-muted:#59636e;--fb-line:#d8dee4;--fb-soft:#eef0f2;--fb-bad:#b42318}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;
--fb-bg:#26282c;--fb-fg:#ececec;--fb-muted:#a8adb3;--fb-line:#3a3d42;--fb-soft:#34363a;--fb-bad:#f97066}}
:root[data-theme="dark"]{color-scheme:dark;
--fb-bg:#26282c;--fb-fg:#ececec;--fb-muted:#a8adb3;--fb-line:#3a3d42;--fb-soft:#34363a;--fb-bad:#f97066}
:root{
--c-bg:var(--color-background-primary,var(--fb-bg));
--c-fg:var(--color-text-primary,var(--fb-fg));
--c-muted:var(--color-text-secondary,var(--fb-muted));
--c-line:var(--color-border-tertiary,var(--fb-line));
--c-soft:var(--color-background-secondary,var(--fb-soft));
--c-bad:var(--color-text-danger,var(--fb-bad));
--c-ring:var(--color-ring-primary,var(--c-fg));
--c-radius:var(--border-radius-xl,12px);
--c-radius-btn:var(--border-radius-md,8px);
--c-font:var(--font-sans,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);
--c-semibold:var(--font-weight-semibold,600)}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent}
body{font-family:var(--c-font);color:var(--c-fg);font-size:12px;line-height:1.45;-webkit-text-size-adjust:100%}
[hidden]{display:none!important}
.card{border:1px solid var(--c-line);border-radius:var(--c-radius);background:var(--c-bg);padding:2px 12px 6px;min-width:0}
.head{font-size:12px;font-weight:var(--c-semibold);color:var(--c-muted);padding:8px 0 6px;margin:0;overflow-wrap:anywhere}
.list{list-style:none;margin:0;padding:0}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--c-line);padding:6px 0;min-height:44px;min-width:0}
.txt{position:relative;min-width:0;flex:1 1 auto}
.t{font-size:14px;font-weight:var(--c-semibold);color:var(--c-fg);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;text-decoration:underline;text-decoration-color:var(--c-line);text-underline-offset:3px;border-radius:4px}
.t:hover{text-decoration-color:currentColor}
.meta,.match{display:block;font-size:12px;color:var(--c-muted)}
.match{color:var(--c-fg)}
.st{color:var(--c-fg);font-weight:var(--c-semibold)}
.st.bad{color:var(--c-bad)}
.match{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{flex:0 0 auto;font:inherit;font-size:12px;font-weight:var(--c-semibold);color:var(--c-fg);background:transparent;border:1px solid var(--c-line);border-radius:var(--c-radius-btn);padding:0 10px;min-height:32px;display:inline-flex;align-items:center;white-space:nowrap;cursor:pointer}
.btn:hover{background:var(--c-soft)}
.btn[aria-disabled="true"]{opacity:.45;cursor:default;background:transparent}
.t:focus-visible,.btn:focus-visible{outline:2px solid var(--c-ring);outline-offset:2px}
.t:focus:not(:focus-visible),.btn:focus:not(:focus-visible){outline:none}
.foot{font-size:12px;color:var(--c-muted);border-top:1px solid var(--c-line);padding-top:6px;margin:0}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.touch .btn{min-height:44px;padding:0 12px}
.touch .txt{min-height:44px;display:flex;flex-direction:column;justify-content:center}
.touch .t::after{content:"";position:absolute;inset:0}
.sk{display:block;background:var(--c-soft);border-radius:4px;height:12px}
.sk.h{width:60px;margin:8px 0 6px}
.sk.t{height:14px;width:60%;margin-bottom:6px}
.sk.m{width:35%}
.sk.b{width:110px;height:32px;border-radius:var(--c-radius-btn);flex:0 0 auto}
.touch .sk.b{height:44px}
@media (max-width:359px){.row{flex-direction:column;align-items:flex-start;gap:4px}.txt{width:100%}}
`;

const VIEW_SCRIPT = `
(function(){
var META_KEY=${JSON.stringify(MEDIA_LIST_CARD_META_KEY)};
var MAX_ROWS=${MEDIA_LIST_CARD_MAX_ROWS};
var WEB_APP_URL=${JSON.stringify(SPEAK_WEB_APP_URL)};
var DATA_TIMEOUT_MS=${CARD_DATA_TIMEOUT_MS};
var LIVE_PAUSE_MS=${LIVE_BUTTON_PAUSE_MS};
var PROTOCOL_VERSION=${JSON.stringify(MCP_APPS_PROTOCOL_VERSION)};
var READY_STATES={processed:1,complete:1};
var NOT_STARTED_STATES={notUploaded:1,pendingPayment:1};

var root=document.getElementById("card");
var hostCaps={};
var locale=document.documentElement.lang||navigator.language||"en-GB";
var timeZone;
var nextId=1;
var pending={};
var settled=false;
var dataTimer;

function post(msg){window.parent.postMessage(msg,"*");}
function request(method,params){
  var id=nextId++;
  post({jsonrpc:"2.0",id:id,method:method,params:params});
  return new Promise(function(resolve,reject){
    pending[id]={resolve:resolve,reject:reject};
    setTimeout(function(){if(pending[id]){delete pending[id];reject(new Error("timeout"));}},15000);
  });
}
function notify(method,params){post({jsonrpc:"2.0",method:method,params:params||{}});}

var lastHeight=-1;
function reportSize(){
  var h=root.hidden?0:Math.ceil(document.documentElement.getBoundingClientRect().height);
  if(h===lastHeight)return;
  lastHeight=h;
  notify("ui/notifications/size-changed",{height:h});
}

function applyContext(ctx){
  if(!ctx)return;
  var docEl=document.documentElement;
  if(ctx.theme)docEl.setAttribute("data-theme",ctx.theme==="dark"?"dark":"light");
  var vars=ctx.styles&&ctx.styles.variables;
  if(vars){for(var k in vars){if(vars[k])docEl.style.setProperty(k,vars[k]);}}
  if(ctx.locale)locale=ctx.locale;
  if(ctx.timeZone)timeZone=ctx.timeZone;
  var touch=(ctx.deviceCapabilities&&ctx.deviceCapabilities.touch)||ctx.platform==="mobile";
  if(touch||(window.matchMedia&&window.matchMedia("(pointer: coarse)").matches))docEl.classList.add("touch");
  var inset=ctx.safeAreaInsets;
  if(inset){document.body.style.padding=[inset.top,inset.right,inset.bottom,inset.left].map(function(n){return (n||0)+"px";}).join(" ");}
}

function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}

function formatDate(iso){
  if(!iso)return "";
  var d=new Date(iso);
  if(isNaN(d.getTime()))return "";
  try{return new Intl.DateTimeFormat(locale,{day:"numeric",month:"short",year:"numeric",timeZone:timeZone}).format(d);}
  catch(e){return d.toISOString().slice(0,10);}
}
function formatLength(s){
  if(typeof s!=="number")return "";
  if(s<60)return "Under 1 min";
  if(s<3600)return Math.floor(s/60)+" min";
  var m=Math.floor((s%3600)/60);
  return Math.floor(s/3600)+" h "+(m<10?"0":"")+m+" min";
}
function statusOf(item){
  var s=item.state;
  if(!s||READY_STATES[s])return null;
  if(s==="failed")return {text:"Could not process",bad:true,button:false};
  if(s==="liveTranscript")return {text:"Recording now",button:true,live:true};
  if(NOT_STARTED_STATES[s])return {text:"Not processed yet",button:false};
  return {text:"Processing",button:false};
}
function plural(n,one,many){return n+" "+(n===1?one:many);}
function headerText(card){
  if(card.source==="search_media"&&card.query){
    return plural(card.total,"file matches","files match")+" \\u201c"+card.query+"\\u201d";
  }
  return plural(card.total,"file","files");
}

function openLink(url){
  if(hostCaps.openLinks){
    return request("ui/open-link",{url:url}).then(function(r){if(r&&r.isError)throw new Error("refused");});
  }
  return Promise.reject(new Error("no open-link"));
}

function askForText(item,btn,status){
  if(btn.getAttribute("aria-disabled")==="true")return;
  btn.setAttribute("aria-disabled","true");
  var isText=item.mediaType==="text";
  var live=status&&status.live;
  var visible=isText?"Show the text of "+item.name:(live?"Show the transcript so far of "+item.name:"Show the transcript of "+item.name);
  var context="The person picked the Speak file \\""+item.name+"\\" (mediaId "+item.mediaId+") in the file list card. Use get_transcript with mediaId "+item.mediaId+" for it; do not search again.";
  var withContext=hostCaps.updateModelContext
    ?request("ui/update-model-context",{content:[{type:"text",text:context}],structuredContent:{mediaId:item.mediaId,name:item.name}}).catch(function(){})
    :Promise.resolve();
  withContext.then(function(){
    return request("ui/message",{role:"user",content:[{type:"text",text:visible}]});
  }).then(function(r){
    if(r&&r.isError)throw new Error("refused");
    if(live)setTimeout(function(){btn.removeAttribute("aria-disabled");},LIVE_PAUSE_MS);
  }).catch(function(){btn.removeAttribute("aria-disabled");});
}

function renderRow(item,isSearch){
  var status=statusOf(item);
  var li=el("li","row");
  var txt=el("div","txt");
  var url=WEB_APP_URL+"/media/"+encodeURIComponent(item.mediaId);
  var a=el("a","t");
  a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.title=item.name;
  a.appendChild(document.createTextNode(item.name));
  a.appendChild(el("span","sr",", opens in Speak in a new tab"));
  a.addEventListener("click",function(ev){
    if(!hostCaps.openLinks)return;
    ev.preventDefault();
    openLink(url).catch(function(){window.open(url,"_blank","noopener");});
  });
  txt.appendChild(a);

  var meta=el("span","meta");
  var parts=[];
  if(!status&&item.mediaType!=="text"){var len=formatLength(item.durationSeconds);if(len)parts.push(len);}
  var date=formatDate(item.createdAt);
  if(date)parts.push(date);
  meta.textContent=parts.join(" \\u00b7 ");
  if(status){
    if(parts.length)meta.appendChild(document.createTextNode(" \\u00b7 "));
    meta.appendChild(el("span","st"+(status.bad?" bad":""),status.text));
  }
  txt.appendChild(meta);

  if(isSearch){
    txt.appendChild(el("span","match",item.matchLine?"\\u201c"+item.matchLine+"\\u201d":"Matched the file name or details"));
  }
  li.appendChild(txt);

  if(!status||status.button){
    var isText=item.mediaType==="text";
    var label=isText?"Show text":"Show transcript";
    var btn=el("button","btn",label);
    btn.type="button";
    btn.setAttribute("aria-label",(isText?"Show text of ":"Show transcript of ")+item.name);
    btn.addEventListener("click",function(){askForText(item,btn,status);});
    li.appendChild(btn);
  }
  return li;
}

function render(card){
  settled=true;
  clearTimeout(dataTimer);
  root.textContent="";
  root.removeAttribute("aria-busy");
  if(!card||!Array.isArray(card.items)||!card.items.length){hide();return;}
  var isSearch=card.source==="search_media";
  var items=card.items.slice(0,MAX_ROWS);
  var head=el("h2","head",headerText(card));
  head.id="card-head";
  root.appendChild(head);
  var ul=el("ul","list");
  ul.setAttribute("aria-labelledby","card-head");
  items.forEach(function(item){ul.appendChild(renderRow(item,isSearch));});
  root.appendChild(ul);
  if(card.total>items.length){
    root.appendChild(el("p","foot","Showing "+items.length+" of "+card.total+". "+(card.total-items.length)+" more in Speak."));
  }
  root.hidden=false;
  reportSize();
}

function renderSkeleton(rows){
  if(settled)return;
  root.textContent="";
  root.setAttribute("aria-busy","true");
  root.appendChild(el("span","sk h"));
  var ul=el("ul","list");
  ul.setAttribute("aria-hidden","true");
  for(var i=0;i<rows;i++){
    var li=el("li","row");
    var txt=el("div","txt");
    txt.appendChild(el("span","sk t"));
    txt.appendChild(el("span","sk m"));
    li.appendChild(txt);
    li.appendChild(el("span","sk b"));
    ul.appendChild(li);
  }
  root.appendChild(ul);
  root.hidden=false;
  reportSize();
}

function hide(){
  settled=true;
  clearTimeout(dataTimer);
  root.hidden=true;
  root.textContent="";
  reportSize();
}

function skeletonRows(args){
  var size=args&&typeof args.pageSize==="number"?args.pageSize:MAX_ROWS;
  return Math.max(1,Math.min(MAX_ROWS,size));
}

function onNotification(method,params){
  if(method==="ui/notifications/tool-input"){renderSkeleton(skeletonRows(params&&params.arguments));}
  else if(method==="ui/notifications/tool-result"){
    if(!params||params.isError){hide();return;}
    render(params._meta&&params._meta[META_KEY]);
  }
  else if(method==="ui/notifications/tool-cancelled"){hide();}
  else if(method==="ui/notifications/host-context-changed"){applyContext(params);reportSize();}
}

window.addEventListener("message",function(ev){
  if(ev.source!==window.parent)return;
  var msg=ev.data;
  if(!msg||msg.jsonrpc!=="2.0")return;
  if(msg.method){
    if(msg.id!=null){post({jsonrpc:"2.0",id:msg.id,result:{}});return;}
    onNotification(msg.method,msg.params);
    return;
  }
  if(msg.id!=null&&pending[msg.id]){
    var p=pending[msg.id];delete pending[msg.id];
    if(msg.error)p.reject(msg.error);else p.resolve(msg.result);
  }
});

if(window.ResizeObserver){new ResizeObserver(reportSize).observe(document.documentElement);}

renderSkeleton(MAX_ROWS);
dataTimer=setTimeout(function(){if(!settled)hide();},DATA_TIMEOUT_MS);

request("ui/initialize",{
  appInfo:{name:"speakai-file-list",version:"1.0.0"},
  appCapabilities:{availableDisplayModes:["inline"]},
  protocolVersion:PROTOCOL_VERSION
}).then(function(result){
  hostCaps=(result&&result.hostCapabilities)||{};
  applyContext(result&&result.hostContext);
  notify("ui/notifications/initialized",{});
  reportSize();
}).catch(function(){});
})();
`;

export const MEDIA_LIST_CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Speak files</title>
<style>${VIEW_STYLE}</style>
</head>
<body>
<main id="card" class="card" hidden></main>
<script>${VIEW_SCRIPT}</script>
</body>
</html>
`;
