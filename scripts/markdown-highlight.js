/* global hexo */
'use strict';

// Extend the Markdown parser so code, links and HTML attributes stay intact.
hexo.extend.filter.register('marked:extensions', function (extensions) {
  extensions.push({
    name: 'highlight',
    level: 'inline',
    start(src) {
      return src.indexOf('==');
    },
    tokenizer(src) {
      if (this.lexer.state.inRawBlock) return;

      const match = /^==(?!=|\s)((?:\\[^\r\n]|[^\\\r\n])+?)==(?!=)/.exec(src);
      if (!match || /\s$/.test(match[1])) return;

      return {
        type: 'highlight',
        raw: match[0],
        tokens: this.lexer.inlineTokens(match[1])
      };
    },
    renderer(token) {
      return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
    }
  });
});
