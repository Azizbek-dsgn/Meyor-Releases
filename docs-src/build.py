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
             f'<a href="changelog.html">{t['nav_news']}</a><a href="help.html">{t['nav_help']}</a>')
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
<footer class="foot"><div class="wrap"><p>{t['footer_local']}</p><div><span>© 2026 Meyor Vision</span><a href="{up}privacy.html">{t['privacy']}</a><a href="{up}terms.html">{t['terms']}</a><a href="https://github.com/Azizbek-dsgn/Meyor-Releases/issues">{t['contact']}</a></div></div></footer>
<script src="{up}download.js"></script>
</body>
</html>
"""


def downloads(lang):
    t = UI[lang]
    return f"""<div class="downloads" id="download">
  <a class="dl" data-asset="win-x64" href="{REL}"><b>{t['win']}</b><small>{t['win_sub']}</small></a>
  <a class="dl" data-asset="mac-arm64" href="{REL}"><b>{t['arm']}</b><small>{t['arm_sub']}</small></a>
  <a class="dl" data-asset="mac-x64" href="{REL}"><b>{t['intel']}</b><small>{t['intel_sub']}</small></a>
</div>
<p class="hint"><span id="version">Hustler</span> · {t['free']} · <a href="{prefix(lang)}install.html">{t['guide']}</a></p>"""


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
  <figure class="frame hero-shot"><img src="{up}shots/hustler.jpg" alt="Hustler"></figure>
</div></section>
<section class="points wrap">{points}</section>
<div class="wrap" id="apps">{products}</div>
<section class="steps-band"><div class="wrap"><h2>{escape(h['steps_title'])}</h2><ol class="three">{steps}</ol>{downloads(lang)}</div></section>"""
    return layout(lang, h["title"], body, "index", h["lead"])


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


def help_page(lang):
    t = UI[lang]
    items = "".join(f"<details class=\"faq\"><summary>{escape(q)}</summary><p>{escape(a)}</p></details>" for q, a in HELP[lang])
    body = f"""<section class="hero small"><div class="wrap"><h1>{t['nav_help']}</h1></div></section>
<section class="wrap faqs">{items}<p class="hint"><a href="{prefix(lang)}install.html">{t['guide']}</a></p></section>"""
    return layout(lang, f"{t['nav_help']} — Hustler", body, "help")


def doc_page(name):
    """Install guide and legal pages: their own content (Uzbek) in the site layout."""
    import re
    text = (Path(__file__).parent / "pages" / f"{name}.html").read_text(encoding="utf-8")
    title = re.search(r"<!-- title: (.*?) -->", text).group(1)
    description = re.search(r"<!-- description: (.*?) -->", text).group(1)
    body = re.sub(r"<!--.*?-->\n?", "", text, count=2)
    return layout("uz", title, f'<section class="wrap doc">{body}</section>', name, description)


def main():
    for name in ("install", "privacy", "terms"):
        (DOCS / f"{name}.html").write_text(doc_page(name), encoding="utf-8")
    for lang in LANGS:
        out = DOCS if lang == "uz" else DOCS / lang
        out.mkdir(parents=True, exist_ok=True)
        pages = {"index": home(lang), "changelog": changelog(lang), "help": help_page(lang)}
        pages.update({p["page"]: product_page(lang, p) for p in PRODUCTS})
        for name, html in pages.items():
            (out / f"{name}.html").write_text(html, encoding="utf-8")
    print("built", ", ".join(LANGS))


if __name__ == "__main__":
    main()
