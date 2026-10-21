function counterUrl(theme) {
  const settings = theme.analytics && theme.analytics.goatcounter;
  if (!settings || !settings.siteUrl) return '';

  try {
    const url = new URL(settings.siteUrl);
    if (url.protocol !== 'https:' || url.username || url.password ||
        !/^[a-z0-9-]+\.goatcounter\.com$/.test(url.hostname) || url.port ||
        (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
      throw new Error('Expected https://YOURCODE.goatcounter.com');
    }
    return url.origin;
  } catch (error) {
    throw new Error('Invalid analytics.goatcounter.siteUrl: ' + error.message);
  }
}

hexo.extend.helper.register('visit_counter_url', function () {
  return counterUrl(this.theme);
});

hexo.extend.generator.register('visit-counter-config', function (locals) {
  const siteUrl = counterUrl(this.theme.config);
  if (!siteUrl) return [];
  const paths = ['TOTAL', ...locals.posts.toArray().map(post => new URL(post.permalink).pathname)];
  return {
    path: 'stats/visit-counter-config.json',
    data: JSON.stringify({ siteUrl, paths: [...new Set(paths)].sort() }, null, 2)
  };
});
