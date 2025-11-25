class EPUBReaderPro {
    constructor() {
        this.currentBook = null;
        this.chapters = [];
        this.currentChapter = 0;
        this.currentPage = 1;
        this.totalPages = 0;
        this.wordsPerPage = 250;
        this.bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        
        this.initializeElements();
        this.bindEvents();
        this.applyTheme();
        this.loadSettings();
        this.renderBookmarks();
    }

    initializeElements() {
        this.elements = {
            fileInput: document.getElementById('fileInput'),
            openBtn: document.getElementById('openBtn'),
            themeBtn: document.getElementById('themeBtn'),
            menuBtn: document.getElementById('menuBtn'),
            closeSidebar: document.getElementById('closeSidebar'),
            bookmarkBtn: document.getElementById('bookmarkBtn'),
            sidebar: document.getElementById('sidebar'),
            toc: document.getElementById('toc'),
            bookmarksList: document.getElementById('bookmarksList'),
            bookInfo: document.getElementById('bookInfo'),
            bookContent: document.getElementById('bookContent'),
            pageNumber: document.getElementById('pageNumber'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            pageInfo: document.getElementById('pageInfo'),
            progressFill: document.getElementById('progressFill'),
            fontSizeSlider: document.getElementById('fontSizeSlider'),
            fontSizeValue: document.getElementById('fontSizeValue'),
            lineHeightSlider: document.getElementById('lineHeightSlider'),
            lineHeightValue: document.getElementById('lineHeightValue'),
            wordCount: document.getElementById('wordCount'),
            readingTime: document.getElementById('readingTime'),
            progress: document.getElementById('progress')
        };
    }

    bindEvents() {
        this.elements.openBtn.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.loadEPUB(e.target.files[0]));
        this.elements.themeBtn.addEventListener('click', () => this.toggleTheme());
        this.elements.menuBtn.addEventListener('click', () => this.toggleSidebar());
        this.elements.closeSidebar.addEventListener('click', () => this.toggleSidebar());
        this.elements.bookmarkBtn.addEventListener('click', () => this.toggleBookmark());
        this.elements.prevBtn.addEventListener('click', () => this.previousChapter());
        this.elements.nextBtn.addEventListener('click', () => this.nextChapter());
        
        this.elements.fontSizeSlider.addEventListener('input', (e) => this.updateFontSize(e.target.value));
        this.elements.lineHeightSlider.addEventListener('input', (e) => this.updateLineHeight(e.target.value));
        
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        window.addEventListener('resize', () => this.calculatePages());
    }

    async loadEPUB(file) {
        if (!file) return;

        try {
            const zip = new JSZip();
            const epub = await zip.loadAsync(file);
            
            const containerXML = await epub.file('META-INF/container.xml').async('text');
            const parser = new DOMParser();
            const containerDoc = parser.parseFromString(containerXML, 'text/xml');
            const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
            
            const opfContent = await epub.file(opfPath).async('text');
            const opfDoc = parser.parseFromString(opfContent, 'text/xml');
            
            const metadata = this.extractMetadata(opfDoc);
            const spine = this.extractSpine(opfDoc);
            const manifest = this.extractManifest(opfDoc);
            
            this.chapters = await this.loadChapters(epub, spine, manifest, opfPath);
            const toc = await this.extractTOC(epub, manifest, opfPath);
            
            this.currentBook = { metadata, chapters: this.chapters, toc };
            this.displayBook();
            
        } catch (error) {
            console.error('Error loading EPUB:', error);
            alert('Error loading EPUB file. Please try another file.');
        }
    }

    extractMetadata(opfDoc) {
        const metadata = {};
        const metadataEl = opfDoc.querySelector('metadata');
        
        metadata.title = metadataEl.querySelector('title')?.textContent || 'Unknown Title';
        metadata.creator = metadataEl.querySelector('creator')?.textContent || 'Unknown Author';
        metadata.language = metadataEl.querySelector('language')?.textContent || 'en';
        metadata.publisher = metadataEl.querySelector('publisher')?.textContent || '';
        
        return metadata;
    }

    extractSpine(opfDoc) {
        const spineItems = opfDoc.querySelectorAll('spine itemref');
        return Array.from(spineItems).map(item => item.getAttribute('idref'));
    }

    extractManifest(opfDoc) {
        const manifestItems = opfDoc.querySelectorAll('manifest item');
        const manifest = {};
        
        manifestItems.forEach(item => {
            manifest[item.getAttribute('id')] = {
                href: item.getAttribute('href'),
                mediaType: item.getAttribute('media-type')
            };
        });
        
        return manifest;
    }

    async loadChapters(epub, spine, manifest, opfPath) {
        const basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
        const chapters = [];
        
        for (const itemId of spine) {
            const item = manifest[itemId];
            if (item && item.mediaType === 'application/xhtml+xml') {
                const filePath = basePath + item.href;
                try {
                    const content = await epub.file(filePath).async('text');
                    chapters.push({
                        id: itemId,
                        title: this.extractChapterTitle(content),
                        content: this.processChapterContent(content),
                        href: item.href,
                        wordCount: this.countWords(content)
                    });
                } catch (error) {
                    console.warn(`Could not load chapter: ${filePath}`);
                }
            }
        }
        
        return chapters;
    }

    extractChapterTitle(content) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        const title = doc.querySelector('title')?.textContent || 
                     doc.querySelector('h1')?.textContent || 
                     doc.querySelector('h2')?.textContent || 
                     'Chapter';
        return title.trim();
    }

    processChapterContent(content) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        const body = doc.querySelector('body');
        
        if (body) {
            body.querySelectorAll('script').forEach(script => script.remove());
            return body.innerHTML;
        }
        
        return content;
    }

    countWords(content) {
        const text = content.replace(/<[^>]*>/g, '');
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }

    async extractTOC(epub, manifest, opfPath) {
        const ncxItem = Object.values(manifest).find(item => 
            item.mediaType === 'application/x-dtbncx+xml'
        );
        
        if (ncxItem) {
            const basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
            const ncxPath = basePath + ncxItem.href;
            
            try {
                const ncxContent = await epub.file(ncxPath).async('text');
                return this.parseNCX(ncxContent);
            } catch (error) {
                console.warn('Could not load NCX file');
            }
        }
        
        return this.chapters.map((chapter, index) => ({
            title: chapter.title,
            href: chapter.href,
            index: index
        }));
    }

    parseNCX(ncxContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(ncxContent, 'text/xml');
        const navPoints = doc.querySelectorAll('navPoint');
        
        return Array.from(navPoints).map((navPoint, index) => {
            const label = navPoint.querySelector('navLabel text')?.textContent || `Chapter ${index + 1}`;
            const src = navPoint.querySelector('content')?.getAttribute('src') || '';
            
            return {
                title: label.trim(),
                href: src,
                index: index
            };
        });
    }

    displayBook() {
        if (!this.currentBook) return;
        
        this.elements.bookInfo.innerHTML = `
            <div class="welcome-card">
                <h2>📖 ${this.currentBook.metadata.title}</h2>
                <p>by ${this.currentBook.metadata.creator}</p>
                <p>${this.chapters.length} chapters • ${this.getTotalWordCount()} words</p>
            </div>
        `;
        
        this.generateTOC();
        this.currentChapter = 0;
        this.displayChapter();
        this.updateNavigation();
        this.calculatePages();
    }

    getTotalWordCount() {
        return this.chapters.reduce((total, chapter) => total + chapter.wordCount, 0);
    }

    generateTOC() {
        this.elements.toc.innerHTML = '';
        
        this.currentBook.toc.forEach((item, index) => {
            const tocItem = document.createElement('div');
            tocItem.className = 'toc-item';
            tocItem.innerHTML = `
                <div style="font-weight: 500;">${item.title}</div>
                <div style="font-size: 0.75rem; opacity: 0.7;">${this.chapters[index]?.wordCount || 0} words</div>
            `;
            tocItem.addEventListener('click', () => {
                this.currentChapter = index;
                this.displayChapter();
                this.updateNavigation();
                this.calculatePages();
                this.toggleSidebar();
            });
            this.elements.toc.appendChild(tocItem);
        });
    }

    displayChapter() {
        if (!this.chapters[this.currentChapter]) return;
        
        const chapter = this.chapters[this.currentChapter];
        this.elements.bookContent.innerHTML = `
            <div id="pageNumber" class="page-number">Page ${this.currentPage}</div>
            ${chapter.content}
        `;
        this.elements.bookContent.style.display = 'block';
        this.elements.bookInfo.style.display = 'none';
        
        this.elements.toc.querySelectorAll('.toc-item').forEach((item, index) => {
            item.classList.toggle('active', index === this.currentChapter);
        });
        
        this.updateReadingStats();
        this.elements.bookContent.scrollTop = 0;
        this.calculatePages();
    }

    calculatePages() {
        if (!this.chapters[this.currentChapter]) return;
        
        const chapter = this.chapters[this.currentChapter];
        const wordsInChapter = chapter.wordCount;
        this.totalPages = Math.ceil(wordsInChapter / this.wordsPerPage);
        this.currentPage = 1;
        
        this.updatePageNumber();
    }

    updatePageNumber() {
        const pageNumberEl = document.getElementById('pageNumber');
        if (pageNumberEl) {
            pageNumberEl.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
        }
    }

    updateReadingStats() {
        const chapter = this.chapters[this.currentChapter];
        const totalWords = this.getTotalWordCount();
        const wordsRead = this.chapters.slice(0, this.currentChapter).reduce((sum, ch) => sum + ch.wordCount, 0);
        const progressPercent = Math.round((wordsRead / totalWords) * 100);
        const readingTimeMinutes = Math.ceil(chapter.wordCount / 200);
        
        this.elements.wordCount.textContent = `${chapter.wordCount} words`;
        this.elements.readingTime.textContent = `${readingTimeMinutes} min read`;
        this.elements.progress.textContent = `${progressPercent}% complete`;
        this.elements.progressFill.style.width = `${progressPercent}%`;
    }

    updateNavigation() {
        this.elements.prevBtn.disabled = this.currentChapter === 0;
        this.elements.nextBtn.disabled = this.currentChapter === this.chapters.length - 1;
        this.elements.pageInfo.textContent = `Chapter ${this.currentChapter + 1} of ${this.chapters.length}`;
        
        this.updateBookmarkButton();
    }

    updateBookmarkButton() {
        const isBookmarked = this.bookmarks.some(b => 
            b.chapter === this.currentChapter && b.book === this.currentBook?.metadata.title
        );
        this.elements.bookmarkBtn.classList.toggle('active', isBookmarked);
    }

    toggleBookmark() {
        if (!this.currentBook) return;
        
        const bookmark = {
            book: this.currentBook.metadata.title,
            chapter: this.currentChapter,
            chapterTitle: this.chapters[this.currentChapter].title,
            timestamp: new Date().toISOString()
        };
        
        const existingIndex = this.bookmarks.findIndex(b => 
            b.chapter === bookmark.chapter && b.book === bookmark.book
        );
        
        if (existingIndex >= 0) {
            this.bookmarks.splice(existingIndex, 1);
        } else {
            this.bookmarks.push(bookmark);
        }
        
        localStorage.setItem('bookmarks', JSON.stringify(this.bookmarks));
        this.renderBookmarks();
        this.updateBookmarkButton();
    }

    renderBookmarks() {
        this.elements.bookmarksList.innerHTML = '';
        
        this.bookmarks.forEach((bookmark, index) => {
            const bookmarkEl = document.createElement('div');
            bookmarkEl.className = 'bookmark-item';
            bookmarkEl.innerHTML = `
                <div style="font-weight: 500; font-size: 0.875rem;">${bookmark.chapterTitle}</div>
                <div style="font-size: 0.75rem; opacity: 0.7;">${new Date(bookmark.timestamp).toLocaleDateString()}</div>
            `;
            bookmarkEl.addEventListener('click', () => {
                if (this.currentBook && bookmark.book === this.currentBook.metadata.title) {
                    this.currentChapter = bookmark.chapter;
                    this.displayChapter();
                    this.updateNavigation();
                    this.calculatePages();
                    this.toggleSidebar();
                }
            });
            this.elements.bookmarksList.appendChild(bookmarkEl);
        });
    }

    previousChapter() {
        if (this.currentChapter > 0) {
            this.currentChapter--;
            this.displayChapter();
            this.updateNavigation();
            this.calculatePages();
        }
    }

    nextChapter() {
        if (this.currentChapter < this.chapters.length - 1) {
            this.currentChapter++;
            this.displayChapter();
            this.updateNavigation();
            this.calculatePages();
        }
    }

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        this.applyTheme();
        localStorage.setItem('darkMode', this.isDarkMode);
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');
        this.elements.themeBtn.textContent = this.isDarkMode ? '☀️' : '🌙';
    }

    toggleSidebar() {
        this.elements.sidebar.classList.toggle('open');
    }

    updateFontSize(size) {
        this.elements.bookContent.style.fontSize = `${size}px`;
        this.elements.fontSizeValue.textContent = `${size}px`;
        localStorage.setItem('fontSize', size);
        setTimeout(() => this.calculatePages(), 100);
    }

    updateLineHeight(height) {
        this.elements.bookContent.style.lineHeight = height;
        this.elements.lineHeightValue.textContent = height;
        localStorage.setItem('lineHeight', height);
        setTimeout(() => this.calculatePages(), 100);
    }

    loadSettings() {
        const fontSize = localStorage.getItem('fontSize') || '16';
        const lineHeight = localStorage.getItem('lineHeight') || '1.6';
        
        this.elements.fontSizeSlider.value = fontSize;
        this.elements.lineHeightSlider.value = lineHeight;
        this.updateFontSize(fontSize);
        this.updateLineHeight(lineHeight);
    }

    handleKeyboard(e) {
        if (!this.currentBook) return;
        
        switch(e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.previousChapter();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.nextChapter();
                break;
            case 'Escape':
                if (this.elements.sidebar.classList.contains('open')) {
                    this.toggleSidebar();
                }
                break;
            case 'b':
            case 'B':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleBookmark();
                }
                break;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new EPUBReaderPro();
});