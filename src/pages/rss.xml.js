import rss, { pagesGlobToRssItems } from '@astrojs/rss';

export async function GET(context) {
  return rss({
    title: 'Portfolio | TJH ',
    description: 'Welcome to the portfolio for Travis James Hornbuckle, a psychology student and Program Associate with a passion in web design and airplaens!',
    site: context.site,
    items: await pagesGlobToRssItems(import.meta.glob('./**/*.md')),
    customData: `<language>es</language>`,
  });
}