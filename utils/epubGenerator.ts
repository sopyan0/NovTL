
import JSZip from 'jszip';
import { SavedTranslation, NovelProject } from '../types';

/**
 * Sanitize strings for XML to prevent breaking EPUB structure
 */
const escapeXml = (unsafe: string): string => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

/**
 * Converts plain text (with \n) into HTML paragraphs <p>
 */
const textToHtml = (text: string): string => {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `<p>${escapeXml(line)}</p>`)
    .join('\n');
};

export const generateEpub = async (project: NovelProject, chapters: SavedTranslation[]) => {
  const zip = new JSZip();
  const uuid = `urn:uuid:${project.id}`;
  const timestamp = new Date().toISOString();

  // 1. MIMETYPE (Must be first, no compression)
  zip.file('mimetype', 'application/epub+zip', { compression: "STORE" });

  // 2. META-INF/container.xml
  zip.folder('META-INF')?.file('container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`);

  // 3. OEBPS Folder
  const oebps = zip.folder('OEBPS');
  if (!oebps) throw new Error("Failed to create OEBPS folder");

  // CSS Styles
  const css = `
    body { font-family: "Times New Roman", serif; line-height: 1.6; margin: 0; padding: 0 1em; }
    h1, h2, h3 { font-family: sans-serif; text-align: center; margin-top: 2em; page-break-before: always; color: #2D3436; }
    p { margin-bottom: 1em; text-align: justify; text-indent: 1.5em; }
    .title-page { text-align: center; margin-top: 30vh; }
    .author { font-style: italic; margin-top: 1em; color: #636E72; }
  `;
  oebps.file('styles.css', css);

  // Title Page
  const titlePageContent = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(project.name)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="title-page">
    <h1>${escapeXml(project.name)}</h1>
    <div class="author">Translated by NovTL Studio</div>
    <div style="margin-top:2em; font-size: 0.8em; color: #aaa;">Generated on ${new Date().toLocaleDateString()}</div>
  </div>
</body>
</html>`;
  oebps.file('title.xhtml', titlePageContent);

  // Add Chapters
  chapters.forEach((chapter, index) => {
    const content = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(chapter.name)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h2>${escapeXml(chapter.name)}</h2>
  ${textToHtml(chapter.translatedText)}
</body>
</html>`;
    oebps.file(`chapter-${index + 1}.xhtml`, content);
  });

  // CONTENT.OPF (Manifest)
  const manifestItems = [
    '<item id="style" href="styles.css" media-type="text/css"/>',
    '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    ...chapters.map((_, i) => `<item id="ch${i + 1}" href="chapter-${i + 1}.xhtml" media-type="application/xhtml+xml"/>`)
  ].join('\n    ');

  const spineItems = [
    '<itemref idref="title"/>',
    ...chapters.map((_, i) => `<itemref idref="ch${i + 1}"/>`)
  ].join('\n    ');

  const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(project.name)}</dc:title>
    <dc:language>${project.targetLanguage === 'Inggris' ? 'en' : 'id'}</dc:language>
    <dc:identifier id="BookId" opf:scheme="UUID">${uuid}</dc:identifier>
    <dc:creator opf:role="aut">NovTL Studio</dc:creator>
    <dc:date>${timestamp}</dc:date>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`;
  oebps.file('content.opf', contentOpf);

  // TOC.NCX (Navigation for older readers)
  const navPoints = [
    `<navPoint id="navPoint-0" playOrder="0"><navLabel><text>Cover</text></navLabel><content src="title.xhtml"/></navPoint>`,
    ...chapters.map((ch, i) => `
    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(ch.name)}</text></navLabel>
      <content src="chapter-${i + 1}.xhtml"/>
    </navPoint>`)
  ].join('\n');

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(project.name)}</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`;
  oebps.file('toc.ncx', tocNcx);

  // Generate Blob
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
  return blob;
};
