import { pinyin } from 'pinyin-pro';

/**
 * 拼音搜索工具类
 * 提供中文拼音搜索和匹配功能
 */
export class PinyinSearch {

    /**
     * 获取文本的拼音表示
     * @param text 要转换的中文文本
     * @param options 转换选项
     * @returns 拼音字符串数组
     */
    static getPinyin(text: string): string[] {
        try {
            const result = pinyin(text, { toneType: 'none', type: 'array' });
            return Array.isArray(result) ? result : [result];
        } catch (error) {
            console.warn('Pinyin conversion error:', error);
            return [];
        }
    }

    /**
     * 获取拼音首字母
     * @param text 中文文本
     * @returns 拼音首字母字符串
     */
    static getPinyinInitials(text: string): string {
        const pinyinArray = this.getPinyin(text);
        return pinyinArray.map(py => py.charAt(0).toLowerCase()).join('');
    }

    /**
     * 检查文本是否包含拼音匹配
     * @param searchText 要搜索的文本
     * @param searchQuery 搜索查询（可以是中文、拼音或混合）
     * @returns 匹配结果
     */
    static matchPinyin(searchText: string | string[], searchQuery: string): PinyinMatchResult | null {
        if (!searchText || !searchQuery) return null;

        // 确保 searchText 是字符串
        const textStr = Array.isArray(searchText) ? searchText.join('') : searchText;

        // 直接中文匹配
        if (textStr.includes(searchQuery)) {
            return {
                matched: true,
                type: 'direct',
                pinyin: null,
                originalText: textStr,
                matchedIndices: this.findMatchIndices(textStr, searchQuery)
            };
        }

        // 拼音匹配
        const textPinyin = this.getPinyin(textStr).join(' ');
        const textPinyinNoSpace = this.getPinyin(textStr).join('');
        const textInitials = this.getPinyinInitials(textStr);

        // 完整拼音匹配（带空格）
        if (textPinyin.toLowerCase().includes(searchQuery.toLowerCase())) {
            return {
                matched: true,
                type: 'pinyin',
                pinyin: textPinyin,
                originalText: textStr,
                matchedIndices: this.findMatchIndices(textPinyin, searchQuery)
            };
        }

        // 完整拼音匹配（无空格）
        if (textPinyinNoSpace.toLowerCase().includes(searchQuery.toLowerCase())) {
            return {
                matched: true,
                type: 'pinyin',
                pinyin: textPinyinNoSpace,
                originalText: textStr,
                matchedIndices: this.findMatchIndices(textPinyinNoSpace, searchQuery)
            };
        }

        // 拼音首字母匹配
        if (textInitials.includes(searchQuery.toLowerCase())) {
            return {
                matched: true,
                type: 'initials',
                pinyin: textInitials,
                originalText: textStr,
                matchedIndices: this.findMatchIndices(textInitials, searchQuery)
            };
        }

        // 部分拼音匹配
        const queryParts = searchQuery.toLowerCase().split(/\s+/);
        for (const part of queryParts) {
            if (textPinyin.toLowerCase().includes(part)) {
                return {
                    matched: true,
                    type: 'partial-pinyin',
                    pinyin: textPinyin,
                    originalText: textStr,
                    matchedIndices: this.findMatchIndices(textPinyin, part)
                };
            }

            if (textInitials.includes(part)) {
                return {
                    matched: true,
                    type: 'partial-initials',
                    pinyin: textInitials,
                    originalText: textStr,
                    matchedIndices: this.findMatchIndices(textInitials, part)
                };
            }
        }

        return {
            matched: false,
            type: 'none',
            pinyin: null,
            originalText: textStr,
            matchedIndices: []
        };
    }

    /**
     * 创建拼音搜索的正则表达式
     * @param searchQuery 搜索查询
     * @returns 增强的正则表达式
     */
    static createPinyinRegex(searchQuery: string): RegExp {
        if (!searchQuery) return new RegExp('');

        // 转义特殊字符
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 检查是否包含中文字符
        const hasChinese = /[\u4e00-\u9fff]/.test(searchQuery);

        if (hasChinese) {
            // 包含中文，使用原有逻辑
            return new RegExp(escapedQuery, 'gi');
        }

        // 纯英文，可能是拼音
        const patterns = [escapedQuery];

        // 添加常见拼音变体（可选，根据需要）
        const pinyinVariants: { [key: string]: string[] } = {
            'zh': ['z', 'h'],
            'ch': ['c', 'h'],
            'sh': ['s', 'h'],
            'ang': ['a', 'n', 'g'],
            'eng': ['e', 'n', 'g'],
            'ing': ['i', 'n', 'g'],
            'ong': ['o', 'n', 'g'],
            'uang': ['u', 'a', 'n', 'g'],
            'iang': ['i', 'a', 'n', 'g'],
            'iong': ['i', 'o', 'n', 'g']
        };

        // 这里可以根据需要扩展更多模式
        return new RegExp(patterns.join('|'), 'gi');
    }

    /**
     * 检查是否为拼音查询
     * @param query 查询字符串
     * @returns 是否为拼音
     */
    static isPinyinQuery(query: string): boolean {
        // 简单检查：如果不包含中文字符，可能是拼音
        return !/[\u4e00-\u9fff]/.test(query) && /[a-zA-Z]/.test(query);
    }

    /**
     * 检查单字符拼音匹配（如 z 匹配支持、支等，q 匹配强、抢、墙等）
     * @param text 要搜索的文本
     * @param query 单字符拼音查询
     * @returns 是否匹配
     */
    static isSingleCharPinyinMatch(text: string, query: string): boolean {
        if (!query || query.length !== 1) return false;

        const queryLower = query.toLowerCase();
        const textLower = text.toLowerCase();

        // 首先检查是否包含该英文字符的直接匹配
        if (textLower.includes(queryLower)) {
            return true;
        }

        // 遍历文本中的每个字符，检查拼音首字母匹配
        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // 对于英文字符和数字，直接匹配已经在上面处理过了
            if (/[a-zA-Z0-9]/.test(char)) continue;

            try {
                const charPinyin = this.getPinyin(char);
                if (charPinyin.length > 0) {
                    // 检查每个拼音选项的首字母
                    for (const pinyin of charPinyin) {
                        const pinyinInitial = pinyin.charAt(0).toLowerCase();
                        // 检查拼音首字母是否匹配
                        if (pinyinInitial === queryLower) {
                            return true;
                        }
                    }
                }
            } catch (error) {
                // 忽略转换错误
            }
        }

        return false;
    }

    /**
     * 检查全拼匹配（如 zhichi 匹配支持）
     * @param text 要搜索的文本
     * @param query 全拼查询
     * @returns 是否匹配
     */
    static isFullPinyinMatch(text: string, query: string): boolean {
        if (!query || query.length < 2) return false;

        const queryLower = query.toLowerCase();

        // 尝试对文本进行拼音转换
        try {
            const textPinyinWithSpace = this.getPinyin(text).join(' ').toLowerCase();
            const textPinyinNoSpace = this.getPinyin(text).join('').toLowerCase();
            const textInitials = this.getPinyinInitials(text).toLowerCase();

            // 检查完整拼音（带空格）是否包含查询
            if (textPinyinWithSpace.includes(queryLower)) {
                return true;
            }

            // 检查完整拼音（无空格）是否包含查询
            if (textPinyinNoSpace.includes(queryLower)) {
                return true;
            }

            // 检查拼音首字母是否包含查询
            if (textInitials.includes(queryLower)) {
                return true;
            }

            // 检查拼音是否部分匹配
            const pinyinWords = textPinyinWithSpace.split(/\s+/);
            for (const word of pinyinWords) {
                if (word.startsWith(queryLower)) {
                    return true;
                }
            }

            // 检查无空格拼音的部分匹配
            for (let i = 0; i < textPinyinNoSpace.length - queryLower.length + 1; i++) {
                const substring = textPinyinNoSpace.substring(i, i + queryLower.length);
                if (substring === queryLower) {
                    return true;
                }
            }

        } catch (error) {
            // 忽略转换错误
        }

        return false;
    }

    /**
     * 增强的搜索匹配
     * @param text 要搜索的文本
     * @param queries 搜索查询数组
     * @returns 是否匹配
     */
    static enhancedMatch(text: string, queries: string[]): boolean {
        if (!text || !queries.length) return false;

        const textLower = text.toLowerCase();

        for (const query of queries) {
            if (!query) continue;

            // 直接文本匹配（包括单字符匹配）
            if (textLower.includes(query.toLowerCase())) {
                return true;
            }

            // 拼音匹配
            const matchResult = this.matchPinyin(text, query);
            if (matchResult && matchResult.matched) {
                return true;
            }

            // 增强的单字符拼音匹配
            if (this.isSingleCharPinyinMatch(text, query)) {
                return true;
            }

            // 增强的全拼匹配
            if (this.isFullPinyinMatch(text, query)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 查找匹配的索引位置
     * @param text 文本
     * @param query 查询
     * @returns 匹配的索引数组
     */
    private static findMatchIndices(text: string, query: string): number[] {
        const indices: number[] = [];
        const textLower = text.toLowerCase();
        const queryLower = query.toLowerCase();

        let index = textLower.indexOf(queryLower);
        while (index !== -1) {
            indices.push(index);
            index = textLower.indexOf(queryLower, index + 1);
        }

        return indices;
    }
}

/**
 * 拼音匹配结果接口
 */
export interface PinyinMatchResult {
    matched: boolean;
    type: 'direct' | 'pinyin' | 'initials' | 'partial-pinyin' | 'partial-initials' | 'enhanced' | 'none';
    pinyin: string | null;
    originalText: string;
    matchedIndices: number[];
}