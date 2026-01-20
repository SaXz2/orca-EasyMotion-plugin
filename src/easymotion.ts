import { PinyinSearch, PinyinMatchResult } from "./pinyin-search";

export class EasyMotionManager {
    private hints: Hint[] = [];
    private inputBuffer = '';
    private active = false;
    private waitingForInput = false;
    private container: HTMLElement | null = null;
    private styleElement: HTMLStyleElement | null = null;
    private searchBar: HTMLElement | null = null;
    private targetKeywords: string[] = [];
    private characters = 'qwerasdfzxcv';
    private savedRange: Range | null = null;
    private lastAltPressTime = 0;
    private enablePinyinSearch = true; // 启用拼音搜索

    private boundHandleKeyDown: (e: KeyboardEvent) => void;
    private boundAutoDismiss: () => void;
    private boundMouseDown: (e: MouseEvent) => void;

    constructor() {
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundAutoDismiss = this.autoDismiss.bind(this);
        this.boundMouseDown = this.handleMouseDown.bind(this);
    }

    init() {
        window.addEventListener('keydown', this.boundHandleKeyDown, true);
        window.addEventListener('mousedown', this.boundMouseDown, true);
        this.injectStyles();
        console.log("✅ Orca EasyMotion 已就绪");
    }

    destroy() {
        this.deactivate();
        window.removeEventListener('keydown', this.boundHandleKeyDown, true);
        window.removeEventListener('mousedown', this.boundMouseDown, true);
        if (this.styleElement) this.styleElement.remove();
        const oldToast = document.querySelector('.js-easymotion-toast');
        if (oldToast) oldToast.remove();
    }

    private handleMouseDown(e: MouseEvent) {
        if (!this.active && !this.waitingForInput) return;
        if (this.searchBar && this.searchBar.contains(e.target as Node)) return;
        this.savedRange = null;
        this.deactivate();
    }

    private handleKeyDown(e: KeyboardEvent) {
        if (e.repeat) return;

        // 双击 Alt 检测逻辑
        if (e.key === 'Alt') {
            const now = Date.now();
            if (now - this.lastAltPressTime < 300) {
                e.preventDefault();
                if (this.active || this.waitingForInput) {
                    this.deactivate();
                } else {
                    this.openSearchBar();
                }
                this.lastAltPressTime = 0;
                return;
            }
            this.lastAltPressTime = now;
            return;
        }

        if (!this.active && !this.waitingForInput) {
            return;
        }

        // 搜索框状态
        if (this.waitingForInput) {
            if (e.key === 'Escape') {
                this.deactivate();
                e.stopPropagation();
            }
            return;
        }

        // 激活状态
        if (this.active) {
            e.preventDefault();
            e.stopImmediatePropagation();

            const key = e.key.toLowerCase();

            if (key === 'escape') {
                this.deactivate();
                return;
            }

            if (key === 'backspace') {
                if (this.inputBuffer.length > 0) {
                    this.inputBuffer = this.inputBuffer.slice(0, -1);
                    this.updateVisuals();
                }
                return;
            }

            if (this.characters.includes(key)) {
                this.checkHints(key);
            }
        }
    }

    private openSearchBar() {
        const sel = window.getSelection();
        let selectedText = '';
        if (sel && !sel.isCollapsed) {
            selectedText = sel.toString().trim();
        }

        if (sel && sel.rangeCount > 0) {
            this.savedRange = sel.getRangeAt(0).cloneRange();
        } else {
            this.savedRange = null;
        }

        this.waitingForInput = true;

        this.searchBar = document.createElement('div');
        this.searchBar.id = 'js-easymotion-bar';
        this.searchBar.innerHTML = `
            <div class="em-icon">🔍</div>
            <input type="text" class="em-input" placeholder="输入搜索词 (支持中文、拼音，空格分隔)..." />
            <div class="em-badge">Enter</div>
        `;
        document.body.appendChild(this.searchBar);

        const input = this.searchBar.querySelector('input') as HTMLInputElement;

        if (selectedText) {
            input.value = selectedText;
            input.select();
        }

        input.focus();
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Control' || e.key === 'Alt') return;

            if (e.key === 'Enter') {
                e.preventDefault();
                const val = input.value.trim();
                if (val) {
                    this.targetKeywords = val.split(/\s+/);
                    this.closeSearchBar();
                    this.activate();
                } else {
                    this.deactivate();
                }
            } else if (e.key === 'Escape') {
                this.deactivate();
            }
        });
    }

    private closeSearchBar() {
        this.waitingForInput = false;
        if (this.searchBar) {
            this.searchBar.remove();
            this.searchBar = null;
        }
    }

    private activate() {
        this.active = true;
        this.inputBuffer = '';

        let matches = this.findVisibleMatches(this.targetKeywords);
        matches = this.removeDuplicateMatches(matches);

        if (matches.length === 0) {
            this.showToast(`未找到: ${this.targetKeywords.join(', ')}`);
            this.deactivate();
            return;
        }

        if (matches.length === 1) {
            const match = matches[0];
            this.jumpTo(match.node, match.index, match.length);
            this.flashMatch(match);
            this.deactivate();
            return;
        }

        const labels = this.generateLabels(matches.length);
        this.renderHints(matches, labels);

        window.addEventListener('scroll', this.boundAutoDismiss, { capture: true, passive: true });
        window.addEventListener('wheel', this.boundAutoDismiss, { capture: true, passive: true });
    }

    private flashMatch(match: Match | Hint) {
        const flashContainer = document.createElement('div');
        flashContainer.style.cssText = `
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            z-index: 2147483645; pointer-events: none; overflow: hidden;
        `;
        document.body.appendChild(flashContainer);

        match.allRects.forEach(r => {
            const ripple = document.createElement('div');
            ripple.className = 'js-easymotion-ripple';
            ripple.style.top = `${r.top + window.scrollY}px`;
            ripple.style.left = `${r.left + window.scrollX}px`;
            ripple.style.width = `${r.width}px`;
            ripple.style.height = `${r.height}px`;
            flashContainer.appendChild(ripple);
        });

        // 如果是拼音匹配，显示提示
        if ('pinyinMatch' in match && match.pinyinMatch && match.pinyinMatch.matched) {
            this.showToast(`拼音匹配: ${match.pinyinMatch.type}`);
        }

        setTimeout(() => {
            flashContainer.remove();
        }, 1500);
    }

    private renderHints(matches: Match[], labels: string[]) {
        this.container = document.createElement('div');
        this.container.id = 'js-easymotion-container';
        document.body.appendChild(this.container);

        const newHints: Hint[] = [];

        matches.forEach((match, i) => {
            const label = labels[i];
            if (!label) return;

            match.allRects.forEach(r => {
                const highlight = document.createElement('div');
                highlight.className = 'js-easymotion-highlight';
                highlight.style.top = `${r.top + window.scrollY}px`;
                highlight.style.left = `${r.left + window.scrollX}px`;
                highlight.style.width = `${r.width}px`;
                highlight.style.height = `${r.height}px`;
                this.container!.appendChild(highlight);
            });

            const marker = document.createElement('div');
            marker.className = 'js-easymotion-marker';
            marker.innerText = label.toUpperCase();

            const top = match.rect.top + window.scrollY;
            const left = match.rect.left + (match.rect.width / 2) + window.scrollX;

            marker.style.top = `${top}px`;
            marker.style.left = `${left}px`;

            this.container!.appendChild(marker);

            newHints.push({
                label: label,
                node: match.node,
                index: match.index,
                length: match.length,
                marker: marker,
                top: top,
                left: left,
                width: marker.offsetWidth,
                height: marker.offsetHeight,
                allRects: match.allRects
            });
        });

        this.hints = newHints;
        this.fixOverlaps();
    }

    private fixOverlaps() {
        this.hints.sort((a, b) => {
            if (Math.abs(a.top - b.top) > 5) return a.top - b.top;
            return a.left - b.left;
        });

        for (let i = 0; i < this.hints.length; i++) {
            const current = this.hints[i];
            for (let j = 0; j < i; j++) {
                const prev = this.hints[j];
                const dist = Math.abs(current.left - prev.left);
                const sameLine = Math.abs(current.top - prev.top) < 15;
                if (sameLine && dist < 20) {
                    current.marker.style.marginTop = '-25px';
                    current.marker.style.marginLeft = '10px';
                    current.marker.style.zIndex = '2147483650';
                }
            }
        }
    }

    private checkHints(newKey: string) {
        const nextBuffer = this.inputBuffer + newKey;
        const match = this.hints.find(h => h.label === nextBuffer);
        const possible = this.hints.filter(h => h.label.startsWith(nextBuffer));

        if (match) {
            this.jumpTo(match.node, match.index, match.length);
            this.flashMatch(match);
            this.deactivate();
        } else if (possible.length > 0) {
            this.inputBuffer = nextBuffer;
            this.updateVisuals();
        }
    }

    private jumpTo(node: Text, index: number, length: number) {
        this.savedRange = null;
        const sel = window.getSelection();
        if (!sel) return;

        const range = document.createRange();

        let specialElement = node.parentElement ?
            (node.parentElement.closest('.orca-inline-r-content') ||
             node.parentElement.closest('.orca-inline-l-text')) : null;

        const insertBtn = node.parentElement ?
            (node.parentElement.closest('.orca-insert-top') ||
             node.parentElement.closest('.orca-insert-bottom')) : null;

        if (insertBtn) {
            range.selectNodeContents(insertBtn);
        } else if (specialElement) {
            const nonEditableWrapper = specialElement.closest('[contenteditable="false"]');
            if (nonEditableWrapper && nonEditableWrapper.contains(specialElement)) {
                specialElement = nonEditableWrapper;
            }

            const nextSibling = specialElement.nextSibling;
            if (nextSibling && nextSibling.nodeType === 3) {
                range.setStart(nextSibling as Text, 0);
                range.setEnd(nextSibling as Text, 0);
            } else {
                range.setStartAfter(specialElement);
                range.setEndAfter(specialElement);
            }
        } else {
            range.setStart(node, index + length);
            range.setEnd(node, index + length);
        }

        sel.removeAllRanges();
        sel.addRange(range);

        let focusTarget = specialElement || node;
        let parent = focusTarget.parentElement;
        while(parent && !parent.isContentEditable && !parent.classList.contains('orca-layout-main')) {
            parent = parent.parentElement;
        }
        if (parent) parent.focus();
    }

    private deactivate() {
        this.active = false;
        this.waitingForInput = false;
        this.closeSearchBar();

        if (this.container) {
            this.container.remove();
            this.container = null;
        }

        this.hints = [];
        window.removeEventListener('scroll', this.boundAutoDismiss, { capture: true });
        window.removeEventListener('wheel', this.boundAutoDismiss, { capture: true });

        if (this.savedRange) {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(this.savedRange);
                let node = this.savedRange.commonAncestorContainer;
                if (node.nodeType === 3 && node.parentElement) {
                    node = node.parentElement;
                }
                const editContainer = (node as Element).closest('[contenteditable="true"]') ||
                                     (node as Element).closest('.orca-layout-main');
                if (editContainer) (editContainer as HTMLElement).focus();
            }
            this.savedRange = null;
        }
    }

    private autoDismiss() {
        if (this.active) this.deactivate();
    }

    private removeDuplicateMatches(matches: Match[]): Match[] {
        const uniqueMatches: Match[] = [];
        matches.forEach(current => {
            const isDuplicate = uniqueMatches.some(existing => {
                const dx = Math.abs(current.rect.left - existing.rect.left);
                const dy = Math.abs(current.rect.top - existing.rect.top);
                return dx < 5 && dy < 5;
            });
            if (!isDuplicate) uniqueMatches.push(current);
        });
        return uniqueMatches;
    }

    private findVisibleMatches(keywords: string[]): Match[] {
        const matches: Match[] = [];
        const root = document.querySelector('.orca-layout-main') || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        const viewportBottom = window.innerHeight;

        // 如果启用拼音搜索，使用增强的搜索方法
        if (this.enablePinyinSearch) {
            return this.findVisibleMatchesWithPinyin(keywords);
        }

        // 传统搜索方式（备用）
        const escapedKeywords = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = escapedKeywords.join('|');
        const regex = new RegExp(pattern, 'gi');

        while ((node = walker.nextNode() as Text)) {
            const parent = node.parentElement;
            if (!parent) continue;

            // 排除标签区域
            if (parent.closest('.orca-tags')) {
                continue;
            }

            const isInsertBtn = parent.closest('.orca-insert-top') ||
                                parent.closest('.orca-insert-bottom');

            let container = null;
            if (!isInsertBtn) {
                container = parent.closest('.orca-repr-text-content') ||
                            parent.closest('.orca-repr-text') ||
                            parent.closest('.orca-repr') ||
                            parent.closest('.orca-inline-r-content') ||
                            parent.closest('.orca-inline-l-text');
            }

            if (!container && !isInsertBtn) continue;

            const text = node.nodeValue;
            if (!text || !regex.test(text)) {
                regex.lastIndex = 0;
                continue;
            }
            regex.lastIndex = 0;

            const parentRect = parent.getBoundingClientRect();
            if (parentRect.bottom < 0 || parentRect.top > viewportBottom) continue;

            let match;
            while ((match = regex.exec(text)) !== null) {
                const range = document.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                const rects = range.getClientRects();
                if (rects.length > 0) {
                    const rect = rects[0];
                    if (rect.top >= 0 && rect.top <= viewportBottom &&
                        rect.left >= 0 && rect.left <= window.innerWidth) {
                        matches.push({
                            node: node,
                            index: match.index,
                            length: match[0].length,
                            rect: rect,
                            allRects: Array.from(rects)
                        });
                    }
                }
            }
            if (matches.length > 300) break;
        }
        return matches;
    }

    /**
     * 查找增强匹配的索引位置（用于单字符和全拼匹配）
     * @param text 文本
     * @param query 查询
     * @returns 匹配的索引数组
     */
    private findEnhancedMatchIndices(text: string, query: string): number[] {
        const indices: number[] = [];
        const queryLower = query.toLowerCase();

        // 首先检查直接文本匹配（这是最重要的！）
        if (text.toLowerCase().includes(queryLower)) {
            let index = text.toLowerCase().indexOf(queryLower);
            while (index !== -1) {
                // 确保索引在有效范围内
                if (index >= 0 && index < text.length) {
                    indices.push(index);
                }
                index = text.toLowerCase().indexOf(queryLower, index + 1);
            }
        }

        // 对于单字符，优先返回直接匹配的结果
        if (query.length === 1 && indices.length > 0) {
            // 过滤并确保所有索引都在有效范围内
            return indices.filter(index => index >= 0 && index < text.length);
        }

        // 单字符拼音匹配
        if (query.length === 1) {
            for (let i = 0; i < text.length; i++) {
                const char = text[i];

                // 如果是英文字符或数字，直接匹配已经在上面处理过了
                if (/[a-zA-Z0-9]/.test(char)) {
                    continue; // 已经在直接匹配中处理
                }

                try {
                    const charPinyin = PinyinSearch.getPinyin(char);
                    if (charPinyin.length > 0) {
                        const pinyinInitial = charPinyin[0].toLowerCase();
                        if (pinyinInitial.startsWith(queryLower)) {
                            indices.push(i);
                        }
                    }
                } catch (error) {
                    // 忽略转换错误
                }
            }
        } else {
            // 全拼匹配 - 谨慎处理，避免索引越界
            try {
                const textPinyinWithSpace = PinyinSearch.getPinyin(text).join(' ').toLowerCase();
                const textPinyinNoSpace = PinyinSearch.getPinyin(text).join('').toLowerCase();
                const textInitials = PinyinSearch.getPinyinInitials(text).toLowerCase();

                // 查找拼音到文本字符的映射（简化版本）
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    if (/[a-zA-Z0-9]/.test(char)) continue; // 跳过英文字符

                    try {
                        const charPinyin = PinyinSearch.getPinyin(char);
                        const charPinyinStr = charPinyin.join('').toLowerCase();
                        const charInitial = charPinyin[0] ? charPinyin[0].charAt(0).toLowerCase() : '';

                        // 检查是否匹配查询
                        if (charPinyinStr.includes(queryLower) ||
                            charInitial === queryLower ||
                            charPinyin.join(' ').toLowerCase().includes(queryLower)) {
                            if (i >= 0 && i < text.length) {
                                indices.push(i);
                            }
                        }
                    } catch (error) {
                        // 忽略转换错误
                    }
                }

            } catch (error) {
                // 忽略转换错误
            }
        }

        // 去重并过滤有效索引
        return [...new Set(indices)].filter(index => index >= 0 && index < text.length).sort((a, b) => a - b);
    }

    /**
     * 支持拼音的搜索匹配方法
     * @param keywords 搜索关键词
     * @returns 匹配结果数组
     */
    private findVisibleMatchesWithPinyin(keywords: string[]): Match[] {
        const matches: Match[] = [];
        const root = document.querySelector('.orca-layout-main') || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        const viewportBottom = window.innerHeight;

        while ((node = walker.nextNode() as Text)) {
            const parent = node.parentElement;
            if (!parent) continue;

            // 排除标签区域
            if (parent.closest('.orca-tags')) {
                continue;
            }

            const isInsertBtn = parent.closest('.orca-insert-top') ||
                                parent.closest('.orca-insert-bottom');

            let container = null;
            if (!isInsertBtn) {
                container = parent.closest('.orca-repr-text-content') ||
                            parent.closest('.orca-repr-text') ||
                            parent.closest('.orca-repr') ||
                            parent.closest('.orca-inline-r-content') ||
                            parent.closest('.orca-inline-l-text');
            }

            if (!container && !isInsertBtn) continue;

            const text = node.nodeValue;
            if (!text) continue;

            // 使用拼音搜索增强匹配
            if (PinyinSearch.enhancedMatch(text, keywords)) {
                const parentRect = parent.getBoundingClientRect();
                if (parentRect.bottom < 0 || parentRect.top > viewportBottom) continue;

                // 为每个匹配项创建范围
                for (const keyword of keywords) {
                    if (!keyword) continue;

                    // 优先处理直接匹配（对单字符特别重要）
                    const textLower = text.toLowerCase();
                    const keywordLower = keyword.toLowerCase();

                    // 直接文本匹配
                    if (textLower.includes(keywordLower)) {
                        let index = textLower.indexOf(keywordLower);
                        while (index !== -1) {
                            // 边界检查：确保索引在有效范围内
                            if (index >= 0 && index + keyword.length <= text.length) {
                                const range = document.createRange();
                                range.setStart(node, index);
                                range.setEnd(node, index + keyword.length);
                                const rects = range.getClientRects();

                                if (rects.length > 0) {
                                    const rect = rects[0];
                                    if (rect.top >= 0 && rect.top <= viewportBottom &&
                                        rect.left >= 0 && rect.left <= window.innerWidth) {
                                        matches.push({
                                            node: node,
                                            index: index,
                                            length: keyword.length,
                                            rect: rect,
                                            allRects: Array.from(rects),
                                            pinyinMatch: {
                                                matched: true,
                                                type: 'direct',
                                                pinyin: null,
                                                originalText: text,
                                                matchedIndices: [index]
                                            }
                                        });
                                    }
                                }
                            } else {
                                console.warn(`⚠️ 索引超出范围: ${index} + ${keyword.length} > ${text.length}`);
                            }

                            index = textLower.indexOf(keywordLower, index + 1);
                        }
                        continue; // 直接匹配成功，跳过后续复杂逻辑
                    }

                    // 如果直接匹配失败，尝试拼音匹配
                    const matchResult = PinyinSearch.matchPinyin(text, keyword);
                    if (matchResult && matchResult.matched && matchResult.matchedIndices.length > 0) {
                        // 找到所有匹配的位置
                        const matchedIndices = matchResult.matchedIndices;

                        for (const matchIndex of matchedIndices) {
                            // 边界检查：确保索引在有效范围内
                            if (matchIndex >= 0 && matchIndex < text.length) {
                                const endPosition = Math.min(matchIndex + keyword.length, text.length);

                                const range = document.createRange();
                                range.setStart(node, matchIndex);
                                range.setEnd(node, endPosition);
                                const rects = range.getClientRects();

                                if (rects.length > 0) {
                                    const rect = rects[0];
                                    if (rect.top >= 0 && rect.top <= viewportBottom &&
                                        rect.left >= 0 && rect.left <= window.innerWidth) {
                                        matches.push({
                                            node: node,
                                            index: matchIndex,
                                            length: endPosition - matchIndex,
                                            rect: rect,
                                            allRects: Array.from(rects),
                                            pinyinMatch: matchResult // 添加拼音匹配信息
                                        });
                                    }
                                }
                            } else {
                                console.warn(`⚠️ 拼音索引超出范围: ${matchIndex} >= ${text.length}`);
                            }
                        }
                        continue; // 拼音匹配成功，跳过增强匹配
                    }

                    // 最后尝试增强匹配（主要用于特殊情况）
                    const enhancedMatchIndices = this.findEnhancedMatchIndices(text, keyword);
                    for (const matchIndex of enhancedMatchIndices) {
                        // 确定匹配长度
                        const matchLength = Math.min(keyword.length, text.length - matchIndex);

                        // 确保匹配位置在有效范围内
                        const endPosition = Math.min(matchIndex + matchLength, text.length);

                        const range = document.createRange();
                        range.setStart(node, matchIndex);
                        range.setEnd(node, endPosition);
                        const rects = range.getClientRects();

                        if (rects.length > 0) {
                            const rect = rects[0];
                            if (rect.top >= 0 && rect.top <= viewportBottom &&
                                rect.left >= 0 && rect.left <= window.innerWidth) {
                                matches.push({
                                    node: node,
                                    index: matchIndex,
                                    length: matchLength,
                                    rect: rect,
                                    allRects: Array.from(rects),
                                    pinyinMatch: {
                                        matched: true,
                                        type: 'enhanced',
                                        pinyin: keyword,
                                        originalText: text,
                                        matchedIndices: [matchIndex]
                                    }
                                });
                            }
                        }
                    }
                }
            }
            if (matches.length > 300) break;
        }
        return matches;
    }

    private showToast(message: string) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8); color: white; padding: 12px 24px;
            border-radius: 8px; font-size: 14px; z-index: 2147483647;
            transition: opacity 0.5s;
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 1500);
    }

    private generateLabels(count: number): string[] {
        const labels: string[] = [];
        const chars = this.characters;
        
        if (count <= chars.length) {
            for (let i = 0; i < count; i++) {
                labels.push(chars[i]);
            }
        } else {
            for (let i = 0; i < count; i++) {
                const first = Math.floor(i / chars.length);
                const second = i % chars.length;
                labels.push(chars[first] + chars[second]);
            }
        }
        
        return labels;
    }

    private updateVisuals() {
        this.hints.forEach(hint => {
            const isMatch = hint.label.startsWith(this.inputBuffer);
            const isDimmed = !isMatch;
            hint.marker.style.opacity = isDimmed ? '0.3' : '1';
            hint.marker.style.transform = isDimmed ? 'scale(0.8)' : 'scale(1)';
        });
    }

    private injectStyles() {
        this.styleElement = document.createElement('style');
        this.styleElement.textContent = `
            #js-easymotion-bar {
                position: fixed;
                top: 20%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(30, 30, 30, 0.95); backdrop-filter: blur(10px);
                padding: 12px 16px; border-radius: 12px;
                box-shadow: 0 15px 40px rgba(0,0,0,0.4);
                z-index: 2147483647; display: flex; align-items: center;
                font-family: sans-serif; min-width: 360px;
            }
            .em-icon { margin-right: 12px; color: #aaa; }
            .em-input {
                border: none; outline: none; font-size: 18px; width: 100%;
                color: #fff; background: transparent;
            }
            .em-badge {
                background: rgba(255,255,255,0.15); color: #ccc;
                padding: 2px 6px; border-radius: 4px; font-size: 11px;
            }
            #js-easymotion-container {
                position: absolute; top: 0; left: 0;
                z-index: 2147483647; pointer-events: none;
            }

            .js-easymotion-highlight {
                position: absolute;
                background-color: rgba(255, 235, 59, 0.5);
                border-bottom: 2px solid #ffca28; border-radius: 2px;
                z-index: 2147483646; mix-blend-mode: multiply;
            }

            .js-easymotion-ripple {
                position: absolute;
                background-color: rgba(255, 152, 0, 0.5);
                border-radius: 4px;
                z-index: 2147483645;
                animation: em-ripple-long 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
            }
            @keyframes em-ripple-long {
                0% { transform: scale(1); opacity: 0.8;
                    box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.7); }
                30% { opacity: 0.6; }
                100% { transform: scale(1.4); opacity: 0;
                    box-shadow: 0 0 30px 15px rgba(255, 152, 0, 0); }
            }

            .js-easymotion-marker {
                position: absolute;
                background: linear-gradient(135deg, #ff4d4f, #d9363e);
                color: white; border-radius: 4px; padding: 1px 5px;
                font-family: monospace; font-size: 12px; font-weight: 700;
                line-height: 14px; min-width: 14px; text-align: center;
                box-shadow: 0 3px 8px rgba(0,0,0,0.3);
                z-index: 2147483648; white-space: nowrap;
                transform: translate(-50%, -120%);
                transition: top 0.1s ease-out, left 0.1s ease-out;
            }
            .js-easymotion-marker.dimmed {
                opacity: 0.1; filter: grayscale(1);
            }
            .js-easymotion-marker.matched {
                transform: translate(-50%, -120%) scale(1.3);
                box-shadow: 0 0 12px #ff4d4f; z-index: 2147483649;
            }
            .js-easymotion-toast {
                position: fixed;
                bottom: 60px; left: 50%; transform: translateX(-50%);
                background: rgba(30, 30, 30, 0.9); color: white;
                padding: 10px 24px; border-radius: 30px; font-size: 14px;
                z-index: 2147483647; pointer-events: none;
                transition: opacity 0.5s;
            }
        `;
        document.head.appendChild(this.styleElement);
    }
}

interface Match {
    node: Text;
    index: number;
    length: number;
    rect: DOMRect;
    allRects: DOMRect[];
    pinyinMatch?: PinyinMatchResult;
}

interface Hint {
    label: string;
    node: Text;
    index: number;
    length: number;
    marker: HTMLElement;
    top: number;
    left: number;
    width: number;
    height: number;
    allRects: DOMRect[];
}