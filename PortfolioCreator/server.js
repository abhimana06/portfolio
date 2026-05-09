import express from 'express';
import multer from 'multer';
import 'dotenv/config';
import OpenAI from 'openai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported'));
    }
  }
});

const PARSE_PROMPT = `You are a professional resume parser. Analyze this resume PDF and extract ALL information into a JSON object. Return ONLY the raw JSON — no markdown, no code blocks, no explanation.

Required schema:
{
  "name": { "first": "First", "last": "Last" },
  "title": "Primary Job Title",
  "openTo": "Open to [Senior/Lead/etc] opportunities · [City]",
  "location": "City, Country",
  "bio": ["Paragraph about background and expertise", "Paragraph about key achievements", "Paragraph about certifications/approach"],
  "contact": {
    "email": "email@example.com",
    "phone": "+1 234 567 8900 (or null if not found)",
    "linkedin": "full URL or null",
    "github": "full URL or null"
  },
  "stats": [
    { "value": "10", "suffix": "+", "label": "Years Experience" },
    { "value": "5", "suffix": "", "label": "Certifications" },
    { "value": "6", "suffix": "", "label": "Companies" }
  ],
  "roles": ["Title 1", "Title 2", "Title 3", "Title 4"],
  "experience": [
    {
      "company": "Company Name",
      "client": "Client Name or null",
      "location": "City, Country",
      "role": "Job Title",
      "isCurrent": true,
      "period": "Mon YYYY — Present",
      "bullets": ["Achievement with <strong>bold tech/metric</strong>", "Another achievement"]
    }
  ],
  "skills": [
    {
      "category": "Backend & Frameworks",
      "icon": "fa-solid fa-code",
      "tags": [{ "label": "Python", "type": "key" }, { "label": "FastAPI", "type": "normal" }]
    }
  ],
  "certifications": [
    { "icon": "☁️", "issuer": "Organization", "name": "Cert Name", "code": "CODE or Date" }
  ],
  "projects": [
    {
      "org": "Company · Year",
      "title": "Project Title",
      "description": "What was built and its impact, with <strong>bold metrics</strong>.",
      "tags": ["Tech1", "Tech2"]
    }
  ],
  "education": [
    { "degree": "Degree Name", "school": "School Name, City, Country", "period": "YYYY — YYYY" }
  ],
  "leadership": ["Leadership or volunteer achievement"],
  "interests": ["Interest1", "Interest2"]
}

Rules:
- tags[].type: "key" = primary tech stack, "hot" = trending/specialized, "normal" = supporting
- skill icons: fa-solid fa-code (backend), fa-solid fa-layer-group (frontend/db), fa-brands fa-aws (cloud/devops), fa-solid fa-wrench (tools), fa-solid fa-diagram-project (practices), fa-solid fa-users (leadership)
- Extract EVERY piece of work experience and skill from the resume
- bio should be 2-3 professional paragraphs written in third person
- roles: 4-5 job title variants for a typewriter animation
- If certifications is empty return []
- If projects is empty return []`;

async function parseResume(buffer) {
  const pdfData = await pdfParse(buffer);
  const resumeText = pdfData.text;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `${PARSE_PROMPT}\n\n---RESUME TEXT---\n${resumeText}`,
      },
    ],
  });

  const text = response.choices[0].message.content || '';
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(jsonText);
}

function generatePortfolioHTML(data) {
  const firstName = data.name?.first || '';
  const lastName = data.name?.last || '';
  const name = `${firstName} ${lastName}`.trim();
  const contact = data.contact || {};
  const hasCerts = (data.certifications || []).length > 0;
  const hasProjects = (data.projects || []).length > 0;

  let sNum = 1;
  const aboutNum = sNum++;
  const expNum = sNum++;
  const skillsNum = sNum++;
  const certsNum = hasCerts ? sNum++ : 0;
  const projNum = hasProjects ? sNum++ : 0;
  const moreNum = sNum++;
  const contactNum = sNum++;

  const pad2 = n => String(n).padStart(2, '0');

  const expHTML = (data.experience || []).map(exp => `
    <div class="tl-item">
      <div class="tl-header">
        <div>
          <div class="tl-company">${exp.company}${exp.client ? ` <span class="client">— ${exp.client}</span>` : ''}</div>
          <div class="tl-role">${exp.role}${exp.isCurrent ? ' <span class="badge">Current</span>' : ''}</div>
        </div>
        <div class="tl-date">${exp.period}</div>
      </div>
      <ul class="tl-bullets">
        ${(exp.bullets || []).map(b => `<li>${b}</li>`).join('\n        ')}
      </ul>
    </div>`).join('\n');

  const skillsHTML = (data.skills || []).map((s, i) => `
    <div class="skill-col reveal"${i > 0 ? ` style="transition-delay:${(i * 0.13).toFixed(2)}s"` : ''}>
      <div class="skill-col-title"><i class="${s.icon}"></i> ${s.category}</div>
      <div class="tags">
        ${(s.tags || []).map(t => `<span class="tag${t.type === 'key' ? ' key' : t.type === 'hot' ? ' hot' : ''}">${t.label}</span>`).join('\n        ')}
      </div>
    </div>`).join('\n');

  const certsSection = hasCerts ? `
  <section id="certs">
    <div class="s-header reveal">
      <span class="s-num">${pad2(certsNum)} — Certifications</span>
      <div><h2 class="s-title">Certifications &amp; <em>Courses</em></h2><div class="s-rule"></div></div>
    </div>
    <div class="certs-grid">
      ${(data.certifications || []).map((c, i) => `
      <div class="cert-card reveal"${i > 0 ? ` style="transition-delay:${(i * 0.1).toFixed(1)}s"` : ''}>
        <div class="cert-icon">${c.icon || '🏆'}</div>
        <div class="cert-issuer">${c.issuer}</div>
        <div class="cert-name">${c.name}</div>
        <div class="cert-code">${c.code}</div>
      </div>`).join('\n')}
    </div>
  </section>` : '';

  const projectsSection = hasProjects ? `
  <section id="work">
    <div class="s-header reveal">
      <span class="s-num">${pad2(projNum)} — Notable Work</span>
      <div><h2 class="s-title">Key <em>Projects</em></h2><div class="s-rule"></div></div>
    </div>
    <div class="work-grid">
      ${(data.projects || []).map((p, i) => `
      <div class="work-card reveal" data-num="${pad2(i + 1)}"${i > 0 ? ` style="transition-delay:${(i * 0.15).toFixed(2)}s"` : ''}>
        <div class="work-org">${p.org}</div>
        <h3 class="work-title">${p.title}</h3>
        <p class="work-desc">${p.description}</p>
        <div class="work-tags">${(p.tags || []).map(t => `<span class="work-tag">${t}</span>`).join('')}</div>
      </div>`).join('\n')}
    </div>
  </section>` : '';

  const statsHTML = (data.stats || []).map(s => `
      <div class="stat">
        <div class="stat-val" data-count="${s.value}" data-suffix="${s.suffix || ''}">0</div>
        <div class="stat-lbl">${s.label}</div>
      </div>`).join('\n');

  const bioHTML = (data.bio || ['Experienced professional with a passion for technology and innovation.']).map(p => `<p>${p}</p>`).join('\n        ');

  const navLinks = [
    { href: '#about', label: 'About' },
    { href: '#experience', label: 'Experience' },
    { href: '#skills', label: 'Skills' },
    ...(hasCerts ? [{ href: '#certs', label: 'Certs' }] : []),
    ...(hasProjects ? [{ href: '#work', label: 'Projects' }] : []),
    { href: '#contact', label: 'Hire Me', cls: 'nav-cta' },
  ];

  const navLinksHTML = navLinks.map(l => `<li><a href="${l.href}"${l.cls ? ` class="${l.cls}"` : ''}>${l.label}</a></li>`).join('\n      ');
  const mobileNavHTML = navLinks.filter(l => !l.cls).map(l => `<a href="${l.href}">${l.label}</a>`).join('\n    ');

  const railLinks = [
    contact.github ? `<a href="${contact.github}" target="_blank" rel="noopener" title="GitHub"><i class="fa-brands fa-github"></i></a>` : '',
    contact.linkedin ? `<a href="${contact.linkedin}" target="_blank" rel="noopener" title="LinkedIn"><i class="fa-brands fa-linkedin-in"></i></a>` : '',
    contact.email ? `<a href="mailto:${contact.email}" title="Email"><i class="fa-solid fa-envelope"></i></a>` : '',
    contact.phone ? `<a href="tel:${contact.phone.replace(/\s/g, '')}" title="Phone"><i class="fa-solid fa-phone"></i></a>` : '',
  ].filter(Boolean).join('\n        ');

  const socialPillsHTML = [
    contact.github ? `<a href="${contact.github}" target="_blank" rel="noopener" class="social-pill"><i class="fa-brands fa-github"></i> GitHub</a>` : '',
    contact.linkedin ? `<a href="${contact.linkedin}" target="_blank" rel="noopener" class="social-pill"><i class="fa-brands fa-linkedin-in"></i> LinkedIn</a>` : '',
    contact.email ? `<a href="mailto:${contact.email}" class="social-pill"><i class="fa-solid fa-envelope"></i> Email</a>` : '',
  ].filter(Boolean).join('\n        ');

  const roles = JSON.stringify(data.roles || [data.title || 'Professional']);

  const educationHTML = (data.education || []).map(e => `
          <div class="edu-item">
            <div class="edu-degree">${e.degree}</div>
            <div class="edu-school">${e.school}</div>
            <div class="edu-year">${e.period}</div>
          </div>`).join('\n');

  const leadershipHTML = (data.leadership || []).map(l => `<li>${l}</li>`).join('\n          ');
  const interestsHTML = (data.interests || []).map(i => `<span class="hobby-tag">${i}</span>`).join('\n          ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — ${data.title || 'Portfolio'}</title>
  <meta name="description" content="${(data.bio || [''])[0].replace(/<[^>]+>/g, '').substring(0, 160)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garant:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
  <style>
    :root {
      --bg: #050505; --surface: #0d0d0d; --surface-2: #131313;
      --gold: #C9A84C; --gold-light: #E2C07A; --gold-dim: rgba(201,168,76,0.13); --gold-border: rgba(201,168,76,0.22);
      --cyan: #00D9FF; --cyan-dim: rgba(0,217,255,0.1);
      --text: #EDE9E3; --text-muted: #888880; --text-dim: #404040; --border: rgba(237,233,227,0.07);
      --ff-display: 'Cormorant Garant', Georgia, serif;
      --ff-body: 'Outfit', system-ui, sans-serif;
      --ff-mono: 'JetBrains Mono', monospace;
      --ease: cubic-bezier(0.4,0,0.2,1); --ease-out: cubic-bezier(0,0,0.2,1); --t: 0.3s;
    }
    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { background:var(--bg); color:var(--text); font-family:var(--ff-body); line-height:1.6; overflow-x:hidden; cursor:none; }
    body::after { content:''; position:fixed; inset:0; background-image:radial-gradient(circle,rgba(237,233,227,0.055) 1px,transparent 1px); background-size:28px 28px; pointer-events:none; z-index:0; }
    body::before { content:''; position:fixed; inset:0; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E"); pointer-events:none; z-index:0; opacity:0.6; }
    ::-webkit-scrollbar { width:2px; } ::-webkit-scrollbar-track { background:var(--bg); } ::-webkit-scrollbar-thumb { background:var(--gold); }
    ::selection { background:var(--gold-dim); color:var(--gold-light); }
    a { text-decoration:none; color:inherit; }
    .cur { position:fixed; border-radius:50%; pointer-events:none; z-index:99999; transform:translate(-50%,-50%); }
    .cur-dot { width:8px; height:8px; background:var(--gold); transition:width .2s,height .2s,background .2s; }
    .cur-ring { width:38px; height:38px; border:1.5px solid rgba(201,168,76,.45); transition:width .18s,height .18s,border-color .2s; }
    body.hovering .cur-dot { width:5px; height:5px; background:var(--cyan); }
    body.hovering .cur-ring { width:52px; height:52px; border-color:rgba(0,217,255,.35); }
    nav { position:fixed; inset:0 0 auto 0; z-index:1000; padding:26px 64px; display:flex; align-items:center; justify-content:space-between; transition:padding var(--t),background var(--t),border-color var(--t); border-bottom:1px solid transparent; }
    nav.scrolled { padding:16px 64px; background:rgba(5,5,5,.9); backdrop-filter:blur(24px); border-color:var(--border); }
    .nav-logo { font-family:var(--ff-display); font-size:1.4rem; font-weight:500; letter-spacing:.04em; position:relative; z-index:1001; }
    .nav-logo em { color:var(--gold); font-style:normal; }
    .nav-links { display:flex; align-items:center; gap:38px; list-style:none; }
    .nav-links a { font-family:var(--ff-mono); font-size:.68rem; color:var(--text-muted); letter-spacing:.14em; text-transform:uppercase; transition:color var(--t); position:relative; }
    .nav-links a::after { content:''; position:absolute; bottom:-5px; left:0; width:0; height:1px; background:var(--gold); transition:width var(--t) var(--ease); }
    .nav-links a:hover, .nav-links a.active { color:var(--text); }
    .nav-links a:hover::after, .nav-links a.active::after { width:100%; }
    .nav-cta { padding:8px 20px; border:1px solid var(--gold-border); color:var(--gold) !important; transition:background var(--t) !important; }
    .nav-cta::after { display:none !important; }
    .nav-cta:hover { background:var(--gold-dim) !important; }
    .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; z-index:1001; padding:4px; }
    .hamburger span { display:block; width:22px; height:1.5px; background:var(--text); transition:var(--t) var(--ease); transform-origin:center; }
    .hamburger.open span:nth-child(1) { transform:translateY(6.5px) rotate(45deg); }
    .hamburger.open span:nth-child(2) { opacity:0; }
    .hamburger.open span:nth-child(3) { transform:translateY(-6.5px) rotate(-45deg); }
    .mobile-nav { display:none; position:fixed; inset:0; background:rgba(5,5,5,.97); backdrop-filter:blur(20px); z-index:1000; flex-direction:column; align-items:center; justify-content:center; gap:32px; }
    .mobile-nav.open { display:flex; }
    .mobile-nav a { font-family:var(--ff-display); font-size:2.4rem; font-weight:300; color:var(--text-muted); transition:color var(--t); }
    .mobile-nav a:hover { color:var(--gold); }
    #hero { position:relative; min-height:100vh; display:flex; align-items:center; padding:120px 64px 80px; overflow:hidden; z-index:1; }
    .hero-rings { position:absolute; top:50%; right:-8%; transform:translateY(-55%); width:640px; height:640px; pointer-events:none; }
    .hero-rings svg { width:100%; height:100%; animation:slowSpin 70s linear infinite; }
    @keyframes slowSpin { to { transform:rotate(360deg); } }
    .hero-glow { position:absolute; top:30%; right:5%; width:460px; height:460px; background:radial-gradient(ellipse at 60% 40%,rgba(201,168,76,.07) 0%,transparent 70%); pointer-events:none; }
    .hero-content { position:relative; z-index:2; max-width:840px; }
    .hero-eyebrow { display:inline-flex; align-items:center; gap:12px; font-family:var(--ff-mono); font-size:.67rem; color:var(--gold); letter-spacing:.22em; text-transform:uppercase; margin-bottom:30px; opacity:0; animation:riseIn .9s var(--ease-out) .2s forwards; }
    .hero-eyebrow::before { content:''; display:block; width:30px; height:1px; background:var(--gold); }
    .hero-eyebrow .dot { display:inline-block; width:6px; height:6px; background:var(--gold); border-radius:50%; animation:pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
    .hero-name { font-family:var(--ff-display); font-size:clamp(4.5rem,9.5vw,9rem); font-weight:300; line-height:.95; letter-spacing:-.025em; margin-bottom:14px; opacity:0; animation:riseIn .9s var(--ease-out) .4s forwards; }
    .hero-name .first { display:block; }
    .hero-name .last { display:block; color:var(--gold); font-style:italic; }
    .hero-tw { font-family:var(--ff-mono); font-size:clamp(.82rem,1.4vw,1.05rem); color:var(--text-muted); letter-spacing:.05em; margin-bottom:32px; min-height:1.5em; opacity:0; animation:riseIn .9s var(--ease-out) .6s forwards; }
    .tw-text { color:var(--cyan); }
    .tw-cur { display:inline-block; width:2px; height:.95em; background:var(--cyan); margin-left:3px; vertical-align:middle; animation:blink .75s step-end infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    .hero-bio { font-size:1.05rem; color:var(--text-muted); line-height:1.85; max-width:540px; margin-bottom:48px; opacity:0; animation:riseIn .9s var(--ease-out) .8s forwards; }
    .hero-bio strong { color:var(--text); font-weight:500; }
    .hero-actions { display:flex; align-items:center; gap:16px; opacity:0; animation:riseIn .9s var(--ease-out) 1s forwards; }
    .btn { display:inline-flex; align-items:center; gap:9px; font-family:var(--ff-body); font-size:.85rem; font-weight:600; letter-spacing:.04em; padding:13px 30px; cursor:pointer; transition:var(--t) var(--ease); position:relative; overflow:hidden; border:none; }
    .btn-gold { background:var(--gold); color:#050505; }
    .btn-gold::before { content:''; position:absolute; inset:0; background:var(--gold-light); transform:translateX(-100%); transition:transform .4s var(--ease); }
    .btn-gold:hover::before { transform:translateX(0); }
    .btn-gold span { position:relative; z-index:1; }
    .btn-ghost { background:transparent; color:var(--text); border:1px solid var(--border); }
    .btn-ghost:hover { border-color:var(--gold-border); color:var(--gold); }
    .hero-rail { position:absolute; right:52px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; align-items:center; opacity:0; animation:fadeIn 1.2s var(--ease) 1.4s forwards; }
    .hero-rail::before, .hero-rail::after { content:''; display:block; width:1px; height:56px; background:var(--border); }
    .rail-links { display:flex; flex-direction:column; gap:16px; padding:18px 0; }
    .rail-links a { display:flex; align-items:center; justify-content:center; width:36px; height:36px; color:var(--text-dim); font-size:.9rem; border:1px solid transparent; border-radius:3px; transition:var(--t); }
    .rail-links a:hover { color:var(--gold); border-color:var(--gold-border); }
    .hero-scroll { position:absolute; bottom:36px; left:64px; display:flex; align-items:center; gap:16px; opacity:0; animation:fadeIn 1s var(--ease) 1.6s forwards; }
    .scroll-track { width:44px; height:1px; background:var(--text-dim); position:relative; overflow:hidden; }
    .scroll-track::after { content:''; position:absolute; inset:0; background:var(--gold); animation:trackAnim 2.2s ease-in-out infinite; }
    @keyframes trackAnim { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
    .scroll-label { font-family:var(--ff-mono); font-size:.6rem; color:var(--text-dim); letter-spacing:.18em; text-transform:uppercase; }
    section { position:relative; z-index:1; padding:110px 64px; }
    .s-header { display:grid; grid-template-columns:auto 1fr; gap:0 34px; align-items:start; margin-bottom:72px; }
    .s-num { font-family:var(--ff-mono); font-size:.63rem; color:var(--gold); letter-spacing:.1em; padding-top:10px; white-space:nowrap; }
    .s-title { font-family:var(--ff-display); font-size:clamp(2.4rem,5vw,4.2rem); font-weight:300; line-height:1.05; letter-spacing:-.02em; }
    .s-title em { color:var(--gold); font-style:italic; }
    .s-rule { grid-column:2; height:1px; background:var(--border); margin-top:12px; }
    .reveal { opacity:0; transform:translateY(26px); transition:opacity .75s var(--ease-out),transform .75s var(--ease-out); }
    .reveal.in { opacity:1; transform:none; }
    @keyframes riseIn { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
    @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
    #about { background:var(--surface); }
    .about-layout { display:grid; grid-template-columns:1.1fr 0.9fr; gap:80px; align-items:center; }
    .about-text p { font-size:1.05rem; color:var(--text-muted); line-height:1.9; margin-bottom:20px; }
    .about-text p:last-child { margin-bottom:0; }
    .about-text strong { color:var(--text); font-weight:600; }
    .about-text .hl { color:var(--gold); }
    .about-stats { display:grid; grid-template-columns:1fr 1fr; gap:2px; }
    .stat { padding:28px 24px; background:var(--bg); border:1px solid var(--border); transition:border-color var(--t); }
    .stat:hover { border-color:var(--gold-border); }
    .stat-val { font-family:var(--ff-display); font-size:2.8rem; font-weight:300; color:var(--gold); line-height:1; margin-bottom:5px; }
    .stat-lbl { font-family:var(--ff-mono); font-size:.62rem; color:var(--text-muted); letter-spacing:.12em; text-transform:uppercase; }
    #experience { background:var(--bg); }
    .timeline { position:relative; }
    .timeline::before { content:''; position:absolute; left:0; top:0; bottom:0; width:1px; background:linear-gradient(to bottom,transparent,var(--gold-border) 5%,var(--gold-border) 95%,transparent); }
    .tl-item { padding:0 0 56px 44px; position:relative; opacity:0; transform:translateY(24px); transition:opacity .7s var(--ease-out),transform .7s var(--ease-out); }
    .tl-item.in { opacity:1; transform:none; }
    .tl-item:last-child { padding-bottom:0; }
    .tl-item::before { content:''; position:absolute; left:-4.5px; top:6px; width:10px; height:10px; background:var(--bg); border:1.5px solid var(--gold); border-radius:50%; transition:background var(--t); }
    .tl-item:hover::before { background:var(--gold); }
    .tl-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:6px; flex-wrap:wrap; }
    .tl-company { font-family:var(--ff-display); font-size:1.45rem; font-weight:500; color:var(--text); }
    .tl-company .client { font-size:.85rem; font-weight:300; color:var(--text-muted); font-style:italic; }
    .tl-date { font-family:var(--ff-mono); font-size:.65rem; color:var(--gold); letter-spacing:.1em; white-space:nowrap; padding-top:4px; }
    .tl-role { font-family:var(--ff-mono); font-size:.72rem; color:var(--text-muted); letter-spacing:.1em; text-transform:uppercase; margin-bottom:18px; }
    .tl-role .badge { display:inline-block; padding:2px 10px; background:var(--gold-dim); color:var(--gold); border-radius:2px; font-size:.62rem; margin-left:8px; letter-spacing:.06em; }
    .tl-bullets { list-style:none; display:flex; flex-direction:column; gap:9px; }
    .tl-bullets li { font-size:.92rem; color:var(--text-muted); line-height:1.7; padding-left:18px; position:relative; }
    .tl-bullets li::before { content:'—'; position:absolute; left:0; color:var(--gold); font-size:.75rem; top:2px; }
    .tl-bullets li strong { color:var(--text); font-weight:600; }
    #skills { background:var(--surface); }
    .skills-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; }
    .skill-col { background:var(--bg); padding:38px 32px; border:1px solid var(--border); transition:border-color var(--t); }
    .skill-col:hover { border-color:var(--gold-border); }
    .skill-col-title { font-family:var(--ff-mono); font-size:.63rem; color:var(--gold); letter-spacing:.2em; text-transform:uppercase; margin-bottom:24px; display:flex; align-items:center; gap:10px; }
    .skill-col-title i { font-size:.78rem; }
    .tags { display:flex; flex-wrap:wrap; gap:7px; }
    .tag { padding:5px 12px; background:transparent; border:1px solid var(--border); font-family:var(--ff-mono); font-size:.66rem; color:var(--text-muted); letter-spacing:.05em; cursor:default; transition:border-color var(--t),color var(--t); }
    .tag:hover { border-color:var(--gold-border); color:var(--gold); }
    .tag.hot { border-color:rgba(0,217,255,.28); color:var(--cyan); }
    .tag.hot:hover { border-color:var(--cyan); }
    .tag.key { border-color:var(--gold-border); color:var(--gold); }
    #certs { background:var(--bg); }
    .certs-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; }
    .cert-card { background:var(--surface); padding:36px 32px; border:1px solid var(--border); position:relative; overflow:hidden; transition:border-color var(--t); }
    .cert-card:hover { border-color:var(--gold-border); }
    .cert-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,var(--gold),var(--gold-light)); transform:scaleX(0); transform-origin:left; transition:transform .45s var(--ease); }
    .cert-card:hover::before { transform:scaleX(1); }
    .cert-icon { font-size:2rem; margin-bottom:16px; }
    .cert-issuer { font-family:var(--ff-mono); font-size:.6rem; color:var(--gold); letter-spacing:.14em; text-transform:uppercase; margin-bottom:8px; }
    .cert-name { font-family:var(--ff-display); font-size:1.2rem; font-weight:400; color:var(--text); line-height:1.3; margin-bottom:10px; }
    .cert-code { font-family:var(--ff-mono); font-size:.6rem; color:var(--text-dim); letter-spacing:.1em; }
    #work { background:var(--surface); }
    .work-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px; }
    .work-card { background:var(--bg); padding:40px 36px; border:1px solid var(--border); position:relative; overflow:hidden; transition:border-color var(--t); }
    .work-card:hover { border-color:var(--gold-border); }
    .work-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,var(--gold),var(--cyan)); transform:scaleX(0); transform-origin:left; transition:transform .45s var(--ease); }
    .work-card:hover::before { transform:scaleX(1); }
    .work-card::after { content:attr(data-num); position:absolute; bottom:-10px; right:12px; font-family:var(--ff-display); font-size:7rem; font-weight:300; color:rgba(237,233,227,.03); line-height:1; pointer-events:none; transition:color var(--t); }
    .work-card:hover::after { color:rgba(201,168,76,.05); }
    .work-org { font-family:var(--ff-mono); font-size:.62rem; color:var(--gold); letter-spacing:.14em; text-transform:uppercase; margin-bottom:10px; }
    .work-title { font-family:var(--ff-display); font-size:1.75rem; font-weight:400; color:var(--text); line-height:1.2; margin-bottom:12px; transition:color var(--t); }
    .work-card:hover .work-title { color:var(--gold); }
    .work-desc { font-size:.9rem; color:var(--text-muted); line-height:1.75; margin-bottom:22px; }
    .work-tags { display:flex; flex-wrap:wrap; gap:6px; }
    .work-tag { padding:3px 10px; background:var(--surface); font-family:var(--ff-mono); font-size:.62rem; color:var(--text-muted); letter-spacing:.06em; }
    #more { background:var(--bg); }
    .more-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px; }
    .more-panel { background:var(--surface); padding:40px 36px; border:1px solid var(--border); }
    .more-panel-title { font-family:var(--ff-mono); font-size:.63rem; color:var(--gold); letter-spacing:.18em; text-transform:uppercase; margin-bottom:28px; display:flex; align-items:center; gap:10px; }
    .edu-item { margin-bottom:28px; }
    .edu-item:last-child { margin-bottom:0; }
    .edu-degree { font-family:var(--ff-display); font-size:1.3rem; font-weight:400; color:var(--text); margin-bottom:4px; }
    .edu-school { font-size:.9rem; color:var(--text-muted); margin-bottom:3px; }
    .edu-year { font-family:var(--ff-mono); font-size:.65rem; color:var(--gold); letter-spacing:.1em; }
    .leadership-list { list-style:none; display:flex; flex-direction:column; gap:14px; }
    .leadership-list li { font-size:.92rem; color:var(--text-muted); line-height:1.65; padding-left:18px; position:relative; }
    .leadership-list li::before { content:'—'; position:absolute; left:0; color:var(--gold); font-size:.75rem; top:2px; }
    .hobbies { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; }
    .hobby-tag { padding:6px 14px; background:var(--bg); border:1px solid var(--border); font-family:var(--ff-mono); font-size:.66rem; color:var(--text-muted); letter-spacing:.08em; transition:border-color var(--t),color var(--t); }
    .hobby-tag:hover { border-color:var(--gold-border); color:var(--gold); }
    #contact { background:var(--surface); min-height:65vh; display:flex; flex-direction:column; justify-content:center; }
    .contact-inner { max-width:700px; }
    .contact-big { font-family:var(--ff-display); font-size:clamp(2rem,4.5vw,3.6rem); font-weight:300; line-height:1.2; margin-bottom:24px; }
    .contact-big em { color:var(--gold); font-style:italic; }
    .contact-sub { font-size:1rem; color:var(--text-muted); line-height:1.85; max-width:460px; margin-bottom:44px; }
    .contact-email-link { display:inline-flex; align-items:center; gap:14px; font-family:var(--ff-display); font-size:clamp(1.1rem,1.8vw,1.4rem); color:var(--text); padding-bottom:5px; border-bottom:1px solid transparent; transition:color var(--t),border-color var(--t); margin-bottom:44px; }
    .contact-email-link:hover { color:var(--gold); border-color:var(--gold); }
    .contact-email-link i { font-size:.95rem; color:var(--gold); }
    .contact-details { display:flex; flex-wrap:wrap; gap:28px; margin-bottom:36px; }
    .contact-detail { display:flex; align-items:center; gap:10px; font-family:var(--ff-mono); font-size:.7rem; color:var(--text-muted); letter-spacing:.06em; }
    .contact-detail i { color:var(--gold); }
    .socials { display:flex; flex-wrap:wrap; gap:10px; }
    .social-pill { display:inline-flex; align-items:center; gap:8px; padding:10px 20px; border:1px solid var(--border); font-family:var(--ff-mono); font-size:.67rem; color:var(--text-muted); letter-spacing:.1em; text-transform:uppercase; transition:color var(--t),border-color var(--t),background var(--t); }
    .social-pill:hover { color:var(--gold); border-color:var(--gold-border); background:var(--gold-dim); }
    footer { position:relative; z-index:1; padding:26px 64px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
    .footer-name { font-family:var(--ff-display); font-size:1rem; font-weight:300; color:var(--text-muted); }
    .footer-copy { font-family:var(--ff-mono); font-size:.58rem; color:var(--text-dim); letter-spacing:.12em; }
    .footer-tag { font-family:var(--ff-mono); font-size:.58rem; color:var(--text-dim); letter-spacing:.08em; }
    .footer-tag span { color:var(--gold); }
    @media (max-width:1100px) { .certs-grid { grid-template-columns:1fr 1fr; } .skills-grid { grid-template-columns:1fr 1fr; } }
    @media (max-width:768px) {
      nav { padding:20px 24px; } nav.scrolled { padding:14px 24px; }
      .nav-links { display:none; } .hamburger { display:flex; }
      #hero { padding:100px 24px 70px; } section { padding:80px 24px; }
      footer { padding:22px 24px; flex-direction:column; gap:8px; text-align:center; }
      .hero-rail, .hero-rings { display:none; } .hero-scroll { left:24px; }
      .about-layout { grid-template-columns:1fr; gap:40px; }
      .skills-grid { grid-template-columns:1fr; } .certs-grid { grid-template-columns:1fr 1fr; }
      .work-grid { grid-template-columns:1fr; } .more-grid { grid-template-columns:1fr; }
      .s-header { grid-template-columns:1fr; } .s-num { padding-top:0; } .s-rule { grid-column:1; }
      .tl-header { flex-direction:column; gap:4px; }
    }
    @media (max-width:480px) { .certs-grid { grid-template-columns:1fr; } }
    @media (min-width:1600px) {
      nav, section, footer { padding-left:110px; padding-right:110px; }
      nav.scrolled { padding-left:110px; padding-right:110px; } #hero { padding-left:110px; padding-right:110px; }
    }
  </style>
</head>
<body>
  <div class="cur cur-dot" id="curDot"></div>
  <div class="cur cur-ring" id="curRing"></div>

  <nav id="nav">
    <a href="#hero" class="nav-logo">${firstName} <em>${lastName.charAt(0)}</em></a>
    <ul class="nav-links" id="navDesktop">
      ${navLinksHTML}
    </ul>
    <div class="hamburger" id="hamburger"><span></span><span></span><span></span></div>
  </nav>

  <div class="mobile-nav" id="mobileNav">
    ${mobileNavHTML}
    <a href="#contact">Contact</a>
  </div>

  <section id="hero">
    <div class="hero-rings" aria-hidden="true">
      <svg viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="320" cy="320" r="319" stroke="rgba(201,168,76,0.1)" stroke-width="1"/>
        <circle cx="320" cy="320" r="260" stroke="rgba(201,168,76,0.065)" stroke-width="1"/>
        <circle cx="320" cy="320" r="195" stroke="rgba(201,168,76,0.04)" stroke-width="1"/>
        <circle cx="320" cy="320" r="128" stroke="rgba(201,168,76,0.025)" stroke-width="1"/>
        <line x1="320" y1="0" x2="320" y2="640" stroke="rgba(201,168,76,0.04)" stroke-width="1"/>
        <line x1="0" y1="320" x2="640" y2="320" stroke="rgba(201,168,76,0.04)" stroke-width="1"/>
        <path d="M 320 1 A 319 319 0 0 1 639 320" stroke="rgba(201,168,76,0.2)" stroke-width="1.5"/>
        <circle cx="639" cy="320" r="3" fill="rgba(201,168,76,0.5)"/>
        <circle cx="320" cy="1" r="3" fill="rgba(201,168,76,0.5)"/>
      </svg>
    </div>
    <div class="hero-glow" aria-hidden="true"></div>
    <div class="hero-content">
      <div class="hero-eyebrow">
        <span class="dot"></span>
        ${data.openTo || `${data.title || 'Professional'} · ${data.location || ''}`}
      </div>
      <h1 class="hero-name">
        <span class="first">${firstName} <em style="color:var(--gold);font-style:italic">${lastName.charAt(0)}</em></span>
      </h1>
      <div class="hero-tw">
        <span class="tw-text" id="twText"></span><span class="tw-cur"></span>
      </div>
      <div class="hero-bio">
        ${(data.bio || [])[0] || ''}
      </div>
      <div class="hero-actions">
        <a href="#experience" class="btn btn-gold"><span>View Experience</span></a>
        <a href="#contact" class="btn btn-ghost">Get in Touch <i class="fa-solid fa-arrow-right" style="font-size:.7rem"></i></a>
      </div>
    </div>
    <div class="hero-rail">
      <div class="rail-links">
        ${railLinks}
      </div>
    </div>
    <div class="hero-scroll">
      <div class="scroll-track"></div>
      <span class="scroll-label">Scroll to explore</span>
    </div>
  </section>

  <section id="about">
    <div class="s-header reveal">
      <span class="s-num">${pad2(aboutNum)} — About</span>
      <div><h2 class="s-title">Who I <em>Am</em></h2><div class="s-rule"></div></div>
    </div>
    <div class="about-layout">
      <div class="about-text reveal">
        ${bioHTML}
      </div>
      <div class="about-stats reveal" style="transition-delay:.18s">
        ${statsHTML}
      </div>
    </div>
  </section>

  <section id="experience">
    <div class="s-header reveal">
      <span class="s-num">${pad2(expNum)} — Experience</span>
      <div><h2 class="s-title">Where I've <em>Worked</em></h2><div class="s-rule"></div></div>
    </div>
    <div class="timeline">
      ${expHTML}
    </div>
  </section>

  <section id="skills">
    <div class="s-header reveal">
      <span class="s-num">${pad2(skillsNum)} — Skills</span>
      <div><h2 class="s-title">What I <em>Know</em></h2><div class="s-rule"></div></div>
    </div>
    <div class="skills-grid">
      ${skillsHTML}
    </div>
  </section>

  ${certsSection}
  ${projectsSection}

  <section id="more">
    <div class="s-header reveal">
      <span class="s-num">${pad2(moreNum)} — Background</span>
      <div><h2 class="s-title">Education &amp; <em>Leadership</em></h2><div class="s-rule"></div></div>
    </div>
    <div class="more-grid">
      <div class="more-panel reveal">
        <div class="more-panel-title"><i class="fa-solid fa-graduation-cap"></i> Education</div>
        ${educationHTML}
      </div>
      <div class="more-panel reveal" style="transition-delay:.15s">
        ${leadershipHTML ? `<div class="more-panel-title"><i class="fa-solid fa-star"></i> Professional Engagement</div>
        <ul class="leadership-list">
          ${leadershipHTML}
        </ul>` : ''}
        ${interestsHTML ? `<div class="more-panel-title" style="margin-top:32px"><i class="fa-solid fa-heart"></i> Interests</div>
        <div class="hobbies">
          ${interestsHTML}
        </div>` : ''}
      </div>
    </div>
  </section>

  <section id="contact">
    <div class="s-header reveal">
      <span class="s-num">${pad2(contactNum)} — Contact</span>
      <div><h2 class="s-title">Let's <em>Connect</em></h2><div class="s-rule"></div></div>
    </div>
    <div class="contact-inner">
      <p class="contact-big reveal">
        Ready to work<br>with <em>excellence?</em>
      </p>
      <p class="contact-sub reveal" style="transition-delay:.15s">
        Open to exciting opportunities. Whether it's a full-time role, contract, or a good conversation — reach out.
      </p>
      ${contact.email ? `<a href="mailto:${contact.email}" class="contact-email-link reveal" style="transition-delay:.3s">
        <i class="fa-solid fa-paper-plane"></i>${contact.email}
      </a>` : ''}
      <div class="contact-details reveal" style="transition-delay:.38s">
        ${contact.phone ? `<div class="contact-detail"><i class="fa-solid fa-phone"></i>${contact.phone}</div>` : ''}
        ${data.location ? `<div class="contact-detail"><i class="fa-solid fa-location-dot"></i>${data.location}</div>` : ''}
      </div>
      <div class="socials reveal" style="transition-delay:.45s">
        ${socialPillsHTML}
      </div>
    </div>
  </section>

  <footer>
    <div class="footer-name">${name}</div>
    <div class="footer-copy">© ${new Date().getFullYear()} — ${data.location || 'Portfolio'}</div>
    <div class="footer-tag">${data.title || 'Professional'} · <span>Generated by PortfolioAI</span></div>
  </footer>

  <script>
    const dot = document.getElementById('curDot');
    const ring = document.getElementById('curRing');
    let mx=-100,my=-100,rx=-100,ry=-100;
    document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; dot.style.left=mx+'px'; dot.style.top=my+'px'; });
    (function animRing(){ rx+=(mx-rx)*.13; ry+=(my-ry)*.13; ring.style.left=rx+'px'; ring.style.top=ry+'px'; requestAnimationFrame(animRing); })();
    document.querySelectorAll('a,button,.tag,.work-card,.stat,.skill-col,.cert-card,.social-pill,.hobby-tag,.tl-item').forEach(el=>{
      el.addEventListener('mouseenter',()=>document.body.classList.add('hovering'));
      el.addEventListener('mouseleave',()=>document.body.classList.remove('hovering'));
    });
    const nav = document.getElementById('nav');
    const sectionEls = [...document.querySelectorAll('section[id]')];
    const navAs = [...document.querySelectorAll('#navDesktop a')];
    window.addEventListener('scroll', ()=>{
      nav.classList.toggle('scrolled', window.scrollY > 40);
      let cur='';
      sectionEls.forEach(s=>{ if(window.scrollY>=s.offsetTop-140) cur=s.id; });
      navAs.forEach(a=>a.classList.toggle('active', a.getAttribute('href')==='#'+cur));
    }, {passive:true});
    const burger = document.getElementById('hamburger');
    const mobileNav = document.getElementById('mobileNav');
    burger.addEventListener('click',()=>{ const open=mobileNav.classList.toggle('open'); burger.classList.toggle('open',open); document.body.style.overflow=open?'hidden':''; });
    mobileNav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{ mobileNav.classList.remove('open'); burger.classList.remove('open'); document.body.style.overflow=''; }));
    const roles = ${roles};
    let ri=0,ci=0,del=false;
    const tw=document.getElementById('twText');
    function typeLoop(){
      const w=roles[ri];
      tw.textContent=del?w.slice(0,--ci):w.slice(0,++ci);
      let d=del?46:90;
      if(!del&&ci===w.length){d=2200;del=true;}
      if(del&&ci===0){del=false;ri=(ri+1)%roles.length;d=360;}
      setTimeout(typeLoop,d);
    }
    if(roles.length>0) setTimeout(typeLoop,1600);
    const revIO=new IntersectionObserver(entries=>entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add('in'); }),{threshold:0.08});
    document.querySelectorAll('.reveal,.tl-item').forEach(el=>revIO.observe(el));
    const countIO=new IntersectionObserver(entries=>entries.forEach(e=>{
      if(!e.isIntersecting) return;
      const el=e.target, target=+el.dataset.count, suffix=el.dataset.suffix||'';
      if(!target) return;
      let v=0; const step=target/40;
      const t=setInterval(()=>{ v=Math.min(v+step,target); el.textContent=Math.floor(v)+suffix; if(v>=target) clearInterval(t); },28);
      countIO.unobserve(el);
    }),{threshold:0.5});
    document.querySelectorAll('[data-count]').forEach(el=>countIO.observe(el));
    document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{ const t=document.querySelector(a.getAttribute('href')); if(!t) return; e.preventDefault(); t.scrollIntoView({behavior:'smooth',block:'start'}); }));
  </script>
</body>
</html>`;
}

app.use(express.static(__dirname));

app.post('/generate', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Please upload a PDF resume.' });

  try {
    console.log(`Processing: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
    const parsed = await parseResume(req.file.buffer);
    const html = generatePortfolioHTML(parsed);
    const name = `${parsed.name?.first || ''} ${parsed.name?.last || ''}`.trim();
    console.log(`Generated portfolio for: ${name}`);
    res.json({ html, name });
  } catch (err) {
    console.error('Generation failed:', err.message);
    if (err.message.includes('JSON')) {
      res.status(500).json({ error: 'Could not parse resume data. Please ensure your PDF is text-based (not a scanned image).' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✦ PortfolioAI running at http://localhost:${PORT}/upload.html`);
  console.log(`  Existing portfolio: http://localhost:${PORT}/\n`);
});
