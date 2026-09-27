/* Markdown -> HTML for the setup guide. Deliberately tiny, zero dependencies.
   Not a general parser — it handles exactly the constructs SETUP.md uses, and
   the verification step checks that nothing leaks through unparsed. */
const fs = require('fs');
const md = fs.readFileSync('SETUP.md', 'utf8');
const OUT = process.argv[2] || 'SETUP.html';
const TITLE = process.argv[3] || 'Pikmin Blog v3 — Setup';

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* Inline: code first, so ** inside a code span is not eaten as bold.
   Bold before links, and bold may contain a code span.
   A paragraph is joined into one string before this runs, so ** spans that
   wrap across a source line still match. */
function inline(s){
  let t = esc(s).replace(/\s*\n\s*/g, ' ');
  t = t.replace(/`([^`]+)`/g, (m, c) => '\u0001' + c + '\u0002');   /* park code */
  t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\u0001([\s\S]*?)\u0002/g, '<code>$1</code>');      /* unpark */
  return t;
}

const lines = md.split(/\r?\n/);
const out = [];
let i = 0, inCode = false, inTable = false, inQuote = false, inList = false;

const closeAll = () => {
  if(inList){ out.push('</ul>'); inList = false; }
  if(inTable){ out.push('</table>'); inTable = false; }
  if(inQuote){ out.push('</blockquote>'); inQuote = false; }
};

while(i < lines.length){
  let L = lines[i];

  /* fenced code */
  if(/^```/.test(L)){
    closeAll();
    if(!inCode){ out.push('<pre>'); inCode = true; }
    else { out.push('</pre>'); inCode = false; }
    i++; continue;
  }
  if(inCode){ out.push(esc(L)); i++; continue; }

  /* blockquote — strip the marker, then fall through so its inner content
     still gets parsed (a heading inside a callout must not leak its ###) */
  const q = L.match(/^>\s?(.*)$/);
  if(q){
    if(!inQuote){ closeAll(); out.push('<blockquote>'); inQuote = true; }
    L = q[1];
    if(!L.trim()){ i++; continue; }
  } else if(inQuote){ out.push('</blockquote>'); inQuote = false; }

  /* table */
  if(/^\|/.test(L)){
    if(inList){ out.push('</ul>'); inList = false; }
    if(!inTable){
      out.push('<table>'); inTable = true;
      out.push('<tr>' + L.split('|').slice(1,-1)
        .map(c => '<th>' + inline(c.trim()) + '</th>').join('') + '</tr>');
      i++;
      if(i < lines.length && /^\|[\s\-:|]+\|/.test(lines[i])) i++;
      continue;
    }
    out.push('<tr>' + L.split('|').slice(1,-1)
      .map(c => '<td>' + inline(c.trim()) + '</td>').join('') + '</tr>');
    i++; continue;
  } else if(inTable){ out.push('</table>'); inTable = false; }

  /* headings, longest marker first */
  let m;
  if((m = L.match(/^(#{1,6})\s+(.*)$/))){
    if(inList){ out.push('</ul>'); inList = false; }
    const lvl = m[1].length;
    out.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>');
    i++; continue;
  }

  /* lists */
  if(/^\s*[-*]\s+/.test(L)){
    if(!inList){ out.push('<ul>'); inList = true; }
    out.push('<li>' + inline(L.replace(/^\s*[-*]\s+/, '')) + '</li>');
    i++; continue;
  }
  if(/^\s*\d+\.\s+/.test(L) || /^\s{2,}\S/.test(L) && inList){
    /* numbered steps are rendered as a list too */
    if(!inList){ out.push('<ul>'); inList = true; }
    out.push('<li>' + inline(L.replace(/^\s*(?:\d+\.\s+)?/, '')) + '</li>');
    i++; continue;
  }
  if(inList){ out.push('</ul>'); inList = false; }

  if(/^---+$/.test(L)) out.push('<hr>');
  else if(!L.trim()) out.push('');
  else {
    /* gather the whole paragraph, so ** spans that wrap a source line match */
    let para = L;
    while(i + 1 < lines.length){
      const N = lines[i + 1];
      if(!N.trim() || /^(\s*[-*]\s|\s*\d+\.\s|#{1,6}\s|\||>|```)/.test(N)) break;
      para += '\n' + N; i++;
    }
    out.push('<p>' + inline(para) + '</p>');
  }
  i++;
}
closeAll();
if(inCode) out.push('</pre>');

const body = out.join('\n');

const css = `
:root{--leaf:#3E5A2E;--leaf2:#5C7F42;--ink:#2E2A24;--line:#E2DACB;--paper:#FFFDF7}
*{box-sizing:border-box}
body{font-family:'Nunito','Segoe UI',system-ui,sans-serif;line-height:1.65;color:var(--ink);
background:linear-gradient(180deg,#F7FAF0,#EFF6E4);margin:0;padding:38px 20px 80px}
main{max-width:780px;margin:0 auto;background:var(--paper);border:1.5px solid var(--line);
border-radius:18px;padding:34px 42px;box-shadow:0 2px 0 rgba(74,53,39,.08),0 10px 30px rgba(74,53,39,.09)}
h1{color:var(--leaf);font-size:1.9rem;border-bottom:3px solid #8FB56A;padding-bottom:12px}
h2{color:var(--leaf);margin-top:2.1em;font-size:1.32rem}
h3{color:#4A3527;margin-top:1.7em;font-size:1.08rem}
h4{color:#4A3527}
code{background:#F2EDE2;padding:2px 6px;border-radius:5px;
font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.89em;color:#4A3527}
pre{background:#2E2A24;color:#D8E8C8;padding:16px;border-radius:11px;overflow:auto;
font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.83rem;line-height:1.55}
pre code{background:none;color:inherit;padding:0;font-size:1em}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.93rem}
th,td{border:1.5px solid var(--line);padding:9px 12px;text-align:left;vertical-align:top}
th{background:#F0F6E6;font-weight:800}
blockquote{border-left:4px solid #F2C230;background:#FFFAEB;margin:1.3em 0;
padding:14px 20px;border-radius:0 10px 10px 0}
blockquote h3{margin-top:.2em}
blockquote p{margin:.35em 0}
a{color:var(--leaf2)}
ul{padding-left:1.3em;margin:.8em 0}
li{margin:.3em 0}
hr{border:0;border-top:2px dashed var(--line);margin:2em 0}
@media(max-width:600px){main{padding:22px 18px}h1{font-size:1.5rem}}
`;

fs.writeFileSync(OUT,
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + esc(TITLE) + '</title><style>' + css + '</style></head>' +
  '<body><main>' + body + '</main></body></html>');
console.log(OUT + ' written, ' + fs.statSync(OUT).size + ' bytes');
