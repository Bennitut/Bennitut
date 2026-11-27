// Tagesbericht der Nachtschicht als kleine PDF (A4): was an einem Tag erledigt wurde, visuell aufbereitet.
//
//   node FoodTracker/reports/make-report.cjs 2026-11-23     # Datum in Japan-Zeit; ohne Datum: gestern
//
// Quellen: Commits auf origin/claude/nightly an diesem Tag, Notizen in FoodTracker/BACKLOG.md und der offene
// Nachtschicht-PR (Entscheidungen, Status der Checks). Braucht git, gh und Playwright mit Chromium. Ohne gh:
// REPORT_PR_JSON=<Datei> mit dem PR als JSON (mindestens number, html_url und body, wie in der GitHub-API).
// Ergebnis: FoodTracker/reports/<Datum>.pdf
//
// Was aus BACKLOG.md im Bericht landet (Format prüft `node --test FoodTracker/reports/`):
//   - Aufgaben „- [x] **6. Titel**“ mit Notiz „  - TT.MM.JJJJ: …“ (oder „  - TT.MM.JJJJ, Teil 1: …“)
//   - erledigte Abschnitte „## ✅ Vorrang: Titel (Anlass) – erledigt TT.MM.JJJJ“ mit Absatz „TT.MM.JJJJ: …“
//   - in noch offenen Abschnitten „## Vorrang …“ erledigte Teilschritte „- [x] Titel … – erledigt TT.MM.JJJJ: Notiz“
//   - unter „Ideen und Erkenntnisse“: „- ✅ **Titel:** … erledigt TT.MM.JJJJ: …“ (Text danach = Notiz im Bericht)
//     und neue Punkte „- **Titel:** … (TT.MM.JJJJ)“ (erstes Datum in Klammern = an dem Tag notiert)
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BACKLOG = path.join(REPO_ROOT, "FoodTracker", "BACKLOG.md");
const TZ = "+09:00";
const DATE = String.raw`\d\d\.\d\d\.\d{4}`;
const DONE_SECTION = new RegExp(String.raw`^## ✅ (.+?) [–-] erledigt (${DATE})\s*$`);
const DONE_IDEA = new RegExp(String.raw`\b[Ee]rledigt (${DATE})`);
const NOTED = new RegExp(String.raw`\((${DATE})\)`);
const IDEAS = "## Ideen und Erkenntnisse";
const OPEN_PRIORITY = /^## (Vorrang[^:]*): /;
const STEP_DONE = new RegExp(String.raw`^\[x\] (.+?) [–-] erledigt (${DATE}):\s*(.*)$`);
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

function reportDate() {
  if (process.argv[2]) return process.argv[2];
  const tokyo = new Date(Date.now() + 9 * 3600_000 - 24 * 3600_000);
  return tokyo.toISOString().slice(0, 10);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** Markdown-Reste (`code`, **fett**) für die PDF glätten. */
const plain = (s) => s.replace(/\*\*/g, "").replace(/`([^`]+)`/g, "$1");

function commitsOf(day) {
  // Flache Clones vertiefen (nie kürzen), damit auch der erste Commit des Tages seinen Vorgänger hat –
  // sonst zählt git dessen ganzen Dateibaum als „hinzugefügt“.
  try {
    sh("git", ["fetch", "--quiet", "--deepen=100", "origin", "claude/nightly"]);
  } catch {
    // Ohne Netz oder bei vollständigem Clone: mit dem vorhandenen Stand arbeiten.
  }
  const out = sh("git", ["log", "origin/claude/nightly", `--since=${day}T00:00:00${TZ}`, `--until=${day}T23:59:59${TZ}`, "--numstat", "--format=@@%H|%cI|%s"]);
  const commits = [];
  for (const line of out.split("\n")) {
    if (line.startsWith("@@")) {
      const [hash, date, ...subject] = line.slice(2).split("|");
      commits.push({ hash, date: new Date(date), subject: subject.join("|"), lines: 0 });
    } else if (line.trim() && commits.length) {
      const [add, del, file] = line.split("\t");
      if (add === "-" || /package-lock\.json$|\.(mp4|pdf|png|jpg)$/.test(file)) continue;
      commits[commits.length - 1].lines += Number(add) + Number(del);
    }
  }
  return commits.reverse();
}

/** Abschnitte („## …“) mit ihren Zeilen; der Text vor der ersten Überschrift hat die Überschrift "". */
function sections(text) {
  const out = [{ heading: "", lines: [] }];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) out.push({ heading: line.trim(), lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

/** Absätze und Aufzählungspunkte („- …“ samt eingerückter Folgezeilen) als je eine Zeile Text. */
function blocks(lines) {
  const out = [];
  let current = null;
  for (const line of lines) {
    if (!line.trim()) current = null;
    else if (line.startsWith("- ") || !current || (current.bullet && !/^\s/.test(line))) {
      out.push((current = { bullet: line.startsWith("- "), text: line.replace(/^- /, "").trim() }));
    } else current.text += ` ${line.trim()}`;
  }
  return out;
}

const ideaTitle = (item) => plain(item.match(/\*\*(.+?)\*\*/)?.[1] ?? item).replace(/:$/, "");

/** Kurzer Titel eines Teilschritts: Nummer („1.“) und kurzes Etikett („Server:“) behalten, danach bis „ (“, „: “ oder „. “. */
function stepTitle(item) {
  const text = plain(item);
  const number = text.match(/^(\d+\.) /);
  const body = number ? text.slice(number[0].length) : text;
  const label = body.match(/^([^:]{1,12}): /);
  const rest = label ? body.slice(label[0].length) : body;
  const cut = rest.split(/ \(|: |\. /)[0].replace(/\.$/, "");
  const short = cut.length > 90 ? `${cut.slice(0, 89).trimEnd()}…` : cut;
  return `${number ? `${number[1]} ` : ""}${label ? `${label[1]}: ` : ""}${short}`;
}

function backlog(day, text = fs.readFileSync(BACKLOG, "utf8")) {
  const [y, m, d] = day.split("-");
  const german = `${d}.${m}.${y}`;
  const tasks = [];
  for (const line of text.split("\n")) {
    const task = line.match(/^- \[( |x)\] \*\*(\d+)\. (.+?)\*\*/);
    if (task) tasks.push({ n: Number(task[2]), title: plain(task[3]).replace(/:$/, ""), done: task[1] === "x", notes: [] });
    const note = line.match(/^ {2}- (\d\d\.\d\d\.\d{4})(?:, ([^:]+))?: (.*)$/);
    if (note && tasks.length) tasks[tasks.length - 1].notes.push({ date: note[1], part: note[2] ?? null, text: plain(note[3]) });
  }
  const today = tasks.filter((t) => t.notes.some((n) => n.date === german));

  // Außerhalb der nummerierten Aufgaben: erledigte Vorrang-Abschnitte und Punkte aus „Ideen und Erkenntnisse“.
  const done = [];
  const added = [];
  for (const { heading, lines } of sections(text)) {
    const section = heading.match(DONE_SECTION);
    if (section?.[2] === german) {
      const [, kind, title] = plain(section[1]).replace(/\s*\([^)]*\)$/, "").match(/^(?:(Vorrang|Daueraufgabe): )?(.+)$/);
      const note = blocks(lines).find((b) => !b.bullet && b.text.startsWith(`${german}: `));
      done.push({ kind: kind ?? "Abschnitt", title, text: note ? plain(note.text.slice(german.length + 2)) : "" });
    }
    // Große Vorrang-Abschnitte laufen über mehrere Tage: deren erledigte Teilschritte einzeln zeigen.
    const priority = !section && heading.match(OPEN_PRIORITY);
    if (priority) {
      for (const { bullet, text: item } of blocks(lines)) {
        const step = bullet && item.match(STEP_DONE);
        if (step?.[2] === german) done.push({ kind: `${priority[1]}, Teilschritt`, title: stepTitle(step[1]), text: plain(step[3]) });
      }
    }
    if (heading !== IDEAS) continue;
    for (const { bullet, text: item } of blocks(lines)) {
      if (!bullet) continue;
      if (item.startsWith("✅")) {
        const match = item.match(DONE_IDEA);
        if (match?.[1] !== german) continue;
        // Notiz = Text nach „erledigt TT.MM.JJJJ“; steht dort nichts, der ganze Punkt ohne Titel.
        const after = item.slice(match.index + match[0].length).replace(/^[\s:–-]+/, "");
        const note = (after || item.replace(/^✅\s*(\*\*.+?\*\*)?/, "").replace(match[0], ""))
          .replace(new RegExp(String.raw`\s*\(${DATE}\)\s*$`), "")
          .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "");
        done.push({ kind: "Ideen und Erkenntnisse", title: ideaTitle(item), text: plain(note) });
      } else if (item.match(NOTED)?.[1] === german) {
        added.push(ideaTitle(item));
      }
    }
  }
  return { german, tasks, today, done, added };
}

/** Stellen in BACKLOG.md, die der Bericht nicht lesen kann (leer = alles in Ordnung). */
function backlogProblems(text) {
  const problems = [];
  for (const task of backlog("2000-01-01", text).tasks) {
    if (task.done && !task.notes.length) problems.push(`Aufgabe ${task.n} ist abgehakt, hat aber keine Notiz „  - TT.MM.JJJJ: …“`);
  }
  for (const { heading, lines } of sections(text)) {
    if (heading.startsWith("## ✅")) {
      const section = heading.match(DONE_SECTION);
      if (!section) problems.push(`„${heading}“: Überschrift endet nicht auf „– erledigt TT.MM.JJJJ“`);
      else if (!blocks(lines).some((b) => !b.bullet && b.text.startsWith(`${section[2]}: `))) {
        problems.push(`„${heading}“: kein Absatz „${section[2]}: …“ mit der Notiz`);
      }
    }
    if (heading !== IDEAS) continue;
    for (const { bullet, text: item } of blocks(lines)) {
      if (!bullet) problems.push(`„Ideen und Erkenntnisse“: Zeile ohne „- “ wird nicht gelesen: ${ideaTitle(item)}`);
      else if (item.startsWith("✅") && !DONE_IDEA.test(item)) problems.push(`✅ ohne „erledigt TT.MM.JJJJ“: ${ideaTitle(item)}`);
      else if (!item.startsWith("✅") && !NOTED.test(item)) problems.push(`ohne Datum „(TT.MM.JJJJ)“: ${ideaTitle(item)}`);
    }
  }
  return problems;
}

function pullRequest() {
  try {
    const prs = process.env.REPORT_PR_JSON
      ? [JSON.parse(fs.readFileSync(process.env.REPORT_PR_JSON, "utf8"))]
      : JSON.parse(sh("gh", ["api", "repos/Bennitut/Bennitut/pulls?head=Bennitut:claude/nightly&state=open"]));
    const pr = prs[0];
    if (!pr) return null;
    const section = (title) => (pr.body.split(/\n## /).find((s) => s.startsWith(title)) ?? "").split("\n").slice(1).join("\n").trim();
    const checks = section("Status der Checks")
      .split("\n")
      .filter((l) => l.startsWith("|") && !/^\|\s*(Check|---)/.test(l))
      .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean))
      .map(([name, result]) => ({ name: plain(name), result: plain(result ?? "") }));
    const decisions = section("Brauche deine Entscheidung")
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => plain(l.slice(2)));
    return { number: pr.number, url: pr.html_url, checks, decisions };
  } catch {
    return null;
  }
}

const tokyoTime = (d) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(11, 16);

function hourChart(commits) {
  const hours = new Array(24).fill(0);
  for (const c of commits) hours[(c.date.getUTCHours() + 9) % 24]++;
  const max = Math.max(1, ...hours);
  const w = 680, h = 120, bw = w / 24;
  const bars = hours
    .map((v, i) => {
      const bh = (v / max) * (h - 28);
      const x = i * bw + 3;
      const label = i % 3 === 0 ? `<text x="${x + (bw - 6) / 2}" y="${h - 4}" text-anchor="middle" class="axis">${i}</text>` : "";
      const value = v ? `<text x="${x + (bw - 6) / 2}" y="${h - 22 - bh}" text-anchor="middle" class="val">${v}</text>` : "";
      return `<rect x="${x}" y="${h - 18 - bh}" width="${bw - 6}" height="${Math.max(bh, v ? 2 : 0)}" rx="3" class="bar"/>${value}${label}`;
    })
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Commits pro Stunde">${bars}<line x1="0" y1="${h - 18}" x2="${w}" y2="${h - 18}" class="base"/></svg>`;
}

function html(day, commits, bl, pr) {
  const lines = commits.reduce((s, c) => s + c.lines, 0);
  const doneTotal = bl.tasks.filter((t) => t.done).length;
  const doneToday = bl.today.filter((t) => t.done && t.notes.some((n) => n.date === bl.german && !n.part)).length;
  const doneOther = bl.done.length;
  const tiles = [
    ["Aufgaben erledigt", String(doneToday + doneOther), doneOther ? `${doneToday} Backlog-Punkt${doneToday === 1 ? "" : "e"} + ${doneOther} weitere` : "heute abgehakt"],
    ["Aktiv", commits.length ? `${tokyoTime(commits[0].date)}–${tokyoTime(commits[commits.length - 1].date)}` : "–", "erste bis letzte Änderung"],
    ["Commits", String(commits.length), "auf claude/nightly"],
    ["Zeilen geändert", lines.toLocaleString("de-DE"), "ohne Lockfiles und Medien"],
  ];
  const taskRows = bl.tasks
    .map((t) => {
      const state = t.done ? "done" : t.notes.length ? "partial" : "open";
      const mark = { done: "✓", partial: "◐", open: "" }[state];
      return `<li class="${state}"><span class="dot">${mark}</span><span>${t.n}. ${esc(t.title)}</span></li>`;
    })
    .join("");
  const todayItems = bl.today
    .map((t) => {
      const notes = t.notes.filter((n) => n.date === bl.german);
      return notes
        .map((n) => `<div class="item"><div class="item-title">${t.done && !n.part ? "✓" : "◐"} ${t.n}. ${esc(t.title)}${n.part ? ` <span class="part">${esc(n.part)}</span>` : ""}</div><div class="item-text">${esc(n.text)}</div></div>`)
        .join("");
    })
    .join("");
  const doneItems = bl.done
    .map((x) => `<div class="item"><div class="item-title">✓ ${esc(x.title)} <span class="kind">${esc(x.kind)}</span></div>${x.text ? `<div class="item-text">${esc(x.text)}</div>` : ""}</div>`)
    .join("");
  const addedItems = bl.added.length
    ? `<p class="added"><b>Neu notiert unter „Ideen und Erkenntnisse“ (${bl.added.length}):</b> ${bl.added.map(esc).join(" · ")}</p>`
    : "";
  const checks = (pr?.checks ?? [])
    .map((c) => `<span class="chip ${/❌/.test(c.result) ? "bad" : /⏭/.test(c.result) ? "skip" : "ok"}">${esc(c.name)}: ${esc(c.result.replace(/^[✅❌⏭️\s]+/u, "") || "ok")}</span>`)
    .join("");
  const decisions = (pr?.decisions ?? []).map((d) => `<li>${esc(d)}</li>`).join("") || "<li>Nichts offen.</li>";
  const commitList = commits
    .map((c) => `<tr><td class="time">${tokyoTime(c.date)}</td><td>${esc(c.subject)}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm 14mm 12mm; }
    :root { --green:#1E9E5A; --ink:#17201B; --muted:#6B746E; --line:#E4E9E2; --tint:#DFF3E7; --warn:#D9822B; }
    body { font-family: Inter, "DejaVu Sans", sans-serif; color: var(--ink); font-size: 10.5pt; margin: 0; }
    header { display:flex; align-items:center; gap:14px; border-bottom: 3px solid var(--green); padding-bottom: 10px; }
    .logo { width:42px; height:42px; border-radius:10px; background:var(--green); display:flex; align-items:center; justify-content:center; color:#fff; font-size:22px; }
    h1 { font-size: 19pt; margin: 0; } .sub { color: var(--muted); font-size: 9.5pt; } .sub a { color: inherit; }
    h2 { font-size: 11.5pt; margin: 16px 0 6px; break-after: avoid; } .keep { break-inside: avoid; } tr { break-inside: avoid; }
    .tiles { display:grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
    .tile { background: var(--tint); border-radius: 10px; padding: 8px 10px; }
    .tile .v { font-size: 20pt; font-weight: 800; color: var(--green); white-space: nowrap; } .tile .v.small { font-size: 15pt; line-height: 26pt; } .tile .l { font-weight: 700; font-size: 9pt; } .tile .h { color: var(--muted); font-size: 8pt; }
    .progress { height: 10px; background: var(--line); border-radius: 5px; overflow: hidden; } .progress > div { height: 100%; background: var(--green); }
    ul.tasks { list-style: none; padding: 0; margin: 6px 0 0; columns: 2; column-gap: 18px; font-size: 9.5pt; }
    ul.tasks li { display:flex; gap:6px; align-items:flex-start; padding: 2px 0; break-inside: avoid; }
    .dot { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid var(--line); flex: none; font-size: 9px; line-height: 12px; text-align: center; color:#fff; }
    li.done .dot { background: var(--green); border-color: var(--green); } li.partial .dot { border-color: var(--green); color: var(--green); }
    li.open span:last-child { color: var(--muted); }
    .item { border-left: 3px solid var(--green); padding: 4px 0 4px 10px; margin: 6px 0; break-inside: avoid; }
    .item-title { font-weight: 700; } .item-text { color: #333; font-size: 9.5pt; margin-top: 2px; } .part { font-weight: 600; color: var(--warn); font-size: 8.5pt; }
    .kind { font-weight: 600; color: var(--muted); font-size: 8.5pt; } .added { font-size: 9pt; color: #333; margin: 8px 0 0; }
    .bar { fill: var(--green); } .axis { fill: var(--muted); font-size: 9px; } .val { fill: var(--ink); font-size: 9px; font-weight: 700; } .base { stroke: var(--line); }
    .chips { display:flex; flex-wrap: wrap; gap: 5px; } .chip { font-size: 8.5pt; padding: 3px 8px; border-radius: 999px; background: var(--tint); }
    .chip.bad { background: #FBE3E1; color: #A12A21; } .chip.skip { background: #F1F1F1; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; } td { border-bottom: 1px solid var(--line); padding: 3px 4px; vertical-align: top; } td.time { color: var(--muted); width: 42px; }
    .decisions li { margin: 3px 0; }
  </style></head><body>
    <header><div class="logo">🥣</div><div><h1>FoodTracker · Tagesbericht ${esc(bl.german)}</h1>
      <div class="sub">Automatisch erstellt von der Nachtschicht · Zeiten in Japan-Zeit${pr ? ` · Details und Testanleitung: <a href="${esc(pr.url)}">PR #${pr.number}</a>` : ""}</div></div></header>
    <div class="tiles">${tiles.map(([l, v, h]) => `<div class="tile"><div class="v${v.length > 6 ? " small" : ""}">${esc(v)}</div><div class="l">${esc(l)}</div><div class="h">${esc(h)}</div></div>`).join("")}</div>
    <h2>Backlog: ${doneTotal} von ${bl.tasks.length} Aufgaben erledigt</h2>
    <div class="progress"><div style="width:${(100 * doneTotal) / Math.max(1, bl.tasks.length)}%"></div></div>
    <ul class="tasks">${taskRows}</ul>
    <h2>Was heute passiert ist</h2>${todayItems + doneItems + addedItems || "<p>Keine Backlog-Notizen mit diesem Datum.</p>"}
    <section class="keep"><h2>Commits pro Stunde</h2>${hourChart(commits)}</section>
    <h2>Status der Checks</h2><div class="chips">${checks || "<span class='chip skip'>keine Angaben im PR</span>"}</div>
    <section class="keep"><h2>Brauche deine Entscheidung</h2><ul class="decisions">${decisions}</ul></section>
    <h2>Alle Commits</h2><table>${commitList || "<tr><td>Keine Commits.</td></tr>"}</table>
  </body></html>`;
}

async function main() {
  const day = reportDate();
  for (const problem of backlogProblems(fs.readFileSync(BACKLOG, "utf8"))) console.warn(`BACKLOG.md: ${problem}`);
  const commits = commitsOf(day);
  const bl = backlog(day);
  const pr = pullRequest();
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html(day, commits, bl, pr), { waitUntil: "load" });
  const out = path.join(__dirname, `${day}.pdf`);
  await page.pdf({ path: out, format: "A4", printBackground: true });
  await browser.close();
  console.log(`${path.relative(REPO_ROOT, out)}: ${commits.length} Commits, ${bl.today.length} Aufgaben mit Notiz, ${bl.done.length} weitere erledigt, ${bl.added.length} neu notiert`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { backlog, backlogProblems, html };
