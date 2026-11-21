"""Builds the Hustler site (docs/) in Uzbek, Russian and English from content.py.  python3 docs-src/build.py"""
import json
from html import escape
from pathlib import Path

from content import HELP, HOME, LANGS, NEWS, PRODUCTS, UI

DOCS = Path(__file__).resolve().parents[1] / "docs"
REL = "https://github.com/Azizbek-dsgn/Meyor-Releases/releases/latest"


def prefix(lang):  # path from a page of this language back to docs/
    return "" if lang == "uz" else "../"


def href(lang, page):
    return ("" if lang == "uz" else "") + page + ".html"


def layout(lang, title, body, page, description=""):
    t, up = UI[lang], prefix(lang)
    langs = "".join(f'<a href="{(up + ("" if l == "uz" else l + "/")) + page}.html"{" aria-current=\"true\"" if l == lang else ""}>{l.upper()}</a>' for l in LANGS)
    install = up + "install.html"
    home = ("index.html" if lang != "uz" or not up else "index.html")
    links = (f'<a href="{home}#apps">{t['nav_apps']}</a><a href="{install}">{t['nav_install']}</a>'
             f'<a href="market.html">{t['nav_market']}</a><a href="changelog.html">{t['nav_news']}</a><a href="help.html">{t['nav_help']}</a>')
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title>
<meta name="description" content="{escape(description or title)}">
<link rel="icon" href="{up}hustler.png">
<link rel="stylesheet" href="{up}site.css">
</head>
<body>
<header class="top"><div class="wrap bar">
  <a class="brand" href="index.html"><img src="{up}hustler.png" alt=""><span><strong>Hustler</strong><small>by Meyor Vision</small></span></a>
  <nav class="links">{links}</nav>
  <div class="langs">{langs}</div>
  <details class="menu"><summary aria-label="Menu"><span></span><span></span><span></span></summary><nav>{links}<div class="langs">{langs}</div></nav></details>
</div></header>
<main>{body}</main>
<footer class="foot"><div class="wrap"><p>{t['footer_local']}</p><div><span>© 2026 Meyor Vision</span><a href="{up}privacy.html">{t['privacy']}</a><a href="{up}terms.html">{t['terms']}</a><a href="https://t.me/Abdulaziz_kbv" rel="noopener">{t['contact']}: Telegram @Abdulaziz_kbv</a></div></div></footer>
<script src="{up}download.js"></script>
</body>
</html>
"""


SITE = "https://meyor-vision.vercel.app"
PS = f"irm {SITE}/install.ps1 | iex"
SH = f"curl -fsSL {SITE}/install.sh | bash"


def downloads(lang):
    t = UI[lang]
    return f"""<div class="get" data-get>
  <a class="dl-main" data-main href="{REL}"><b>{t['get']}</b><small data-main-label>Windows · macOS</small></a>
  <p class="others">{t['others']} <a data-asset="win-x64" href="{REL}">{t['win']}</a> · <a data-asset="mac-arm64" href="{REL}">{t['mac_arm']}</a> · <a data-asset="mac-x64" href="{REL}">{t['mac_intel']}</a></p>
  <div class="cmd-box"><b>{t['cmd_title']}</b>
    <div class="cmd" data-os="win"><span>{t['cmd_win']}</span><div class="line"><code>{PS}</code><button type="button" data-copy="{PS}" data-done="{t['copied']}">{t['copy']}</button></div></div>
    <div class="cmd" data-os="mac"><span>{t['cmd_mac']}</span><div class="line"><code>{SH}</code><button type="button" data-copy="{SH}" data-done="{t['copied']}">{t['copy']}</button></div></div>
    <p class="cmd-note">{t['cmd_note']}</p></div>
  <p class="hint"><span id="version">Hustler</span> · {t['free']} · <a href="{prefix(lang)}install.html">{t['guide']}</a></p>
</div>"""


def product_block(lang, p, flip):
    t, up = UI[lang], prefix(lang)
    bullets = "".join(f"<li><b>{escape(a)}</b> {escape(b)}</li>" for a, b in p["features"][lang][:3])
    return f"""<section class="product-row{' flip' if flip else ''}{' tall' if p.get('tall') else ''}" id="{p['id']}">
  <div class="copy"><div class="tag"><img src="{up}{p['logo']}" alt=""><span>{escape(p['kind'][lang])}</span></div>
    <h2>{escape(p['name'][lang])}</h2><p class="pitch">{escape(p['pitch'][lang])}</p><ul class="ticks">{bullets}</ul>
    <a class="more" href="{p['page']}.html">{t['more']}</a></div>
  <figure class="frame"><img src="{up}shots/{p['shot']}" alt="{escape(p['name'][lang])}" loading="lazy"></figure>
</section>"""


def home(lang):
    h, up = HOME[lang], prefix(lang)
    points = "".join(f"<div><b>{escape(a)}</b><p>{escape(b)}</p></div>" for a, b in h["points"])
    steps = "".join(f"<li><b>{escape(a)}</b><p>{escape(b)}</p></li>" for a, b in h["steps"])
    products = "".join(product_block(lang, p, i % 2 == 1) for i, p in enumerate(PRODUCTS))
    body = f"""<section class="hero"><div class="wrap">
  <p class="eyebrow">{h['eyebrow']}</p><h1>{h['h1']}</h1><p class="lead">{escape(h['lead'])}</p>
  {downloads(lang)}
  <figure class="frame hero-shot"><video src="{up}promo.mp4" poster="{up}promo-poster.jpg" controls playsinline preload="none" style="width:100%;display:block;border-radius:inherit" aria-label="Hustler — 25 soniyalik tanishtiruv"></video></figure>
</div></section>
{quiz(lang)}
<div class="wrap" id="apps">{products}</div>
<section class="points wrap">{points}</section>
<section class="steps-band"><div class="wrap"><h2>{escape(h['steps_title'])}</h2><ol class="three">{steps}</ol>{downloads(lang)}</div></section>"""
    return layout(lang, h["title"], body, "index", h["lead"])


QUIZ = {
    "uz": {"title": "Qaysi biri menga kerak?", "q1": "Qayerda montaj qilasiz?", "q2": "Yana nima kerak?", "a1": ["Premiere Pro yoki After Effects", "DaVinci Resolve", "Montaj dasturisiz — oddiy ilova"],
           "a2": ["Gapirib yozish, uchrashuv matni", "Montaj vaqtini o‘lchash", "Boshqa hech narsa"], "result": "Sizga:", "get": "Hustler’ni yuklab olish — hammasi bitta tugmada",
           "why": {"swible": "Premiere va After Effects ichida AI montaj, subtitr va 66 animatsiya", "resolve": "DaVinci’da o‘zbekcha subtitr va animatsiya (Swible for DaVinci)", "lab": "Adobe’siz: subtitr, reels va dublyaj bitta oynada", "voxly": "Gapiring — matn yoziladi; video va uchrashuvlardan matn", "tempass": "Montajga ketgan vaqtni o‘zi o‘lchaydi"}},
    "ru": {"title": "Что мне подходит?", "q1": "Где вы монтируете?", "q2": "Что ещё нужно?", "a1": ["Premiere Pro или After Effects", "DaVinci Resolve", "Без монтажной программы — простое приложение"],
           "a2": ["Печать голосом, текст встреч", "Учёт времени монтажа", "Больше ничего"], "result": "Вам подойдут:", "get": "Скачать Hustler — всё одной кнопкой",
           "why": {"swible": "AI-монтаж, субтитры и 66 анимаций в Premiere и After Effects", "resolve": "Узбекские субтитры и анимация в DaVinci (Swible for DaVinci)", "lab": "Без Adobe: субтитры, reels и дубляж в одном окне", "voxly": "Говорите — текст печатается; текст из видео и встреч", "tempass": "Сам считает время на монтаж"}},
    "en": {"title": "Which one do I need?", "q1": "Where do you edit?", "q2": "What else do you need?", "a1": ["Premiere Pro or After Effects", "DaVinci Resolve", "No editing app — a simple app"],
           "a2": ["Typing by voice, meeting notes", "Tracking editing time", "Nothing else"], "result": "For you:", "get": "Download Hustler — everything in one click",
           "why": {"swible": "AI editing, subtitles and 66 animations inside Premiere and After Effects", "resolve": "Uzbek subtitles and animation in DaVinci (Swible for DaVinci)", "lab": "No Adobe: subtitles, reels and dubbing in one window", "voxly": "Speak and it types; text from videos and meetings", "tempass": "Tracks your editing time by itself"}},
}


def quiz(lang):
    q, up = QUIZ[lang], prefix(lang)
    b1 = "".join(f'<button type="button" class="chip-btn" data-q1="{i}">{escape(a)}</button>' for i, a in enumerate(q["a1"]))
    b2 = "".join(f'<button type="button" class="chip-btn" data-q2="{i}">{escape(a)}</button>' for i, a in enumerate(q["a2"]))
    links = {"swible": ("Swible", "swible.html"), "resolve": ("Swible for DaVinci", "swible.html"), "lab": ("Swible Lab", "swible-lab.html"), "voxly": ("Voxly", "voxly.html"), "tempass": ("Tempass", "tempass.html")}
    data = json.dumps({k: [v[0], v[1], q["why"][k]] for k, v in links.items()}, ensure_ascii=False)
    return f"""<section class="wrap quiz" id="quiz"><h2>{escape(q['title'])}</h2>
<p class="hint">{escape(q['q1'])}</p><div class="chip-row">{b1}</div>
<p class="hint">{escape(q['q2'])}</p><div class="chip-row">{b2}</div>
<div id="quiz-result" class="cards" hidden></div>
<p id="quiz-get" hidden><a class="dl-main" href="{up}install.html"><b>{escape(q['get'])}</b></a></p></section>
<script>(function(){{var D={data},a=null,b=[];
function pick(attr,v,multi){{document.querySelectorAll('[data-'+attr+']').forEach(function(x){{if(!multi||v==='2')x.classList.toggle('on',x.dataset[attr]===v);}});}}
function draw(){{if(a===null)return;var keys=[['swible','resolve','lab'][+a]];b.forEach(function(x){{if(x==='0')keys.push('voxly');if(x==='1')keys.push('tempass');}});
var box=document.getElementById('quiz-result');box.textContent='';keys.forEach(function(k){{var c=document.createElement('a');c.className='card';c.href=D[k][1];var t=document.createElement('b');t.textContent=D[k][0];var p=document.createElement('p');p.textContent=D[k][2];c.appendChild(t);c.appendChild(p);box.appendChild(c);}});
box.hidden=false;document.getElementById('quiz-get').hidden=false;}}
document.querySelectorAll('[data-q1]').forEach(function(x){{x.onclick=function(){{a=x.dataset.q1;pick('q1',a);draw();}};}});
document.querySelectorAll('[data-q2]').forEach(function(x){{x.onclick=function(){{var v=x.dataset.q2;if(v==='2'){{b=[];}}else{{var i=b.indexOf(v);if(i<0)b.push(v);else b.splice(i,1);}}
document.querySelectorAll('[data-q2]').forEach(function(y){{y.classList.toggle('on',v==='2'?y.dataset.q2==='2':b.indexOf(y.dataset.q2)>=0);}});draw();}};}});}})();</script>"""


def product_page(lang, p):
    t, up = UI[lang], prefix(lang)
    cards = "".join(f"<div class=\"card\"><b>{escape(a)}</b><p>{escape(b)}</p></div>" for a, b in p["features"][lang])
    body = f"""<section class="hero product-hero"><div class="wrap">
  <a class="back" href="index.html">{t['back']}</a>
  <div class="tag big"><img src="{up}{p['logo']}" alt=""><span>{escape(p['kind'][lang])}</span></div>
  <h1>{escape(p['name'][lang])}</h1><p class="lead">{escape(p['pitch'][lang])}</p>
  <p class="hint">{escape(t['install_with'])}</p>{downloads(lang)}
  <figure class="frame{' tall-shot' if p.get('tall') else ''}"><img src="{up}shots/{p['shot']}" alt="{escape(p['name'][lang])}"></figure>
</div></section>
<section class="wrap cards">{cards}</section>"""
    return layout(lang, f"{p['name'][lang]} — {p['kind'][lang]}", body, p["page"], p["pitch"][lang])


def changelog(lang):
    t = UI[lang]
    items = "".join(f"<li><b>{escape(a)}</b><p>{escape(b)}</p></li>" for a, b in NEWS[lang])
    body = f"""<section class="hero small"><div class="wrap"><h1>{t['nav_news']}</h1>
<p class="lead" id="versions">{t['current']}: …</p></div></section>
<section class="wrap"><ol class="timeline">{items}</ol></section>
<script>fetch('https://raw.githubusercontent.com/Azizbek-dsgn/Meyor-Releases/main/catalog.json',{{cache:'no-store'}}).then(r=>r.json()).then(c=>{{
const v=[['Hustler',c.meyor],['Swible',c.uzscribe],['Swible Lab',c.uzscribeDesktop],['Voxly',(c.products||{{}}).uzdictate],['Tempass',c.tempo]].filter(x=>x[1]).map(x=>x[0]+' '+x[1].version);
document.getElementById('versions').textContent={json.dumps(t['current'])}+': '+v.join(' · ');}}).catch(()=>{{}});</script>"""
    return layout(lang, f"{t['nav_news']} — Hustler", body, "changelog")


def market(lang):
    """The skill market, read live from the Meyor API (Supabase) in the visitor's browser."""
    t = UI[lang]
    body = f"""<section class="hero small"><div class="wrap"><h1>{t['nav_market']}</h1><p class="lead">{t['market_lead']}</p>
<p class="hint">{t['market_how']}</p><input id="q" class="search" type="search" placeholder="{escape(t['market_search'])}" aria-label="{escape(t['market_search'])}"></div></section>
<section class="wrap cards" id="market" aria-live="polite"><p class="hint">…</p></section>
<script>(function(){{var box=document.getElementById('market'),q=document.getElementById('q'),all=[];
function el(tag,cls,text){{var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}}
function draw(){{var s=q.value.trim().toLowerCase().replace(/^@/,''),list=all.filter(function(k){{return !s||[k.name,k.author,k.description].concat(k.tags||[]).join(' ').toLowerCase().indexOf(s)>=0;}});box.textContent='';
if(!list.length){{box.appendChild(el('p','hint',all.length?'—':{json.dumps(t['market_empty'])}));return;}}
list.forEach(function(k){{var c=el('div','card');c.appendChild(el('b','',k.name));c.appendChild(el('small','hint','@'+k.author+' · v'+k.version));c.appendChild(el('p','',k.description||''));
if((k.tags||[]).length)c.appendChild(el('p','hint',(k.tags||[]).map(function(x){{return '#'+x;}}).join(' ')));
if(k.donate&&k.donate.indexOf('https://')===0){{var a=el('a','',{json.dumps(t['market_donate'])}+' →');a.href=k.donate;a.rel='noopener nofollow';a.target='_blank';c.appendChild(a);}}box.appendChild(c);}});}}
q.addEventListener('input',draw);
fetch('https://jqlqsejoblnzxbnwpvvr.supabase.co/functions/v1/api/catalog').then(function(r){{return r.json();}}).then(function(c){{all=(c&&c.skills)||[];draw();}}).catch(function(){{box.textContent='';box.appendChild(el('p','hint',{json.dumps(t['market_error'])}));}});}})();</script>"""
    return layout(lang, f"{t['nav_market']} — Hustler", body, "market", t['market_lead'])


def help_page(lang):
    t = UI[lang]
    items = "".join(f"<details class=\"faq\"><summary>{escape(q)}</summary><p>{escape(a)}</p></details>" for q, a in HELP[lang])
    body = f"""<section class="hero small"><div class="wrap"><h1>{t['nav_help']}</h1></div></section>
<section class="wrap faqs">{items}<div class="card contact"><b>{t['contact']}</b><p><a href="https://t.me/Abdulaziz_kbv" rel="noopener">{t['telegram']}</a></p></div><p class="hint"><a href="{prefix(lang)}install.html">{t['guide']}</a></p></section>"""
    return layout(lang, f"{t['nav_help']} — Hustler", body, "help")


def doc_page(name):
    """Install guide and legal pages: their own content (Uzbek) in the site layout."""
    import re
    text = (Path(__file__).parent / "pages" / f"{name}.html").read_text(encoding="utf-8")
    title = re.search(r"<!-- title: (.*?) -->", text).group(1)
    description = re.search(r"<!-- description: (.*?) -->", text).group(1)
    body = re.sub(r"<!--.*?-->\n?", "", text, count=2)
    body = body.replace("<!--DOWNLOADS-->", downloads("uz"))
    return layout("uz", title, f'<section class="wrap doc">{body}</section>', name, description)


def main():
    for name in ("install", "privacy", "terms"):
        (DOCS / f"{name}.html").write_text(doc_page(name), encoding="utf-8")
    for lang in LANGS:
        out = DOCS if lang == "uz" else DOCS / lang
        out.mkdir(parents=True, exist_ok=True)
        pages = {"index": home(lang), "changelog": changelog(lang), "help": help_page(lang), "market": market(lang)}
        pages.update({p["page"]: product_page(lang, p) for p in PRODUCTS})
        for name, html in pages.items():
            (out / f"{name}.html").write_text(html, encoding="utf-8")
    # The newest notes for the apps' "what's new" window (Hustler reads it after an update).
    (DOCS / "news.json").write_text(json.dumps({lang: [[a, b] for a, b in NEWS[lang][:8]] for lang in LANGS}, ensure_ascii=False), encoding="utf-8")
    print("built", ", ".join(LANGS))


if __name__ == "__main__":
    main()
