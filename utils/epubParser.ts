
import JSZip from 'jszip';
import { EpubChapter } from '../types';

/**
 * Membersihkan HTML tag dari konten bab EPUB
 * Mengubah <p>, <div>, <br> menjadi baris baru agar format novel terjaga.
 */
const cleanHtmlText = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Hapus style dan script agar teks lebih bersih
    const scripts = doc.querySelectorAll('script, style');
    scripts.forEach(s => s.remove());

    // Ganti tag blok dengan baris baru untuk menjaga paragraf
    const blockTags = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'];
    blockTags.forEach(tag => {
        const elements = doc.querySelectorAll(tag);
        elements.forEach(el => {
            // Tambahkan marker baris baru setelah konten elemen blok
            el.innerHTML = el.innerHTML + '\n\n';
        });
    });

    return doc.body.textContent || "";
};

/**
 * Helper untuk normalisasi path file dalam zip
 * Menangani kasus path relatif sederhana
 */
const resolvePath = (base: string, relative: string): string => {
    // Jika relative path tidak dimulai dengan sesuatu yang aneh, gabungkan saja
    // Ini penyederhanaan, untuk full path resolution butuh library path
    const stack = base.split("/");
    const parts = relative.split("/");
    stack.pop(); // remove current file name (or empty string if dir)
    
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === ".") continue;
        if (parts[i] === "..") stack.pop();
        else stack.push(parts[i]);
    }
    return stack.join("/");
};

export const parseEpub = async (file: File): Promise<{ chapters: EpubChapter[], fileMap: Record<string, string> }> => {
    const zip = new JSZip();
    const content = await zip.loadAsync(file);

    // 1. Cari file container.xml untuk mengetahui lokasi file .opf
    const containerXml = await content.file("META-INF/container.xml")?.async("string");
    if (!containerXml) throw new Error("Invalid EPUB: container.xml missing");

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "text/xml");
    const rootPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
    if (!rootPath) throw new Error("Invalid EPUB: OPF path missing");

    // 2. Baca file .opf
    const opfContent = await content.file(rootPath)?.async("string");
    if (!opfContent) throw new Error("Invalid EPUB: OPF file missing");

    const opfDoc = parser.parseFromString(opfContent, "text/xml");
    const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item"));
    const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));

    // Tentukan direktori dasar OPF (misal: "OEBPS/")
    const opfDir = rootPath.includes('/') ? rootPath.substring(0, rootPath.lastIndexOf('/')) : '';
    
    // 3. Buat Peta File (ID -> Full Path di Zip)
    const idToHref: Record<string, string> = {};
    manifestItems.forEach(item => {
        const id = item.getAttribute("id");
        const href = item.getAttribute("href");
        if (id && href) {
            // Gabungkan dengan path direktori OPF
            const fullPath = opfDir ? `${opfDir}/${href}` : href;
            idToHref[id] = fullPath;
        }
    });

    // 4. Cari dan Parsing NCX (Table of Contents) untuk Judul Asli
    const titleMap: Record<string, string> = {}; // Mapping href -> Judul Bab
    
    try {
        // Coba cari item toc di manifest atau spine attribute
        const spineElement = opfDoc.querySelector("spine");
        const tocId = spineElement?.getAttribute("toc"); // EPUB 2 standard
        
        let tocHref = "";
        
        if (tocId && idToHref[tocId]) {
            tocHref = idToHref[tocId];
        } else {
            // Fallback: cari item dengan properti 'nav' (EPUB 3) atau ekstensi .ncx
            const ncxItem = manifestItems.find(i => 
                i.getAttribute("media-type") === "application/x-dtbncx+xml" || 
                i.getAttribute("href")?.endsWith(".ncx")
            );
            if (ncxItem) {
                const href = ncxItem.getAttribute("href");
                if (href) tocHref = opfDir ? `${opfDir}/${href}` : href;
            }
        }

        if (tocHref) {
            const ncxContent = await content.file(tocHref)?.async("string");
            if (ncxContent) {
                const ncxDoc = parser.parseFromString(ncxContent, "text/xml");
                const navPoints = ncxDoc.querySelectorAll("navPoint");
                
                navPoints.forEach(np => {
                    const label = np.querySelector("navLabel > text")?.textContent;
                    const src = np.querySelector("content")?.getAttribute("src");
                    
                    if (label && src) {
                        // Bersihkan src dari anchor (chapter.html#top -> chapter.html)
                        // Kita simpan full path relatif terhadap OPF root agar cocok dengan spine
                        
                        // NOTE: Path di NCX relatif terhadap file NCX itu sendiri. 
                        // Tapi seringkali NCX dan OPF ada di folder sama.
                        // Untuk keakuratan, kita anggap nama file-nya saja yang penting untuk matching.
                        const cleanSrc = src.split('#')[0]; 
                        titleMap[cleanSrc] = label.trim();
                    }
                });
            }
        }
    } catch (e) {
        console.warn("Failed to parse TOC, falling back to generic titles", e);
    }

    // 5. Bangun Daftar Bab berdasarkan Spine (Urutan Baca) + Judul dari NCX
    const chapters: EpubChapter[] = [];
    
    spineItems.forEach((item, index) => {
        const idref = item.getAttribute("idref");
        if (idref && idToHref[idref]) {
            const fullPath = idToHref[idref];
            // Ambil nama file saja untuk mencocokkan dengan map title (misal: chapter1.xhtml)
            const fileName = fullPath.split('/').pop() || "";
            
            // Cari judul di map. 
            // Coba match exact filename atau check decoding uri component
            let realTitle = titleMap[fileName] || titleMap[decodeURIComponent(fileName)];

            // Jika masih tidak ketemu, cek apakah ada key di titleMap yang mengandung filename ini
            if (!realTitle) {
                const foundKey = Object.keys(titleMap).find(k => k.endsWith(fileName));
                if (foundKey) realTitle = titleMap[foundKey];
            }

            chapters.push({
                id: idref,
                title: realTitle || `Chapter ${index + 1}`, // Gunakan judul asli atau fallback
                href: fullPath
            });
        }
    });

    return { chapters, fileMap: idToHref };
};

export const loadChapterText = async (zip: JSZip, path: string): Promise<string> => {
    const file = zip.file(path);
    if (!file) return "[Error: File not found inside EPUB]";
    
    const html = await file.async("string");
    
    // Ekstrak Title dari HTML itu sendiri jika ada (sebagai fallback kedua)
    // Kadang NCX tidak lengkap, tapi di dalam HTML ada <h1>Judul Bab</h1>
    let text = cleanHtmlText(html);
    text = text.replace(/\n\s+\n/g, '\n\n').trim(); 
    return text;
};
